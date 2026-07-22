import Meta from 'gi://Meta';
import St from 'gi://St';

export type ClipboardPayload =
    | { kind: 'text'; text: string }
    | { kind: 'image'; mime: string; bytes: Uint8Array }
    | { kind: 'files'; uris: string[]; operation: 'copy' | 'cut' };

export type ClipboardChangeHandler = (payload: ClipboardPayload) => void;

const FILES_MIME = 'x-special/gnome-copied-files';
const URI_LIST_MIME = 'text/uri-list';
const TEXT_MIMES = ['text/plain;charset=utf-8', 'text/plain', 'UTF8_STRING'];
const PASSWORD_HINT_MIMES = [
    'x-kde-passwordManagerHint',
    'application/x-password-manager',
    'org.gnome.gpaste.password',
];

/**
 * Watches the system clipboard (SELECTION_CLIPBOARD only — never PRIMARY) via
 * Meta.Selection's owner-changed signal, and resolves the new content through
 * St.Clipboard by MIME priority: files > images > text.
 */
export class ClipboardMonitor {
    private readonly _selection: Meta.Selection;
    private readonly _clipboard: St.Clipboard;
    private readonly _onChange: ClipboardChangeHandler;
    private _signalId = 0;
    private _suppressNext = false;

    constructor(onChange: ClipboardChangeHandler) {
        this._selection = global.display.get_selection();
        this._clipboard = St.Clipboard.get_default();
        this._onChange = onChange;
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
    }

    /** Call right before this extension programmatically sets the clipboard, to avoid re-recording our own paste as a new entry. */
    suppressNextChange(): void {
        this._suppressNext = true;
    }

    private _handleChange(): void {
        const mimetypes = this._clipboard.get_mimetypes(St.ClipboardType.CLIPBOARD);
        if (mimetypes.length === 0)
            return;

        if (PASSWORD_HINT_MIMES.some(hint => mimetypes.includes(hint)))
            return;

        if (mimetypes.includes(FILES_MIME)) {
            this._readGnomeCopiedFiles();
            return;
        }

        if (mimetypes.includes(URI_LIST_MIME)) {
            this._readUriList();
            return;
        }

        const imageMime = mimetypes.find(mime => mime.startsWith('image/'));
        if (imageMime) {
            this._readImage(imageMime);
            return;
        }

        if (TEXT_MIMES.some(mime => mimetypes.includes(mime)))
            this._readText();
    }

    private _readText(): void {
        this._clipboard.get_text(St.ClipboardType.CLIPBOARD, (_clipboard, text) => {
            if (text)
                this._onChange({ kind: 'text', text });
        });
    }

    private _readImage(mime: string): void {
        this._clipboard.get_content(St.ClipboardType.CLIPBOARD, mime, (_clipboard, bytes) => {
            const data = bytes?.get_data();
            if (data && data.length > 0)
                this._onChange({ kind: 'image', mime, bytes: data });
        });
    }

    private _readGnomeCopiedFiles(): void {
        this._clipboard.get_content(St.ClipboardType.CLIPBOARD, FILES_MIME, (_clipboard, bytes) => {
            const data = bytes?.get_data();
            if (!data || data.length === 0)
                return;

            const lines = new TextDecoder()
                .decode(data)
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
            if (lines.length === 0)
                return;

            const operation: 'copy' | 'cut' = lines[0] === 'cut' ? 'cut' : 'copy';
            const uris = lines.filter(line => line.startsWith('file://'));
            if (uris.length > 0)
                this._onChange({ kind: 'files', uris, operation });
        });
    }

    private _readUriList(): void {
        this._clipboard.get_text(St.ClipboardType.CLIPBOARD, (_clipboard, text) => {
            if (!text)
                return;

            const uris = text
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.startsWith('file://'));
            if (uris.length > 0)
                this._onChange({ kind: 'files', uris, operation: 'copy' });
        });
    }
}
