import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { describe, test, assert, assertDeepEqual } from './harness.js';
import { classifyTarget, UNKNOWN_TARGET } from '../src/pastePlan.js';
import type { PasteTarget } from '../src/pastePlan.js';

const SCHEMA_ID = 'org.gnome.shell.extensions.clipboard-khipu';

function loadSchema(): Gio.SettingsSchema {
    const dir = GLib.getenv('KHIPU_TEST_SCHEMA_DIR');
    assert(dir, 'KHIPU_TEST_SCHEMA_DIR is not set; run the suite through scripts/test.sh');
    const source = Gio.SettingsSchemaSource.new_from_directory(dir, null, false);
    const schema = source.lookup(SCHEMA_ID, false);
    assert(schema, `schema ${SCHEMA_ID} not found`);
    return schema;
}

describe('settings schema', () => {
    // EGO review guidelines: an extension MUST NOT ship with a default keyboard
    // shortcut for interacting with clipboard data.
    test('ships without a default shortcut for opening the history', () => {
        const value = loadSchema().get_key('open-history').get_default_value();
        assertDeepEqual(value.deepUnpack(), []);
    });

    test('defaults to excluding passwords', () => {
        assert(loadSchema().get_key('exclude-passwords').get_default_value().get_boolean());
    });

    test('the default hints classify common apps as intended', () => {
        const schema = loadSchema();
        const list = (key: string): string[] => schema.get_key(key).get_default_value().deepUnpack() as string[];
        const hints = {
            terminal: list('terminal-wm-classes'),
            richText: list('rich-text-wm-classes'),
            fileManager: list('file-manager-wm-classes'),
            fileDrop: list('file-drop-wm-classes'),
        };
        const only = (key: keyof PasteTarget): PasteTarget => ({ ...UNKNOWN_TARGET, [key]: true });

        assertDeepEqual(classifyTarget(['org.gnome.Ptyxis'], hints), only('isTerminal'), 'Ptyxis');
        assertDeepEqual(classifyTarget(['kitty'], hints), only('isTerminal'), 'kitty');
        assertDeepEqual(classifyTarget(['libreoffice-writer'], hints), only('prefersRichText'), 'Writer');
        assertDeepEqual(classifyTarget(['org.gnome.Nautilus'], hints), only('isFileManager'), 'Nautilus');
        assertDeepEqual(classifyTarget(['firefox'], hints), only('acceptsFileDrop'), 'Firefox');
        assertDeepEqual(classifyTarget(['gnome-text-editor', 'org.gnome.TextEditor'], hints), UNKNOWN_TARGET,
            'Text Editor');
        assertDeepEqual(classifyTarget(['code', 'Code'], hints), UNKNOWN_TARGET, 'VS Code');
    });
});
