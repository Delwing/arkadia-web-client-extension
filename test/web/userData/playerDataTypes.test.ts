import { characterStorage } from '@modules/core/storage';
import { FIREBASE_DEVICE_ID_KEY } from '@modules/firebase/firebaseTypes';
import { HybridLogicalClock } from '@modules/userData/hlc';
import { MemoryRecordStore } from '@modules/userData/recordStore';
import type { UserRecord } from '@modules/userData/records';
import { UserDataTracker } from '@modules/userData/tracker';
import type { LocalItem, UserDataType } from '@modules/userData/types';
import eventBus from '@modules/core/eventBus';
import {
    closeOswajanieDatabase,
    getAnimals,
    getFeedingsByAnimal,
    getFoodGroupMap,
    getLevelByAnimal,
    insertAnimalLevel,
    insertFeedingEntry,
    linkFoods,
    dissolveFoodGroup,
    mutateTamingStore,
    readTamingStore,
    renameAnimal,
    setAnimalActive,
} from '@client/scripts/oswajanie';
import initDeliveryStats, { addDeliveryRecords, readDeliveryRecords, type DeliveryRecord } from '@client/scripts/deliveryStats';
import { clearIndexedDB, getIndexedDBKeys } from '@client/utils/dataCache';
import {
    clearTransportStats,
    deleteTransportSegment,
    getAllTransportSegments,
    onTransportSegmentsChanged,
    recordTransportSegment,
    type TransportSegmentValue,
} from '@client/utils/transportStats';
import {
    __resetEnemyResistanceStoreForTests,
    getEnemyResistanceSnapshot,
    subscribeEnemyResistances,
    updateEnemyResistanceSnapshot,
    type EnemyResistanceEntry,
} from '@modules/data/enemyResistanceStore';
import {
    __resetZlomStoreForTests,
    getZlomSnapshot,
    subscribeZlom,
    updateZlomSnapshot,
    type WeaponEntry,
} from '@modules/data/zlomStore';
import {
    createPlayerDataTypes,
    deliveriesType,
    enemyResistancesType,
    mergeTransportSegments,
    tamingFeedingActiveType,
    tamingFeedingsType,
    tamingFoodGroupsType,
    tamingLevelsType,
    transportSegmentsType,
    zlomType,
} from '@web/userData/playerDataTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tracker(deviceId: string) {
    let saved: string | null = null;
    return new UserDataTracker({
        deviceId,
        types: createPlayerDataTypes(),
        store: new MemoryRecordStore(),
        clock: new HybridLogicalClock(deviceId, { load: () => saved, save: s => { saved = s; } }),
    });
}

/** Act as the given device: new oswajanie entries get its id prefix. */
function onDevice(deviceId: string): void {
    localStorage.setItem(FIREBASE_DEVICE_ID_KEY, deviceId);
}

async function captureAll(deviceId: string): Promise<UserRecord[]> {
    const t = tracker(deviceId);
    await t.capture();
    return t.outbox();
}

async function clearDeliveries(): Promise<void> {
    const config = { dbName: 'ArkadiaDeliveryStats', storeName: 'deliveries', key: '' };
    for (const key of await getIndexedDBKeys(config)) await clearIndexedDB({ ...config, key });
}

/** Wipe every store these types cover: a fresh device. */
async function clearAll(): Promise<void> {
    for (const store of ['feeding', 'animals', 'foodGroups'] as const) {
        await mutateTamingStore<{ id?: string; food?: string }>(store, records => ({
            delete: records.map(r => (store === 'foodGroups' ? r.food! : r.id!)),
        }));
    }
    await __resetZlomStoreForTests();
    await __resetEnemyResistanceStoreForTests();
    await clearTransportStats();
    await clearDeliveries();
}

async function readSorted<V>(type: UserDataType<V>): Promise<LocalItem<V>[]> {
    return [...await type.read()].sort((a, b) => `${a.scope}|${a.key}`.localeCompare(`${b.scope}|${b.key}`));
}

/** Everything the player data types list, for comparing whole devices. */
async function snapshot(): Promise<Record<string, LocalItem[]>> {
    const result: Record<string, LocalItem[]> = {};
    for (const type of createPlayerDataTypes()) result[type.id] = await readSorted(type);
    return result;
}

async function setFeedingTimestamp(id: string, timestamp: number): Promise<void> {
    await mutateTamingStore<{ id: string; timestamp: number }>('feeding', records => ({
        put: records.filter(r => r.id === id).map(r => ({ ...r, timestamp })),
    }));
}

async function setLevelTimestamp(animal: string, level: string, timestamp: number): Promise<void> {
    await mutateTamingStore<{ animal: string; level: string; timestamp: number }>('animals', records => ({
        put: records.filter(r => r.animal === animal && r.level === level).map(r => ({ ...r, timestamp })),
    }));
}

function weapon(short: string, overrides: Partial<WeaponEntry> = {}): WeaponEntry {
    return {
        short, typ: 'miecz', rodzaj: 'ciete', klute: 1, obuch: 1, ciete: 5, chwyt: 'jednoreczna',
        magik: 0, srebro: 0, opis: `opis ${short}`, waga: 1, obj: 1, cena: 10, wywazenie: 3, parowanie: 2,
        roomId: null, ...overrides,
    };
}

function resistance(name: string, areaId: number | null, updatedAt = 1): EnemyResistanceEntry {
    return {
        name, traits: [{ kind: 'odporny', target: 'magie zycia' }], raw: 'odporny na magie zycia',
        roomId: null, areaId, areaName: null, updatedAt,
    };
}

const BASE = Date.now() - 10 * 24 * 3600 * 1000;

function segment(duration: number, endedAt: number, fromLabel = 'Start') {
    return {
        transport: 'Prom', fromId: 1, toId: 2, fromLabel, toLabel: 'Koniec',
        startedAt: endedAt - duration * 1000, endedAt, duration, expectedDuration: 30,
    };
}

beforeEach(async () => {
    localStorage.clear();
    onDevice('devA');
    characterStorage.setCharacter('Alice');
    await clearAll();
});

// ---------------------------------------------------------------------------
// Oswajanie
// ---------------------------------------------------------------------------

describe('oswajanie stable ids', () => {
    it('gives new entries stable string ids with the device prefix', async () => {
        await insertFeedingEntry('wilk', 'miesem');
        await insertAnimalLevel('wilk', 'nerwowe');

        const [feeding] = await readTamingStore<{ id: unknown }>('feeding');
        const [level] = await readTamingStore<{ id: unknown }>('animals');
        expect(feeding.id).toMatch(/^devA:/);
        expect(level.id).toMatch(/^devA:/);
        expect(feeding.id).not.toBe(level.id);
    });

    it('migrates auto-increment entries of an existing database once, keeping all data', async () => {
        closeOswajanieDatabase();
        await new Promise<void>((resolve, reject) => {
            const req = indexedDB.deleteDatabase('oswajanie');
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
        // A database as version 4 created it.
        await new Promise<void>((resolve, reject) => {
            const req = indexedDB.open('oswajanie', 4);
            req.onupgradeneeded = () => {
                const db = req.result;
                const feeding = db.createObjectStore('feeding', { keyPath: 'id', autoIncrement: true });
                feeding.createIndex('character', 'character', { unique: false });
                feeding.createIndex('character_animal', ['character', 'animal'], { unique: false });
                const animals = db.createObjectStore('animals', { keyPath: 'id', autoIncrement: true });
                animals.createIndex('character', 'character', { unique: false });
                animals.createIndex('character_animal', ['character', 'animal'], { unique: false });
                animals.createIndex('character_animal_level', ['character', 'animal', 'level'], { unique: false });
                const groups = db.createObjectStore('foodGroups', { keyPath: 'food' });
                groups.createIndex('group', 'group', { unique: false });
                feeding.add({ character: 'Alice', animal: 'wilk', food: 'miesem', active: 1, timestamp: 1000 });
                feeding.add({ character: 'Alice', animal: 'wilk', food: 'ryba', active: 0, timestamp: 2000 });
                feeding.add({ character: 'Bob', animal: 'lis', food: 'miesem', active: 1, timestamp: 3000 });
                animals.add({ character: 'Alice', animal: 'wilk', level: 'nerwowe', timestamp: 1500 });
                groups.add({ food: 'miesem', group: 'g1' });
            };
            req.onsuccess = () => {
                req.result.close();
                resolve();
            };
            req.onerror = () => reject(req.error);
        });

        const feedings = await readTamingStore<{ id: unknown; food: string }>('feeding');
        expect(feedings.map(f => f.id).sort()).toEqual(['devA:1', 'devA:2', 'devA:3']);
        expect((await readTamingStore<{ id: unknown }>('animals')).map(a => a.id)).toEqual(['devA:1']);

        // Per-character indexes still work, nothing is lost.
        expect((await getFeedingsByAnimal('wilk')).map(f => [f.id, f.food, f.active])).toEqual([
            ['devA:2', 'ryba', 0],
            ['devA:1', 'miesem', 1],
        ]);
        expect(await getLevelByAnimal('wilk', 1600)).toBe('nerwowe');
        expect((await getFoodGroupMap()).get('miesem')).toBe('g1');
        characterStorage.setCharacter('Bob');
        expect(await getAnimals()).toEqual([{ animal: 'lis', active: true }]);

        // New entries use the new scheme next to the migrated ones.
        await insertFeedingEntry('lis', 'ryba');
        expect((await getFeedingsByAnimal('lis')).map(f => f.id)).toHaveLength(2);
    });
});

describe('oswajanie adapters', () => {
    it('list feedings without the active flag, the flag separately, and write both back', async () => {
        await insertFeedingEntry('wilk', 'miesem');
        const [item] = await tamingFeedingsType.read();
        expect(item.scope).toBe('char:Alice');
        expect(item.value).toEqual({ animal: 'wilk', food: 'miesem', timestamp: expect.any(Number) });
        expect(await tamingFeedingActiveType.read()).toEqual([{ scope: 'char:Alice', key: item.key, value: true }]);

        const updated = jest.fn();
        const off = eventBus.on('oswajanie.updated', updated);
        await tamingFeedingActiveType.write([{ scope: 'char:Alice', key: item.key, value: false }]);
        await tamingFeedingsType.write([
            { scope: 'char:Bob', key: 'devB:x', value: { animal: 'lis', food: 'ryba', timestamp: 5 } },
        ]);
        off();

        expect(updated).toHaveBeenCalledTimes(2);
        expect(await getAnimals()).toEqual([{ animal: 'wilk', active: false }]);
        characterStorage.setCharacter('Bob');
        // Its active flag hasn't arrived yet: listed, not active.
        expect((await getFeedingsByAnimal('lis')).map(f => f.food)).toEqual(['ryba']);
    });

    it('keys level-ups by character, animal and level and only moves them earlier', async () => {
        await insertAnimalLevel('wilk', 'nerwowe');
        const [item] = await tamingLevelsType.read();
        expect(item.key).toBe(JSON.stringify(['wilk', 'nerwowe']));

        await tamingLevelsType.write([{ scope: 'char:Alice', key: item.key, value: { ...item.value, timestamp: 10 } }]);

        expect(await tamingLevelsType.read()).toEqual([{ ...item, value: { ...item.value, timestamp: 10 } }]);
        expect(await readTamingStore('animals')).toHaveLength(1);
    });

    it('keeps a renamed animal identified by the name it was observed under', async () => {
        await insertFeedingEntry('sojke', 'miesem');
        await insertAnimalLevel('sojke', 'nerwowe');
        const before = { feedings: await tamingFeedingsType.read(), levels: await tamingLevelsType.read() };

        await renameAnimal('sojke', 'Darniaka');

        // The facts don't change, so the union / earliest items stay the same.
        expect(await tamingFeedingsType.read()).toEqual(before.feedings);
        expect(await tamingLevelsType.read()).toEqual(before.levels);
        expect((await getAnimals()).map(a => a.animal)).toEqual(['Darniaka']);
        // The game still calls it "sojke": the level is not recorded again.
        await insertAnimalLevel('sojke', 'nerwowe');
        expect(await readTamingStore('animals')).toHaveLength(1);
    });

    it('syncs food groups per food, including unlinking', async () => {
        await linkFoods('miesem', 'kawalkiem miesa');
        const items = await tamingFoodGroupsType.read();
        expect(items.map(i => i.key).sort()).toEqual(['kawalkiem miesa', 'miesem']);

        await tamingFoodGroupsType.write([
            { scope: 'global', key: 'miesem', deleted: true },
            { scope: 'global', key: 'ryba', value: items[0].value },
        ]);

        const map = await getFoodGroupMap();
        expect(map.has('miesem')).toBe(false);
        expect(map.get('ryba')).toBe(map.get('kawalkiem miesa'));
    });
});

describe('oswajanie on two devices', () => {
    it('rebuilds the same data on a fresh device', async () => {
        await insertFeedingEntry('wilk', 'miesem');
        await insertFeedingEntry('wilk', 'ryba');
        await insertAnimalLevel('wilk', 'nerwowe');
        await setAnimalActive('wilk', false);
        await renameAnimal('wilk', 'Burek');
        await linkFoods('miesem', 'ryba');
        const before = await snapshot();
        const animals = await getAnimals();

        const records = await captureAll('devA');
        await clearAll();
        onDevice('devB');
        const b = tracker('devB');
        await b.apply(records);

        expect(await snapshot()).toEqual(before);
        expect(await getAnimals()).toEqual(animals);
        expect(await getLevelByAnimal('Burek', Date.now() + 1000)).toBe('nerwowe');
        await b.capture();
        expect(await b.outbox()).toEqual([]);
    });

    it('unions feedings made on two devices', async () => {
        await insertFeedingEntry('wilk', 'miesem');
        await insertFeedingEntry('wilk', 'ryba');
        const fromA = await captureAll('devA');

        await clearAll();
        onDevice('devB');
        await insertFeedingEntry('wilk', 'jajo');
        const b = tracker('devB');
        await b.capture();
        const fromB = await b.outbox();
        await b.apply(fromA);

        expect((await getFeedingsByAnimal('wilk')).map(f => f.food).sort()).toEqual(['jajo', 'miesem', 'ryba']);

        // A third device gets all three, whatever order the records come in.
        await clearAll();
        await tracker('devC').apply([...fromB, ...fromA]);
        expect((await getFeedingsByAnimal('wilk')).map(f => f.food).sort()).toEqual(['jajo', 'miesem', 'ryba']);
        expect((await getAnimals())).toEqual([{ animal: 'wilk', active: true }]);
    });

    it('keeps the level-up seen first, so feedings count toward the right level', async () => {
        // Device A: feed, level-up at 1500, feed.
        await insertFeedingEntry('wilk', 'miesem');
        await insertAnimalLevel('wilk', 'nerwowe');
        const [feedA] = await readTamingStore<{ id: string }>('feeding');
        await setFeedingTimestamp(feedA.id, BASE + 1000);
        await setLevelTimestamp('wilk', 'nerwowe', BASE + 1500);
        const fromA = await captureAll('devA');

        // Device B didn't see the level-up; it fed at 2000 and 3000 and only
        // noticed the new level at 4000.
        await clearAll();
        onDevice('devB');
        await insertFeedingEntry('wilk', 'ryba');
        await insertFeedingEntry('wilk', 'ryba');
        await insertAnimalLevel('wilk', 'nerwowe');
        const feedsB = await readTamingStore<{ id: string }>('feeding');
        await setFeedingTimestamp(feedsB[0].id, BASE + 2000);
        await setFeedingTimestamp(feedsB[1].id, BASE + 3000);
        await setLevelTimestamp('wilk', 'nerwowe', BASE + 4000);
        expect(await getLevelByAnimal('wilk', BASE + 2000)).toBe('plochliwe');

        const b = tracker('devB');
        await b.capture();
        const fromB = await b.outbox();
        await b.apply(fromA);

        expect((await tamingLevelsType.read()).map(i => i.value.timestamp)).toEqual([BASE + 1500]);
        // The level-up now follows A's feeding at 1000, not B's at 3000.
        expect(await getLevelByAnimal('wilk', BASE + 1000)).toBe('nerwowe');
        expect(await getLevelByAnimal('wilk', BASE + 2000)).toBe('nerwowe');
        expect(await getLevelByAnimal('wilk', BASE + 3000)).toBe('nerwowe');

        // A device that gets B's later observation after A's keeps A's.
        await clearAll();
        const c = tracker('devC');
        await c.apply(fromA);
        await c.apply(fromB);
        expect((await tamingLevelsType.read()).map(i => i.value.timestamp)).toEqual([BASE + 1500]);
        expect((await getFeedingsByAnimal('wilk'))).toHaveLength(3);
    });

    it('propagates toggling an animal off and on', async () => {
        await insertFeedingEntry('wilk', 'miesem');
        const a = tracker('devA');
        await a.capture();
        const fromA = await a.outbox();
        await a.acknowledge(Number.MAX_SAFE_INTEGER);
        await clearAll();
        const b = tracker('devB');
        await b.apply(fromA);

        // Both devices now hold the same data, so the local stores stand in
        // for either. A switches the animal off; B's copy is still on.
        await setAnimalActive('wilk', false);
        await a.capture();
        const off = await a.outbox();
        await a.acknowledge(Number.MAX_SAFE_INTEGER);
        await setAnimalActive('wilk', true);

        await b.apply(off);
        expect(await getAnimals()).toEqual([{ animal: 'wilk', active: false }]);

        // And back on, from B this time.
        await setAnimalActive('wilk', true);
        await b.capture();
        const on = (await b.outbox()).filter(r => r.type === 'tamingFeedingActive');
        await setAnimalActive('wilk', false);
        await a.apply(on);
        expect(await getAnimals()).toEqual([{ animal: 'wilk', active: true }]);
    });
});

// ---------------------------------------------------------------------------
// Enemy resistances
// ---------------------------------------------------------------------------

describe('enemyResistancesType', () => {
    it('keys entries by name and area and writes through the store', async () => {
        await updateEnemyResistanceSnapshot(() => ({ entries: [resistance('kikimora', 1), resistance('kikimora', null)] }));
        expect((await enemyResistancesType.read()).map(i => i.key)).toEqual(['kikimora|1', 'kikimora|']);

        const listener = jest.fn();
        subscribeEnemyResistances(listener);
        await enemyResistancesType.write([
            { scope: 'global', key: 'kikimora|', deleted: true },
            { scope: 'global', key: 'kikimora|1', value: resistance('kikimora', 1, 5) },
            { scope: 'global', key: 'troll|2', value: resistance('troll', 2) },
        ]);

        expect(listener).toHaveBeenCalled();
        expect(getEnemyResistanceSnapshot().entries.map(e => [e.name, e.areaId, e.updatedAt])).toEqual([
            ['kikimora', 1, 5],
            ['troll', 2, 1],
        ]);
    });
});

// ---------------------------------------------------------------------------
// Zlom
// ---------------------------------------------------------------------------

describe('zlomType', () => {
    it('keys items by kind and short and writes through the store cache', async () => {
        await updateZlomSnapshot(() => ({ bronie: [weapon('miecz'), weapon('miecz', { opis: 'inny' })], tarcze: [], zbroje: [] }));
        expect((await zlomType.read()).map(i => i.key)).toEqual(['bronie:miecz']);

        const listener = jest.fn();
        subscribeZlom(listener);
        await zlomType.write([
            { scope: 'global', key: 'bronie:miecz', value: weapon('miecz', { note: 'dobry' }) },
            { scope: 'global', key: 'bronie:topor', value: weapon('topor') },
        ]);

        expect(listener).toHaveBeenCalled();
        expect(getZlomSnapshot().bronie.map(e => [e.short, e.note])).toEqual([
            ['miecz', 'dobry'],
            ['miecz', undefined],
            ['topor', undefined],
        ]);

        await zlomType.write([{ scope: 'global', key: 'bronie:miecz', deleted: true }]);
        expect(getZlomSnapshot().bronie.map(e => e.short)).toEqual(['topor']);
    });
});

// ---------------------------------------------------------------------------
// Transport segments
// ---------------------------------------------------------------------------

describe('transport segments', () => {
    it('merges to the shortest and longest duration, other fields from the latest update', () => {
        const a = {
            segmentKey: 'k', transport: 'Prom', fromId: 1, toId: 2, fromLabel: 'Old', toLabel: 'B',
            shortestDuration: { duration: 10, startedAt: 0, endedAt: 10 },
            longestDuration: { duration: 20, startedAt: 0, endedAt: 20 },
            expectedDuration: 30, updatedAt: 1,
        } satisfies TransportSegmentValue;
        const b = {
            ...a, fromLabel: 'New', updatedAt: 2,
            shortestDuration: { duration: 5, startedAt: 0, endedAt: 5 },
            longestDuration: { duration: 15, startedAt: 0, endedAt: 15 },
        };

        const merged = mergeTransportSegments(a, b);
        expect(merged).toEqual({
            ...b,
            shortestDuration: b.shortestDuration,
            longestDuration: a.longestDuration,
        });
        expect(mergeTransportSegments(b, a)).toEqual(merged);
        expect(mergeTransportSegments(merged, merged)).toEqual(merged);
        expect(mergeTransportSegments(merged, a)).toEqual(merged);
    });

    it('drops durations measured before a reset', () => {
        const a = {
            segmentKey: 'k', transport: 'Prom', fromId: 1, toId: 2, fromLabel: 'A', toLabel: 'B',
            shortestDuration: { duration: 10, startedAt: 0, endedAt: 100 },
            longestDuration: { duration: 20, startedAt: 0, endedAt: 300 },
            updatedAt: 300,
        } satisfies TransportSegmentValue;
        const reset = { segmentKey: 'k', transport: 'Prom', fromId: 1, toId: 2, fromLabel: 'A', toLabel: 'B', resetAt: 200, updatedAt: 200 };

        expect(mergeTransportSegments(a, reset)).toEqual({
            ...reset, updatedAt: 300, resetAt: 200,
            shortestDuration: a.longestDuration, longestDuration: a.longestDuration,
        });
        expect(mergeTransportSegments(reset, a)).toEqual(mergeTransportSegments(a, reset));
    });

    it('merges min and max from two devices and tells the transport tracker', async () => {
        await recordTransportSegment(segment(10, BASE + 100_000));
        await recordTransportSegment(segment(20, BASE + 200_000));
        const fromA = await captureAll('devA');

        await clearAll();
        await new Promise(resolve => setTimeout(resolve, 5)); // B updates later (updatedAt)
        await recordTransportSegment(segment(5, BASE + 300_000, 'Start B'));
        await recordTransportSegment(segment(15, BASE + 400_000, 'Start B'));
        const b = tracker('devB');
        await b.capture();
        const changed = jest.fn();
        const off = onTransportSegmentsChanged(changed);
        await b.apply(fromA);
        off();

        const [record] = await getAllTransportSegments();
        expect(record.shortestDuration.duration).toBe(5);
        expect(record.longestDuration.duration).toBe(20);
        expect(record.fromLabel).toBe('Start B'); // B's record was updated last
        expect(changed).toHaveBeenCalled();
    });

    it('keeps a reset leg reset instead of restoring it', async () => {
        await recordTransportSegment(segment(10, BASE + 100_000));
        const a = tracker('devA');
        await a.capture();
        const fromA = await a.outbox();

        await deleteTransportSegment('Prom', 1, 2);
        expect(await getAllTransportSegments()).toEqual([]);
        await a.capture();
        expect(await getAllTransportSegments()).toEqual([]);

        // A device that had the old duration drops it too.
        const reset = (await a.outbox()).filter(r => !fromA.includes(r));
        await clearAll();
        const c = tracker('devC');
        await c.apply(fromA);
        expect(await getAllTransportSegments()).toHaveLength(1);
        await c.apply(reset);
        expect(await getAllTransportSegments()).toEqual([]);

        // A new run after the reset counts again.
        await recordTransportSegment(segment(7, Date.now() + 1000));
        expect((await getAllTransportSegments())[0].shortestDuration.duration).toBe(7);
        await c.capture();
        expect((await transportSegmentsType.read())[0].value.resetAt).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// Deliveries
// ---------------------------------------------------------------------------

function delivery(timestamp: number, gold = 1): DeliveryRecord {
    return { timestamp, late: false, gold, silver: 0, copper: 0 };
}

describe('deliveries', () => {
    it('lists deliveries per character keyed by timestamp', async () => {
        await addDeliveryRecords('Alice', [delivery(2), delivery(1)]);
        await addDeliveryRecords('Bob', [delivery(3)]);

        expect(await readSorted(deliveriesType)).toEqual([
            { scope: 'char:Alice', key: '1', value: delivery(1) },
            { scope: 'char:Alice', key: '2', value: delivery(2) },
            { scope: 'char:Bob', key: '3', value: delivery(3) },
        ]);
    });

    it('unions deliveries from two devices', async () => {
        await addDeliveryRecords('Alice', [delivery(1), delivery(2)]);
        const fromA = await captureAll('devA');

        await clearAll();
        await addDeliveryRecords('Alice', [delivery(3)]);
        const b = tracker('devB');
        await b.capture();
        await b.apply(fromA);

        expect((await readDeliveryRecords('Alice')).map(r => r.timestamp)).toEqual([1, 2, 3]);
    });

    it('merges synced deliveries into the running script, so its next save keeps them', async () => {
        const handlers: Record<string, () => void> = {};
        const printed: string[] = [];
        const aliases: { pattern: RegExp; callback: () => void }[] = [];
        const client = {
            on: (event: string, cb: () => void) => { handlers[event] = cb; },
            Triggers: { registerTrigger: jest.fn(), registerOneTimeTrigger: jest.fn(), removeTrigger: jest.fn() },
            print: (buffer: { text: string }) => printed.push(buffer.text),
            now: () => Date.now(),
        };
        initDeliveryStats(client as never, aliases);
        await addDeliveryRecords('Alice', [delivery(1)]);
        handlers['gmcp.char.info']();
        await vi.waitFor(async () => {
            aliases[0].callback();
            expect(printed.at(-1)).toContain('Dostarczono: 1');
        });

        await deliveriesType.write([{ scope: 'char:Alice', key: '2', value: delivery(2) }]);
        aliases[0].callback();

        expect(printed.at(-1)).toContain('Dostarczono: 2');
    });
});

// ---------------------------------------------------------------------------
// All together
// ---------------------------------------------------------------------------

describe('all player data types together', () => {
    it('rebuild the same data on a fresh device', async () => {
        await insertFeedingEntry('wilk', 'miesem');
        await insertAnimalLevel('wilk', 'nerwowe');
        await linkFoods('miesem', 'ryba');
        await dissolveFoodGroup('ryba');
        await linkFoods('miesem', 'jajo');
        await updateEnemyResistanceSnapshot(() => ({ entries: [resistance('kikimora', 1)] }));
        await updateZlomSnapshot(() => ({ bronie: [weapon('miecz')], tarcze: [], zbroje: [] }));
        await recordTransportSegment(segment(10, BASE + 100_000));
        await addDeliveryRecords('Alice', [delivery(1)]);
        const before = await snapshot();
        expect(Object.values(before).filter(items => items.length === 0).length).toBe(2); // the two name types

        const records = await captureAll('devA');
        await clearAll();
        const b = tracker('devB');
        await b.apply(records);

        expect(await snapshot()).toEqual(before);
        await b.capture();
        expect(await b.outbox()).toEqual([]);
    });
});
