import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { HistoryEntry, TextDetectedType } from './types.js';

const POPUP_WIDTH = 460;
const POPUP_MAX_HEIGHT = 480;
const ROW_HEIGHT = 52;
const SEARCH_ROW_HEIGHT = 44;
const PREVIEW_MAX_LENGTH = 160;

export type HistorySelectHandler = (entry: HistoryEntry) => void;

interface Row {
    actor: St.BoxLayout;
    entry: HistoryEntry;
}

/**
 * Opens the modal clipboard-history popup. Only called when there is more
 * than one entry to choose from — a single entry is pasted directly by the
 * caller, with no UI at all.
 */
export function openHistoryPopup(entries: readonly HistoryEntry[], onSelect: HistorySelectHandler): void {
    new HistoryPopup(entries, onSelect).open();
}

class HistoryPopup {
    private readonly _entries: readonly HistoryEntry[];
    private readonly _onSelect: HistorySelectHandler;
    private readonly _container: St.BoxLayout;
    private readonly _searchEntry: St.Entry;
    private readonly _listBox: St.BoxLayout;
    private readonly _scrollView: St.ScrollView;
    private _rows: Row[] = [];
    private _selectedIndex = 0;
    private _grab: ReturnType<typeof Main.pushModal> | null = null;

    constructor(entries: readonly HistoryEntry[], onSelect: HistorySelectHandler) {
        this._entries = entries;
        this._onSelect = onSelect;

        this._searchEntry = new St.Entry({
            style_class: 'khipu-search',
            hint_text: 'Type to filter…',
            can_focus: true,
            x_expand: true,
        });
        this._searchEntry.clutter_text.connect('key-press-event', (_actor, event) => this._onKeyPress(event));
        this._searchEntry.clutter_text.connect('text-changed', () => this._onSearchChanged());

        this._listBox = new St.BoxLayout({ vertical: true, style_class: 'khipu-list', x_expand: true });

        this._scrollView = new St.ScrollView({
            style_class: 'khipu-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            x_expand: true,
        });
        this._scrollView.set_child(this._listBox);

        this._container = new St.BoxLayout({
            vertical: true,
            style_class: 'khipu-popup',
            width: POPUP_WIDTH,
            reactive: true,
        });
        this._container.add_child(this._searchEntry);
        this._container.add_child(this._scrollView);

        this._renderRows(this._entries);
    }

    open(): void {
        Main.layoutManager.uiGroup.add_child(this._container);
        this._position(this._entries.length);
        this._grab = Main.pushModal(this._container);
        this._searchEntry.grab_key_focus();
    }

    private _close(): void {
        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }
        this._container.destroy();
    }

    private _position(rowCount: number): void {
        const monitor = Main.layoutManager.currentMonitor ?? Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;

        const listHeight = Math.min(POPUP_MAX_HEIGHT - SEARCH_ROW_HEIGHT, Math.max(1, rowCount) * ROW_HEIGHT);
        this._scrollView.set_height(listHeight);

        const totalHeight = SEARCH_ROW_HEIGHT + listHeight;
        const x = monitor.x + Math.floor((monitor.width - POPUP_WIDTH) / 2);
        const y = monitor.y + Math.floor((monitor.height - totalHeight) / 2);
        this._container.set_position(x, y);
    }

    private _renderRows(entries: readonly HistoryEntry[]): void {
        this._listBox.destroy_all_children();
        this._rows = entries.map(entry => ({ actor: this._buildRow(entry), entry }));

        if (this._rows.length === 0) {
            this._listBox.add_child(new St.Label({ text: 'No matches', style_class: 'khipu-empty' }));
        } else {
            for (const row of this._rows)
                this._listBox.add_child(row.actor);
        }

        this._selectedIndex = 0;
        this._highlightSelected();
    }

    private _buildRow(entry: HistoryEntry): St.BoxLayout {
        const row = new St.BoxLayout({ style_class: 'khipu-row', reactive: true, track_hover: true, x_expand: true });

        row.add_child(new St.Icon({ style_class: 'khipu-row-icon', icon_size: 20, gicon: iconForEntry(entry) }));

        const textBox = new St.BoxLayout({ vertical: true, x_expand: true, style_class: 'khipu-row-text' });
        const primaryStyle =
            entry.kind === 'text' ? 'khipu-row-primary khipu-row-primary-mono' : 'khipu-row-primary';
        textBox.add_child(new St.Label({ text: previewFor(entry), style_class: primaryStyle }));
        textBox.add_child(new St.Label({ text: metaFor(entry), style_class: 'khipu-row-meta' }));
        row.add_child(textBox);

        row.connect('button-press-event', () => {
            this._activate(entry);
            return Clutter.EVENT_STOP;
        });

        return row;
    }

    private _onSearchChanged(): void {
        const query = this._searchEntry.get_text().trim().toLowerCase();
        const filtered = query.length === 0 ? this._entries : this._entries.filter(entry => matches(entry, query));
        this._renderRows(filtered);
    }

    private _onKeyPress(event: Clutter.Event): boolean {
        switch (event.get_key_symbol()) {
        case Clutter.KEY_Escape:
            this._close();
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Down:
            this._moveSelection(1);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Up:
            this._moveSelection(-1);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Return:
        case Clutter.KEY_KP_Enter:
        case Clutter.KEY_ISO_Enter:
            this._activateSelected();
            return Clutter.EVENT_STOP;
        default:
            return Clutter.EVENT_PROPAGATE;
        }
    }

    private _moveSelection(delta: number): void {
        if (this._rows.length === 0)
            return;

        const next = this._selectedIndex + delta;
        this._selectedIndex = Math.min(Math.max(next, 0), this._rows.length - 1);
        this._highlightSelected();
    }

    private _highlightSelected(): void {
        this._rows.forEach((row, index) => {
            row.actor.style_class = index === this._selectedIndex ? 'khipu-row khipu-row-selected' : 'khipu-row';
        });
        this._scrollSelectedIntoView();
    }

    private _scrollSelectedIntoView(): void {
        const adjustment = this._scrollView.vadjustment;
        const viewHeight = this._scrollView.height;
        const rowTop = this._selectedIndex * ROW_HEIGHT;
        const rowBottom = rowTop + ROW_HEIGHT;

        if (rowTop < adjustment.value)
            adjustment.value = rowTop;
        else if (rowBottom > adjustment.value + viewHeight)
            adjustment.value = rowBottom - viewHeight;
    }

    private _activateSelected(): void {
        const row = this._rows[this._selectedIndex];
        if (row)
            this._activate(row.entry);
    }

    private _activate(entry: HistoryEntry): void {
        this._close();
        this._onSelect(entry);
    }
}

function matches(entry: HistoryEntry, query: string): boolean {
    switch (entry.kind) {
    case 'text':
        return entry.text.toLowerCase().includes(query);
    case 'files':
        return entry.uris.some(uri => uri.toLowerCase().includes(query));
    case 'image':
        return entry.mime.toLowerCase().includes(query);
    }
}

function previewFor(entry: HistoryEntry): string {
    switch (entry.kind) {
    case 'text': {
        const lines = entry.text.split('\n');
        const firstLine = (lines.find(line => line.trim().length > 0) ?? lines[0] ?? '').trim();
        const snippet = truncate(firstLine, PREVIEW_MAX_LENGTH);
        return lines.length > 1 ? `${snippet}  ⏎` : snippet;
    }
    case 'image':
        return `Image (${entry.mime.replace('image/', '')})`;
    case 'files': {
        const names = entry.uris.map(uriBasename);
        return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1} more`;
    }
    }
}

function metaFor(entry: HistoryEntry): string {
    const when = formatRelativeTime(entry.createdAt);
    switch (entry.kind) {
    case 'text':
        return `${entry.detectedType} · ${when}`;
    case 'image':
        return `image · ${when}`;
    case 'files':
        return `${entry.uris.length} file${entry.uris.length === 1 ? '' : 's'} · ${when}`;
    }
}

function iconForEntry(entry: HistoryEntry): Gio.Icon {
    switch (entry.kind) {
    case 'image':
        return Gio.FileIcon.new(Gio.File.new_for_path(entry.path));
    case 'files':
        return Gio.ThemedIcon.new('folder-symbolic');
    case 'text':
        return Gio.ThemedIcon.new(iconNameForTextType(entry.detectedType));
    }
}

function iconNameForTextType(type: TextDetectedType): string {
    switch (type) {
    case 'url':
        return 'web-browser-symbolic';
    case 'path':
        return 'folder-symbolic';
    case 'json':
    case 'yaml':
    case 'code':
        return 'text-x-script-symbolic';
    case 'plain':
        return 'edit-copy-symbolic';
    }
}

function uriBasename(uri: string): string {
    try {
        const path = decodeURIComponent(uri.replace(/^file:\/\//, ''));
        return path.split('/').filter(Boolean).pop() ?? path;
    } catch {
        return uri;
    }
}

function truncate(text: string, maxLength: number): string {
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function formatRelativeTime(createdAt: number): string {
    const minutes = Math.floor((Date.now() - createdAt) / 60000);
    if (minutes < 1)
        return 'just now';
    if (minutes < 60)
        return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)
        return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}
