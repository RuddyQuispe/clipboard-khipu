import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import type { HistoryEntry, TextEntry, FilesEntry, Flavor } from './types.js';
import type { ClipboardMonitor } from './clipboardMonitor.js';

const FILES_MIME = 'x-special/gnome-copied-files';
const URI_LIST_MIME = 'text/uri-list';

/**
 * Rich interchange formats, best first. HTML is the one every word processor
 * and mail client understands; RTF is the fallback for the few that do not.
 *
 * App-specific formats (application/x-openoffice-*) are captured and kept, but
 * never republished on their own: they only round-trip when their companion
 * descriptor format is offered in the same grab, which we cannot do.
 */
const RICH_MIME_PRIORITY = ['text/html', 'text/rtf', 'application/rtf', 'text/richtext'];

/** Delay (ms) between returning focus to the target window and synthesizing Ctrl+V. */
const PASTE_FOCUS_SETTLE_MS = 60;

/** What the window receiving the paste can make use of. */
export interface PasteTarget {
    /** Terminals paste with Ctrl+Shift+V, and only ever want plain text. */
    isTerminal: boolean;
    /** Word processors, spreadsheets and mail clients keep HTML/RTF formatting. */
    prefersRichText: boolean;
}

let virtualKeyboard: Clutter.VirtualInputDevice | null = null;

function getVirtualKeyboard(): Clutter.VirtualInputDevice {
    if (!virtualKeyboard) {
        const seat = Clutter.get_default_backend().get_default_seat();
        virtualKeyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    }
    return virtualKeyboard;
}

function notifyKey(keyval: number, state: Clutter.KeyState): void {
    getVirtualKeyboard().notify_keyval(GLib.get_monotonic_time(), keyval, state);
}

/**
 * Synthesizes the paste shortcut. Normal apps take Ctrl+V; terminals take
 * Ctrl+Shift+V (Ctrl+V does not paste in VTE-based terminals), so the caller
 * decides based on the target window.
 */
function simulatePaste(withShift: boolean): void {
    notifyKey(Clutter.KEY_Control_L, Clutter.KeyState.PRESSED);
    if (withShift)
        notifyKey(Clutter.KEY_Shift_L, Clutter.KeyState.PRESSED);
    notifyKey(Clutter.KEY_v, Clutter.KeyState.PRESSED);
    notifyKey(Clutter.KEY_v, Clutter.KeyState.RELEASED);
    if (withShift)
        notifyKey(Clutter.KEY_Shift_L, Clutter.KeyState.RELEASED);
    notifyKey(Clutter.KEY_Control_L, Clutter.KeyState.RELEASED);
}

/**
 * The best formatted representation stored for `entry`, if any. Only text
 * carries one: an image's own bytes already are its richest form, and a file
 * list is republished as URIs or as the file's contents, never as markup.
 */
function pickRichFlavor(entry: TextEntry): Flavor | null {
    for (const mime of RICH_MIME_PRIORITY) {
        const flavor = entry.flavors.find(candidate => candidate.mime === mime);
        if (flavor)
            return flavor;
    }
    return null;
}

async function loadBytes(path: string): Promise<Uint8Array | null> {
    try {
        const [bytes] = await Gio.File.new_for_path(path).load_contents_async(null);
        return bytes;
    } catch (error) {
        console.error('clipboard-khipu: failed to read stored content', path, error);
        return null;
    }
}

/**
 * Puts the formatted representation of a text entry on the clipboard when the
 * target can use it. Returns false if there is nothing suitable, so the caller
 * falls back to the plain representation.
 */
async function applyRichFlavor(entry: TextEntry, monitor: ClipboardMonitor): Promise<boolean> {
    const flavor = pickRichFlavor(entry);
    if (!flavor)
        return false;

    const bytes = await loadBytes(flavor.path);
    if (!bytes)
        return false;

    monitor.suppressNextChange();
    St.Clipboard.get_default().set_content(St.ClipboardType.CLIPBOARD, flavor.mime, bytes);
    return true;
}

/** Local filesystem path behind a file:// URI, percent-decoding included. */
function uriToPath(uri: string): string | null {
    return Gio.File.new_for_uri(uri).get_path();
}

/** Guessed from the name alone — no disk access, and enough to spot a picture. */
function imageMimeForPath(path: string): string | null {
    const [contentType] = Gio.content_type_guess(path, null);
    return contentType.startsWith('image/') ? contentType : null;
}

/**
 * A file list has no single "correct" representation: Nautilus wants
 * x-special/gnome-copied-files, a document wants the picture itself, a terminal
 * wants the path. Since only one mimetype can be advertised per grab, the
 * target window decides which one it gets.
 */
async function applyFiles(
    entry: FilesEntry,
    monitor: ClipboardMonitor,
    target: PasteTarget,
    plainOnly: boolean
): Promise<void> {
    const clipboard = St.Clipboard.get_default();

    // Terminals only take text, and Ctrl+Enter is the user saying the same
    // thing about any other app: give me the bare paths.
    if (target.isTerminal || plainOnly) {
        const paths = entry.uris.map(uri => uriToPath(uri) ?? uri);
        monitor.suppressNextChange();
        clipboard.set_text(St.ClipboardType.CLIPBOARD, paths.join('\n'));
        return;
    }

    if (target.prefersRichText) {
        // A word processor cannot do anything with a file reference, so a lone
        // picture is handed over as its own bytes and lands embedded. Only one
        // image fits in a grab; several files fall back to the URI list, which
        // is what those apps read when they accept file drops.
        const embedded = entry.uris.length === 1 ? await loadImageOf(entry.uris[0]) : null;
        if (embedded) {
            monitor.suppressNextChange();
            clipboard.set_content(St.ClipboardType.CLIPBOARD, embedded.mime, embedded.bytes);
            return;
        }

        monitor.suppressNextChange();
        clipboard.set_content(St.ClipboardType.CLIPBOARD, URI_LIST_MIME,
            new TextEncoder().encode(`${entry.uris.join('\r\n')}\r\n`));
        return;
    }

    // File managers: the only format that round-trips a copy/cut operation.
    const payload = `${entry.operation}\n${entry.uris.join('\n')}`;
    monitor.suppressNextChange();
    clipboard.set_content(St.ClipboardType.CLIPBOARD, FILES_MIME, new TextEncoder().encode(payload));
}

/** The picture behind a file:// URI, or null if it is not one or is gone. */
async function loadImageOf(uri: string): Promise<{ mime: string; bytes: Uint8Array } | null> {
    const path = uriToPath(uri);
    if (!path)
        return null;

    const mime = imageMimeForPath(path);
    if (!mime)
        return null;

    const bytes = await loadBytes(path);
    return bytes ? { mime, bytes } : null;
}

/**
 * Writes the entry's ORIGINAL content back onto the system clipboard.
 * Never reformats text; for images the exact bytes are restored.
 */
async function applyPrimary(
    entry: HistoryEntry,
    monitor: ClipboardMonitor,
    target: PasteTarget,
    plainOnly: boolean
): Promise<void> {
    const clipboard = St.Clipboard.get_default();

    switch (entry.kind) {
    case 'image': {
        const bytes = await loadBytes(entry.path);
        if (!bytes)
            return;
        monitor.suppressNextChange();
        clipboard.set_content(St.ClipboardType.CLIPBOARD, entry.mime, bytes);
        return;
    }
    case 'text':
        monitor.suppressNextChange();
        clipboard.set_text(St.ClipboardType.CLIPBOARD, entry.text);
        return;
    case 'files':
        await applyFiles(entry, monitor, target, plainOnly);
    }
}

/**
 * Only one mimetype can be advertised per grab (St.Clipboard, and the
 * Meta.SelectionSource vfuncs behind it, cannot be implemented from GJS), so
 * every choice below is made from the window that is about to receive the
 * paste.
 */
async function applyToClipboard(
    entry: HistoryEntry,
    monitor: ClipboardMonitor,
    target: PasteTarget,
    plainOnly: boolean
): Promise<void> {
    const wantsFormatting =
        entry.kind === 'text' && !plainOnly && !target.isTerminal && target.prefersRichText;

    if (wantsFormatting && await applyRichFlavor(entry, monitor))
        return;

    await applyPrimary(entry, monitor, target, plainOnly);
}

/**
 * Restores `entry` to the clipboard and, if requested, synthesizes the paste
 * shortcut so it lands directly in whatever was focused before the history
 * popup opened. `target` decides both the shortcut (Ctrl+Shift+V in terminals)
 * and whether the formatted representation is used; `plainOnly` forces the
 * plain one regardless.
 * If auto-paste fails or is disabled, the content is still on the clipboard,
 * so a manual paste always works — the action is never lost.
 */
export async function pasteEntry(
    entry: HistoryEntry,
    monitor: ClipboardMonitor,
    autoPaste: boolean,
    target: PasteTarget,
    plainOnly = false
): Promise<void> {
    await applyToClipboard(entry, monitor, target, plainOnly);

    if (!autoPaste)
        return;

    GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, PASTE_FOCUS_SETTLE_MS, () => {
        simulatePaste(target.isTerminal);
        return GLib.SOURCE_REMOVE;
    });
}

/** Release the virtual input device. Call from disable(). */
export function destroyPaster(): void {
    virtualKeyboard = null;
}
