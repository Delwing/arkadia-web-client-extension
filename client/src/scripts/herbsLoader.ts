import { loadCachedJSON } from "../utils/dataCache";
import type { HerbForms, HerbUse, HerbsData } from "../runtime/data";

export const HERBS_URL = "https://raw.githubusercontent.com/tjurczyk/arkadia-data/refs/heads/master/herbs_data.json";

const TTL = 24 * 60 * 60 * 1000; // 24h

export default async function loadHerbs(): Promise<HerbsData | null> {
    try {
        return await loadCachedJSON<HerbsData>({
            url: HERBS_URL,
            localStorageKey: "herbs_data",
            indexedDB: { dbName: "ArkadiaHerbsDB", storeName: "herbs", key: "herbs" },
            ttl: TTL,
        });
    } catch (e) {
        console.error("Failed to load herbs:", e);
        return null;
    }
}

export type { HerbForms, HerbUse, HerbsData };
