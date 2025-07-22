import { loadCachedJSON } from "../utils/dataCache";

export const HERBS_URL = "https://raw.githubusercontent.com/tjurczyk/arkadia-data/refs/heads/master/herbs_data.json";

export interface HerbForms {
    mianownik: string;
    dopelniacz: string;
    biernik: string;
    mnoga_mianownik: string;
    mnoga_dopelniacz: string;
    mnoga_biernik: string;
}

export interface HerbUse {
    action: string;
    effect: string;
}

export interface HerbsData {
    herb_id_to_odmiana: Record<string, HerbForms>;
    version: number;
    herb_id_to_use: Record<string, HerbUse[]>;
}

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
