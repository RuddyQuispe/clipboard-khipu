import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import type { HistoryEntry, TextEntry, ImageEntry, FilesEntry, Flavor } from './types.js';
import type { FlavorMap } from './clipboardMonitor.js';
import { detectTextType } from './typeDetect.js';

// GJS does not promisify these Gio methods by default — without this they
// throw "Expected function for callback argument" when awaited. We use the
// bytes variant of replace_contents to avoid the byte-array GC bug in the
// plain replace_contents_async. Runs once per shell session (module is cached
// across enable/disable), so no double-promisify concern.
Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');
Gio._promisify(Gio.File.prototype, 'delete_async', 'delete_finish');
Gio._promisify(Gio.File.prototype, 'enumerate_children_async', 'enumerate_children_finish');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async', 'next_files_finish');

const HISTORY_FILE_VERSION = 2;
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
 * persistence. Text is stored verbatim — never trimmed or reformatted — and
 * every extra MIME flavor of a grab is kept byte-for-byte as a blob on disk,
 * so pasting an entry always reproduces exactly what was copied, formatting
 * included.
 */
export class HistoryStore {
    private _entries: HistoryEntry[] = [];
    private _maxSize: number;
    private readonly _dataDir: Gio.File;
    private readonly _imagesDir: Gio.File;
    private readonly _blobsDir: Gio.File;
    private readonly _historyFile: Gio.File;
    private _saveTimeoutId = 0;
    private _loaded = false;

    constructor(maxSize: number) {
        this._maxSize = maxSize;
        const base = GLib.build_filenamev([GLib.get_user_data_dir(), 'clipboard-khipu']);
        this._dataDir = Gio.File.new_for_path(base);
        this._imagesDir = Gio.File.new_for_path(GLib.build_filenamev([base, 'images']));
        this._blobsDir = Gio.File.new_for_path(GLib.build_filenamev([base, 'blobs']));
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
            if (Array.isArray(parsed.entries)) {
                this._entries = parsed.entries
                    .filter(entry => this._entryLooksValid(entry))
                    .map(entry => this._normalize(entry));
            }
        } catch {
            // No history file yet, or it is unreadable — start fresh.
            this._entries = [];
        }

        this._loaded = true;
        this._sweepOrphanBlobs().catch((error: unknown) => {
            console.warn('clipboard-khipu: failed to sweep orphan blobs', error);
        });
    }

    async addText(text: string, flavors: FlavorMap): Promise<void> {
        if (!this._loaded)
            return;

        const id = GLib.uuid_string_random();
        const stored = await this._writeFlavors(id, flavors);

        this._removeExisting(entry => entry.kind === 'text' && entry.text === text);

        const entry: TextEntry = {
            id,
            kind: 'text',
            createdAt: Date.now(),
            flavors: stored,
            text,
            detectedType: detectTextType(text),
        };
        this._insert(entry);
    }

    async addImage(mime: string, bytes: Uint8Array, flavors: FlavorMap): Promise<void> {
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

        const stored = await this._writeFlavors(id, flavors);

        const entry: ImageEntry = {
            id,
            kind: 'image',
            createdAt: Date.now(),
            flavors: stored,
            path: file.get_path()!,
            mime,
        };
        this._insert(entry);
    }

    async addFiles(uris: string[], operation: 'copy' | 'cut', flavors: FlavorMap): Promise<void> {
        if (!this._loaded)
            return;

        const id = GLib.uuid_string_random();
        const stored = await this._writeFlavors(id, flavors);

        this._removeExisting(entry => entry.kind === 'files' && sameUris(entry.uris, uris));

        const entry: FilesEntry = {
            id,
            kind: 'files',
            createdAt: Date.now(),
            flavors: stored,
            uris,
            operation,
        };
        this._insert(entry);
    }

    remove(id: string): void {
        const index = this._entries.findIndex(entry => entry.id === id);
        if (index === -1)
            return;

        const [removed] = this._entries.splice(index, 1);
        this._deleteEntryFiles(removed);
        this._scheduleSave();
    }

    clear(): void {
        for (const entry of this._entries)
            this._deleteEntryFiles(entry);
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

    /**
     * Inserts most-recent-first. Adding is async (blobs hit disk before the
     * entry is published), so two quick copies can finish out of order —
     * position by timestamp rather than always unshifting.
     */
    private _insert(entry: HistoryEntry): void {
        const index = this._entries.findIndex(existing => existing.createdAt <= entry.createdAt);
        if (index === -1)
            this._entries.push(entry);
        else
            this._entries.splice(index, 0, entry);

        this._trim();
        this._scheduleSave();
    }

    /** Persists every extra flavor of a grab as its own blob file. */
    private async _writeFlavors(id: string, flavors: FlavorMap): Promise<Flavor[]> {
        if (flavors.size === 0)
            return [];

        const dir = this._blobsDir.get_path()!;
        const stored: Flavor[] = [];
        let index = 0;

        for (const [mime, bytes] of flavors) {
            const file = Gio.File.new_for_path(GLib.build_filenamev([dir, `${id}-${index}.bin`]));
            index++;

            try {
                await (file as unknown as PromisifiedFile).replace_contents_bytes_async(
                    new GLib.Bytes(bytes), null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            } catch (error) {
                // One unwritable flavor must not cost us the whole entry.
                console.warn(`clipboard-khipu: failed to write flavor ${mime}`, error);
                continue;
            }

            stored.push({ mime, path: file.get_path()!, size: bytes.length });
        }

        return stored;
    }

    private _removeExisting(predicate: (entry: HistoryEntry) => boolean): void {
        const index = this._entries.findIndex(predicate);
        if (index !== -1) {
            const [removed] = this._entries.splice(index, 1);
            this._deleteEntryFiles(removed);
        }
    }

    private _entryLooksValid(entry: HistoryEntry): boolean {
        if (!entry || typeof entry !== 'object' || !entry.id || !entry.kind)
            return false;
        if (entry.kind === 'image')
            return Gio.File.new_for_path(entry.path).query_exists(null);
        return true;
    }

    /** Histories written before formats existed have no `flavors` key. */
    private _normalize(entry: HistoryEntry): HistoryEntry {
        const flavors = Array.isArray(entry.flavors)
            ? entry.flavors.filter(flavor =>
                flavor?.mime && flavor.path && Gio.File.new_for_path(flavor.path).query_exists(null))
            : [];
        return { ...entry, flavors };
    }

    private _trim(): void {
        while (this._entries.length > this._maxSize) {
            const removed = this._entries.pop();
            if (removed)
                this._deleteEntryFiles(removed);
        }
    }

    private _deleteEntryFiles(entry: HistoryEntry): void {
        if (entry.kind === 'image')
            this._deleteFile(entry.path);
        for (const flavor of entry.flavors ?? [])
            this._deleteFile(flavor.path);
    }

    private _deleteFile(path: string): void {
        const file = Gio.File.new_for_path(path);
        file.delete_async(GLib.PRIORITY_DEFAULT, null).catch((error: unknown) => {
            console.warn('clipboard-khipu: failed to delete file', path, error);
        });
    }

    /**
     * Removes blobs no entry references any more — insurance against files
     * orphaned by a Shell crash between writing a blob and saving the index.
     */
    private async _sweepOrphanBlobs(): Promise<void> {
        const referenced = new Set<string>();
        for (const entry of this._entries) {
            for (const flavor of entry.flavors)
                referenced.add(flavor.path);
        }

        const dir = this._blobsDir.get_path()!;
        const enumerator = await this._blobsDir.enumerate_children_async(
            'standard::name', Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_LOW, null);

        for (;;) {
            const batch = await enumerator.next_files_async(32, GLib.PRIORITY_LOW, null);
            if (batch.length === 0) {
                enumerator.close(null);
                return;
            }

            for (const info of batch) {
                const path = GLib.build_filenamev([dir, info.get_name()]);
                if (!referenced.has(path))
                    this._deleteFile(path);
            }
        }
    }

    private _ensureDirs(): void {
        for (const dir of [this._dataDir, this._imagesDir, this._blobsDir]) {
            if (!dir.query_exists(null))
                dir.make_directory_with_parents(null);
        }
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
