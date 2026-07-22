export type TextDetectedType = 'json' | 'yaml' | 'url' | 'path' | 'code' | 'plain';

export interface TextEntry {
    id: string;
    kind: 'text';
    createdAt: number;
    text: string;
    detectedType: TextDetectedType;
}

export interface ImageEntry {
    id: string;
    kind: 'image';
    createdAt: number;
    /** Absolute path to the stored image file on disk. */
    path: string;
    mime: string;
}

export interface FilesEntry {
    id: string;
    kind: 'files';
    createdAt: number;
    uris: string[];
    operation: 'copy' | 'cut';
}

export type HistoryEntry = TextEntry | ImageEntry | FilesEntry;
