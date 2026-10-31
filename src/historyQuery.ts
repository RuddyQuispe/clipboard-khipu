import type { HistoryEntry } from './types.js';

/**
 * Pure display logic for the history popup: filtering, ordering, selection and
 * the text shown for each row. Kept free of St/Clutter so it can be tested
 * outside GNOME Shell.
 */

const PREVIEW_MAX_LENGTH = 160;

/** The rows as displayed: search-filtered, then pinned section first. */
export function visibleEntries(entries: readonly HistoryEntry[], rawQuery: string): HistoryEntry[] {
    const query = rawQuery.trim().toLowerCase();
    const filtered = query.length === 0 ? entries : entries.filter(entry => matches(entry, query));
    return pinnedFirst(filtered);
}

/** Stable partition: pinned entries first, each group keeping newest-first order. */
export function pinnedFirst(entries: readonly HistoryEntry[]): HistoryEntry[] {
    return [...entries.filter(entry => entry.pinned), ...entries.filter(entry => !entry.pinned)];
}

/** The newest unpinned row, so Enter pastes the latest copy; row 0 if all are pinned. */
export function defaultSelection(entries: readonly HistoryEntry[]): number {
    const index = entries.findIndex(entry => !entry.pinned);
    return index === -1 ? 0 : index;
}

/** Case-insensitive match; `query` must already be trimmed and lower-cased. */
export function matches(entry: HistoryEntry, query: string): boolean {
    switch (entry.kind) {
    case 'text':
        return entry.text.toLowerCase().includes(query);
    case 'files':
        return entry.uris.some(uri => uri.toLowerCase().includes(query));
    case 'image':
        return entry.mime.toLowerCase().includes(query);
    }
}

export function previewFor(entry: HistoryEntry): string {
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

export function metaFor(entry: HistoryEntry, now = Date.now()): string {
    const when = formatRelativeTime(entry.createdAt, now);
    const format = formatBadge(entry);

    switch (entry.kind) {
    case 'text':
        return `${entry.detectedType}${format} · ${when}`;
    case 'image':
        return `image${format} · ${when}`;
    case 'files':
        return `${entry.uris.length} file${entry.uris.length === 1 ? '' : 's'}${format} · ${when}`;
    }
}

/** Tells the user this entry carries formatting, and roughly of what kind. */
export function formatBadge(entry: HistoryEntry): string {
    if (entry.flavors.length === 0)
        return '';

    const mimes = entry.flavors.map(flavor => flavor.mime);
    if (mimes.includes('text/html'))
        return ' · html';
    if (mimes.some(mime => mime === 'text/rtf' || mime === 'application/rtf'))
        return ' · rtf';
    return ' · formatted';
}

export function uriBasename(uri: string): string {
    try {
        const path = decodeURIComponent(uri.replace(/^file:\/\//, ''));
        return path.split('/').filter(Boolean).pop() ?? path;
    } catch {
        return uri;
    }
}

export function truncate(text: string, maxLength: number): string {
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export function formatRelativeTime(createdAt: number, now = Date.now()): string {
    const minutes = Math.floor((now - createdAt) / 60000);
    if (minutes < 1)
        return 'just now';
    if (minutes < 60)
        return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)
        return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}
