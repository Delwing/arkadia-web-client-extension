import {
    storeInIndexedDB,
    getFromIndexedDB,
    clearIndexedDB,
    type IndexedDBConfig,
} from '@client/utils/dataCache';

/** The six cases of a noun phrase, as `odmien` prints them, lower case. */
export interface Odmiana {
    mianownik: string;
    dopelniacz: string;
    celownik: string;
    biernik: string;
    narzednik: string;
    miejscownik: string;
}

/** Keyed by mianownik. */
export type OdmianaSnapshot = Record<string, Odmiana>;

const CONFIG: IndexedDBConfig = {
    dbName: 'ArkadiaOdmiana',
    storeName: 'odmiana',
    key: 'snapshot',
};

let cache: OdmianaSnapshot = {};
let loaded = false;
let loadingPromise: Promise<void> | null = null;
const listeners = new Set<(snap: OdmianaSnapshot) => void>();

function notify(): void {
    for (const l of listeners) l(cache);
}

export function ensureOdmianaLoaded(): Promise<void> {
    if (loaded) return Promise.resolve();
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
        try {
            const raw = await getFromIndexedDB<OdmianaSnapshot>(CONFIG);
            cache = raw && typeof raw === 'object' ? raw : {};
        } catch {
            cache = {};
        }
        loaded = true;
        notify();
    })();
    return loadingPromise;
}

export function getOdmianaSnapshot(): OdmianaSnapshot {
    return cache;
}

export function getOdmiana(mianownik: string): Odmiana | undefined {
    return cache[mianownik.trim().toLowerCase()];
}

export function subscribeOdmiana(listener: (snap: OdmianaSnapshot) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Store one declension, replacing an earlier one of the same mianownik. */
export async function saveOdmiana(odmiana: Odmiana): Promise<void> {
    await ensureOdmianaLoaded();
    const prev = cache[odmiana.mianownik];
    if (prev && JSON.stringify(prev) === JSON.stringify(odmiana)) return;
    cache = { ...cache, [odmiana.mianownik]: odmiana };
    notify();
    try {
        await storeInIndexedDB(CONFIG, cache);
    } catch (e) {
        console.warn('[odmiana] persist failed', e);
    }
}

/** Test-only: forget the cache and the persisted record. */
export async function __resetOdmianaStoreForTests(): Promise<void> {
    cache = {};
    loaded = false;
    loadingPromise = null;
    listeners.clear();
    try {
        await clearIndexedDB(CONFIG);
    } catch {
        // ignore
    }
}
