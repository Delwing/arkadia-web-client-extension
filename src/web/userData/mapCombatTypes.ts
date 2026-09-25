/**
 * Sync adapters for IndexedDB-backed map and combat data: kills, visited
 * rooms, location notes and multibinds. Writes go through each feature's own
 * storage functions, so open popups, the map and client scripts see them.
 * See docs/dev/SYNC_V2_PLAN.md, sections 4.1, 5 and 6.
 */

import { characterStorage } from '@modules/core/storage';
import eventBus from '@modules/core/eventBus';
import {
    exportAllKillRecords,
    migrateFromLocalStorage,
    setKillCounts,
    type KillRecord,
} from '@client/scripts/killLifetimeStorage.ts';
import {
    deleteNote,
    getAllNotes,
    saveNote,
    type LocationNote,
} from '@modules/data/locationNotesStorage.ts';
import {
    applyLocalChange,
    getSnapshot,
    toKey,
    type StoredMultibindRecord,
} from '@modules/data/multibindStore.ts';
import {
    applyCounterChange,
    characterFromScope,
    characterScope,
    GLOBAL_SCOPE,
    type ItemChange,
    type LocalItem,
    type UserDataType,
} from '@modules/userData/types.ts';
import { parseCharacterStorageKey } from '@web/options/exportUtils.ts';

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
// Kills: counter per character, day and mob
// ---------------------------------------------------------------------------

const KILL_COUNTER_KEY = 'kill_counter';

/** Key `${date}/${mob}`; the date is `YYYY/M/D` or `unknown` (kills from before dates were kept). */
const KILL_KEY = /^(unknown|\d+\/\d+\/\d+)\/(.+)$/;

function killKey(record: { date: string; mob: string }): string {
    return `${record.date}/${record.mob}`;
}

function parseKillKey(key: string): { date: string; mob: string } | null {
    const match = KILL_KEY.exec(key);
    return match ? { date: match[1], mob: match[2] } : null;
}

/**
 * Move the legacy `<char>:kill_counter` totals into the database first (once
 * per character, as the counter does on load). Otherwise they would stay out
 * of sync, and a later migration would count synced kills twice.
 */
async function migrateLegacyKills(characters: Iterable<string>): Promise<void> {
    for (const character of characters) {
        await migrateFromLocalStorage(character);
    }
}

function charactersWithLegacyKills(): string[] {
    const names: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        const parsed = key ? parseCharacterStorageKey(key) : null;
        if (parsed?.name && parsed.baseKey === KILL_COUNTER_KEY) names.push(parsed.name);
    }
    return names;
}

/** Keep the legacy per-mob aggregate in step with the database, like a backup import does. */
function writeKillAggregate(character: string, records: KillRecord[]): void {
    const totals: Record<string, number> = {};
    for (const r of records) {
        if (r.character === character) totals[r.mob] = (totals[r.mob] ?? 0) + r.count;
    }
    if (character === characterStorage.getCharacter()) {
        // Through characterStorage: the kill counter reloads its totals on change.
        characterStorage.set(KILL_COUNTER_KEY, totals);
    } else {
        localStorage.setItem(`${character}:${KILL_COUNTER_KEY}`, JSON.stringify(totals));
    }
}

export const killsType: UserDataType<Record<string, number>> = {
    id: 'kills',
    scope: 'character',
    rule: { kind: 'counter' },
    async read() {
        await migrateLegacyKills(charactersWithLegacyKills());
        const items: LocalItem<Record<string, number>>[] = [];
        for (const record of await exportAllKillRecords()) {
            const key = killKey(record);
            if (!record.character || typeof record.count !== 'number' || !parseKillKey(key)) continue;
            items.push({ scope: characterScope(record.character), key, value: { count: record.count } });
        }
        return items;
    },
    async write(changes) {
        const groups = byCharacter(changes);
        if (groups.size === 0) return;
        await migrateLegacyKills(groups.keys());
        // Kills recorded since the tracker's read are kept: the change moves
        // what is stored now by its difference.
        const stored = new Map((await exportAllKillRecords()).map(r => [`${r.character}\u0000${killKey(r)}`, r.count]));
        const records: KillRecord[] = [];
        for (const [character, list] of groups) {
            for (const change of list) {
                const parsed = parseKillKey(change.key);
                if (!parsed) continue;
                const current = stored.get(`${character}\u0000${change.key}`);
                const value = change.deleted ? {} : applyCounterChange(current === undefined ? undefined : { count: current }, change);
                // A total of zero is kept as a record, so read() still lists the item.
                const count = Math.max(0, value.count ?? 0);
                records.push({ id: '', character, ...parsed, count });
            }
        }
        await setKillCounts(records);
        const all = await exportAllKillRecords();
        for (const character of groups.keys()) writeKillAggregate(character, all);
    },
};

// ---------------------------------------------------------------------------
// Visited rooms: union per character and room
// ---------------------------------------------------------------------------

const VISITED_DB_NAME = 'ArkadiaVisitedRoomsDB';
const VISITED_STORE = 'visitedRooms';
/** Entry ids are `${character}:visitedRooms` (bare `visitedRooms` without a character, not synced). */
const VISITED_SUFFIX = `:${VISITED_STORE}`;

interface VisitedEntry {
    id: string;
    rooms: number[];
}

function openVisitedDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(VISITED_DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(VISITED_STORE)) {
                db.createObjectStore(VISITED_STORE, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Failed to open visited rooms IndexedDB'));
    });
}

async function readVisitedEntries(): Promise<VisitedEntry[]> {
    const db = await openVisitedDb();
    return new Promise((resolve, reject) => {
        const req = db.transaction([VISITED_STORE], 'readonly').objectStore(VISITED_STORE).getAll();
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result as VisitedEntry[] : []);
        req.onerror = () => reject(new Error('Failed to read visited rooms'));
    });
}

/** Add rooms to characters' stored sets; returns the rooms that were new, per character. */
async function addVisitedRooms(added: Map<string, number[]>): Promise<Map<string, number[]>> {
    const db = await openVisitedDb();
    const fresh = new Map<string, number[]>();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([VISITED_STORE], 'readwrite');
        const store = tx.objectStore(VISITED_STORE);
        for (const [character, rooms] of added) {
            const id = `${character}${VISITED_SUFFIX}`;
            const getReq = store.get(id);
            getReq.onsuccess = () => {
                const existing: number[] = Array.isArray(getReq.result?.rooms) ? getReq.result.rooms : [];
                const known = new Set(existing);
                const newRooms = rooms.filter(room => !known.has(room));
                if (newRooms.length === 0) return;
                fresh.set(character, newRooms);
                store.put({ id, rooms: [...existing, ...newRooms] });
            };
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error('Failed to store visited rooms'));
    });
    return fresh;
}

export const visitedRoomsType: UserDataType<true> = {
    id: 'visitedRooms',
    scope: 'character',
    rule: { kind: 'union' },
    async read() {
        const items: LocalItem<true>[] = [];
        for (const entry of await readVisitedEntries()) {
            if (typeof entry?.id !== 'string' || !entry.id.endsWith(VISITED_SUFFIX)) continue;
            const character = entry.id.slice(0, -VISITED_SUFFIX.length);
            if (!character || !Array.isArray(entry.rooms)) continue;
            const scope = characterScope(character);
            for (const room of new Set(entry.rooms)) {
                if (Number.isFinite(room)) items.push({ scope, key: String(room), value: true });
            }
        }
        return items;
    },
    async write(changes) {
        const added = new Map<string, number[]>();
        for (const [character, list] of byCharacter(changes)) {
            const rooms = list
                .filter(change => !change.deleted)
                .map(change => Number(change.key))
                .filter(Number.isFinite);
            if (rooms.length > 0) added.set(character, rooms);
        }
        if (added.size === 0) return;
        const fresh = await addVisitedRooms(added);
        // The open map keeps visited rooms in memory and saves that whole set.
        for (const [character, rooms] of fresh) {
            eventBus.emit('visitedRooms.added', { character, rooms });
        }
    },
};

// ---------------------------------------------------------------------------
// Location notes: newest per room, deletable
// ---------------------------------------------------------------------------

export const locationNotesType: UserDataType<LocationNote> = {
    id: 'locationNotes',
    scope: 'global',
    rule: { kind: 'newest' },
    deletable: true,
    async read() {
        return (await getAllNotes())
            .filter(note => Number.isFinite(note?.id))
            .map(note => ({ scope: GLOBAL_SCOPE, key: String(note.id), value: note }));
    },
    async write(changes) {
        // saveNote/deleteNote emit locationNote.changed for the open UI.
        for (const change of changes) {
            const roomId = Number(change.key);
            if (change.scope !== GLOBAL_SCOPE || !Number.isFinite(roomId)) continue;
            if (change.deleted) await deleteNote(roomId);
            else if (change.value) await saveNote({ ...change.value, id: roomId });
        }
    },
};

// ---------------------------------------------------------------------------
// Multibinds: newest per room and index, deletable
// ---------------------------------------------------------------------------

export const multibindsType: UserDataType<StoredMultibindRecord> = {
    id: 'multibinds',
    scope: 'global',
    rule: { kind: 'newest' },
    deletable: true,
    async read() {
        return (await getSnapshot()).map(record => ({
            scope: GLOBAL_SCOPE,
            key: toKey(record.roomId, record.index),
            value: record,
        }));
    },
    async write(changes) {
        const relevant = changes.filter(change => change.scope === GLOBAL_SCOPE);
        if (relevant.length === 0) return;
        // Through the store: subscribers (the client script, the room popup)
        // and other tabs see the change.
        await applyLocalChange(current => {
            const byKey = new Map(current.map(record => [toKey(record.roomId, record.index), record]));
            for (const change of relevant) {
                if (change.deleted) byKey.delete(change.key);
                else if (change.value) byKey.set(change.key, change.value);
            }
            return [...byKey.values()];
        });
    },
};

export function createMapCombatTypes(): UserDataType[] {
    return [killsType, visitedRoomsType, locationNotesType, multibindsType];
}
