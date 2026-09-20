import {
    storeInIndexedDB,
    getFromIndexedDB,
    clearIndexedDB,
    type IndexedDBConfig,
} from '@client/utils/dataCache';

export type ResistanceKind = 'odporny' | 'wrazliwy';

export interface ResistanceTrait {
    kind: ResistanceKind;
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
    /** Map area the evaluation happened in; the same kind can differ between areas. */
    areaId: number | null;
    /** Area name as known when captured, so entries read without the map loaded. */
    areaName: string | null;
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
/** Set by normalizeEntry when the loaded record needed rewriting to the current shape. */
let migrated = false;

/**
 * Brings a stored entry to the current shape: entries written before areas were
 * tracked carry none, and older ones carry a per-trait `degree` that turned out to
 * be fixed boilerplate. Returns the entry unchanged when it is already current.
 */
function normalizeEntry(e: EnemyResistanceEntry): EnemyResistanceEntry {
    const staleDegree = e.traits.some(t => 'degree' in t);
    if (!staleDegree && e.areaId !== undefined && e.areaName !== undefined) return e;
    migrated = true;
    return {
        ...e,
        traits: staleDegree ? e.traits.map(t => ({ kind: t.kind, target: t.target })) : e.traits,
        areaId: e.areaId ?? null,
        areaName: e.areaName ?? null,
    };
}

function normalize(raw: unknown): EnemyResistanceSnapshot {
    const s = (raw ?? {}) as Partial<EnemyResistanceSnapshot>;
    return { entries: Array.isArray(s.entries) ? s.entries.map(normalizeEntry) : [] };
}

function notify(): void {
    for (const l of listeners) l(cache);
}

export function ensureEnemyResistancesLoaded(): Promise<void> {
    if (loaded) return Promise.resolve();
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
        try {
            migrated = false;
            cache = normalize(await getFromIndexedDB<EnemyResistanceSnapshot>(CONFIG));
            // Write the migrated shape back, so the old fields go away for good.
            if (migrated) await persist();
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

/**
 * Identity of an entry: one kind per area, since resistances can differ between areas.
 * "|" is a safe separator - a kind is lowercase words and an area is a number.
 */
function entryKey(e: { name: string; areaId: number | null }): string {
    return `${e.name}|${e.areaId ?? ''}`;
}

/** Replace-by-name-and-area upsert: the latest evaluation in an area wins. */
export function upsertEnemyResistance(
    list: EnemyResistanceEntry[],
    entry: EnemyResistanceEntry,
): EnemyResistanceEntry[] {
    const key = entryKey(entry);
    const idx = list.findIndex(e => entryKey(e) === key);
    if (idx < 0) return [...list, entry];
    const next = list.slice();
    next[idx] = entry;
    return next;
}

/** Canonical form of a trait list, so entries can be compared across areas. */
export function resistanceSignature(traits: ResistanceTrait[]): string {
    return traits
        .map(t => `${t.kind}|${t.target}`.toLowerCase())
        .sort()
        .join(';');
}

export function areaLabelOf(entry: EnemyResistanceEntry): string {
    if (entry.areaName) return entry.areaName;
    if (entry.areaId != null) return `obszar #${entry.areaId}`;
    return 'nieznany obszar';
}

export interface EnemyResistanceGroup {
    /** Stable identity for list keys and removals. */
    key: string;
    name: string;
    traits: ResistanceTrait[];
    /** Every area this exact set of resistances was captured in. */
    entries: EnemyResistanceEntry[];
    /** Areas, joined - set only when the same kind differs between areas. */
    areaLabel: string | null;
    /** True when some entry has no area, so it cannot be told apart from another area's. */
    hasUnknownArea: boolean;
    updatedAt: number;
}

/**
 * Folds entries of one kind that agree on resistances into a single row, whatever
 * area they came from. Only a kind whose resistances actually differ between areas
 * is split, and only those rows carry an area label.
 */
export function groupEnemyResistances(entries: EnemyResistanceEntry[]): EnemyResistanceGroup[] {
    const byName = new Map<string, Map<string, EnemyResistanceEntry[]>>();
    for (const entry of entries) {
        const bySignature = byName.get(entry.name) ?? new Map<string, EnemyResistanceEntry[]>();
        const signature = resistanceSignature(entry.traits);
        bySignature.set(signature, [...(bySignature.get(signature) ?? []), entry]);
        byName.set(entry.name, bySignature);
    }
    const groups: EnemyResistanceGroup[] = [];
    for (const [name, bySignature] of byName) {
        const split = bySignature.size > 1;
        for (const [signature, group] of bySignature) {
            const newest = group.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
            const areas = [...new Set(group.map(areaLabelOf))].sort((a, b) => a.localeCompare(b));
            groups.push({
                key: `${name}|${signature}`,
                name,
                traits: newest.traits,
                entries: group,
                areaLabel: split ? areas.join(', ') : null,
                hasUnknownArea: group.some(e => e.areaId == null),
                updatedAt: newest.updatedAt,
            });
        }
    }
    return groups.sort((a, b) =>
        a.name.localeCompare(b.name) || (a.areaLabel ?? '').localeCompare(b.areaLabel ?? ''));
}

/** Removes just the areas folded into one row, leaving other areas of the kind alone. */
export function removeEnemyResistanceGroup(group: EnemyResistanceGroup): Promise<boolean> {
    const keys = new Set(group.entries.map(entryKey));
    let removed = false;
    return updateEnemyResistanceSnapshot(s => {
        const entries = s.entries.filter(e => !keys.has(entryKey(e)));
        removed = entries.length !== s.entries.length;
        return { entries };
    }).then(() => removed);
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
    // A load may be in flight: this module starts one on import, and a test may
    // have started another. Dropping the promise does not cancel it - it lands
    // afterwards, sets `loaded` and overwrites `cache`, so the next
    // ensureEnemyResistancesLoaded() short-circuits and never reads what the test
    // has just written. Wait for it (including its migration write-back, which
    // would otherwise re-create the record after the clear below) instead.
    while (loadingPromise) {
        const pending = loadingPromise;
        try {
            await pending;
        } catch {
            // the loader swallows its own errors; nothing to do here
        }
        if (loadingPromise === pending) break;
    }
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
