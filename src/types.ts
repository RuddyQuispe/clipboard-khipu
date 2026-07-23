export type TextDetectedType = 'json' | 'yaml' | 'url' | 'path' | 'code' | 'plain';

/**
 * One MIME representation of a clipboard grab, stored verbatim as a blob on
 * disk. A single copy publishes several of these at once (text/html, text/rtf,
 * application/x-openoffice-*, …) and the pasting app picks the richest one it
 * understands — which is why formatting survives Calc → Writer but a terminal
 * still gets plain text.
 */
export interface Flavor {
    mime: string;
    /** Absolute path to the blob file. */
    path: string;
    size: number;
}

interface BaseEntry {
    id: string;
    createdAt: number;
    /**
     * Extra representations captured alongside the primary one. Empty for
     * plain-only copies. Replayed byte-for-byte on paste.
     */
    flavors: Flavor[];
}

export interface TextEntry extends BaseEntry {
    kind: 'text';
    text: string;
    detectedType: TextDetectedType;
}

export interface ImageEntry extends BaseEntry {
    kind: 'image';
    /** Absolute path to the stored image file on disk. */
    path: string;
    mime: string;
}

export interface FilesEntry extends BaseEntry {
    kind: 'files';
    uris: string[];
    operation: 'copy' | 'cut';
}

export type HistoryEntry = TextEntry | ImageEntry | FilesEntry;
