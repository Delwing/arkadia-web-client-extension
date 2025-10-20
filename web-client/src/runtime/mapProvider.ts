import type { EmbeddedMap } from '../embed';

let embeddedMapInstance: EmbeddedMap | null = null;

export function setEmbeddedMap(map: EmbeddedMap | null) {
    embeddedMapInstance = map;
    if (map) {
        (globalThis as any).embedded = map;
    } else if ((globalThis as any).embedded) {
        delete (globalThis as any).embedded;
    }
}

export function getEmbeddedMap(): EmbeddedMap {
    if (!embeddedMapInstance) {
        throw new Error('Embedded map has not been initialised.');
    }
    return embeddedMapInstance;
}

export function peekEmbeddedMap(): EmbeddedMap | null {
    return embeddedMapInstance;
}

export function clearEmbeddedMap() {
    setEmbeddedMap(null);
}
