/**
 * Sync adapters for data the player collects in game: oswajanie (taming),
 * enemy resistances, zlom, transport durations and deliveries. Each lists
 * local items and writes merged items back through the feature's own store,
 * so open views and client scripts see applied values.
 * See docs/dev/SYNC_V2_PLAN.md, sections 4.1, 5 and 6.
 */

import {
    mutateTamingStore,
    newTamingEntryId,
    readTamingStore,
    type AnimalLevel,
    type FeedingEntry,
    type FoodGroupRecord,
} from '@client/scripts/oswajanie.ts';
import {
    addDeliveryRecords,
    listDeliveryCharacters,
    readDeliveryRecords,
    type DeliveryRecord,
} from '@client/scripts/deliveryStats.ts';
import {
    getAllTransportSegmentValues,
    putTransportSegmentValues,
    type TransportSegmentDurationEntry,
    type TransportSegmentValue,
} from '@client/utils/transportStats.ts';
import {
    ensureEnemyResistancesLoaded,
    getEnemyResistanceSnapshot,
    updateEnemyResistanceSnapshot,
    type EnemyResistanceEntry,
} from '@modules/data/enemyResistanceStore.ts';
import {
    ensureZlomLoaded,
    getZlomSnapshot,
    updateZlomSnapshot,
    type ZlomEntry,
    type ZlomKind,
    type ZlomSnapshot,
} from '@modules/data/zlomStore.ts';
import { canonicalJson } from '@modules/userData/records.ts';
import {
    characterFromScope,
    characterScope,
    GLOBAL_SCOPE,
    type ItemChange,
    type LocalItem,
    type UserDataType,
} from '@modules/userData/types.ts';

/** Group changes by character, skipping any that aren't character-scoped. */
function byCharacter<V>(changes: ItemChange<V>[]): Map<string, ItemChange<V>[]> {
    const groups = new Map<string, ItemChange<V>[]>();
    for (const change of changes) {
        const character = characterFromScope(change.scope);
        if (!character) continue;
        const list = groups.get(character) ?? [];
        list.push(change);
        groups.set(character, list);
    }
    return groups;
}

// ---------------------------------------------------------------------------
// Oswajanie
//
// The stream per animal is `feed feed feed level-up feed ...`; what matters is
// how many feedings it took between level-ups. A feeding is a fact (union by
// its stable id); its `active` flag and its animal name can change later, so
// each is its own newest item. A level-up is keyed by what was observed
// (character, animal as the game named it, level): the first observation is
// the real one (earliest), and a rename changes only the current name.
//
// The fields of one entry arrive as separate items, possibly in any order, so
// writes merge fields into the stored entry and may create an incomplete one
// for a moment (the views skip entries without animal or timestamp).
// ---------------------------------------------------------------------------

/** A stored feeding, possibly incomplete while its synced items arrive. */
type StoredFeeding = Partial<FeedingEntry> & { id: string; character: string };
type StoredLevel = Partial<AnimalLevel> & { id: string; character: string; level: string };

export interface TamingFeedingValue {
    /** The animal as the game named it when fed (the name before any rename). */
    animal: string;
    food: string;
    timestamp: number;
}

export interface TamingLevelValue {
    animal: string;
    level: string;
    timestamp: number;
}

function hasOwner<T extends { id?: unknown; character?: unknown }>(r: T): r is T & { id: string; character: string } {
    return typeof r.id === 'string' && typeof r.character === 'string' && r.character !== '';
}

function observedName(r: { animal?: string; observedAnimal?: string }): string | undefined {
    return r.observedAnimal ?? r.animal;
}

async function readFeedings(): Promise<StoredFeeding[]> {
    return (await readTamingStore<Partial<FeedingEntry>>('feeding')).filter(hasOwner);
}

/** Apply per-entry field updates to the feeding store in one transaction. */
function writeFeedings<V>(
    changes: ItemChange<V>[],
    apply: (entry: StoredFeeding, value: V) => StoredFeeding,
): Promise<void> {
    return mutateTamingStore<StoredFeeding>('feeding', records => {
        const byId = new Map(records.map(r => [String(r.id), r]));
        const put: StoredFeeding[] = [];
        for (const change of changes) {
            const character = characterFromScope(change.scope);
            if (!character || change.deleted || change.value === undefined) continue;
            const current = byId.get(change.key);
            const next = apply({ ...(current ?? { id: change.key, character }) }, change.value);
            if (current && canonicalJson(current) === canonicalJson(next)) continue;
            byId.set(change.key, next);
            put.push(next);
        }
        return { put };
    });
}

export const tamingFeedingsType: UserDataType<TamingFeedingValue> = {
    id: 'tamingFeedings',
    scope: 'character',
    rule: { kind: 'union' },
    async read() {
        const items: LocalItem<TamingFeedingValue>[] = [];
        for (const r of await readFeedings()) {
            const animal = observedName(r);
            if (animal === undefined || typeof r.food !== 'string' || typeof r.timestamp !== 'number') continue;
            items.push({
                scope: characterScope(r.character),
                key: r.id,
                value: { animal, food: r.food, timestamp: r.timestamp },
            });
        }
        return items;
    },
    write(changes) {
        return writeFeedings(changes, (entry, value) => {
            const next = { ...entry, food: value.food, timestamp: value.timestamp };
            if (next.animal === undefined) {
                next.animal = value.animal;
            } else if (next.observedAnimal !== undefined || next.animal !== value.animal) {
                // Renamed here (or its current name arrived first): keep the name.
                next.observedAnimal = value.animal;
            }
            return next;
        });
    },
};

export const tamingFeedingActiveType: UserDataType<boolean> = {
    id: 'tamingFeedingActive',
    scope: 'character',
    rule: { kind: 'newest' },
    async read() {
        return (await readFeedings())
            .filter(r => typeof r.active === 'number')
            .map(r => ({ scope: characterScope(r.character), key: r.id, value: r.active === 1 }));
    },
    write(changes) {
        return writeFeedings(changes, (entry, value) => ({ ...entry, active: value ? 1 : 0 }));
    },
};

/** Current animal name of a feeding, listed only once the animal was renamed. */
export const tamingFeedingNamesType: UserDataType<string> = {
    id: 'tamingFeedingNames',
    scope: 'character',
    rule: { kind: 'newest' },
    async read() {
        return (await readFeedings())
            .filter(r => r.observedAnimal !== undefined && typeof r.animal === 'string')
            .map(r => ({ scope: characterScope(r.character), key: r.id, value: r.animal! }));
    },
    write(changes) {
        return writeFeedings(changes, (entry, value) => ({
            ...entry,
            // Before the feeding itself arrives, its observed name is unknown;
            // the feeding's write sets it.
            observedAnimal: entry.observedAnimal ?? entry.animal ?? value,
            animal: value,
        }));
    },
};

function levelKey(animal: string, level: string): string {
    return JSON.stringify([animal, level]);
}

function parseLevelKey(key: string): { animal: string; level: string } | null {
    try {
        const parsed = JSON.parse(key) as unknown;
        if (Array.isArray(parsed) && typeof parsed[0] === 'string' && typeof parsed[1] === 'string') {
            return { animal: parsed[0], level: parsed[1] };
        }
    } catch {
        // not a level key
    }
    return null;
}

/**
 * One stored entry per (character, observed animal, level). Duplicates (from
 * before sync) resolve to the earliest complete one, the same for reads and
 * writes.
 */
function levelsByItem(records: Partial<AnimalLevel>[]): Map<string, StoredLevel> {
    const chosen = new Map<string, StoredLevel>();
    const rank = (r: StoredLevel): [number, string] => [typeof r.timestamp === 'number' ? r.timestamp : Infinity, r.id];
    for (const r of records) {
        if (!hasOwner(r) || typeof r.level !== 'string') continue;
        const animal = observedName(r);
        if (animal === undefined) continue;
        const id = `${characterScope(r.character)}\u0000${levelKey(animal, r.level)}`;
        const current = chosen.get(id);
        const level = r as StoredLevel;
        if (!current) {
            chosen.set(id, level);
            continue;
        }
        const [ta, ia] = rank(level);
        const [tb, ib] = rank(current);
        if (ta < tb || (ta === tb && ia < ib)) chosen.set(id, level);
    }
    return chosen;
}

function writeLevels<V>(
    changes: ItemChange<V>[],
    apply: (entry: StoredLevel | undefined, value: V, character: string, key: { animal: string; level: string }) => StoredLevel,
): Promise<void> {
    return mutateTamingStore<StoredLevel>('animals', records => {
        const chosen = levelsByItem(records);
        const put: StoredLevel[] = [];
        for (const change of changes) {
            const character = characterFromScope(change.scope);
            const key = parseLevelKey(change.key);
            if (!character || !key || change.deleted || change.value === undefined) continue;
            const id = `${change.scope}\u0000${change.key}`;
            const current = chosen.get(id);
            const next = apply(current ? { ...current } : undefined, change.value, character, key);
            if (current && canonicalJson(current) === canonicalJson(next)) continue;
            chosen.set(id, next);
            put.push(next);
        }
        return { put };
    });
}

export const tamingLevelsType: UserDataType<TamingLevelValue> = {
    id: 'tamingLevels',
    scope: 'character',
    rule: { kind: 'earliest', time: v => v.timestamp },
    async read() {
        const items: LocalItem<TamingLevelValue>[] = [];
        for (const r of levelsByItem(await readTamingStore<Partial<AnimalLevel>>('animals')).values()) {
            const animal = observedName(r)!;
            if (typeof r.timestamp !== 'number') continue;
            items.push({
                scope: characterScope(r.character),
                key: levelKey(animal, r.level),
                value: { animal, level: r.level, timestamp: r.timestamp },
            });
        }
        return items;
    },
    write(changes) {
        return writeLevels(changes, (entry, value, character, key) =>
            entry
                ? { ...entry, timestamp: value.timestamp }
                : { id: newTamingEntryId(), character, animal: key.animal, level: key.level, timestamp: value.timestamp });
    },
};

/** Current animal name of a level-up, listed only once the animal was renamed. */
export const tamingLevelNamesType: UserDataType<string> = {
    id: 'tamingLevelNames',
    scope: 'character',
    rule: { kind: 'newest' },
    async read() {
        return [...levelsByItem(await readTamingStore<Partial<AnimalLevel>>('animals')).values()]
            .filter(r => r.observedAnimal !== undefined && typeof r.animal === 'string')
            .map(r => ({
                scope: characterScope(r.character),
                key: levelKey(r.observedAnimal!, r.level),
                value: r.animal!,
            }));
    },
    write(changes) {
        return writeLevels(changes, (entry, value, character, key) =>
            entry
                ? { ...entry, observedAnimal: entry.observedAnimal ?? entry.animal, animal: value }
                // The level-up itself (its timestamp) arrives as a tamingLevels item.
                : { id: newTamingEntryId(), character, animal: value, observedAnimal: key.animal, level: key.level });
    },
};

/** Which foods count as the same food; global, edited by linking and unlinking. */
export const tamingFoodGroupsType: UserDataType<string> = {
    id: 'tamingFoodGroups',
    scope: 'global',
    rule: { kind: 'newest' },
    deletable: true,
    async read() {
        return (await readTamingStore<FoodGroupRecord>('foodGroups'))
            .map(r => ({ scope: GLOBAL_SCOPE, key: r.food, value: r.group }));
    },
    write(changes) {
        return mutateTamingStore<FoodGroupRecord>('foodGroups', records => {
            const current = new Map(records.map(r => [r.food, r.group]));
            const put: FoodGroupRecord[] = [];
            const remove: string[] = [];
            for (const change of changes) {
                if (change.deleted) {
                    if (current.has(change.key)) remove.push(change.key);
                } else if (change.value !== undefined && current.get(change.key) !== change.value) {
                    put.push({ food: change.key, group: change.value });
                }
            }
            return { put, delete: remove };
        });
    },
};

// ---------------------------------------------------------------------------
// Enemy resistances: the latest evaluation per enemy kind and area
// ---------------------------------------------------------------------------

function enemyResistanceKey(e: { name: string; areaId: number | null }): string {
    return `${e.name}|${e.areaId ?? ''}`;
}

export const enemyResistancesType: UserDataType<EnemyResistanceEntry> = {
    id: 'enemyResistances',
    scope: 'global',
    rule: { kind: 'newest' },
    deletable: true,
    async read() {
        await ensureEnemyResistancesLoaded();
        return getEnemyResistanceSnapshot().entries
            .map(e => ({ scope: GLOBAL_SCOPE, key: enemyResistanceKey(e), value: e }));
    },
    write(changes) {
        // Through the store, so its cache, subscribers (popup) and the client
        // script's lookups see the change.
        return updateEnemyResistanceSnapshot(s => {
            const entries = s.entries.slice();
            for (const change of changes) {
                const index = entries.findIndex(e => enemyResistanceKey(e) === change.key);
                if (change.deleted) {
                    if (index >= 0) entries.splice(index, 1);
                } else if (index >= 0) {
                    entries[index] = change.value!;
                } else {
                    entries.push(change.value!);
                }
            }
            return { entries };
        });
    },
};

// ---------------------------------------------------------------------------
// Zlom: the latest reading of each item, per kind and item `short`
// ---------------------------------------------------------------------------

const ZLOM_KINDS: ZlomKind[] = ['bronie', 'tarcze', 'zbroje'];

function zlomKey(kind: ZlomKind, short: string): string {
    return `${kind}:${short}`;
}

function parseZlomKey(key: string): { kind: ZlomKind; short: string } | null {
    const at = key.indexOf(':');
    const kind = key.slice(0, at) as ZlomKind;
    return at > 0 && ZLOM_KINDS.includes(kind) ? { kind, short: key.slice(at + 1) } : null;
}

export const zlomType: UserDataType<ZlomEntry> = {
    id: 'zlom',
    scope: 'global',
    rule: { kind: 'newest' },
    deletable: true,
    async read() {
        await ensureZlomLoaded();
        const snapshot = getZlomSnapshot();
        const items: LocalItem<ZlomEntry>[] = [];
        for (const kind of ZLOM_KINDS) {
            // Two entries can share a short (they differ by opis); the first
            // one is the synced one, reads and writes alike.
            const seen = new Set<string>();
            for (const entry of snapshot[kind] as ZlomEntry[]) {
                if (!entry.short || seen.has(entry.short)) continue;
                seen.add(entry.short);
                items.push({ scope: GLOBAL_SCOPE, key: zlomKey(kind, entry.short), value: entry });
            }
        }
        return items;
    },
    write(changes) {
        // Through the store, so its in-memory cache, the popup and the
        // highlight triggers (subscribeZlom) see the change.
        return updateZlomSnapshot(current => {
            const next: ZlomSnapshot = { bronie: current.bronie.slice(), tarcze: current.tarcze.slice(), zbroje: current.zbroje.slice() };
            for (const change of changes) {
                const key = parseZlomKey(change.key);
                if (!key) continue;
                const list = next[key.kind] as ZlomEntry[];
                if (change.deleted) {
                    next[key.kind] = list.filter(e => e.short !== key.short) as never;
                    continue;
                }
                const index = list.findIndex(e => e.short === key.short);
                if (index >= 0) list[index] = change.value!;
                else list.push(change.value!);
            }
            return next;
        });
    },
};

// ---------------------------------------------------------------------------
// Transport segments: only the current shortest and longest duration
// ---------------------------------------------------------------------------

function compareDurations(a: TransportSegmentDurationEntry, b: TransportSegmentDurationEntry): number {
    if (a.duration !== b.duration) return a.duration - b.duration;
    // Same duration: any fixed order will do, so both sides pick the same one.
    const ca = canonicalJson(a);
    const cb = canonicalJson(b);
    return ca < cb ? -1 : ca > cb ? 1 : 0;
}

function withoutDurations(v: TransportSegmentValue): Omit<TransportSegmentValue, 'shortestDuration' | 'longestDuration' | 'resetAt'> {
    const { shortestDuration: _s, longestDuration: _l, resetAt: _r, ...rest } = v;
    return rest;
}

/**
 * Commutative and idempotent: the smaller shortest and the larger longest
 * duration, measured after the latest reset of either side; labels and the
 * expected duration from the value updated last (ties by content).
 */
export function mergeTransportSegments(a: TransportSegmentValue, b: TransportSegmentValue): TransportSegmentValue {
    const resetAt = Math.max(a.resetAt ?? 0, b.resetAt ?? 0);
    const durations = [a.shortestDuration, a.longestDuration, b.shortestDuration, b.longestDuration]
        .filter((d): d is TransportSegmentDurationEntry => !!d && (!resetAt || d.endedAt > resetAt));
    const infoA = canonicalJson(withoutDurations(a));
    const infoB = canonicalJson(withoutDurations(b));
    const latest = a.updatedAt !== b.updatedAt
        ? (a.updatedAt > b.updatedAt ? a : b)
        : (infoA >= infoB ? a : b);

    const merged: TransportSegmentValue = { ...withoutDurations(latest) };
    if (resetAt) merged.resetAt = resetAt;
    if (durations.length > 0) {
        merged.shortestDuration = durations.reduce((x, y) => (compareDurations(y, x) < 0 ? y : x));
        merged.longestDuration = durations.reduce((x, y) => (compareDurations(y, x) > 0 ? y : x));
    }
    return merged;
}

export const transportSegmentsType: UserDataType<TransportSegmentValue> = {
    id: 'transportSegments',
    scope: 'global',
    rule: { kind: 'custom', merge: mergeTransportSegments },
    async read() {
        return (await getAllTransportSegmentValues())
            .map(v => ({ scope: GLOBAL_SCOPE, key: v.segmentKey, value: v }));
    },
    write(changes) {
        // putTransportSegmentValues tells the transport tracker to re-read its
        // learned durations.
        return putTransportSegmentValues(
            changes.filter(c => !c.deleted && c.value).map(c => ({ ...c.value!, segmentKey: c.key })),
        );
    },
};

// ---------------------------------------------------------------------------
// Deliveries: a delivery is identified by its timestamp (a package can't be
// delivered on two devices)
// ---------------------------------------------------------------------------

export const deliveriesType: UserDataType<DeliveryRecord> = {
    id: 'deliveries',
    scope: 'character',
    rule: { kind: 'union' },
    async read() {
        const items: LocalItem<DeliveryRecord>[] = [];
        for (const character of await listDeliveryCharacters()) {
            if (!character) continue;
            for (const record of await readDeliveryRecords(character)) {
                items.push({ scope: characterScope(character), key: String(record.timestamp), value: record });
            }
        }
        return items;
    },
    async write(changes) {
        // addDeliveryRecords also merges into the running script's list.
        for (const [character, list] of byCharacter(changes)) {
            await addDeliveryRecords(character, list.filter(c => !c.deleted && c.value).map(c => c.value!));
        }
    },
};

export function createPlayerDataTypes(): UserDataType[] {
    return [
        tamingFeedingsType,
        tamingFeedingActiveType,
        tamingFeedingNamesType,
        tamingLevelsType,
        tamingLevelNamesType,
        tamingFoodGroupsType,
        enemyResistancesType,
        zlomType,
        transportSegmentsType,
        deliveriesType,
    ];
}
