import { describe, test, assertEqual, assertDeepEqual } from './harness.js';
import {
    classifyTarget,
    copiedFilesPayload,
    filesPasteMode,
    imageMimeForPath,
    pickRichFlavor,
    plainPathsOf,
    UNKNOWN_TARGET,
    uriListPayload,
    wantsFormatting,
} from '../src/pastePlan.js';
import type { PasteTarget, TargetHints } from '../src/pastePlan.js';
import { filesEntry, flavor, imageEntry, textEntry } from './fixtures.js';

const hints: TargetHints = {
    terminal: ['gnome-terminal', 'kitty', 'ptyxis'],
    richText: ['libreoffice', 'thunderbird'],
    fileManager: ['nautilus'],
    fileDrop: ['firefox', 'chrome'],
};

const target = (overrides: Partial<PasteTarget>): PasteTarget => ({ ...UNKNOWN_TARGET, ...overrides });

describe('classifyTarget', () => {
    test('matches a hint contained in any window id, case-insensitively', () => {
        assertDeepEqual(classifyTarget(['Org.Gnome.Ptyxis', null, undefined], hints), target({ isTerminal: true }));
        assertDeepEqual(classifyTarget([null, 'libreoffice-writer', null], hints), target({ prefersRichText: true }));
        assertDeepEqual(classifyTarget(['org.gnome.Nautilus'], hints), target({ isFileManager: true }));
        assertDeepEqual(classifyTarget(['firefox'], hints), target({ acceptsFileDrop: true }));
    });

    test('an unmatched window is a plain-text target', () => {
        assertDeepEqual(classifyTarget(['org.gnome.TextEditor'], hints), UNKNOWN_TARGET);
    });

    test('a window without any id is a plain-text target', () => {
        assertDeepEqual(classifyTarget([null, undefined], hints), UNKNOWN_TARGET);
    });

    test('empty hints never match', () => {
        assertDeepEqual(classifyTarget(['anything'], { ...hints, terminal: ['', 'kitty'] }), UNKNOWN_TARGET);
    });

    test('returns a fresh object, never the shared unknown target', () => {
        const result = classifyTarget([], hints);
        result.isTerminal = true;
        assertEqual(UNKNOWN_TARGET.isTerminal, false);
    });
});

describe('wantsFormatting', () => {
    const rich = target({ prefersRichText: true });

    test('only text pasted into a rich-text app wants its formatting', () => {
        assertEqual(wantsFormatting(textEntry('a'), rich, false), true);
        assertEqual(wantsFormatting(textEntry('a'), UNKNOWN_TARGET, false), false);
    });

    test('Ctrl+Enter (plainOnly) and terminals always get plain text', () => {
        assertEqual(wantsFormatting(textEntry('a'), rich, true), false);
        assertEqual(wantsFormatting(textEntry('a'), target({ prefersRichText: true, isTerminal: true }), false), false);
    });

    test('images and files never use a text flavor', () => {
        assertEqual(wantsFormatting(imageEntry('image/png'), rich, false), false);
        assertEqual(wantsFormatting(filesEntry(['file:///a']), rich, false), false);
    });
});

describe('pickRichFlavor', () => {
    test('prefers html, then rtf, then application/rtf, then richtext', () => {
        const all = [flavor('text/richtext'), flavor('application/rtf'), flavor('text/rtf'), flavor('text/html')];
        assertEqual(pickRichFlavor(textEntry('a', { flavors: all }))?.mime, 'text/html');
        assertEqual(pickRichFlavor(textEntry('a', { flavors: all.slice(0, 3) }))?.mime, 'text/rtf');
        assertEqual(pickRichFlavor(textEntry('a', { flavors: all.slice(0, 2) }))?.mime, 'application/rtf');
        assertEqual(pickRichFlavor(textEntry('a', { flavors: all.slice(0, 1) }))?.mime, 'text/richtext');
    });

    test('never republishes app-specific formats alone', () => {
        assertEqual(pickRichFlavor(textEntry('a', { flavors: [flavor('application/x-openoffice-embed')] })), null);
        assertEqual(pickRichFlavor(textEntry('a')), null);
    });
});

describe('filesPasteMode', () => {
    const one = filesEntry(['file:///home/me/photo.png']);
    const two = filesEntry(['file:///a.png', 'file:///b.png']);

    test('terminals and Ctrl+Enter get the paths, whatever else matches', () => {
        assertEqual(filesPasteMode(one, target({ isTerminal: true, isFileManager: true }), false), 'paths');
        assertEqual(filesPasteMode(one, target({ isFileManager: true }), true), 'paths');
    });

    test('file managers get the copy/cut grab', () => {
        assertEqual(filesPasteMode(one, target({ isFileManager: true, acceptsFileDrop: true }), false), 'file-manager');
    });

    test('browsers and chat clients get the URI list', () => {
        assertEqual(filesPasteMode(one, target({ acceptsFileDrop: true, prefersRichText: true }), false), 'uri-list');
    });

    test('rich-text apps embed a lone file and get a URI list for several', () => {
        assertEqual(filesPasteMode(one, target({ prefersRichText: true }), false), 'embed-image');
        assertEqual(filesPasteMode(two, target({ prefersRichText: true }), false), 'uri-list');
    });

    test('unknown windows get the paths', () => {
        assertEqual(filesPasteMode(two, UNKNOWN_TARGET, false), 'paths');
    });
});

describe('file payloads', () => {
    const entry = filesEntry(['file:///home/me/My%20Notes.md', 'sftp://host/remote.txt'], { operation: 'cut' });

    test('plain paths are decoded local paths, non-local URIs kept as-is', () => {
        assertEqual(plainPathsOf(entry), '/home/me/My Notes.md\nsftp://host/remote.txt');
    });

    test('the GNOME Files payload carries the operation then one URI per line', () => {
        assertEqual(copiedFilesPayload(entry), 'cut\nfile:///home/me/My%20Notes.md\nsftp://host/remote.txt');
    });

    test('the URI list is CRLF-terminated', () => {
        assertEqual(uriListPayload(entry), 'file:///home/me/My%20Notes.md\r\nsftp://host/remote.txt\r\n');
    });
});

describe('imageMimeForPath', () => {
    test('recognizes pictures by name and rejects everything else', () => {
        assertEqual(imageMimeForPath('/tmp/photo.png'), 'image/png');
        assertEqual(imageMimeForPath('/tmp/photo.JPG'), 'image/jpeg');
        assertEqual(imageMimeForPath('/tmp/notes.md'), null);
    });
});
