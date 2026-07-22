import type Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { HistoryStore } from './historyStore.js';
import { ClipboardMonitor } from './clipboardMonitor.js';
import { openHistoryPopup } from './historyView.js';
import { pasteEntry, destroyPaster } from './paster.js';

const KEYBINDING_NAME = 'open-history';

export default class ClipboardKhipuExtension extends Extension {
    private _settings: Gio.Settings | null = null;
    private _store: HistoryStore | null = null;
    private _monitor: ClipboardMonitor | null = null;
    private _settingsSignalIds: number[] = [];

    enable(): void {
        const settings = this.getSettings();
        this._settings = settings;

        const store = new HistoryStore(settings.get_int('history-size'));
        this._store = store;

        const monitor = new ClipboardMonitor(payload => {
            switch (payload.kind) {
            case 'text':
                store.addText(payload.text);
                break;
            case 'image':
                if (settings.get_boolean('capture-images'))
                    store.addImage(payload.mime, payload.bytes).catch(logError);
                break;
            case 'files':
                if (settings.get_boolean('capture-files'))
                    store.addFiles(payload.uris, payload.operation);
                break;
            }
        });
        this._monitor = monitor;

        store
            .load()
            .catch((error: unknown) => console.error('clipboard-khipu: failed to load history', error))
            .then(() => monitor.start());

        Main.wm.addKeybinding(
            KEYBINDING_NAME,
            settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._openHistory()
        );

        this._settingsSignalIds.push(
            settings.connect('changed::history-size', () => store.setMaxSize(settings.get_int('history-size')))
        );
    }

    disable(): void {
        Main.wm.removeKeybinding(KEYBINDING_NAME);

        for (const id of this._settingsSignalIds)
            this._settings?.disconnect(id);
        this._settingsSignalIds = [];

        this._monitor?.stop();
        this._monitor = null;

        this._store?.flush();
        this._store = null;

        this._settings = null;

        destroyPaster();
    }

    private _openHistory(): void {
        const { _store: store, _monitor: monitor, _settings: settings } = this;
        if (!store || !monitor || !settings)
            return;

        const entries = store.getAll();
        if (entries.length === 0)
            return;

        const autoPaste = settings.get_boolean('auto-paste');

        if (entries.length === 1) {
            pasteEntry(entries[0], monitor, autoPaste).catch(logError);
            return;
        }

        openHistoryPopup(entries, entry => {
            pasteEntry(entry, monitor, autoPaste).catch(logError);
        });
    }
}

function logError(error: unknown): void {
    console.error('clipboard-khipu:', error);
}
