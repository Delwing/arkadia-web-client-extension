// This file provides a way to load map and colors data asynchronously.
import { loadCachedJSON } from "@client/src/utils/dataCache.ts";

const TTL = 24 * 60 * 60 * 1000; // 24h

export function loadMapData(onProgress?: (progress: number, loaded?: number, total?: number) => void) {
    return loadCachedJSON({
        url: 'https://delwing.github.io/arkadia-mapa/data/mapExport.json',
        localStorageKey: 'cachedMapData',
        indexedDB: { dbName: 'ArkadiaMapDB', storeName: 'mapData', key: 'mapExport' },
        ttl: TTL,
        onProgress,
    });
}

export function loadColors() {
    return loadCachedJSON({
        url: 'https://delwing.github.io/arkadia-mapa/data/colors.json',
        localStorageKey: 'cachedColors',
        ttl: TTL,
    });
}
