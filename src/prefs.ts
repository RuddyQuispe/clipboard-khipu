import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ClipboardKhipuPreferences extends ExtensionPreferences {
    async fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({ title: 'Clipboard Khipu' });

        page.add(buildBehaviorGroup(settings));
        page.add(buildFormatsGroup(settings));
        page.add(buildTerminalGroup(settings));
        page.add(buildShortcutGroup(settings));
        page.add(buildDataGroup());

        window.add(page);
    }
}

function buildBehaviorGroup(settings: Gio.Settings): Adw.PreferencesGroup {
    const group = new Adw.PreferencesGroup({ title: 'Behavior' });

    const sizeRow = Adw.SpinRow.new(Gtk.Adjustment.new(25, 1, 200, 1, 10, 0), 1, 0);
    sizeRow.title = 'History size';
    sizeRow.subtitle = 'Maximum number of entries to keep';
    settings.bind('history-size', sizeRow, 'value', Gio.SettingsBindFlags.DEFAULT);
    group.add(sizeRow);

    const autoPasteRow = new Adw.SwitchRow({
        title: 'Auto-paste on select',
        subtitle: 'Simulate Ctrl+V right after picking an entry',
    });
    settings.bind('auto-paste', autoPasteRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    group.add(autoPasteRow);

    const imagesRow = new Adw.SwitchRow({ title: 'Capture images' });
    settings.bind('capture-images', imagesRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    group.add(imagesRow);

    const filesRow = new Adw.SwitchRow({
        title: 'Capture files',
        subtitle: 'Files copied in a file manager, e.g. Nautilus',
    });
    settings.bind('capture-files', filesRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    group.add(filesRow);

    const passwordsRow = new Adw.SwitchRow({
        title: 'Exclude passwords',
        subtitle: 'Skip clipboard content flagged as a password by its source app',
    });
    settings.bind('exclude-passwords', passwordsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    group.add(passwordsRow);

    return group;
}

const BYTES_PER_MIB = 1024 * 1024;

function buildFormatsGroup(settings: Gio.Settings): Adw.PreferencesGroup {
    const group = new Adw.PreferencesGroup({
        title: 'Formats',
        description:
            'A copy from a spreadsheet, document or web page carries more than text — tables, ' +
            'styles and colours travel as extra formats. Those are kept, and handed to the apps ' +
            'listed below; everything else, including editors and terminals, receives plain text.',
    });

    const enabledRow = new Adw.SwitchRow({
        title: 'Preserve formatting',
        subtitle: 'Store HTML, RTF and app-specific formats alongside the text',
    });
    settings.bind('capture-formats', enabledRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    group.add(enabledRow);

    group.add(buildTokenRow(settings, 'rich-text-wm-classes', 'Rich-text app hints'));

    group.add(buildSizeRow(settings, 'flavor-max-bytes', 128, {
        title: 'Maximum size per format (MiB)',
        subtitle: 'Bigger formats are dropped, never truncated',
    }));
    group.add(buildSizeRow(settings, 'entry-max-bytes', 512, {
        title: 'Maximum extra formats per item (MiB)',
        subtitle: 'Total budget for one history item',
    }));

    return group;
}

/** Comma-separated editor for a GSettings string list. */
function buildTokenRow(settings: Gio.Settings, key: string, title: string): Adw.EntryRow {
    const row = new Adw.EntryRow({ title });
    row.set_text(settings.get_strv(key).join(', '));
    row.connect('changed', () => {
        const tokens = row
            .get_text()
            .split(',')
            .map(token => token.trim())
            .filter(token => token.length > 0);
        settings.set_strv(key, tokens);
    });
    return row;
}

/** GSettings stores bytes; the user thinks in MiB. */
function buildSizeRow(
    settings: Gio.Settings,
    key: string,
    maxMib: number,
    labels: { title: string; subtitle: string }
): Adw.SpinRow {
    const row = Adw.SpinRow.new(Gtk.Adjustment.new(1, 1, maxMib, 1, 4, 0), 1, 0);
    row.title = labels.title;
    row.subtitle = labels.subtitle;
    row.set_value(Math.max(1, Math.round(settings.get_int(key) / BYTES_PER_MIB)));
    row.connect('notify::value', () => settings.set_int(key, row.get_value() * BYTES_PER_MIB));
    return row;
}

function buildTerminalGroup(settings: Gio.Settings): Adw.PreferencesGroup {
    const group = new Adw.PreferencesGroup({
        title: 'Terminals',
        description:
            'Windows whose WM class or app id contains any of these hints are pasted into with ' +
            'Ctrl+Shift+V instead of Ctrl+V. Comma-separated, case-insensitive.',
    });

    group.add(buildTokenRow(settings, 'terminal-wm-classes', 'Terminal hints'));
    return group;
}

function buildShortcutGroup(settings: Gio.Settings): Adw.PreferencesGroup {
    const group = new Adw.PreferencesGroup({
        title: 'Shortcut',
        description: 'GTK accelerator syntax, e.g. &lt;Super&gt;v or &lt;Control&gt;&lt;Alt&gt;c',
    });

    const row = new Adw.EntryRow({ title: 'Open history' });
    row.set_text(settings.get_strv('open-history')[0] ?? '<Super>v');

    row.connect('changed', () => {
        const text = row.get_text().trim();
        const [ok, keyval, mods] = Gtk.accelerator_parse(text);
        const valid = ok && keyval !== 0 && Gtk.accelerator_valid(keyval, mods ?? 0);

        row.remove_css_class('error');
        if (!valid) {
            if (text.length > 0)
                row.add_css_class('error');
            return;
        }

        settings.set_strv('open-history', [text]);
    });

    group.add(row);
    return group;
}

function buildDataGroup(): Adw.PreferencesGroup {
    const group = new Adw.PreferencesGroup({ title: 'Data' });

    const row = new Adw.ActionRow({
        title: 'Clear history',
        subtitle: 'Deletes all stored entries, images and formats from disk',
    });

    const button = Gtk.Button.new_with_label('Clear');
    button.set_valign(Gtk.Align.CENTER);
    button.add_css_class('destructive-action');
    button.connect('clicked', () => clearHistoryData());
    row.add_suffix(button);

    group.add(row);
    return group;
}

function clearHistoryData(): void {
    const base = GLib.build_filenamev([GLib.get_user_data_dir(), 'clipboard-khipu']);
    const historyFile = Gio.File.new_for_path(GLib.build_filenamev([base, 'history.json']));

    try {
        if (historyFile.query_exists(null))
            historyFile.delete(null);
    } catch (error) {
        console.error('clipboard-khipu: failed to delete history.json', error);
    }

    // `blobs` holds the stored rich formats — leaving it behind would keep the
    // bulk of the data on disk after a "clear".
    for (const name of ['images', 'blobs'])
        emptyDirectory(Gio.File.new_for_path(GLib.build_filenamev([base, name])));
}

function emptyDirectory(dir: Gio.File): void {
    try {
        const enumerator = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        let info: Gio.FileInfo | null;
        while ((info = enumerator.next_file(null)) !== null)
            dir.get_child(info.get_name()).delete(null);
    } catch {
        // Directory does not exist yet — nothing to clean up.
    }
}
