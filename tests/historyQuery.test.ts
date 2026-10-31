import { describe, test, assertEqual, assertDeepEqual } from './harness.js';
import {
    defaultSelection,
    formatBadge,
    formatRelativeTime,
    metaFor,
    pinnedFirst,
    previewFor,
    uriBasename,
    visibleEntries,
} from '../src/historyQuery.js';
import { filesEntry, flavor, imageEntry, textEntry } from './fixtures.js';

const ids = (entries: { id: string }[]): string[] => entries.map(entry => entry.id);

describe('visibleEntries', () => {
    const json = textEntry('{"Name": "Khipu"}');
    const file = filesEntry(['file:///home/me/Report.PDF']);
    const png = imageEntry('image/png');
    const all = [json, file, png];

    test('an empty or blank query keeps every entry', () => {
        assertDeepEqual(ids(visibleEntries(all, '')), ids(all));
        assertDeepEqual(ids(visibleEntries(all, '   ')), ids(all));
    });

    test('matches text case-insensitively and ignores surrounding spaces', () => {
        assertDeepEqual(ids(visibleEntries(all, '  KHIPU ')), [json.id]);
    });

    test('matches file URIs and image mimetypes', () => {
        assertDeepEqual(ids(visibleEntries(all, 'report.pdf')), [file.id]);
        assertDeepEqual(ids(visibleEntries(all, 'png')), [png.id]);
    });

    test('no match yields no rows', () => {
        assertDeepEqual(visibleEntries(all, 'nothing-like-this'), []);
    });

    test('pinned matches come first', () => {
        const pinned = textEntry('khipu pinned', { pinned: true });
        assertDeepEqual(ids(visibleEntries([json, pinned], 'khipu')), [pinned.id, json.id]);
    });
});

describe('pinnedFirst', () => {
    test('is a stable partition that keeps newest-first order in each group', () => {
        const a = textEntry('a');
        const b = textEntry('b', { pinned: true });
        const c = textEntry('c');
        const d = textEntry('d', { pinned: true });
        assertDeepEqual(ids(pinnedFirst([a, b, c, d])), [b.id, d.id, a.id, c.id]);
    });
});

describe('defaultSelection', () => {
    test('selects the newest unpinned row', () => {
        assertEqual(defaultSelection([textEntry('p', { pinned: true }), textEntry('x'), textEntry('y')]), 1);
    });

    test('falls back to row 0 when everything is pinned or the list is empty', () => {
        assertEqual(defaultSelection([textEntry('p', { pinned: true })]), 0);
        assertEqual(defaultSelection([]), 0);
    });
});

describe('previewFor', () => {
    test('single-line text is shown trimmed', () => {
        assertEqual(previewFor(textEntry('   hello  ')), 'hello');
    });

    test('multi-line text shows its first non-blank line and a return marker', () => {
        assertEqual(previewFor(textEntry('\n\n  first\nsecond')), 'first  ⏎');
    });

    test('long text is truncated to 160 characters with an ellipsis', () => {
        const preview = previewFor(textEntry('x'.repeat(200)));
        assertEqual(preview, `${'x'.repeat(160)}…`);
    });

    test('images show their format', () => {
        assertEqual(previewFor(imageEntry('image/jpeg')), 'Image (jpeg)');
    });

    test('files show the decoded name, and a count when several', () => {
        assertEqual(previewFor(filesEntry(['file:///home/me/My%20Notes.md'])), 'My Notes.md');
        assertEqual(previewFor(filesEntry(['file:///a/one.txt', 'file:///a/two.txt', 'file:///a/three.txt'])),
            'one.txt +2 more');
    });
});

describe('uriBasename', () => {
    test('returns the last path segment, decoded', () => {
        assertEqual(uriBasename('file:///home/me/dir/'), 'dir');
        assertEqual(uriBasename('file:///tmp/a%23b.txt'), 'a#b.txt');
    });

    test('returns the URI itself when it cannot be decoded', () => {
        assertEqual(uriBasename('file:///bad%E0%A4%A'), 'file:///bad%E0%A4%A');
    });
});

describe('formatBadge', () => {
    test('no flavors means no badge', () => {
        assertEqual(formatBadge(textEntry('a')), '');
    });

    test('html wins over rtf, rtf over anything else', () => {
        assertEqual(formatBadge(textEntry('a', { flavors: [flavor('text/rtf'), flavor('text/html')] })), ' · html');
        assertEqual(formatBadge(textEntry('a', { flavors: [flavor('application/rtf')] })), ' · rtf');
        assertEqual(formatBadge(textEntry('a', { flavors: [flavor('application/x-openoffice-embed')] })),
            ' · formatted');
    });
});

describe('formatRelativeTime', () => {
    const now = 1_000_000_000_000;
    const minute = 60_000;

    test('buckets elapsed time into just now, minutes, hours and days', () => {
        assertEqual(formatRelativeTime(now - 59_999, now), 'just now');
        assertEqual(formatRelativeTime(now - minute, now), '1m ago');
        assertEqual(formatRelativeTime(now - 59 * minute, now), '59m ago');
        assertEqual(formatRelativeTime(now - 60 * minute, now), '1h ago');
        assertEqual(formatRelativeTime(now - 24 * 60 * minute, now), '1d ago');
    });
});

describe('metaFor', () => {
    const now = 1_000_000_000_000;

    test('describes text by detected type, format and age', () => {
        const entry = textEntry('{}', { detectedType: 'json', createdAt: now - 5 * 60_000, flavors: [flavor('text/html')] });
        assertEqual(metaFor(entry, now), 'json · html · 5m ago');
    });

    test('counts files with correct pluralization', () => {
        assertEqual(metaFor(filesEntry(['file:///a'], { createdAt: now }), now), '1 file · just now');
        assertEqual(metaFor(filesEntry(['file:///a', 'file:///b'], { createdAt: now }), now), '2 files · just now');
    });

    test('labels images', () => {
        assertEqual(metaFor(imageEntry('image/png', { createdAt: now }), now), 'image · just now');
    });
});
