import { loadCachedJSON } from "../utils/dataCache";

export const MAGICS_URL = "https://raw.githubusercontent.com/tjurczyk/arkadia-data/refs/heads/master/magics_data.json";

interface MagicsFile {
    magics: Record<string, { regexps?: string[] }>;
}

const TTL = 24 * 60 * 60 * 1000; // 24h

export default async function loadMagics(): Promise<string[]> {
    try {
        const data = await loadCachedJSON<MagicsFile>({
            url: MAGICS_URL,
            localStorageKey: "magics",
            indexedDB: { dbName: "ArkadiaMagicsDB", storeName: "magics", key: "magics" },
            ttl: TTL,
        });
        const magics: string[] = [];
        for (const value of Object.values(data.magics)) {
            if (value && Array.isArray(value.regexps)) {
                magics.push(...value.regexps);
            }
        }
        return magics;
    } catch (e) {
        console.error("Failed to load magics:", e);
        return [];
    }
}
