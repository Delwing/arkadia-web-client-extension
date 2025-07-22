import { loadCachedJSON } from "../utils/dataCache";

export const MAGIC_KEYS_URL = "https://raw.githubusercontent.com/tjurczyk/arkadia-data/refs/heads/master/magic_keys.json";

interface MagicKeysData {
    magic_keys: string[];
}

const TTL = 24 * 60 * 60 * 1000; // 24h

export default async function loadMagicKeys(): Promise<string[]> {
    try {
        const data = await loadCachedJSON<MagicKeysData>({
            url: MAGIC_KEYS_URL,
            localStorageKey: "magic_keys",
            indexedDB: { dbName: "ArkadiaMagicKeysDB", storeName: "magicKeys", key: "keys" },
            ttl: TTL,
        });
        if (!Array.isArray(data.magic_keys)) {
            throw new Error("Invalid data format");
        }
        return data.magic_keys;
    } catch (e) {
        console.error("Failed to load magic keys:", e);
        return [];
    }
}
