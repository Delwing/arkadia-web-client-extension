import eventBus from '@modules/core/eventBus';
import { DataStore } from '@modules/data/dataStore/DataStore';
import type { LoaderStrategy, RefreshMetadata, StorageStrategy } from '@modules/data/dataStore/types';
import {
    getKnowledgeStore,
    KNOWLEDGE_URL,
    type KnowledgeSnapshot,
} from '@modules/data/dataStores/knowledgeStore';
import {
    getKnowledgeDetailsStore,
    type KnowledgeCategoryProgress,
    type KnowledgeDefinitions,
    type KnowledgeDetailsSnapshot,
} from '@modules/data/dataStores/knowledgeDetailsStore';
import {
    getKnowledgeEventsForCharacter,
    loadKnowledgeEvents,
    saveKnowledgeEvents,
    type KnowledgeEvent,
    type KnowledgeEventsByCharacter,
} from '@modules/data/dataStores/knowledgeEventsStore';
import { WIEDZA_URL } from '@modules/data/dataStores/wiedzaStore';
import { HybridLogicalClock } from '@modules/userData/hlc';
import { MemoryRecordStore } from '@modules/userData/recordStore';
import type { UserRecord } from '@modules/userData/records';
import { UserDataTracker } from '@modules/userData/tracker';
import { characterScope, type UserDataType } from '@modules/userData/types';
import { createKnowledgeTypes, type KnowledgeSources } from '@web/userData/knowledgeTypes';

const LIBRARIES = {
    'library-chaos': { location_id: 'library-chaos', categories: ['Chaos i jego twory', 'golemy'], name: 'Biblioteka Chaosu' },
};
const BOOKS = {
    'ceramiczna tabliczka': {
        mianownik: 'ceramiczna tabliczka',
        dopelniacz: 'ceramicznej tabliczki',
        biernik: 'ceramiczna tabliczke',
        categories: ['Chaos i jego twory'],
    },
};

// The stores bind fetch when they are first created: stub it before that.
const fetchMock = vi.fn(async (url: string) => {
    const body = url === KNOWLEDGE_URL
        ? { version: 1, books: BOOKS, libraries: LIBRARIES }
        : url === WIEDZA_URL
            ? { success: true, data: { data: [] } }
            : {};
    return { ok: true, json: async () => body } as Response;
});
vi.stubGlobal('fetch', fetchMock);

function typeById(types: UserDataType[], id: string): UserDataType {
    return types.find(t => t.id === id)!;
}

function progress(overrides: Partial<KnowledgeCategoryProgress> = {}): KnowledgeCategoryProgress {
    return {
        entries: { fight: [], books: [], exploration: [] },
        unknownEntries: { fight: [], books: [], exploration: [] },
        levels: {},
        updatedAt: 1,
        ...overrides,
    };
}

function tick(category: string, timestamp: number): KnowledgeEvent {
    return { category: category as KnowledgeEvent['category'], categoryDative: 'golemach', type: 'tick', locationId: 7, timestamp };
}

function levelChange(category: string, level: string, timestamp: number): KnowledgeEvent {
    return { category: category as KnowledgeEvent['category'], categoryDative: '', type: 'level_change', locationId: 0, timestamp, level };
}

/** Ticks since the newest level change of a category, as the knowledge script counts them. */
function ticksSinceLevelUp(events: KnowledgeEvent[], category: string): number {
    const since = Math.max(0, ...events.filter(e => e.type === 'level_change' && e.category === category).map(e => e.timestamp));
    return events.filter(e => e.type === 'tick' && e.category === category && e.timestamp > since).length;
}

function ofCharacter<T extends { scope: string }>(items: T[], name: string): T[] {
    return items.filter(item => item.scope === characterScope(name));
}

// ---------------------------------------------------------------------------
// Against the app's stores
// ---------------------------------------------------------------------------

describe('knowledge types on the app stores', () => {
    const types = createKnowledgeTypes();
    const libraries = typeById(types, 'knowledgeLibraries');
    const books = typeById(types, 'knowledgeBooks');
    const details = typeById(types, 'knowledgeDetails');
    const ticks = typeById(types, 'knowledgeTicks');
    const levels = typeById(types, 'knowledgeLevels');

    // First: the stores have never loaded definitions in this file.
    it('loads definitions before writing on a device that has none yet', async () => {
        expect(await getKnowledgeStore().getSnapshot()).toBeUndefined();
        expect(await getKnowledgeDetailsStore().getSnapshot()).toBeUndefined();

        await libraries.write([{ scope: 'char:Alice', key: 'library-chaos/golemy', value: 'completed' }]);
        await details.write([{ scope: 'char:Alice', key: 'golemy', value: progress({ totalLevel: 'dobra' }) }]);

        const snapshot = await getKnowledgeStore().getSnapshot();
        expect(snapshot?.data.libraries).toEqual(LIBRARIES);
        expect(snapshot?.data.progress.Alice).toEqual({ 'library-chaos': { golemy: 'completed' } });
        expect((await getKnowledgeDetailsStore().getSnapshot())?.data.progress.Alice?.golemy?.totalLevel).toBe('dobra');
    });

    it('lists library progress per library and category, skipping the no-character key', async () => {
        await getKnowledgeStore().applyLocalChange(s => ({
            ...s!,
            data: {
                ...s!.data,
                progress: {
                    ...s!.data.progress,
                    Bob: { 'library-chaos': { 'Chaos i jego twory': 'in_progress', golemy: 'completed' } },
                    __default__: { 'library-chaos': { golemy: 'completed' } },
                },
            },
        }));

        const items = await libraries.read();
        expect(ofCharacter(items, 'Bob')).toEqual([
            { scope: 'char:Bob', key: 'library-chaos/Chaos i jego twory', value: 'in_progress' },
            { scope: 'char:Bob', key: 'library-chaos/golemy', value: 'completed' },
        ]);
        expect(items.some(i => i.scope === 'char:__default__')).toBe(false);

        const seen: unknown[] = [];
        const off = getKnowledgeStore().subscribe(s => seen.push(s?.data.progress.Bob), { emitInitial: false });
        await libraries.write([{ scope: 'char:Bob', key: 'library-chaos/Chaos i jego twory', value: 'completed' }]);
        off();
        const expected = { 'library-chaos': { 'Chaos i jego twory': 'completed', golemy: 'completed' } };
        expect((await getKnowledgeStore().getSnapshot())?.data.progress.Bob).toEqual(expected);
        // Subscribers (the knowledge script) see the change
        expect(seen).toEqual([expected]);
    });

    it('lists and writes book progress per book and category, and asks for a new book report', async () => {
        const requested = vi.fn();
        const off = eventBus.on('requestKnowledgeBookReport', requested);
        await books.write([
            { scope: 'char:Carol', key: 'ceramiczna tabliczka/Chaos i jego twory', value: 'in_progress' },
            { scope: 'char:Carol', key: 'ceramiczna tabliczka/golemy', value: true },
        ]);
        off();

        expect((await getKnowledgeStore().getSnapshot())?.data.bookProgress.Carol).toEqual({
            'ceramiczna tabliczka': { 'Chaos i jego twory': 'in_progress', golemy: true },
        });
        expect(ofCharacter(await books.read(), 'Carol')).toEqual([
            { scope: 'char:Carol', key: 'ceramiczna tabliczka/Chaos i jego twory', value: 'in_progress' },
            { scope: 'char:Carol', key: 'ceramiczna tabliczka/golemy', value: true },
        ]);
        expect(requested).toHaveBeenCalledTimes(1);
    });

    it('lists details per category in a stable shape, plus the character metadata', async () => {
        await getKnowledgeDetailsStore().applyLocalChange(s => ({
            ...s!,
            data: {
                ...s!.data,
                progress: {
                    ...s!.data.progress,
                    Dave: {
                        golemy: progress({
                            entries: { fight: ['b', 'a'], books: [], exploration: [] },
                            levels: { fight: 'dobra' },
                            totalLevel: 'niezla',
                            updatedAt: 50,
                        }),
                    },
                },
                characters: { ...s!.data.characters, Dave: { gender: 'female', updatedAt: 40 } },
            },
        }));

        const items = ofCharacter(await details.read(), 'Dave');
        expect(items).toEqual([
            {
                scope: 'char:Dave',
                key: 'golemy',
                value: progress({
                    entries: { fight: ['a', 'b'], books: [], exploration: [] },
                    levels: { fight: 'dobra' },
                    totalLevel: 'niezla',
                    updatedAt: 50,
                }),
            },
            { scope: 'char:Dave', key: 'meta', value: { gender: 'female', updatedAt: 40 } },
        ]);

        await details.write([
            { scope: 'char:Dave', key: 'nieumarli', value: progress({ updatedAt: 60 }) },
            { scope: 'char:Dave', key: 'meta', value: { gender: 'male', updatedAt: 60 } },
        ]);
        const snapshot = await getKnowledgeDetailsStore().getSnapshot();
        expect(snapshot?.data.progress.Dave?.nieumarli).toEqual(progress({ updatedAt: 60 }));
        expect(snapshot?.data.progress.Dave?.golemy?.totalLevel).toBe('niezla');
        expect(snapshot?.data.characters.Dave).toEqual({ gender: 'male', updatedAt: 60 });
    });

    it('lists ticks one by one and level changes collapsed to the earliest per level', async () => {
        await saveKnowledgeEvents('Erin', {
            events: [
                levelChange('golemy', 'dobra', 100),
                tick('golemy', 150),
                levelChange('golemy', 'dobra', 300),
                tick('nieumarli', 320),
                levelChange('golemy', 'bardzo dobra', 400),
            ],
        });
        await saveKnowledgeEvents('__default__', { events: [tick('golemy', 5)] });

        expect(ofCharacter(await ticks.read(), 'Erin')).toEqual([
            { scope: 'char:Erin', key: 'tick/golemy/150', value: tick('golemy', 150) },
            { scope: 'char:Erin', key: 'tick/nieumarli/320', value: tick('nieumarli', 320) },
        ]);
        expect(ofCharacter(await levels.read(), 'Erin')).toEqual([
            { scope: 'char:Erin', key: 'level/golemy/dobra', value: levelChange('golemy', 'dobra', 100) },
            { scope: 'char:Erin', key: 'level/golemy/bardzo dobra', value: levelChange('golemy', 'bardzo dobra', 400) },
        ]);
        expect((await ticks.read()).some(i => i.scope === 'char:__default__')).toBe(false);
    });

    it('writes events sorted into the cached list the script and window read, and says so', async () => {
        await saveKnowledgeEvents('Finn', {
            events: [levelChange('golemy', 'dobra', 500), tick('golemy', 600), levelChange('golemy', 'dobra', 700)],
        });
        const changed = vi.fn();
        const off = eventBus.on('knowledgeEvents.changed', changed);

        await ticks.write([
            { scope: 'char:Finn', key: 'tick/golemy/200', value: tick('golemy', 200) },
            // Already there
            { scope: 'char:Finn', key: 'tick/golemy/600', value: tick('golemy', 600) },
        ]);
        await levels.write([{ scope: 'char:Finn', key: 'level/golemy/dobra', value: levelChange('golemy', 'dobra', 100) }]);
        off();

        expect(await getKnowledgeEventsForCharacter('Finn')).toEqual([
            levelChange('golemy', 'dobra', 100),
            tick('golemy', 200),
            tick('golemy', 600),
        ]);
        expect((await loadKnowledgeEvents()).Finn.events).toHaveLength(3);
        expect(changed).toHaveBeenCalledTimes(2);
        expect(changed).toHaveBeenLastCalledWith({ characters: ['Finn'] });
    });

    it('rebuild the same knowledge on a fresh device', async () => {
        await saveKnowledgeEvents('Gina', { events: [levelChange('golemy', 'dobra', 10), tick('golemy', 20)] });
        const a = trackerOn('a', types);
        await a.capture();
        const records = await a.outbox();

        const before = {
            libraries: (await getKnowledgeStore().getSnapshot())!.data,
            details: (await getKnowledgeDetailsStore().getSnapshot())!.data,
            events: structuredClone(await loadKnowledgeEvents()),
        };
        await getKnowledgeStore().clear();
        await getKnowledgeDetailsStore().clear();
        for (const name of Object.keys(before.events)) await saveKnowledgeEvents(name, { events: [] });

        const b = trackerOn('b', types);
        await b.apply(records);

        const librariesAfter = (await getKnowledgeStore().getSnapshot())!.data;
        const detailsAfter = (await getKnowledgeDetailsStore().getSnapshot())!.data;
        const { __default__: _libDefault, ...syncedProgress } = before.libraries.progress;
        expect(librariesAfter.progress).toEqual(syncedProgress);
        expect(librariesAfter.bookProgress).toEqual(before.libraries.bookProgress);
        for (const [name, categories] of Object.entries(before.details.progress)) {
            for (const [category, value] of Object.entries(categories)) {
                expect(detailsAfter.progress[name]?.[category as 'golemy']?.updatedAt).toBe(value!.updatedAt);
                expect(detailsAfter.progress[name]?.[category as 'golemy']?.totalLevel).toBe(value!.totalLevel);
            }
        }
        expect(detailsAfter.characters).toEqual(before.details.characters);
        const eventsAfter = await loadKnowledgeEvents();
        expect(eventsAfter.Gina.events).toEqual(before.events.Gina.events);
        expect(eventsAfter.Erin.events).toHaveLength(4); // duplicate level change collapsed
        expect(eventsAfter.__default__.events).toEqual([]);

        // Nothing to upload: b's data is exactly what it received
        await b.capture();
        expect(await b.outbox()).toEqual([]);
    });
});

function trackerOn(deviceId: string, types: UserDataType[], now: () => number = Date.now): UserDataTracker {
    let saved: string | null = null;
    return new UserDataTracker({
        deviceId,
        types,
        store: new MemoryRecordStore(),
        clock: new HybridLogicalClock(deviceId, { load: () => saved, save: s => { saved = s; } }, now),
    });
}

// ---------------------------------------------------------------------------
// Several devices, each with its own stores
// ---------------------------------------------------------------------------

class MemoryStorage<T> implements StorageStrategy<T, RefreshMetadata> {
    snapshot: T | undefined;
    metadata: RefreshMetadata | undefined;
    async readSnapshot() { return this.snapshot; }
    async writeSnapshot(snapshot: T | undefined) { this.snapshot = snapshot; }
    async readMetadata() { return this.metadata; }
    async writeMetadata(metadata: RefreshMetadata | undefined) { this.metadata = metadata; }
    async clear() { this.snapshot = undefined; this.metadata = undefined; }
}

interface Device {
    id: string;
    tracker: UserDataTracker;
    sources: KnowledgeSources;
    events: KnowledgeEventsByCharacter;
    /** Whether the definitions download works. */
    online: boolean;
    advance(ms: number): void;
}

async function makeDevice(id: string, startMs: number, options: { loaded?: boolean } = {}): Promise<Device> {
    let now = startMs;
    const device = { id, online: true, events: {} as KnowledgeEventsByCharacter } as Device;

    const librariesLoader: LoaderStrategy<KnowledgeSnapshot> = {
        async load({ previousSnapshot }) {
            if (!device.online) throw new Error('offline');
            return {
                snapshot: {
                    data: {
                        books: BOOKS,
                        libraries: LIBRARIES,
                        progress: previousSnapshot?.data.progress ?? {},
                        bookProgress: previousSnapshot?.data.bookProgress ?? {},
                    },
                    timestamp: now,
                },
            };
        },
    };
    const detailsLoader: LoaderStrategy<KnowledgeDetailsSnapshot> = {
        async load({ previousSnapshot }) {
            if (!device.online) throw new Error('offline');
            return {
                snapshot: {
                    data: {
                        definitions: {} as KnowledgeDefinitions,
                        progress: previousSnapshot?.data.progress ?? {},
                        characters: previousSnapshot?.data.characters ?? {},
                    },
                    timestamp: now,
                },
            };
        },
    };
    const librariesStore = new DataStore({ loader: librariesLoader, storage: new MemoryStorage<KnowledgeSnapshot>() });
    const detailsStore = new DataStore({ loader: detailsLoader, storage: new MemoryStorage<KnowledgeDetailsSnapshot>() });
    device.sources = {
        libraries: () => librariesStore,
        details: () => detailsStore,
        events: {
            load: async () => device.events,
            save: async (character, data) => { device.events[character] = data; },
        },
    };

    let saved: string | null = null;
    device.tracker = new UserDataTracker({
        deviceId: id,
        types: createKnowledgeTypes(device.sources),
        store: new MemoryRecordStore(),
        clock: new HybridLogicalClock(id, { load: () => saved, save: s => { saved = s; } }, () => now),
    });
    device.advance = ms => { now += ms; };

    if (options.loaded !== false) {
        await librariesStore.refresh();
        await detailsStore.refresh();
    }
    return device;
}

async function setLibrary(device: Device, character: string, libraryId: string, category: string, status: string): Promise<void> {
    await device.sources.libraries().applyLocalChange(s => {
        const progress = { ...s!.data.progress };
        progress[character] = { ...progress[character], [libraryId]: { ...progress[character]?.[libraryId], [category]: status as 'completed' } };
        return { ...s!, data: { ...s!.data, progress } };
    });
}

async function libraryStatus(device: Device, character: string, libraryId: string, category: string): Promise<string | undefined> {
    return (await device.sources.libraries().getSnapshot())?.data.progress[character]?.[libraryId]?.[category];
}

/** Upload `from`'s outbox and deliver it to the others, like the cloud log would. */
async function sync(from: Device, ...to: Device[]): Promise<UserRecord[]> {
    await from.tracker.capture();
    const outbox = await from.tracker.outbox();
    for (const device of to) await device.tracker.apply(outbox);
    if (outbox.length > 0) await from.tracker.acknowledge(outbox[outbox.length - 1].seq);
    return outbox;
}

describe('knowledge types across devices', () => {
    it('only moves library and book progress forward', async () => {
        const a = await makeDevice('a', 1_000);
        const b = await makeDevice('b', 1_000);
        await setLibrary(a, 'Alice', 'library-chaos', 'golemy', 'completed');
        await a.tracker.capture();
        // b reads the library later, still in progress there
        b.advance(10_000);
        await setLibrary(b, 'Alice', 'library-chaos', 'golemy', 'in_progress');
        await setLibrary(b, 'Alice', 'library-chaos', 'Chaos i jego twory', 'in_progress');
        await b.sources.libraries().applyLocalChange(s => ({
            ...s!, data: { ...s!.data, bookProgress: { Alice: { 'ceramiczna tabliczka': { golemy: true } } } },
        }));
        await b.tracker.capture();

        await sync(a, b);
        await sync(b, a);

        for (const device of [a, b]) {
            expect(await libraryStatus(device, 'Alice', 'library-chaos', 'golemy')).toBe('completed');
            expect(await libraryStatus(device, 'Alice', 'library-chaos', 'Chaos i jego twory')).toBe('in_progress');
        }
        expect((await a.sources.libraries().getSnapshot())?.data.bookProgress.Alice).toEqual({ 'ceramiczna tabliczka': { golemy: true } });

        // A later "in progress" from a doesn't undo the completed book on b
        a.advance(20_000);
        await a.sources.libraries().applyLocalChange(s => ({
            ...s!, data: { ...s!.data, bookProgress: { Alice: { 'ceramiczna tabliczka': { golemy: 'in_progress' } } } },
        }));
        await sync(a, b);
        expect((await b.sources.libraries().getSnapshot())?.data.bookProgress.Alice).toEqual({ 'ceramiczna tabliczka': { golemy: true } });
    });

    it('keeps the level-up seen first, so ticks since it are counted from the real level-up', async () => {
        const a = await makeDevice('a', 1_000);
        const b = await makeDevice('b', 1_000);
        // a saw the level-up at 1000 and two ticks after it
        a.events.Alice = { events: [levelChange('golemy', 'dobra', 1_000), tick('golemy', 1_100), tick('golemy', 1_200)] };
        await a.tracker.capture();
        // b played on without the level-up, then ran `wiedza` at 1500
        b.advance(10_000);
        b.events.Alice = {
            events: [levelChange('golemy', 'niezla', 500), tick('golemy', 1_300), levelChange('golemy', 'dobra', 1_500), tick('golemy', 1_600)],
        };
        expect(ticksSinceLevelUp(b.events.Alice.events, 'golemy')).toBe(1);
        await b.tracker.capture();

        await sync(b, a);
        await sync(a, b);

        const expected = [
            levelChange('golemy', 'niezla', 500),
            levelChange('golemy', 'dobra', 1_000),
            tick('golemy', 1_100),
            tick('golemy', 1_200),
            tick('golemy', 1_300),
            tick('golemy', 1_600),
        ];
        expect(a.events.Alice.events).toEqual(expected);
        expect(b.events.Alice.events).toEqual(expected);
        expect(ticksSinceLevelUp(b.events.Alice.events, 'golemy')).toBe(4);

        // Settled: nothing new to upload from either
        expect(await a.tracker.capture()).toEqual([]);
        expect(await b.tracker.capture()).toEqual([]);
    });

    it('unions ticks recorded on two devices', async () => {
        const a = await makeDevice('a', 1_000);
        const b = await makeDevice('b', 1_000);
        a.events.Alice = { events: [tick('golemy', 10), tick('nieumarli', 30)] };
        b.events.Alice = { events: [tick('golemy', 20), tick('golemy', 10)] };
        b.events.Bob = { events: [tick('golemy', 5)] };

        await sync(a, b);
        await sync(b, a);

        const expected = [tick('golemy', 10), tick('golemy', 20), tick('nieumarli', 30)];
        expect(a.events.Alice.events).toEqual(expected);
        expect(b.events.Alice.events).toEqual(expected);
        expect(a.events.Bob.events).toEqual([tick('golemy', 5)]);
    });

    it('keeps the later wiedza reading even when an older one is captured later', async () => {
        const a = await makeDevice('a', 1_000);
        const b = await makeDevice('b', 1_000);
        const fresh = progress({ totalLevel: 'dobra', updatedAt: 2_000 });
        const stale = progress({ totalLevel: 'niezla', updatedAt: 1_000 });
        await a.sources.details().applyLocalChange(s => ({ ...s!, data: { ...s!.data, progress: { Alice: { golemy: fresh } } } }));
        await sync(a, b);
        // b's own old reading, captured (stamped) after a's
        b.advance(60_000);
        await b.sources.details().applyLocalChange(s => ({ ...s!, data: { ...s!.data, progress: { Alice: { golemy: stale } } } }));
        await sync(b, a);

        for (const device of [a, b]) {
            expect((await device.sources.details().getSnapshot())?.data.progress.Alice?.golemy).toEqual(fresh);
        }
    });

    it('loads definitions before applying progress on a device that has none, and never drops it', async () => {
        const a = await makeDevice('a', 1_000);
        await setLibrary(a, 'Alice', 'library-chaos', 'golemy', 'completed');
        await a.sources.details().applyLocalChange(s => ({
            ...s!, data: { ...s!.data, progress: { Alice: { golemy: progress({ totalLevel: 'dobra' }) } }, characters: { Alice: { gender: 'female' } } },
        }));
        await a.tracker.capture();
        const records = await a.tracker.outbox();

        // Offline: the write fails and the records stay unapplied
        const b = await makeDevice('b', 1_000, { loaded: false });
        b.online = false;
        await expect(b.tracker.apply(records)).rejects.toThrow();
        expect(await b.sources.libraries().getSnapshot()).toBeUndefined();

        // Delivered again once definitions can be loaded
        b.online = true;
        await b.tracker.apply(records);
        expect(await libraryStatus(b, 'Alice', 'library-chaos', 'golemy')).toBe('completed');
        const detailsSnapshot = await b.sources.details().getSnapshot();
        expect(detailsSnapshot?.data.progress.Alice?.golemy?.totalLevel).toBe('dobra');
        expect(detailsSnapshot?.data.characters.Alice).toEqual({ gender: 'female' });
        expect(await b.tracker.capture()).toEqual([]);
    });
});
