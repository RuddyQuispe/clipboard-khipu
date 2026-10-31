import type Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { HistoryStore } from './historyStore.js';
import { ClipboardMonitor } from './clipboardMonitor.js';
import { openHistoryPopup } from './historyView.js';
import type { HistoryPopupHandle } from './historyView.js';
import { pasteEntry, destroyPaster } from './paster.js';
import { classifyTarget, UNKNOWN_TARGET } from './pastePlan.js';
import type { PasteTarget } from './pastePlan.js';

const KEYBINDING_NAME = 'open-history';

export default class ClipboardKhipuExtension extends Extension {
    private _settings: Gio.Settings | null = null;
    private _store: HistoryStore | null = null;
    private _monitor: ClipboardMonitor | null = null;
    private _settingsSignalIds: number[] = [];
    private _popup: HistoryPopupHandle | null = null;

    enable(): void {
        const settings = this.getSettings();
        this._settings = settings;

        const store = new HistoryStore(settings.get_int('history-size'));
        this._store = store;

        const monitor = new ClipboardMonitor(
            payload => {
                switch (payload.kind) {
                case 'text':
                    store.addText(payload.text, payload.flavors).catch(logError);
                    break;
                case 'image':
                    if (settings.get_boolean('capture-images'))
                        store.addImage(payload.mime, payload.bytes, payload.flavors).catch(logError);
                    break;
                case 'files':
                    if (settings.get_boolean('capture-files'))
                        store.addFiles(payload.uris, payload.operation, payload.flavors).catch(logError);
                    break;
                }
            },
            // Read live, so changing the limits in preferences takes effect on
            // the next copy without re-enabling the extension.
            () => ({
                captureFormats: settings.get_boolean('capture-formats'),
                flavorMaxBytes: settings.get_int('flavor-max-bytes'),
                entryMaxBytes: settings.get_int('entry-max-bytes'),
            })
        );
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

        // Nothing else tears down the modal grab or backdrop actor if the
        // extension is disabled while the popup is still open.
        this._popup?.close();
        this._popup = null;

        for (const id of this._settingsSignalIds)
            this._settings?.disconnect(id);
        this._settingsSignalIds = [];

        this._monitor?.stop();
        this._monitor = null;

        // A persistence failure must never abort disable() — otherwise GNOME
        // leaves the extension in ERROR state and won't re-enable it on unlock.
        try {
            this._store?.flush();
        } catch (error) {
            logError(error);
        }
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
        // Capture the paste target now, before the popup grabs input — focus
        // returns to this same window when the popup closes.
        const target = this._pasteTarget(settings);

        if (entries.length === 1) {
            pasteEntry(entries[0], monitor, autoPaste, target).catch(logError);
            return;
        }

        this._popup = openHistoryPopup(
            entries,
            (entry, plainOnly) => {
                pasteEntry(entry, monitor, autoPaste, target, plainOnly).catch(logError);
            },
            entry => store.remove(entry.id),
            entry => {
                store.setPinned(entry.id, !entry.pinned);
                return store.getAll();
            },
            () => {
                this._popup = null;
            }
        );
    }

    /**
     * Classifies the window that is about to receive the paste, from the
     * configurable WM-class token lists. Terminals paste with Ctrl+Shift+V
     * rather than Ctrl+V; rich-text apps get the formatted representation; file
     * managers get the file grab itself; browsers and web chat clients get a
     * copied file as a URI list so it uploads. Anything unmatched is treated as
     * a plain-text target, which is all an unknown window is known to accept.
     */
    private _pasteTarget(settings: Gio.Settings): PasteTarget {
        const window = global.display.get_focus_window();
        if (!window)
            return { ...UNKNOWN_TARGET };

        return classifyTarget(
            [window.get_wm_class(), window.get_wm_class_instance(), window.get_gtk_application_id()],
            {
                terminal: settings.get_strv('terminal-wm-classes'),
                richText: settings.get_strv('rich-text-wm-classes'),
                fileManager: settings.get_strv('file-manager-wm-classes'),
                fileDrop: settings.get_strv('file-drop-wm-classes'),
            }
        );
    }
}

function logError(error: unknown): void {
    console.error('clipboard-khipu:', error);
}
