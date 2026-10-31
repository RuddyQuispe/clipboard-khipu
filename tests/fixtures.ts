import type { FilesEntry, Flavor, ImageEntry, TextEntry } from '../src/types.js';

let counter = 0;
const nextId = (): string => `id-${++counter}`;

export function textEntry(text: string, extra: Partial<TextEntry> = {}): TextEntry {
    return { id: nextId(), kind: 'text', createdAt: Date.now(), flavors: [], text, detectedType: 'plain', ...extra };
}

export function imageEntry(mime: string, extra: Partial<ImageEntry> = {}): ImageEntry {
    return { id: nextId(), kind: 'image', createdAt: Date.now(), flavors: [], path: '/tmp/x', mime, ...extra };
}

export function filesEntry(uris: string[], extra: Partial<FilesEntry> = {}): FilesEntry {
    return { id: nextId(), kind: 'files', createdAt: Date.now(), flavors: [], uris, operation: 'copy', ...extra };
}

export function flavor(mime: string): Flavor {
    return { mime, path: `/blobs/${mime.replace('/', '_')}.bin`, size: 1 };
}
