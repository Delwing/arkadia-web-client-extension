import { characterStorage } from '@modules/core/storage';
import eventBus from '@modules/core/eventBus';
import { HybridLogicalClock } from '@modules/userData/hlc';
import { MemoryRecordStore } from '@modules/userData/recordStore';
import type { UserRecord } from '@modules/userData/records';
import { UserDataTracker } from '@modules/userData/tracker';
import {
    exportAllKillRecords,
    importRecords,
    makeId,
    onKillCountsSet,
    openDB as openKillsDb,
    type KillRecord,
} from '@client/scripts/killLifetimeStorage';
import { getAllNotes, importNotes, saveNote, type LocationNote } from '@modules/data/locationNotesStorage';
import { getSnapshot, replaceAll, subscribe, type StoredMultibindRecord } from '@modules/data/multibindStore';
import {
    createMapCombatTypes,
    killsType,
    locationNotesType,
    multibindsType,
    visitedRoomsType,
} from '@web/userData/mapCombatTypes';

// ---------------------------------------------------------------------------
// Storage helpers: all devices share one jsdom, so each device's data is
// swapped in and out of the real stores.
// ---------------------------------------------------------------------------

function openDb(name: string, store: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(store)) {
                request.result.createObjectStore(store, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function inStore<T>(db: IDBDatabase, store: string, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction([store], 'readwrite');
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
    });
}

const visitedDb = () => openDb('ArkadiaVisitedRoomsDB', 'visitedRooms');
const notesDb = () => openDb('ArkadiaLocationNotesDB', 'notes');

async function setVisited(id: string, rooms: number[]): Promise<void> {
    await inStore(await visitedDb(), 'visitedRooms', s => { s.put({ id, rooms }); });
}

async function getVisited(id: string): Promise<number[] | undefined> {
    const entry = await inStore(await visitedDb(), 'visitedRooms', s => s.get(id));
    return (entry as { rooms: number[] } | undefined)?.rooms;
}

interface World {
    kills: KillRecord[];
    visited: { id: string; rooms: number[] }[];
    notes: LocationNote[];
    multibinds: StoredMultibindRecord[];
    localStorage: Record<string, string>;
}

async function saveWorld(): Promise<World> {
    const ls: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i)!;
        ls[key] = localStorage.getItem(key)!;
    }
    return {
        kills: await exportAllKillRecords(),
        visited: (await inStore(await visitedDb(), 'visitedRooms', s => s.getAll())) as World['visited'],
        notes: await getAllNotes(),
        multibinds: await getSnapshot(),
        localStorage: ls,
    };
}

async function clearWorld(): Promise<void> {
    localStorage.clear();
    await inStore(await openKillsDb(), 'kills', s => { s.clear(); });
    await inStore(await visitedDb(), 'visitedRooms', s => { s.clear(); });
    await inStore(await notesDb(), 'notes', s => { s.clear(); });
    await replaceAll([]);
}

async function loadWorld(world: World): Promise<void> {
    await clearWorld();
    for (const [key, value] of Object.entries(world.localStorage)) localStorage.setItem(key, value);
    await importRecords(world.kills);
    for (const entry of world.visited) await setVisited(entry.id, entry.rooms);
    await importNotes(world.notes);
    await replaceAll(world.multibinds);
}

function kill(character: string, mob: string, date: string, count: number): KillRecord {
    return { id: makeId(character, mob, date), character, mob, date, count };
}

async function killCount(character: string, mob: string, date: string): Promise<number | undefined> {
    return (await exportAllKillRecords()).find(r => r.id === makeId(character, mob, date))?.count;
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

interface Device {
    id: string;
    tracker: UserDataTracker;
    world: World | null;
}

let active: Device | null = null;

function device(id: string): Device {
    let saved: string | null = null;
    return {
        id,
        world: null,
        tracker: new UserDataTracker({
            deviceId: id,
            types: createMapCombatTypes(),
            store: new MemoryRecordStore(),
            clock: new HybridLogicalClock(id, { load: () => saved, save: s => { saved = s; } }),
        }),
    };
}

/** Make `next` the device whose data is in the stores; a new device starts empty. */
async function switchTo(next: Device): Promise<void> {
    if (active === next) return;
    if (active) active.world = await saveWorld();
    if (next.world) await loadWorld(next.world);
    else await clearWorld();
    active = next;
}

/** Capture on `from` and deliver its outbox to `to`, like the cloud log would. */
async function sync(from: Device, to: Device): Promise<UserRecord[]> {
    await switchTo(from);
    await from.tracker.capture();
    const outbox = await from.tracker.outbox();
    if (outbox.length > 0) await from.tracker.acknowledge(outbox[outbox.length - 1].seq);
    await switchTo(to);
    await to.tracker.apply(outbox);
    return outbox;
}

beforeEach(async () => {
    active = null;
    characterStorage.setCharacter('');
    await clearWorld();
});

// ---------------------------------------------------------------------------
// Adapters against the real storage
// ---------------------------------------------------------------------------

describe('killsType', () => {
    it('reads kill records as counters keyed by date and mob', async () => {
        await importRecords([kill('Alice', 'orka', '2026/9/1', 3), kill('Alice', 'goblina', 'unknown', 2)]);
        localStorage.setItem('kill_idb_migrated:Alice', 'true');

        const items = await killsType.read();
        expect(items).toEqual(expect.arrayContaining([
            { scope: 'char:Alice', key: '2026/9/1/orka', value: { count: 3 } },
            { scope: 'char:Alice', key: 'unknown/goblina', value: { count: 2 } },
        ]));
        expect(items).toHaveLength(2);
    });

    it('moves stored totals by the change, lower ones included, and keeps the legacy aggregate in step', async () => {
        await importRecords([kill('Alice', 'orka', '2026/9/1', 5), kill('Alice', 'orka', '2026/9/2', 1)]);
        localStorage.setItem('kill_idb_migrated:Alice', 'true');
        const listener = jest.fn();
        const off = onKillCountsSet(listener);

        await killsType.write([
            { scope: 'char:Alice', key: '2026/9/1/orka', value: { count: 2 }, previous: { count: 5 } },
            { scope: 'char:Alice', key: '2026/9/3/elfa', value: { count: 4 }, previous: {} },
        ]);
        off();

        expect(await killCount('Alice', 'orka', '2026/9/1')).toBe(2);
        expect(await killCount('Alice', 'elfa', '2026/9/3')).toBe(4);
        expect(JSON.parse(localStorage.getItem('Alice:kill_counter')!)).toEqual({ orka: 3, elfa: 4 });
        expect(listener).toHaveBeenCalledWith(['Alice']);
    });

    it('writes the aggregate through characterStorage for the active character', async () => {
        characterStorage.setCharacter('Alice');
        const listener = jest.fn();
        const off = characterStorage.onChange('kill_counter', listener);
        await killsType.write([{ scope: 'char:Alice', key: '2026/9/1/orka', value: { count: 2 } }]);
        off();
        expect(listener).toHaveBeenCalled();
        expect(characterStorage.get('kill_counter')).toEqual({ orka: 2 });
    });

    it('moves legacy kill_counter totals into the database before reading, once', async () => {
        localStorage.setItem('Alice:kill_counter', JSON.stringify({ orka: 7 }));
        expect(await killsType.read()).toEqual([{ scope: 'char:Alice', key: 'unknown/orka', value: { count: 7 } }]);
        expect(await killsType.read()).toEqual([{ scope: 'char:Alice', key: 'unknown/orka', value: { count: 7 } }]);
    });

    it('does not count synced kills twice when the device migrates later', async () => {
        await killsType.write([{ scope: 'char:Alice', key: '2026/9/1/orka', value: { count: 2 } }]);
        // The aggregate written above must not be migrated as extra "unknown" kills
        expect(await killsType.read()).toEqual([{ scope: 'char:Alice', key: '2026/9/1/orka', value: { count: 2 } }]);
    });
});

describe('visitedRoomsType', () => {
    it('reads one item per character and room, skipping the entry without a character', async () => {
        await setVisited('Alice:visitedRooms', [1, 2]);
        await setVisited('visitedRooms', [9]);
        expect(await visitedRoomsType.read()).toEqual([
            { scope: 'char:Alice', key: '1', value: true },
            { scope: 'char:Alice', key: '2', value: true },
        ]);
    });

    it('adds rooms to the stored set and tells the open map about the new ones', async () => {
        await setVisited('Alice:visitedRooms', [1, 2]);
        const listener = jest.fn();
        const off = eventBus.on('visitedRooms.added', listener);

        await visitedRoomsType.write([
            { scope: 'char:Alice', key: '2', value: true },
            { scope: 'char:Alice', key: '3', value: true },
            { scope: 'char:Bob', key: '5', value: true },
        ]);
        off();

        expect(await getVisited('Alice:visitedRooms')).toEqual([1, 2, 3]);
        expect(await getVisited('Bob:visitedRooms')).toEqual([5]);
        expect(listener).toHaveBeenCalledWith({ character: 'Alice', rooms: [3] });
        expect(listener).toHaveBeenCalledWith({ character: 'Bob', rooms: [5] });
    });
});

describe('locationNotesType', () => {
    it('reads, saves and deletes notes through the notes storage, notifying the UI', async () => {
        await saveNote({ id: 10, note: 'old', updatedAt: 1 });
        expect(await locationNotesType.read()).toEqual([
            { scope: 'global', key: '10', value: { id: 10, note: 'old', updatedAt: 1 } },
        ]);
        const listener = jest.fn();
        const off = eventBus.on('locationNote.changed', listener);

        await locationNotesType.write([
            { scope: 'global', key: '10', deleted: true },
            { scope: 'global', key: '11', value: { id: 11, note: 'new', updatedAt: 2 } },
        ]);
        off();

        expect(await getAllNotes()).toEqual([{ id: 11, note: 'new', updatedAt: 2 }]);
        expect(listener).toHaveBeenCalledWith({ roomId: 10 });
        expect(listener).toHaveBeenCalledWith({ roomId: 11 });
    });
});

describe('multibindsType', () => {
    it('reads, edits and deletes multibinds through the store, notifying subscribers', async () => {
        await replaceAll([{ roomId: 1, index: 1, action: 'n' }, { roomId: 1, index: 2, action: 's' }]);
        expect(await multibindsType.read()).toEqual([
            { scope: 'global', key: '1:1', value: { roomId: 1, index: 1, action: 'n' } },
            { scope: 'global', key: '1:2', value: { roomId: 1, index: 2, action: 's' } },
        ]);
        const seen: StoredMultibindRecord[][] = [];
        const off = subscribe(snapshot => seen.push(snapshot), { emitInitial: false });

        await multibindsType.write([
            { scope: 'global', key: '1:1', value: { roomId: 1, index: 1, action: 'e' } },
            { scope: 'global', key: '1:2', deleted: true },
            { scope: 'global', key: '2:1', value: { roomId: 2, index: 1, action: 'w' } },
        ]);
        off();

        const expected = [{ roomId: 1, index: 1, action: 'e' }, { roomId: 2, index: 1, action: 'w' }];
        expect(await getSnapshot()).toEqual(expected);
        expect(seen[seen.length - 1]).toEqual(expected);
    });
});

// ---------------------------------------------------------------------------
// Several devices
// ---------------------------------------------------------------------------

describe('map and combat types on several devices', () => {
    it('rebuild the same data on a fresh device', async () => {
        const a = device('a');
        const b = device('b');
        await switchTo(a);
        await importRecords([kill('Alice', 'orka', '2026/9/1', 3)]);
        localStorage.setItem('kill_idb_migrated:Alice', 'true');
        await setVisited('Alice:visitedRooms', [4, 5]);
        await saveNote({ id: 10, note: 'here', roomName: 'Room', updatedAt: 1 });
        await replaceAll([{ roomId: 10, index: 1, action: 'open door' }]);

        await sync(a, b);

        expect(await killCount('Alice', 'orka', '2026/9/1')).toBe(3);
        expect(JSON.parse(localStorage.getItem('Alice:kill_counter')!)).toEqual({ orka: 3 });
        expect(await getVisited('Alice:visitedRooms')).toEqual([4, 5]);
        expect(await getAllNotes()).toEqual([{ id: 10, note: 'here', roomName: 'Room', updatedAt: 1 }]);
        expect(await getSnapshot()).toEqual([{ roomId: 10, index: 1, action: 'open door' }]);
        // Nothing to upload: b's data is exactly what it received
        expect(await b.tracker.capture()).toEqual([]);
    });

    it('sums kills of the same mob and day made on two devices', async () => {
        const a = device('a');
        const b = device('b');
        await switchTo(a);
        await importRecords([kill('Alice', 'orka', '2026/9/1', 2)]);
        await switchTo(b);
        await importRecords([kill('Alice', 'orka', '2026/9/1', 3)]);
        await b.tracker.capture();

        await sync(a, b);
        expect(await killCount('Alice', 'orka', '2026/9/1')).toBe(5);
        await sync(b, a);
        expect(await killCount('Alice', 'orka', '2026/9/1')).toBe(5);
        expect(JSON.parse(localStorage.getItem('Alice:kill_counter')!)).toEqual({ orka: 5 });

        // Another kill on a adds to the sum on b
        await importRecords([kill('Alice', 'orka', '2026/9/1', 6)]);
        await sync(a, b);
        expect(await killCount('Alice', 'orka', '2026/9/1')).toBe(6);
    });

    it('propagates a count lowered by hand on one device', async () => {
        const a = device('a');
        const b = device('b');
        await switchTo(a);
        await importRecords([kill('Alice', 'orka', '2026/9/1', 2)]);
        await switchTo(b);
        await importRecords([kill('Alice', 'orka', '2026/9/1', 3)]);
        await b.tracker.capture();
        await sync(a, b);
        await sync(b, a);
        expect(await killCount('Alice', 'orka', '2026/9/1')).toBe(5);

        await importRecords([kill('Alice', 'orka', '2026/9/1', 1)]);
        await sync(a, b);

        expect(await killCount('Alice', 'orka', '2026/9/1')).toBe(1);
        expect(JSON.parse(localStorage.getItem('Alice:kill_counter')!)).toEqual({ orka: 1 });
    });

    it('unites rooms visited on two devices', async () => {
        const a = device('a');
        const b = device('b');
        await switchTo(a);
        await setVisited('Alice:visitedRooms', [1, 2]);
        await switchTo(b);
        await setVisited('Alice:visitedRooms', [2, 3]);
        await b.tracker.capture();

        await sync(a, b);
        expect([...(await getVisited('Alice:visitedRooms'))!].sort()).toEqual([1, 2, 3]);
        await sync(b, a);
        expect([...(await getVisited('Alice:visitedRooms'))!].sort()).toEqual([1, 2, 3]);
    });

    it('deletes a note on the other device', async () => {
        const a = device('a');
        const b = device('b');
        await switchTo(a);
        await saveNote({ id: 10, note: 'here', updatedAt: 1 });
        await sync(a, b);
        expect(await getAllNotes()).toHaveLength(1);

        await switchTo(a);
        await locationNotesType.write([{ scope: 'global', key: '10', deleted: true }]);
        await sync(a, b);

        expect(await getAllNotes()).toEqual([]);
    });

    it('replaces a multibind edited on the other device', async () => {
        const a = device('a');
        const b = device('b');
        await switchTo(a);
        await replaceAll([{ roomId: 10, index: 1, action: 'open door' }]);
        await sync(a, b);

        await replaceAll([{ roomId: 10, index: 1, action: 'unlock door' }]);
        await sync(b, a);

        expect(await getSnapshot()).toEqual([{ roomId: 10, index: 1, action: 'unlock door' }]);
    });
});
