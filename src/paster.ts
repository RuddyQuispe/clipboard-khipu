import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import type { HistoryEntry } from './types.js';
import type { ClipboardMonitor } from './clipboardMonitor.js';

const FILES_MIME = 'x-special/gnome-copied-files';

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

/**
 * Writes the entry's ORIGINAL content back onto the system clipboard.
 * Never reformats text; for images/files the exact bytes/URIs are restored.
 */
async function applyToClipboard(entry: HistoryEntry, monitor: ClipboardMonitor): Promise<void> {
    const clipboard = St.Clipboard.get_default();

    if (entry.kind === 'image') {
        const file = Gio.File.new_for_path(entry.path);
        let bytes: Uint8Array;
        try {
            [bytes] = await file.load_contents_async(null);
        } catch (error) {
            console.error('clipboard-khipu: failed to read image for paste', error);
            return;
        }
        monitor.suppressNextChange();
        clipboard.set_content(St.ClipboardType.CLIPBOARD, entry.mime, bytes);
        return;
    }

    monitor.suppressNextChange();

    if (entry.kind === 'text') {
        clipboard.set_text(St.ClipboardType.CLIPBOARD, entry.text);
        return;
    }

    // St.Clipboard only advertises one mimetype per grab, so we set the one
    // format that actually round-trips with GTK file managers (Nautilus).
    const payload = `${entry.operation}\n${entry.uris.join('\n')}`;
    clipboard.set_content(St.ClipboardType.CLIPBOARD, FILES_MIME, new TextEncoder().encode(payload));
}

/**
 * Restores `entry` to the clipboard and, if requested, synthesizes the paste
 * shortcut so it lands directly in whatever was focused before the history
 * popup opened. `pasteWithShift` selects Ctrl+Shift+V (terminals) over Ctrl+V.
 * If auto-paste fails or is disabled, the content is still on the clipboard,
 * so a manual paste always works — the action is never lost.
 */
export async function pasteEntry(
    entry: HistoryEntry,
    monitor: ClipboardMonitor,
    autoPaste: boolean,
    pasteWithShift: boolean
): Promise<void> {
    await applyToClipboard(entry, monitor);

    if (!autoPaste)
        return;

    GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, PASTE_FOCUS_SETTLE_MS, () => {
        simulatePaste(pasteWithShift);
        return GLib.SOURCE_REMOVE;
    });
}

/** Release the virtual input device. Call from disable(). */
export function destroyPaster(): void {
    virtualKeyboard = null;
}
