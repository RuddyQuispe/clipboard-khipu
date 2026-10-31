import Gio from 'gi://Gio';

import type { HistoryEntry, TextEntry, FilesEntry, Flavor } from './types.js';

/**
 * Pure paste decisions: what kind of window is receiving the paste, and which
 * single representation of an entry it should get. Kept free of St/Clutter so
 * the rules can be tested outside GNOME Shell; `paster.ts` carries them out.
 */

export const FILES_MIME = 'x-special/gnome-copied-files';
export const URI_LIST_MIME = 'text/uri-list';

/**
 * Rich interchange formats, best first. HTML is the one every word processor
 * and mail client understands; RTF is the fallback for the few that do not.
 *
 * App-specific formats (application/x-openoffice-*) are captured and kept, but
 * never republished on their own: they only round-trip when their companion
 * descriptor format is offered in the same grab, which we cannot do.
 */
export const RICH_MIME_PRIORITY = ['text/html', 'text/rtf', 'application/rtf', 'text/richtext'];

/** What the window receiving the paste can make use of. */
export interface PasteTarget {
    /** Terminals paste with Ctrl+Shift+V, and only ever want plain text. */
    isTerminal: boolean;
    /** Word processors, spreadsheets and mail clients keep HTML/RTF formatting. */
    prefersRichText: boolean;
    /** File managers are the only target that understands a copy/cut file grab. */
    isFileManager: boolean;
    /**
     * Browsers and web chat clients take a file through the same paste handler a
     * drop would use, so they get the URI list and the file uploads.
     */
    acceptsFileDrop: boolean;
}

/** The configurable WM-class token lists, one per kind of target. */
export interface TargetHints {
    terminal: readonly string[];
    richText: readonly string[];
    fileManager: readonly string[];
    fileDrop: readonly string[];
}

export const UNKNOWN_TARGET: PasteTarget = {
    isTerminal: false,
    prefersRichText: false,
    isFileManager: false,
    acceptsFileDrop: false,
};

/**
 * Classifies a window from its identifiers (WM class, WM class instance, GTK
 * application id). A hint matches when any identifier contains it,
 * case-insensitively; empty hints never match. A window with no identifier is
 * an unknown target, which is treated as plain text only.
 */
export function classifyTarget(windowIds: readonly (string | null | undefined)[], hints: TargetHints): PasteTarget {
    const ids = windowIds
        .filter((id): id is string => typeof id === 'string')
        .map(id => id.toLowerCase());
    if (ids.length === 0)
        return { ...UNKNOWN_TARGET };

    const matches = (tokens: readonly string[]): boolean =>
        tokens
            .map(token => token.toLowerCase())
            .some(token => token.length > 0 && ids.some(id => id.includes(token)));

    return {
        isTerminal: matches(hints.terminal),
        prefersRichText: matches(hints.richText),
        isFileManager: matches(hints.fileManager),
        acceptsFileDrop: matches(hints.fileDrop),
    };
}

/**
 * Whether a stored formatted flavor should be tried before the plain text.
 * Only text carries one, only rich-text apps get it, and terminals or a forced
 * plain paste (Ctrl+Enter) never do.
 */
export function wantsFormatting(entry: HistoryEntry, target: PasteTarget, plainOnly: boolean): boolean {
    return entry.kind === 'text' && !plainOnly && !target.isTerminal && target.prefersRichText;
}

/**
 * The best formatted representation stored for `entry`, if any. Only text
 * carries one: an image's own bytes already are its richest form, and a file
 * list is republished as URIs or as the file's contents, never as markup.
 */
export function pickRichFlavor(entry: TextEntry): Flavor | null {
    for (const mime of RICH_MIME_PRIORITY) {
        const flavor = entry.flavors.find(candidate => candidate.mime === mime);
        if (flavor)
            return flavor;
    }
    return null;
}

/**
 * How a file list is handed to the target:
 * - `paths`: the local paths as text (terminals, Ctrl+Enter, unknown windows);
 * - `file-manager`: the copy/cut grab itself, so pasting copies or moves the file;
 * - `uri-list`: the files to attach, the way a drop would;
 * - `embed-image`: a lone file in a rich-text app, embedded if it is a picture
 *   (the caller falls back to `uri-list` when it is not).
 */
export type FilesPasteMode = 'paths' | 'file-manager' | 'uri-list' | 'embed-image';

export function filesPasteMode(entry: FilesEntry, target: PasteTarget, plainOnly: boolean): FilesPasteMode {
    if (target.isTerminal || plainOnly)
        return 'paths';
    if (target.isFileManager)
        return 'file-manager';
    if (target.acceptsFileDrop)
        return 'uri-list';
    if (target.prefersRichText)
        return entry.uris.length === 1 ? 'embed-image' : 'uri-list';
    return 'paths';
}

/** Local filesystem path behind a file:// URI, percent-decoding included. */
export function uriToPath(uri: string): string | null {
    return Gio.File.new_for_uri(uri).get_path();
}

/** The files as local paths, one per line; a URI with no local path stays a URI. */
export function plainPathsOf(entry: FilesEntry): string {
    return entry.uris.map(uri => uriToPath(uri) ?? uri).join('\n');
}

/** The x-special/gnome-copied-files payload: the operation, then one URI per line. */
export function copiedFilesPayload(entry: FilesEntry): string {
    return `${entry.operation}\n${entry.uris.join('\n')}`;
}

/** The text/uri-list payload: CRLF-terminated URIs, as RFC 2483 requires. */
export function uriListPayload(entry: FilesEntry): string {
    return `${entry.uris.join('\r\n')}\r\n`;
}

/** Guessed from the name alone — no disk access, and enough to spot a picture. */
export function imageMimeForPath(path: string): string | null {
    const [contentType] = Gio.content_type_guess(path, null);
    return contentType.startsWith('image/') ? contentType : null;
}
