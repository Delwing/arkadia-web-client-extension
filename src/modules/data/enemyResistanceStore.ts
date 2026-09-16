import {
    storeInIndexedDB,
    getFromIndexedDB,
    clearIndexedDB,
    type IndexedDBConfig,
} from '@client/utils/dataCache';

export type ResistanceKind = 'odporny' | 'wrazliwy';

export interface ResistanceTrait {
    kind: ResistanceKind;
    /** Qualifier as written by the game, e.g. "wyjatkowo"; empty when absent. */
    degree: string;
    /** Damage source in the accusative, as written by the game, e.g. "magie zycia". */
    target: string;
}

export interface EnemyResistanceEntry {
    /** Enemy kind - the nominative noun without adjectives, e.g. "kikimora". */
    name: string;
    traits: ResistanceTrait[];
    /** Original trait phrase ("wyjatkowo odporny na ...") kept for re-parsing. */
    raw: string;
    roomId: number | null;
    updatedAt: number;
}

export interface DamageType {
    key: string;
    match: RegExp;
}

export interface DamageCategory {
    label: string;
    types: DamageType[];
}

/** Canonical damage types, grouped as in the in-game resistance list. */
export const DAMAGE_CATEGORIES: DamageCategory[] = [
    {
        label: 'Obrazenia fizyczne',
        types: [
            { key: 'ciete', match: /ciet/ },
            { key: 'klute', match: /klut/ },
            { key: 'obuchowe', match: /obuch/ },
            { key: 'bronie niemagiczne', match: /niemagiczn/ },
        ],
    },
    {
        label: 'Obrazenia od zywiolow',
        types: [
            { key: 'ogien', match: /ogien|ogn/ },
            { key: 'powietrze', match: /powietrz/ },
            { key: 'woda', match: /\bwod/ },
            { key: 'ziemia', match: /ziemi/ },
        ],
    },
    {
        label: 'Obrazenia magiczne',
        types: [
            { key: 'czysta magia', match: /czyst/ },
            { key: 'magia umyslu', match: /umysl/ },
            { key: 'magia zycia', match: /zycia/ },
            { key: 'magia smierci', match: /smierc/ },
        ],
    },
    {
        label: 'Inne',
        types: [
            { key: 'elektrycznosc', match: /elektryczn/ },
            { key: 'kwas', match: /kwas/ },
            { key: 'spaczenie', match: /spacz/ },
            { key: 'trucizna', match: /trucizn/ },
            { key: 'alkohol', match: /alkohol/ },
            { key: 'zimno', match: /zimn/ },
        ],
    },
];

/** Maps a game phrase ("magie zycia", "zywiol ognia") to a canonical damage type key. */
export function damageTypeOf(target: string): string | null {
    const t = target.toLowerCase();
    for (const category of DAMAGE_CATEGORIES) {
        for (const type of category.types) {
            if (type.match.test(t)) return type.key;
        }
    }
    return null;
}

export interface EnemyResistanceSnapshot {
    entries: EnemyResistanceEntry[];
}

const CONFIG: IndexedDBConfig = {
    dbName: 'ArkadiaEnemyResistances',
    storeName: 'resistances',
    key: 'snapshot',
};

function emptySnapshot(): EnemyResistanceSnapshot {
    return { entries: [] };
}

let cache: EnemyResistanceSnapshot = emptySnapshot();
let loaded = false;
let loadingPromise: Promise<void> | null = null;
const listeners = new Set<(snap: EnemyResistanceSnapshot) => void>();

function normalize(raw: unknown): EnemyResistanceSnapshot {
    const s = (raw ?? {}) as Partial<EnemyResistanceSnapshot>;
    return { entries: Array.isArray(s.entries) ? s.entries : [] };
}

function notify(): void {
    for (const l of listeners) l(cache);
}

export function ensureEnemyResistancesLoaded(): Promise<void> {
    if (loaded) return Promise.resolve();
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
        try {
            cache = normalize(await getFromIndexedDB<EnemyResistanceSnapshot>(CONFIG));
        } catch {
            cache = emptySnapshot();
        }
        loaded = true;
        notify();
    })();
    return loadingPromise;
}

export function getEnemyResistanceSnapshot(): EnemyResistanceSnapshot {
    return cache;
}

/** Kinds whose name is two words; nominative forms of the kill counter's list (kill.ts). */
const TWO_WORD_KINDS = new Set([
    'czarny ork',
    'dziki ork',
    'elfi egzekutor',
    'kamienny troll',
    'kon bojowy',
    'krasnolud chaosu',
    'lodowy troll',
    'pajak sieciarz',
    'pomiot chaosu',
    'rumak bojowy',
    'rycerz chaosu',
    'smoczy ogr',
    'smok chaosu',
    'straznik wiezy',
    'szkielet goblina',
    'szkielet krasnoluda',
    'szkielet orka',
    'tancerz wojny',
    'troll gorski',
    'troll jaskiniowy',
    'zjawa kobiety',
    'zjawa straznika',
    'zywiolak ognia',
    'zywiolak powietrza',
    'zywiolak wody',
    'zywiolak ziemi',
]);

/** "wielka krwiozercza kikimora" -> "kikimora"; adjectives don't change resistances. */
export function enemyKind(name: string): string {
    const words = name.trim().toLowerCase().split(/\s+/);
    const lastTwo = words.slice(-2).join(' ');
    if (words.length >= 2 && TWO_WORD_KINDS.has(lastTwo)) return lastTwo;
    return words[words.length - 1] ?? '';
}

export function findEnemyResistance(name: string): EnemyResistanceEntry | undefined {
    const key = enemyKind(name);
    return cache.entries.find(e => e.name === key);
}

export function subscribeEnemyResistances(listener: (snap: EnemyResistanceSnapshot) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

async function persist(): Promise<void> {
    try {
        await storeInIndexedDB(CONFIG, cache);
    } catch (e) {
        console.warn('[enemyResistances] persist failed', e);
    }
}

export function updateEnemyResistanceSnapshot(
    fn: (s: EnemyResistanceSnapshot) => EnemyResistanceSnapshot,
): Promise<void> {
    const run = () => {
        cache = fn(cache);
        notify();
        return persist();
    };
    if (!loaded) return ensureEnemyResistancesLoaded().then(run);
    return run();
}

/** Replace-by-name upsert: the latest evaluation of a kind wins. */
export function upsertEnemyResistance(
    list: EnemyResistanceEntry[],
    entry: EnemyResistanceEntry,
): EnemyResistanceEntry[] {
    const idx = list.findIndex(e => e.name === entry.name);
    if (idx < 0) return [...list, entry];
    const next = list.slice();
    next[idx] = entry;
    return next;
}

export function removeEnemyResistance(name: string): Promise<boolean> {
    const key = enemyKind(name);
    if (!cache.entries.some(e => e.name === key) && loaded) return Promise.resolve(false);
    let removed = false;
    return updateEnemyResistanceSnapshot(s => {
        const entries = s.entries.filter(e => e.name !== key);
        removed = entries.length !== s.entries.length;
        return { entries };
    }).then(() => removed);
}

export function clearEnemyResistanceStore(): Promise<void> {
    const run = () => {
        cache = emptySnapshot();
        notify();
        return clearIndexedDB(CONFIG).catch(e => {
            console.warn('[enemyResistances] clear failed', e);
        });
    };
    if (!loaded) return ensureEnemyResistancesLoaded().then(run);
    return run();
}

ensureEnemyResistancesLoaded().catch(() => {});

/** Test-only: reset cache, loading state and the persisted record. */
export async function __resetEnemyResistanceStoreForTests(): Promise<void> {
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
