import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { describe, test, afterEach, assert, assertEqual, assertDeepEqual, sleep, waitFor } from './harness.js';
import { HistoryStore } from '../src/historyStore.js';
import type { FlavorMap } from '../src/clipboardMonitor.js';
import type { HistoryEntry, TextEntry } from '../src/types.js';

/*
 * These tests exercise the real store against a throwaway XDG_DATA_HOME set by
 * scripts/test.sh. Every store is flushed and the data directory wiped after
 * each test, so pending debounced writes never leak into the next one.
 */

const baseDir = (): string => GLib.build_filenamev([GLib.get_user_data_dir(), 'clipboard-khipu']);
const historyPath = (): string => GLib.build_filenamev([baseDir(), 'history.json']);
const NO_FLAVORS: FlavorMap = new Map();
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

const openStores: HistoryStore[] = [];

async function newStore(maxSize = 25): Promise<HistoryStore> {
    const store = new HistoryStore(maxSize);
    openStores.push(store);
    await store.load();
    return store;
}

function exists(path: string): boolean {
    return Gio.File.new_for_path(path).query_exists(null);
}

function readBytes(path: string): Uint8Array {
    const [, bytes] = Gio.File.new_for_path(path).load_contents(null);
    return bytes;
}

function writeFile(path: string, contents: string | Uint8Array): void {
    const file = Gio.File.new_for_path(path);
    const parent = file.get_parent();
    if (parent && !parent.query_exists(null))
        parent.make_directory_with_parents(null);
    file.replace_contents(typeof contents === 'string' ? encode(contents) : contents,
        null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
}

function deleteTree(file: Gio.File): void {
    if (!file.query_exists(null))
        return;
    if (file.query_file_type(Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null) === Gio.FileType.DIRECTORY) {
        const children = file.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        let info: Gio.FileInfo | null;
        while ((info = children.next_file(null)) !== null)
            deleteTree(file.get_child(info.get_name()));
    }
    file.delete(null);
}

/** Persists the store now and waits until history.json holds what it should. */
async function persisted(store: HistoryStore): Promise<{ version: number; entries: HistoryEntry[] }> {
    const expected = store.getAll().map(entry => entry.id);
    store.flush();
    let parsed: { version: number; entries: HistoryEntry[] } | null = null;
    await waitFor(() => {
        if (!exists(historyPath()))
            return false;
        try {
            parsed = JSON.parse(new TextDecoder().decode(readBytes(historyPath())));
        } catch {
            return false;
        }
        return JSON.stringify(parsed!.entries.map(entry => entry.id)) === JSON.stringify(expected);
    }, 'history.json to be written');
    return parsed!;
}

const texts = (store: HistoryStore): string[] =>
    store.getAll().map(entry => (entry as TextEntry).text);

afterEach(async () => {
    for (const store of openStores.splice(0))
        store.flush();
    await sleep(50);
    deleteTree(Gio.File.new_for_path(baseDir()));
});

describe('HistoryStore', () => {
    test('ignores copies made before the history is loaded', async () => {
        const store = new HistoryStore(25);
        openStores.push(store);
        await store.addText('too early', NO_FLAVORS);
        assertEqual(store.getAll().length, 0);
    });

    test('stores text verbatim: whitespace, CRLF, tabs and trailing newlines intact', async () => {
        const raw = '  {\r\n\t"a": 1,\n  "b": "x"\n}\n\n';
        const store = await newStore();
        await store.addText(raw, NO_FLAVORS);
        assertEqual((store.getAll()[0] as TextEntry).text, raw);
    });

    test('text survives a save and reload byte-for-byte', async () => {
        const raw = 'key:\n  - "value"   \n\tindented\r\nünïcödé 🧶\n';
        const first = await newStore();
        await first.addText(raw, NO_FLAVORS);
        await persisted(first);

        const second = await newStore();
        assertEqual((second.getAll()[0] as TextEntry).text, raw);
    });

    test('labels text with its detected type without changing it', async () => {
        const store = await newStore();
        await store.addText('https://example.org', NO_FLAVORS);
        const entry = store.getAll()[0] as TextEntry;
        assertEqual(entry.detectedType, 'url');
        assertEqual(entry.text, 'https://example.org');
    });

    test('keeps the most recent copy first', async () => {
        const store = await newStore();
        await store.addText('one', NO_FLAVORS);
        await sleep(2);
        await store.addText('two', NO_FLAVORS);
        await sleep(2);
        await store.addText('three', NO_FLAVORS);
        assertDeepEqual(texts(store), ['three', 'two', 'one']);
    });

    test('copying the same text again moves it to the top instead of duplicating it', async () => {
        const store = await newStore();
        await store.addText('a', NO_FLAVORS);
        await sleep(2);
        await store.addText('b', NO_FLAVORS);
        await sleep(2);
        await store.addText('a', NO_FLAVORS);
        assertDeepEqual(texts(store), ['a', 'b']);
    });

    test('text differing only in whitespace is a different entry', async () => {
        const store = await newStore();
        await store.addText('a', NO_FLAVORS);
        await store.addText('a ', NO_FLAVORS);
        assertEqual(store.getAll().length, 2);
    });

    test('a re-copied pinned entry stays pinned', async () => {
        const store = await newStore();
        await store.addText('keep me', NO_FLAVORS);
        store.setPinned(store.getAll()[0].id, true);
        await store.addText('keep me', NO_FLAVORS);
        assertEqual(store.getAll().length, 1);
        assertEqual(store.getAll()[0].pinned, true);
    });

    test('evicts the oldest entries beyond the history size', async () => {
        const store = await newStore(2);
        for (const text of ['1', '2', '3']) {
            await store.addText(text, NO_FLAVORS);
            await sleep(2);
        }
        assertDeepEqual(texts(store), ['3', '2']);
    });

    test('pinned entries are never evicted and do not count toward the size', async () => {
        const store = await newStore(2);
        await store.addText('pinned', NO_FLAVORS);
        store.setPinned(store.getAll()[0].id, true);
        for (const text of ['1', '2', '3']) {
            await sleep(2);
            await store.addText(text, NO_FLAVORS);
        }
        assertDeepEqual(texts(store), ['3', '2', 'pinned']);
    });

    test('shrinking the history size trims immediately', async () => {
        const store = await newStore();
        for (const text of ['1', '2', '3']) {
            await store.addText(text, NO_FLAVORS);
            await sleep(2);
        }
        store.setMaxSize(1);
        assertDeepEqual(texts(store), ['3']);
    });

    test('pinning keeps the position; unpinning removes the flag entirely', async () => {
        const store = await newStore();
        await store.addText('old', NO_FLAVORS);
        await sleep(2);
        await store.addText('new', NO_FLAVORS);
        const oldId = store.getAll()[1].id;

        const pinned = store.setPinned(oldId, true);
        assertEqual(pinned?.pinned, true);
        assertDeepEqual(texts(store), ['new', 'old']);

        const unpinned = store.setPinned(oldId, false);
        assert(unpinned && !('pinned' in unpinned), 'unpinned entry should have no pinned key');
    });

    test('pinning an unknown id returns null and changes nothing', async () => {
        const store = await newStore();
        await store.addText('a', NO_FLAVORS);
        assertEqual(store.setPinned('missing', true), null);
        assertEqual(store.getAll()[0].pinned, undefined);
    });

    test('stores every extra flavor verbatim as its own blob', async () => {
        const html = encode('<b>bold</b>\r\n');
        const rtf = encode('{\\rtf1 bold}');
        const store = await newStore();
        await store.addText('bold', new Map([['text/html', html], ['text/rtf', rtf]]));

        const { flavors } = store.getAll()[0];
        assertDeepEqual(flavors.map(f => f.mime), ['text/html', 'text/rtf']);
        assertDeepEqual(flavors.map(f => f.size), [html.length, rtf.length]);
        assertDeepEqual(readBytes(flavors[0].path), html);
        assertDeepEqual(readBytes(flavors[1].path), rtf);
    });

    test('removing an entry deletes its blobs from disk', async () => {
        const store = await newStore();
        await store.addText('x', new Map([['text/html', encode('<i>x</i>')]]));
        const entry = store.getAll()[0];
        store.remove(entry.id);

        assertEqual(store.getAll().length, 0);
        await waitFor(() => !exists(entry.flavors[0].path), 'the blob to be deleted');
    });

    test('removing an unknown id is a no-op', async () => {
        const store = await newStore();
        await store.addText('x', NO_FLAVORS);
        store.remove('missing');
        assertEqual(store.getAll().length, 1);
    });

    test('evicting an entry deletes its blobs too', async () => {
        const store = await newStore(1);
        await store.addText('old', new Map([['text/html', encode('<p>old</p>')]]));
        const blob = store.getAll()[0].flavors[0].path;
        await sleep(2);
        await store.addText('new', NO_FLAVORS);
        await waitFor(() => !exists(blob), 'the evicted blob to be deleted');
    });

    test('clear() empties the history and deletes images and blobs', async () => {
        const store = await newStore();
        await store.addText('x', new Map([['text/html', encode('<p>x</p>')]]));
        await store.addImage('image/png', encode('PNGDATA'), NO_FLAVORS);
        const paths = [store.getAll()[0], store.getAll()[1]].flatMap(entry =>
            [...entry.flavors.map(f => f.path), ...(entry.kind === 'image' ? [entry.path] : [])]);

        store.clear();
        assertEqual(store.getAll().length, 0);
        await waitFor(() => paths.every(path => !exists(path)), 'all files to be deleted');
        assertDeepEqual((await persisted(store)).entries, []);
    });

    test('stores images byte-for-byte with an extension for their type', async () => {
        const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
        const store = await newStore();
        await store.addImage('image/png', bytes, NO_FLAVORS);
        await store.addImage('image/x-unknown', bytes, NO_FLAVORS);

        const [unknown, png] = store.getAll();
        assert(png.kind === 'image' && unknown.kind === 'image');
        assert(png.path.endsWith('.png'), `expected .png, got ${png.path}`);
        assert(unknown.path.endsWith('.bin'), `expected .bin, got ${unknown.path}`);
        assertDeepEqual(readBytes(png.path), bytes);
    });

    test('copying the same files again moves them to the top', async () => {
        const store = await newStore();
        await store.addFiles(['file:///a', 'file:///b'], 'copy', NO_FLAVORS);
        await sleep(2);
        await store.addFiles(['file:///c'], 'copy', NO_FLAVORS);
        await sleep(2);
        await store.addFiles(['file:///a', 'file:///b'], 'cut', NO_FLAVORS);

        const entries = store.getAll();
        assertEqual(entries.length, 2);
        assert(entries[0].kind === 'files');
        assertDeepEqual(entries[0].uris, ['file:///a', 'file:///b']);
        assertEqual(entries[0].operation, 'cut');
    });

    test('the same files in a different order are a different entry', async () => {
        const store = await newStore();
        await store.addFiles(['file:///a', 'file:///b'], 'copy', NO_FLAVORS);
        await store.addFiles(['file:///b', 'file:///a'], 'copy', NO_FLAVORS);
        assertEqual(store.getAll().length, 2);
    });

    test('persists in format version 2 with pins included', async () => {
        const store = await newStore();
        await store.addText('pinned', NO_FLAVORS);
        store.setPinned(store.getAll()[0].id, true);
        const saved = await persisted(store);
        assertEqual(saved.version, 2);
        assertEqual(saved.entries[0].pinned, true);

        const reloaded = await newStore();
        assertEqual(reloaded.getAll()[0].pinned, true);
    });

    test('a corrupt history file starts an empty history', async () => {
        writeFile(historyPath(), '{ this is not json');
        const store = await newStore();
        assertEqual(store.getAll().length, 0);
    });

    test('loading drops invalid entries and images whose file is gone', async () => {
        const kept = { id: 'kept', kind: 'text', createdAt: 1, text: 'kept', detectedType: 'plain', flavors: [] };
        writeFile(historyPath(), JSON.stringify({
            version: 2,
            entries: [
                kept,
                { kind: 'text', text: 'no id' },
                null,
                { id: 'img', kind: 'image', createdAt: 1, path: '/nonexistent/x.png', mime: 'image/png', flavors: [] },
            ],
        }));
        const store = await newStore();
        assertDeepEqual(store.getAll().map(entry => entry.id), ['kept']);
    });

    test('loads histories written before flavors existed', async () => {
        writeFile(historyPath(), JSON.stringify({
            version: 1,
            entries: [{ id: 'legacy', kind: 'text', createdAt: 1, text: 'old', detectedType: 'plain' }],
        }));
        const store = await newStore();
        assertDeepEqual(store.getAll()[0].flavors, []);
        assertEqual((store.getAll()[0] as TextEntry).text, 'old');
    });

    test('loading drops flavors whose blob is missing', async () => {
        const blob = GLib.build_filenamev([baseDir(), 'blobs', 'kept-0.bin']);
        writeFile(blob, '<p>kept</p>');
        writeFile(historyPath(), JSON.stringify({
            version: 2,
            entries: [{
                id: 'e', kind: 'text', createdAt: 1, text: 't', detectedType: 'plain',
                flavors: [
                    { mime: 'text/html', path: blob, size: 11 },
                    { mime: 'text/rtf', path: GLib.build_filenamev([baseDir(), 'blobs', 'gone.bin']), size: 3 },
                ],
            }],
        }));
        const store = await newStore();
        assertDeepEqual(store.getAll()[0].flavors.map(f => f.mime), ['text/html']);
    });

    test('a copy made right after loading keeps its blobs (orphan sweep has finished)', async () => {
        for (let i = 0; i < 40; i++)
            writeFile(GLib.build_filenamev([baseDir(), 'blobs', `orphan-${i}.bin`]), 'stale');
        const store = await newStore();
        await store.addText('fresh', new Map([['text/html', encode('<p>fresh</p>')]]));
        const blob = store.getAll()[0].flavors[0].path;
        await sleep(100);
        assert(exists(blob), 'the fresh blob was deleted by the orphan sweep');
    });

    test('loading sweeps blobs no entry references', async () => {
        const orphan = GLib.build_filenamev([baseDir(), 'blobs', 'orphan-0.bin']);
        writeFile(orphan, 'left behind by a crash');
        await newStore();
        await waitFor(() => !exists(orphan), 'the orphan blob to be swept');
    });
});
