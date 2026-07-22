import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import type { HistoryEntry, TextEntry, ImageEntry, FilesEntry } from './types.js';
import { detectTextType } from './typeDetect.js';

// GJS does not promisify these Gio.File methods by default — without this they
// throw "Expected function for callback argument" when awaited. We use the
// bytes variant of replace_contents to avoid the byte-array GC bug in the
// plain replace_contents_async. Runs once per shell session (module is cached
// across enable/disable), so no double-promisify concern.
Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');
Gio._promisify(Gio.File.prototype, 'delete_async', 'delete_finish');

const HISTORY_FILE_VERSION = 1;
const SAVE_DEBOUNCE_MS = 400;

// @girs types replace_contents_bytes_async as callback-only, but we promisify
// it above — expose the Promise-returning shape for the call sites.
type PromisifiedFile = {
    replace_contents_bytes_async(
        contents: GLib.Bytes,
        etag: string | null,
        makeBackup: boolean,
        flags: Gio.FileCreateFlags,
        cancellable: Gio.Cancellable | null,
    ): Promise<[boolean, string]>;
};

const IMAGE_EXTENSIONS: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
    'image/svg+xml': 'svg',
};

interface StoredFile {
    version: number;
    entries: HistoryEntry[];
}

/**
 * In-memory, most-recent-first clipboard history with debounced JSON
 * persistence. Text is stored verbatim — never trimmed or reformatted —
 * so pasting an entry always reproduces exactly what was copied.
 */
export class HistoryStore {
    private _entries: HistoryEntry[] = [];
    private _maxSize: number;
    private readonly _dataDir: Gio.File;
    private readonly _imagesDir: Gio.File;
    private readonly _historyFile: Gio.File;
    private _saveTimeoutId = 0;
    private _loaded = false;

    constructor(maxSize: number) {
        this._maxSize = maxSize;
        const base = GLib.build_filenamev([GLib.get_user_data_dir(), 'clipboard-khipu']);
        this._dataDir = Gio.File.new_for_path(base);
        this._imagesDir = Gio.File.new_for_path(GLib.build_filenamev([base, 'images']));
        this._historyFile = Gio.File.new_for_path(GLib.build_filenamev([base, 'history.json']));
    }

    setMaxSize(size: number): void {
        this._maxSize = size;
        this._trim();
    }

    getAll(): readonly HistoryEntry[] {
        return this._entries;
    }

    async load(): Promise<void> {
        this._ensureDirs();

        try {
            const [bytes] = await this._historyFile.load_contents_async(null);
            const parsed = JSON.parse(new TextDecoder().decode(bytes)) as StoredFile;
            if (Array.isArray(parsed.entries))
                this._entries = parsed.entries.filter(entry => this._entryLooksValid(entry));
        } catch {
            // No history file yet, or it is unreadable — start fresh.
            this._entries = [];
        }

        this._loaded = true;
    }

    addText(text: string): void {
        if (!this._loaded)
            return;

        this._removeExisting(entry => entry.kind === 'text' && entry.text === text);

        const entry: TextEntry = {
            id: GLib.uuid_string_random(),
            kind: 'text',
            createdAt: Date.now(),
            text,
            detectedType: detectTextType(text),
        };
        this._entries.unshift(entry);
        this._trim();
        this._scheduleSave();
    }

    async addImage(mime: string, bytes: Uint8Array): Promise<void> {
        if (!this._loaded)
            return;

        const id = GLib.uuid_string_random();
        const ext = IMAGE_EXTENSIONS[mime] ?? 'bin';
        const file = Gio.File.new_for_path(GLib.build_filenamev([this._imagesDir.get_path()!, `${id}.${ext}`]));

        try {
            await (file as unknown as PromisifiedFile).replace_contents_bytes_async(
                new GLib.Bytes(bytes), null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        } catch (error) {
            console.error('clipboard-khipu: failed to write image entry', error);
            return;
        }

        const entry: ImageEntry = {
            id,
            kind: 'image',
            createdAt: Date.now(),
            path: file.get_path()!,
            mime,
        };
        this._entries.unshift(entry);
        this._trim();
        this._scheduleSave();
    }

    addFiles(uris: string[], operation: 'copy' | 'cut'): void {
        if (!this._loaded)
            return;

        this._removeExisting(entry => entry.kind === 'files' && sameUris(entry.uris, uris));

        const entry: FilesEntry = {
            id: GLib.uuid_string_random(),
            kind: 'files',
            createdAt: Date.now(),
            uris,
            operation,
        };
        this._entries.unshift(entry);
        this._trim();
        this._scheduleSave();
    }

    remove(id: string): void {
        const index = this._entries.findIndex(entry => entry.id === id);
        if (index === -1)
            return;

        const [removed] = this._entries.splice(index, 1);
        if (removed.kind === 'image')
            this._deleteImageFile(removed.path);
        this._scheduleSave();
    }

    clear(): void {
        for (const entry of this._entries) {
            if (entry.kind === 'image')
                this._deleteImageFile(entry.path);
        }
        this._entries = [];
        this._scheduleSave();
    }

    /** Cancel any pending debounced write and persist synchronously-scheduled now. Call from disable(). */
    flush(): void {
        if (this._saveTimeoutId) {
            GLib.source_remove(this._saveTimeoutId);
            this._saveTimeoutId = 0;
        }
        this._saveNow();
    }

    private _removeExisting(predicate: (entry: HistoryEntry) => boolean): void {
        const index = this._entries.findIndex(predicate);
        if (index !== -1)
            this._entries.splice(index, 1);
    }

    private _entryLooksValid(entry: HistoryEntry): boolean {
        if (!entry || typeof entry !== 'object' || !entry.id || !entry.kind)
            return false;
        if (entry.kind === 'image')
            return Gio.File.new_for_path(entry.path).query_exists(null);
        return true;
    }

    private _trim(): void {
        while (this._entries.length > this._maxSize) {
            const removed = this._entries.pop();
            if (removed?.kind === 'image')
                this._deleteImageFile(removed.path);
        }
    }

    private _deleteImageFile(path: string): void {
        const file = Gio.File.new_for_path(path);
        file.delete_async(GLib.PRIORITY_DEFAULT, null).catch((error: unknown) => {
            console.warn('clipboard-khipu: failed to delete image file', path, error);
        });
    }

    private _ensureDirs(): void {
        if (!this._dataDir.query_exists(null))
            this._dataDir.make_directory_with_parents(null);
        if (!this._imagesDir.query_exists(null))
            this._imagesDir.make_directory_with_parents(null);
    }

    private _scheduleSave(): void {
        if (this._saveTimeoutId)
            GLib.source_remove(this._saveTimeoutId);

        this._saveTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SAVE_DEBOUNCE_MS, () => {
            this._saveTimeoutId = 0;
            this._saveNow();
            return GLib.SOURCE_REMOVE;
        });
    }

    private _saveNow(): void {
        const payload: StoredFile = { version: HISTORY_FILE_VERSION, entries: this._entries };
        const bytes = new GLib.Bytes(new TextEncoder().encode(JSON.stringify(payload)));
        (this._historyFile as unknown as PromisifiedFile)
            .replace_contents_bytes_async(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null)
            .catch((error: unknown) => console.error('clipboard-khipu: failed to persist history', error));
    }
}

function sameUris(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((uri, index) => uri === b[index]);
}
