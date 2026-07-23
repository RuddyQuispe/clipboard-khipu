import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import St from 'gi://St';

// Reading a flavor is a selection transfer, not a memory copy — it round-trips
// to the source app. We drive it directly through Meta.Selection (rather than
// St.Clipboard) because it accepts a maximum size, so a runaway flavor can be
// bounded instead of landing whole in the Shell's heap. Runs once per shell
// session (the module is cached across enable/disable).
Gio._promisify(Meta.Selection.prototype, 'transfer_async', 'transfer_finish');

/** Extra MIME representations of one grab, keyed by mimetype. */
export type FlavorMap = Map<string, Uint8Array>;

export type ClipboardPayload =
    | { kind: 'text'; text: string; flavors: FlavorMap }
    | { kind: 'image'; mime: string; bytes: Uint8Array; flavors: FlavorMap }
    | { kind: 'files'; uris: string[]; operation: 'copy' | 'cut'; flavors: FlavorMap };

export type ClipboardChangeHandler = (payload: ClipboardPayload) => void;

export interface CaptureLimits {
    /** When false, only the primary representation is captured (pre-formats behaviour). */
    captureFormats: boolean;
    /** Maximum bytes for a single extra flavor. */
    flavorMaxBytes: number;
    /** Maximum total bytes of extra flavors for one entry. */
    entryMaxBytes: number;
}

const FILES_MIME = 'x-special/gnome-copied-files';
const URI_LIST_MIME = 'text/uri-list';
const TEXT_MIMES = ['text/plain;charset=utf-8', 'text/plain', 'UTF8_STRING'];
const PASSWORD_HINT_MIMES = [
    'x-kde-passwordManagerHint',
    'application/x-password-manager',
    'org.gnome.gpaste.password',
];

/** X11 protocol targets: metadata about the selection, never content. */
const PROTOCOL_TARGETS = [
    'TARGETS',
    'MULTIPLE',
    'TIMESTAMP',
    'SAVE_TARGETS',
    'DELETE',
    'INSERT_SELECTION',
    'INSERT_PROPERTY',
];

/** Legacy X11 spellings of plain text — republished from the stored text, so never stored twice. */
const TEXT_ALIASES = [...TEXT_MIMES, 'STRING', 'TEXT', 'COMPOUND_TEXT'];

/** Preference order when an app publishes the same picture in several encodings. */
const IMAGE_MIME_PRIORITY = ['image/png', 'image/webp', 'image/jpeg'];

/** Hard guard against pathological apps advertising dozens of targets. */
const MAX_FLAVORS = 16;

interface Primary {
    kind: 'text' | 'image' | 'files';
    mime: string;
}

/**
 * Watches the system clipboard (SELECTION_CLIPBOARD only — never PRIMARY) via
 * Meta.Selection's owner-changed signal.
 *
 * A grab is not one blob: apps publish several representations at once
 * (text/html, text/rtf, application/x-openoffice-*, …) and the pasting app
 * picks the richest one it understands. We read the primary representation to
 * classify the entry (files > images > text) and keep every other flavor
 * verbatim so paste can republish the whole set.
 */
export class ClipboardMonitor {
    private readonly _selection: Meta.Selection;
    private readonly _clipboard: St.Clipboard;
    private readonly _onChange: ClipboardChangeHandler;
    private readonly _getLimits: () => CaptureLimits;
    private _signalId = 0;
    private _suppressNext = false;
    /**
     * Bumped on every owner change. Flavors are read one at a time, so a copy
     * that lands mid-sequence must abandon the in-flight reads — otherwise
     * flavors from two different grabs get merged into one entry.
     */
    private _generation = 0;

    constructor(onChange: ClipboardChangeHandler, getLimits: () => CaptureLimits) {
        this._selection = global.display.get_selection();
        this._clipboard = St.Clipboard.get_default();
        this._onChange = onChange;
        this._getLimits = getLimits;
    }

    start(): void {
        if (this._signalId)
            return;

        this._signalId = this._selection.connect('owner-changed', (_selection, selectionType) => {
            if (selectionType !== Meta.SelectionType.SELECTION_CLIPBOARD)
                return;

            if (this._suppressNext) {
                this._suppressNext = false;
                return;
            }

            this._handleChange();
        });
    }

    stop(): void {
        if (this._signalId) {
            this._selection.disconnect(this._signalId);
            this._signalId = 0;
        }
        // Abandon any read sequence still in flight.
        this._generation++;
    }

    /** Call right before this extension programmatically sets the clipboard, to avoid re-recording our own paste as a new entry. */
    suppressNextChange(): void {
        this._suppressNext = true;
    }

    private _handleChange(): void {
        const generation = ++this._generation;

        const mimetypes = this._clipboard.get_mimetypes(St.ClipboardType.CLIPBOARD);
        if (mimetypes.length === 0)
            return;

        if (PASSWORD_HINT_MIMES.some(hint => mimetypes.includes(hint)))
            return;

        const primary = classify(mimetypes);
        if (!primary)
            return;

        this._capture(primary, mimetypes, generation).catch((error: unknown) => {
            console.error('clipboard-khipu: failed to capture clipboard', error);
        });
    }

    private async _capture(primary: Primary, mimetypes: string[], generation: number): Promise<void> {
        // The primary representation is read uncapped: it is what the entry
        // fundamentally is, and capping it would silently drop large copies
        // that worked before formats existed.
        const primaryData = await this._readFlavor(primary.mime, -1);
        if (!primaryData || generation !== this._generation)
            return;

        const flavors: FlavorMap = new Map();
        const limits = this._getLimits();

        if (limits.captureFormats) {
            let budget = limits.entryMaxBytes;

            for (const mime of selectExtras(primary, mimetypes)) {
                if (generation !== this._generation)
                    return;
                if (budget <= 0)
                    break;

                const cap = Math.min(limits.flavorMaxBytes, budget);
                const data = await this._readFlavor(mime, cap + 1);
                if (!data)
                    continue;
                // Over the cap: drop it whole. A truncated HTML or RTF blob is
                // worse than no blob at all.
                if (data.length > cap) {
                    console.debug(`clipboard-khipu: dropping oversized flavor ${mime}`);
                    continue;
                }

                flavors.set(mime, data);
                budget -= data.length;
            }
        }

        if (generation !== this._generation)
            return;

        this._emit(primary, primaryData, flavors);
    }

    /** Transfers one mimetype into memory. `maxBytes` of -1 means unlimited. */
    private async _readFlavor(mime: string, maxBytes: number): Promise<Uint8Array | null> {
        const output = Gio.MemoryOutputStream.new_resizable();

        try {
            await this._selection.transfer_async(
                Meta.SelectionType.SELECTION_CLIPBOARD, mime, maxBytes, output, null);
            output.close(null);
        } catch (error) {
            // A source app may advertise a target it cannot actually serve;
            // that is normal, so skip the flavor rather than failing the grab.
            console.debug(`clipboard-khipu: could not read ${mime}: ${error}`);
            return null;
        }

        const data = output.steal_as_bytes().get_data();
        return data && data.length > 0 ? data : null;
    }

    private _emit(primary: Primary, data: Uint8Array, flavors: FlavorMap): void {
        switch (primary.kind) {
        case 'text': {
            const text = decodeText(data);
            if (text.length > 0)
                this._onChange({ kind: 'text', text, flavors });
            return;
        }
        case 'image':
            this._onChange({ kind: 'image', mime: primary.mime, bytes: data, flavors });
            return;
        case 'files': {
            const parsed = primary.mime === FILES_MIME
                ? parseGnomeCopiedFiles(data)
                : parseUriList(data);
            if (parsed)
                this._onChange({ kind: 'files', ...parsed, flavors });
        }
        }
    }
}

/**
 * Picks the representation that defines what the entry *is* — icon, preview and
 * dedup key. Priority is files > images > text, unchanged from before formats.
 */
function classify(mimetypes: string[]): Primary | null {
    if (mimetypes.includes(FILES_MIME))
        return { kind: 'files', mime: FILES_MIME };

    if (mimetypes.includes(URI_LIST_MIME))
        return { kind: 'files', mime: URI_LIST_MIME };

    const image = pickImageMime(mimetypes);
    if (image)
        return { kind: 'image', mime: image };

    const text = TEXT_MIMES.find(mime => mimetypes.includes(mime));
    if (text)
        return { kind: 'text', mime: text };

    return null;
}

function pickImageMime(mimetypes: string[]): string | null {
    const preferred = IMAGE_MIME_PRIORITY.find(mime => mimetypes.includes(mime));
    if (preferred)
        return preferred;
    return mimetypes.find(mime => mime.startsWith('image/')) ?? null;
}

/**
 * The flavors worth storing beyond the primary one. Anything paste rebuilds
 * from the entry itself is skipped, so nothing is stored twice.
 */
function selectExtras(primary: Primary, mimetypes: string[]): string[] {
    const extras: string[] = [];

    for (const mime of mimetypes) {
        if (mime === primary.mime)
            continue;
        if (PROTOCOL_TARGETS.includes(mime))
            continue;

        switch (primary.kind) {
        case 'text':
            // Paste republishes the stored text under every text spelling.
            if (isTextAlias(mime))
                continue;
            break;
        case 'files':
            // Paste rebuilds both file lists and their text form from the URIs.
            if (mime === FILES_MIME || mime === URI_LIST_MIME || isTextAlias(mime))
                continue;
            break;
        case 'image':
            // One picture published as PNG + BMP + TIFF is still one picture.
            if (mime.startsWith('image/'))
                continue;
            break;
        }

        extras.push(mime);
        if (extras.length >= MAX_FLAVORS)
            break;
    }

    return extras;
}

function isTextAlias(mime: string): boolean {
    const normalized = mime.toLowerCase();
    return TEXT_ALIASES.some(alias => alias.toLowerCase() === normalized);
}

/**
 * Decodes a text transfer the way St.Clipboard does: some apps NUL-terminate
 * their buffer, and the trailing byte is not part of the copied text.
 */
function decodeText(data: Uint8Array): string {
    const nul = data.indexOf(0);
    return new TextDecoder().decode(nul === -1 ? data : data.subarray(0, nul));
}

function parseGnomeCopiedFiles(data: Uint8Array): { uris: string[]; operation: 'copy' | 'cut' } | null {
    const lines = decodeText(data)
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    if (lines.length === 0)
        return null;

    const operation: 'copy' | 'cut' = lines[0] === 'cut' ? 'cut' : 'copy';
    const uris = lines.filter(line => line.startsWith('file://'));
    return uris.length > 0 ? { uris, operation } : null;
}

function parseUriList(data: Uint8Array): { uris: string[]; operation: 'copy' | 'cut' } | null {
    const uris = decodeText(data)
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('file://'));
    return uris.length > 0 ? { uris, operation: 'copy' } : null;
}
