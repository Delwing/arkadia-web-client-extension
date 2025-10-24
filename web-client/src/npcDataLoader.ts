// Loader for NPC data sharing cache logic with map loader.
import { loadCachedJSON } from "@client/src/utils/dataCache";

const TTL = 24 * 60 * 60 * 1000; // 24h

export function loadNpcData() {
    return loadCachedJSON({
        url: 'https://delwing.github.io/arkadia-mapa/data/npc.json',
        indexedDB: { dbName: 'ArkadiaNpcDB', storeName: 'npcData', key: 'npc' },
        ttl: TTL,
    });
}
