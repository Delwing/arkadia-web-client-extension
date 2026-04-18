import {
    storeInIndexedDB,
    getFromIndexedDB,
    clearIndexedDB,
    type IndexedDBConfig,
} from '@client/utils/dataCache';

export interface WeaponEntry {
    short: string;
    typ: string;
    rodzaj: string;
    klute: number;
    obuch: number;
    ciete: number;
    chwyt: string;
    magik: 0 | 1;
    srebro: 0 | 1;
    opis: string;
    waga: number;
    obj: number;
    cena: number;
    wywazenie: number;
    parowanie: number;
    roomId: number | null;
    color?: string;
}

export interface ArmorEntry {
    short: string;
    typ: string;
    klute: number;
    obuch: number;
    ciete: number;
    magik: 0 | 1;
    opis: string;
    waga: number;
    obj: number;
    cena: number;
    oslona: string;
    roomId: number | null;
    color?: string;
}

export interface ShieldEntry {
    short: string;
    klute: number;
    obuch: number;
    ciete: number;
    magik: 0 | 1;
    opis: string;
    waga: number;
    obj: number;
    cena: number;
    parowanie: number;
    oslona: string;
    roomId: number | null;
    color?: string;
}

export type ZlomEntry = WeaponEntry | ShieldEntry | ArmorEntry;
export type ZlomKind = 'bronie' | 'tarcze' | 'zbroje';

export interface ZlomSnapshot {
    bronie: WeaponEntry[];
    tarcze: ShieldEntry[];
    zbroje: ArmorEntry[];
}

const CONFIG: IndexedDBConfig = {
    dbName: 'ArkadiaZlom',
    storeName: 'zlom',
    key: 'snapshot',
};

function emptySnapshot(): ZlomSnapshot {
    return { bronie: [], tarcze: [], zbroje: [] };
}

let cache: ZlomSnapshot = emptySnapshot();
let loaded = false;
let loadingPromise: Promise<void> | null = null;
const listeners = new Set<(snap: ZlomSnapshot) => void>();

function normalize(raw: unknown): ZlomSnapshot {
    const s = (raw ?? {}) as Partial<ZlomSnapshot>;
    return {
        bronie: Array.isArray(s.bronie) ? s.bronie : [],
        tarcze: Array.isArray(s.tarcze) ? s.tarcze : [],
        zbroje: Array.isArray(s.zbroje) ? s.zbroje : [],
    };
}

function notify(): void {
    for (const l of listeners) l(cache);
}

/**
 * Initialize the in-memory cache from IndexedDB. Safe to call multiple times.
 */
export function ensureZlomLoaded(): Promise<void> {
    if (loaded) return Promise.resolve();
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
        try {
            const raw = await getFromIndexedDB<ZlomSnapshot>(CONFIG);
            cache = normalize(raw);
        } catch {
            cache = emptySnapshot();
        }
        loaded = true;
        notify();
    })();
    return loadingPromise;
}

/**
 * Synchronous accessor — returns the in-memory cache. Call ensureZlomLoaded() first
 * to guarantee it reflects persisted data.
 */
export function getZlomSnapshot(): ZlomSnapshot {
    return cache;
}

export function subscribeZlom(listener: (snap: ZlomSnapshot) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

async function persist(): Promise<void> {
    try {
        await storeInIndexedDB(CONFIG, cache);
    } catch (e) {
        console.warn('[zlom] persist failed', e);
    }
}

/**
 * Mutator-style update — replaces the cache with the result of `fn(current)`,
 * persists asynchronously and notifies subscribers. The in-memory cache is
 * updated synchronously once the initial load has completed, so callers can
 * observe their own writes via getZlomSnapshot() without awaiting persistence.
 */
export function updateZlomSnapshot(fn: (s: ZlomSnapshot) => ZlomSnapshot): Promise<void> {
    if (!loaded) {
        return ensureZlomLoaded().then(() => {
            cache = fn(cache);
            notify();
            return persist();
        });
    }
    cache = fn(cache);
    notify();
    return persist();
}

export function clearZlomStore(): Promise<void> {
    const run = () => {
        cache = emptySnapshot();
        notify();
        return clearIndexedDB(CONFIG).catch(e => {
            console.warn('[zlom] clear failed', e);
        });
    };
    if (!loaded) return ensureZlomLoaded().then(run);
    return run();
}

// Kick off loading eagerly on first import so subsequent sync reads are
// likely to see persisted data even before any explicit initializer runs.
ensureZlomLoaded().catch(() => {});

/**
 * Test-only helper: reset the in-memory cache and loading state AND clear the
 * persisted IndexedDB record so the next ensureZlomLoaded() starts from empty.
 */
export async function __resetZlomStoreForTests(): Promise<void> {
    cache = emptySnapshot();
    loaded = false;
    loadingPromise = null;
    listeners.clear();
    try {
        await clearIndexedDB(CONFIG);
    } catch {
        // ignore
    }
}

/**
 * Replace-by-opis upsert. If an entry with the same `opis` exists it's overwritten
 * (preserving its prior color when the new entry has none). Otherwise the entry
 * is appended.
 */
export function upsertByOpis<T extends ZlomEntry>(list: T[], entry: T): T[] {
    const idx = entry.opis ? list.findIndex(e => e.opis === entry.opis) : -1;
    if (idx >= 0) {
        const prev = list[idx];
        const merged: T = { ...entry };
        if (!merged.color && prev.color) merged.color = prev.color;
        const next = list.slice();
        next[idx] = merged;
        return next;
    }
    return [...list, entry];
}
