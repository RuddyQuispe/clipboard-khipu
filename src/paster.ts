import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import type { HistoryEntry, TextEntry, FilesEntry } from './types.js';
import type { ClipboardMonitor } from './clipboardMonitor.js';
import {
    FILES_MIME,
    URI_LIST_MIME,
    copiedFilesPayload,
    filesPasteMode,
    imageMimeForPath,
    pickRichFlavor,
    plainPathsOf,
    uriListPayload,
    uriToPath,
    wantsFormatting,
} from './pastePlan.js';
import type { PasteTarget } from './pastePlan.js';

/** Delay (ms) between returning focus to the target window and synthesizing Ctrl+V. */
const PASTE_FOCUS_SETTLE_MS = 60;

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

/**
 * Publishes the files as a URI list — the format a browser reads to fill
 * DataTransfer.files on paste, and what apps accepting file drops ask for.
 */
function setUriList(clipboard: St.Clipboard, monitor: ClipboardMonitor, entry: FilesEntry): void {
    monitor.suppressNextChange();
    clipboard.set_content(St.ClipboardType.CLIPBOARD, URI_LIST_MIME,
        new TextEncoder().encode(uriListPayload(entry)));
}

/**
 * A file list has no single "correct" representation: Nautilus wants
 * x-special/gnome-copied-files, a document wants the picture itself, a terminal
 * wants the path. Since only one mimetype can be advertised per grab, the
 * target window decides which one it gets.
 *
 * An unrecognized window gets the paths as text, because both file formats paste
 * as nothing into an ordinary input: x-special/gnome-copied-files is private to
 * GNOME Files, and text/uri-list is not among the targets a text entry asks for.
 *
 * Browsers and web chat clients are the exception: a page that accepts a pasted
 * file reads text/uri-list, so they are classified separately and get that. The
 * cost is the mirror image of the default — a plain text field inside one of
 * those apps receives nothing, since a drop area and a text input cannot be told
 * apart from outside the window. Ctrl+Enter forces the bare paths anywhere.
 */
async function applyFiles(
    entry: FilesEntry,
    monitor: ClipboardMonitor,
    target: PasteTarget,
    plainOnly: boolean
): Promise<void> {
    const clipboard = St.Clipboard.get_default();

    switch (filesPasteMode(entry, target, plainOnly)) {
    case 'file-manager':
        // The only format that round-trips a copy/cut operation: pasting it into
        // a directory copies or moves the file.
        monitor.suppressNextChange();
        clipboard.set_content(St.ClipboardType.CLIPBOARD, FILES_MIME,
            new TextEncoder().encode(copiedFilesPayload(entry)));
        return;
    case 'uri-list':
        // A web page accepts a pasted file the same way it accepts a dropped one,
        // so the URI list is what makes the upload happen. Always the list, never
        // the picture's own bytes: attaching the real file keeps its name.
        setUriList(clipboard, monitor, entry);
        return;
    case 'embed-image': {
        // A word processor cannot do anything with a file reference, so a lone
        // picture is handed over as its own bytes and lands embedded; anything
        // else falls back to the URI list those apps read for file drops.
        const embedded = await loadImageOf(entry.uris[0]);
        if (embedded) {
            monitor.suppressNextChange();
            clipboard.set_content(St.ClipboardType.CLIPBOARD, embedded.mime, embedded.bytes);
            return;
        }
        setUriList(clipboard, monitor, entry);
        return;
    }
    case 'paths':
        // Terminals, Ctrl+Enter and every unrecognized window are only known to
        // accept text, so they get the bare paths.
        monitor.suppressNextChange();
        clipboard.set_text(St.ClipboardType.CLIPBOARD, plainPathsOf(entry));
    }
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
    if (entry.kind === 'text' && wantsFormatting(entry, target, plainOnly) && await applyRichFlavor(entry, monitor))
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
