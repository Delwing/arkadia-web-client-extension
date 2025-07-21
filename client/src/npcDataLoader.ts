import { loadCachedJSON } from "./utils/dataCache";

const TTL = 24 * 60 * 60 * 1000; // 24h

export default function loadNpcData() {
    return loadCachedJSON({
        url: 'https://delwing.github.io/arkadia-mapa/data/npc.json',
        localStorageKey: 'npc',
        indexedDB: { dbName: 'ArkadiaNpcDB', storeName: 'npcData', key: 'npc' },
        ttl: TTL,
        cacheInLocalStorage: false,
    });
}
