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

function buildTerminalGroup(settings: Gio.Settings): Adw.PreferencesGroup {
    const group = new Adw.PreferencesGroup({
        title: 'Terminals',
        description:
            'Windows whose WM class or app id contains any of these hints are pasted into with ' +
            'Ctrl+Shift+V instead of Ctrl+V. Comma-separated, case-insensitive.',
    });

    const row = new Adw.EntryRow({ title: 'Terminal hints' });
    row.set_text(settings.get_strv('terminal-wm-classes').join(', '));
    row.connect('changed', () => {
        const tokens = row
            .get_text()
            .split(',')
            .map(token => token.trim())
            .filter(token => token.length > 0);
        settings.set_strv('terminal-wm-classes', tokens);
    });

    group.add(row);
    return group;
}

function buildShortcutGroup(settings: Gio.Settings): Adw.PreferencesGroup {
    const group = new Adw.PreferencesGroup({
        title: 'Shortcut',
        description: 'GTK accelerator syntax, e.g. <Super>v or <Control><Alt>c',
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
        subtitle: 'Deletes all stored entries and images from disk',
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
    const imagesDir = Gio.File.new_for_path(GLib.build_filenamev([base, 'images']));

    try {
        if (historyFile.query_exists(null))
            historyFile.delete(null);
    } catch (error) {
        console.error('clipboard-khipu: failed to delete history.json', error);
    }

    try {
        const enumerator = imagesDir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        let info: Gio.FileInfo | null;
        while ((info = enumerator.next_file(null)) !== null)
            imagesDir.get_child(info.get_name()).delete(null);
    } catch {
        // Images directory does not exist yet — nothing to clean up.
    }
}
