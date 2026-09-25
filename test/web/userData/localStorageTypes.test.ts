import { characterStorage, globalStorage } from '@modules/core/storage';
import { formatStamp, HybridLogicalClock } from '@modules/userData/hlc';
import { MemoryRecordStore } from '@modules/userData/recordStore';
import type { UserRecord } from '@modules/userData/records';
import { UserDataTracker } from '@modules/userData/tracker';
import { characterScope, deviceScope } from '@modules/userData/types';
import {
    characterKeysType,
    improveCountsType,
    keymapsType,
    listType,
    objectEntriesType,
    peopleEditsType,
} from '@web/userData/localStorageTypes';
import { restoreBackup, type ExportPayload } from '@web/options/exportUtils';
import { createUserDataTypes } from '@web/userData/registry';

function tracker(deviceId: string, now: () => number = Date.now) {
    let saved: string | null = null;
    return new UserDataTracker({
        deviceId,
        types: createUserDataTypes(() => deviceId, { settleMs: 0, reload: async () => undefined }),
        store: new MemoryRecordStore(),
        clock: new HybridLogicalClock(deviceId, { load: () => saved, save: s => { saved = s; } }, now),
    });
}

/** Everything device `a` knows, captured from the current localStorage. */
async function captureAll(deviceId = 'a'): Promise<UserRecord[]> {
    const a = tracker(deviceId);
    await a.capture();
    return a.outbox();
}

function snapshotLocalStorage(): Record<string, string> {
    const result: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i)!;
        if (key.startsWith('arkadia.')) continue; // clock state, device id
        result[key] = localStorage.getItem(key)!;
    }
    return result;
}

beforeEach(() => {
    localStorage.clear();
    characterStorage.setCharacter('');
});

describe('listType', () => {
    const type = listType('triggers', 'triggers');

    it('keys items by id and applies edits in place, appends new ones and removes deleted ones', () => {
        globalStorage.set('triggers', [{ id: 'a', pattern: 'x' }, { id: 'b', pattern: 'y' }] as never);
        expect(type.read()).toEqual([
            { scope: 'global', key: 'a', value: { id: 'a', pattern: 'x' } },
            { scope: 'global', key: 'b', value: { id: 'b', pattern: 'y' } },
        ]);

        type.write([
            { scope: 'global', key: 'a', deleted: true },
            { scope: 'global', key: 'b', value: { id: 'b', pattern: 'changed' } },
            { scope: 'global', key: 'c', value: { id: 'c', pattern: 'new' } },
        ]);

        expect(globalStorage.get('triggers')).toEqual([{ id: 'b', pattern: 'changed' }, { id: 'c', pattern: 'new' }]);
    });

    it('keys items saved before ids existed by their content', () => {
        globalStorage.set('triggers', [{ pattern: 'old' }] as never);
        expect((type.read() as { key: string }[])[0].key).toBe('content:{"pattern":"old"}');
    });

    it('fires storage listeners so the UI sees applied items', () => {
        const listener = jest.fn();
        const unsubscribe = globalStorage.onChange('triggers', listener);
        type.write([{ scope: 'global', key: 'a', value: { id: 'a' } }]);
        unsubscribe();
        expect(listener).toHaveBeenCalled();
    });
});

describe('objectEntriesType', () => {
    it('syncs settings field by field', () => {
        const type = objectEntriesType('shellSettings', 'shellSettings', false);
        globalStorage.set('shellSettings', { fontSize: 14, theme: 'dark' } as never);

        type.write([{ scope: 'global', key: 'fontSize', value: 16 }]);

        expect(globalStorage.get('shellSettings')).toEqual({ fontSize: 16, theme: 'dark' });
    });
});

describe('keymapsType', () => {
    it('refreshes the flat binds when the active keymap changes', () => {
        globalStorage.set('keymaps', { version: 1, keymaps: { default: { id: 'default', name: 'D', binds: { main: { key: 'F1' } } } } } as never);
        globalStorage.set('active_keymap_id', 'default');

        keymapsType.write([{ scope: 'global', key: 'default', value: { id: 'default', name: 'D', binds: { main: { key: 'F2' } } } as never }]);

        expect(globalStorage.get('binds')).toEqual({ main: { key: 'F2' } });
    });
});

describe('characterKeysType', () => {
    it('lists settings of every character, leaving out excluded keys and keys synced by other types', () => {
        localStorage.setItem('Alice:settings', JSON.stringify({ shortenExits: true }));
        localStorage.setItem('Bob:lastLang', JSON.stringify('elfi'));
        localStorage.setItem('Alice:mapperRoomId', '5');
        localStorage.setItem('Alice:profession', JSON.stringify({ start_time: 1, plus_events: [] }));
        localStorage.setItem('Alice:deposits', JSON.stringify({}));
        localStorage.setItem('Alice:chat_history', JSON.stringify([{ text: 'a chat log line' }]));

        const items = (characterKeysType.read() as { scope: string; key: string }[])
            .map(i => `${i.scope}/${i.key}`).sort();
        expect(items).toEqual(['char:Alice/settings', 'char:Bob/lastLang']);
    });

    it('writes the active character through characterStorage so its listeners fire', () => {
        characterStorage.setCharacter('Alice');
        const listener = jest.fn();
        const unsubscribe = characterStorage.onChange('settings', listener);

        characterKeysType.write([{ scope: characterScope('Alice'), key: 'settings', value: { shortenExits: false } }]);
        unsubscribe();

        expect(localStorage.getItem('Alice:settings')).toBe(JSON.stringify({ shortenExits: false }));
        expect(listener).toHaveBeenCalled();
    });
});

describe('improveCountsType', () => {
    it('reads days as counters and writes them back sorted by date', () => {
        localStorage.setItem('Alice:improve_counter_lifetime', JSON.stringify({
            entries: [{ date: '2026/9/2', count: 3 }],
            enabled: false,
        }));

        expect(improveCountsType.read()).toEqual([{ scope: 'char:Alice', key: '2026/9/2', value: { count: 3 } }]);

        improveCountsType.write([{ scope: 'char:Alice', key: '2026/9/1', value: { count: 1, noFormCount: 1 } }]);

        expect(JSON.parse(localStorage.getItem('Alice:improve_counter_lifetime')!)).toEqual({
            entries: [{ date: '2026/9/1', count: 1, noFormCount: 1 }, { date: '2026/9/2', count: 3 }],
            enabled: false,
        });
    });

    it('keeps the enabled switch of the other device instead of a default', async () => {
        localStorage.setItem('Alice:improve_counter_lifetime', JSON.stringify({ entries: [{ date: '2026/9/1', count: 2 }], enabled: false }));
        const records = await captureAll('a');
        localStorage.clear();

        await tracker('b').apply(records);

        expect(JSON.parse(localStorage.getItem('Alice:improve_counter_lifetime')!).enabled).toBe(false);
    });

    it('skips legacy formats, which the counter converts on load', () => {
        localStorage.setItem('Alice:improve_counter_lifetime', JSON.stringify([{ time: 1 }]));
        expect(improveCountsType.read()).toEqual([]);
    });
});

describe('peopleEditsType', () => {
    it('adds and removes edit events', () => {
        localStorage.setItem('Alice:peopleLocalEvents', JSON.stringify({
            events: [{ id: 'e1', type: 'add', timestamp: 2 }],
            timestamp: 2,
        }));

        peopleEditsType.write([
            { scope: 'char:Alice', key: 'e1', deleted: true },
            { scope: 'char:Alice', key: 'e0', value: { id: 'e0', type: 'ignore', timestamp: 1 } as never },
        ]);

        const events = JSON.parse(localStorage.getItem('Alice:peopleLocalEvents')!).events;
        expect(events).toEqual([{ id: 'e0', type: 'ignore', timestamp: 1 }]);
    });
});

describe('all localStorage types together', () => {
    it('rebuild the same localStorage on a fresh device', async () => {
        globalStorage.set('triggers', [{ id: 't1', pattern: 'x', command: 'y' }] as never);
        globalStorage.set('aliases', [{ id: 'a1', pattern: 'z', command: 'w' }] as never);
        globalStorage.set('shortcuts', { home: { id: 1 } } as never);
        globalStorage.set('shellSettings', { fontSize: 14 } as never);
        localStorage.setItem('Alice:settings', JSON.stringify({ shortenExits: true }));
        localStorage.setItem('Alice:profession', JSON.stringify({ start_time: 1, plus_events: [5, 9] }));
        localStorage.setItem('Alice:deposits', JSON.stringify({ bank: ['sword'] }));
        localStorage.setItem('Alice:improve_counter_lifetime', JSON.stringify({ entries: [{ date: '2026/9/1', count: 2 }], enabled: true }));
        localStorage.setItem('Alice:peopleLocalEvents', JSON.stringify({ events: [{ id: 'e1', type: 'add', timestamp: 1 }], timestamp: 1 }));
        localStorage.setItem('mobileButtonSettings', JSON.stringify({ size: 2, radial: { items: [1] } }));
        const before = snapshotLocalStorage();

        const records = await captureAll('a');
        localStorage.clear();
        const b = tracker('b');
        await b.apply(records);

        const after = snapshotLocalStorage();
        for (const [key, raw] of Object.entries(before)) {
            if (key === 'mobileButtonSettings') continue; // device-scoped part checked below
            expect([key, JSON.parse(after[key] ?? 'null')]).toEqual([key, JSON.parse(raw)]);
        }
        // The radial menu is shared; the rest of the mobile buttons belongs to device a
        expect(JSON.parse(after.mobileButtonSettings)).toEqual({ radial: { items: [1] } });
        // Nothing to upload: b's data is exactly what it received
        await b.capture();
        const outbox = await b.outbox();
        expect(outbox.filter(r => !r.scope.startsWith('device:'))).toEqual([]);
    });

    it('sums improvement counts made on two devices for the same day', async () => {
        localStorage.setItem('Alice:improve_counter_lifetime', JSON.stringify({ entries: [{ date: '2026/9/1', count: 2 }], enabled: true }));
        const fromA = await captureAll('a');

        localStorage.setItem('Alice:improve_counter_lifetime', JSON.stringify({ entries: [{ date: '2026/9/1', count: 3 }], enabled: true }));
        const b = tracker('b');
        await b.capture();
        await b.apply(fromA);

        const entries = JSON.parse(localStorage.getItem('Alice:improve_counter_lifetime')!).entries;
        expect(entries).toEqual([{ date: '2026/9/1', count: 5 }]);
    });

    it('merges profession +staz events from two devices', async () => {
        localStorage.setItem('Alice:profession', JSON.stringify({ start_time: 1, plus_events: [5] }));
        const fromA = await captureAll('a');

        localStorage.setItem('Alice:profession', JSON.stringify({ start_time: 1, plus_events: [7] }));
        const b = tracker('b');
        await b.capture();
        await b.apply(fromA);

        expect(JSON.parse(localStorage.getItem('Alice:profession')!).plus_events).toEqual([5, 7]);
    });

    it('applies a group member\'s layout change without touching its other interface settings', async () => {
        localStorage.setItem('layoutManagerState', JSON.stringify({ enabled: true, windows: {}, dockExtents: { left: 300 } }));
        localStorage.setItem('tripRoutes', JSON.stringify(['a-route']));
        const a = tracker('a');
        await a.capture();
        const first = await a.outbox();
        await a.acknowledge(first[first.length - 1].seq);

        localStorage.clear();
        localStorage.setItem('layoutManagerState', JSON.stringify({ enabled: true, windows: {}, dockExtents: { left: 200 } }));
        localStorage.setItem('tripRoutes', JSON.stringify(['b-route']));
        const b = new UserDataTracker({
            deviceId: 'b',
            types: createUserDataTypes(() => 'b', { settleMs: 0, reload: async () => undefined }),
            store: new MemoryRecordStore(),
            clock: new HybridLogicalClock('b', { load: () => null, save: () => undefined }, () => Date.now() - 60_000),
            appliesFromDevice: other => other === 'a',
        });
        await b.capture();

        // a changes only the dock size
        const layout = JSON.parse(first.find(r => r.key === 'layoutManagerState')!.value as string);
        const edited: UserRecord = {
            ...first.find(r => r.key === 'layoutManagerState')!,
            value: JSON.stringify({ ...layout, dockExtents: { left: 420 } }),
            stamp: formatStamp({ wall: Date.now() + 1_000, counter: 0, device: 'a' }),
        };
        await b.apply([edited]);

        expect(JSON.parse(localStorage.getItem('layoutManagerState')!).dockExtents).toEqual({ left: 420 });
        expect(localStorage.getItem('tripRoutes')).toBe(JSON.stringify(['b-route']));
    });

    it('keeps device interface settings per device', async () => {
        localStorage.setItem('uiSettings', JSON.stringify({ theme: 'dark' }));
        const records = await captureAll('a');
        const ui = records.find(r => r.type === 'interfaceSettings' && r.key === 'uiSettings');
        expect(ui?.scope).toBe(deviceScope('a'));
        expect(ui?.value).toBe(JSON.stringify({ theme: 'dark' }));

        localStorage.clear();
        localStorage.setItem('uiSettings', JSON.stringify({ theme: 'light' }));
        const b = tracker('b');
        await b.apply(records);

        // a is not in b's sync group
        expect(localStorage.getItem('uiSettings')).toBe(JSON.stringify({ theme: 'light' }));
    });
});

/** A device with its own localStorage, swapped in for each of its steps. */
class Device {
    storage: Record<string, string>;
    now = Date.now();
    readonly tracker: UserDataTracker;

    constructor(id: string, storage: Record<string, string>) {
        this.storage = { ...storage };
        let saved: string | null = null;
        this.tracker = new UserDataTracker({
            deviceId: id,
            types: createUserDataTypes(() => id, { settleMs: 0, reload: async () => undefined }),
            store: new MemoryRecordStore(),
            clock: new HybridLogicalClock(id, { load: () => saved, save: s => { saved = s; } }, () => this.now),
        });
    }

    async run<T>(step: () => Promise<T>): Promise<T> {
        localStorage.clear();
        for (const [key, value] of Object.entries(this.storage)) localStorage.setItem(key, value);
        const result = await step();
        this.storage = snapshotLocalStorage();
        return result;
    }

    upload(): Promise<UserRecord[]> {
        return this.run(async () => {
            await this.tracker.capture();
            const outbox = await this.tracker.outbox();
            if (outbox.length > 0) await this.tracker.acknowledge(outbox[outbox.length - 1].seq);
            return outbox;
        });
    }

    apply(records: UserRecord[]): Promise<void> {
        return this.run(() => this.tracker.apply(records));
    }

    lifetime(): Record<string, number> {
        const data = JSON.parse(this.storage['Alice:improve_counter_lifetime']);
        return Object.fromEntries(data.entries.map((e: { date: string; count: number }) => [e.date, e.count]));
    }
}

const lifetime = (counts: Record<string, number>) => JSON.stringify({
    entries: Object.entries(counts).map(([date, count]) => ({ date, count })),
    enabled: true,
});

describe('two devices moving from sync v1', () => {
    it('keeps improvement counts both already had instead of doubling them', async () => {
        const synced = { 'Alice:improve_counter_lifetime': lifetime({ '2026/9/1': 10, '2026/9/2': 5 }) };
        const chrome = new Device('chrome', synced);
        const firefox = new Device('firefox', { 'Alice:improve_counter_lifetime': lifetime({ '2026/9/1': 10, '2026/9/2': 6 }) });

        await firefox.apply(await chrome.upload());
        await chrome.apply(await firefox.upload());

        expect(chrome.lifetime()).toEqual({ '2026/9/1': 10, '2026/9/2': 6 });
        expect(firefox.lifetime()).toEqual({ '2026/9/1': 10, '2026/9/2': 6 });
    });

    it('sends a backup restored on one device to the other', async () => {
        const synced = { 'Alice:improve_counter_lifetime': lifetime({ '2026/9/1': 10, '2026/9/2': 5 }) };
        const chrome = new Device('chrome', synced);
        const firefox = new Device('firefox', synced);
        await firefox.apply(await chrome.upload());
        await chrome.apply(await firefox.upload());

        chrome.now += 60_000;
        const backup: ExportPayload = {
            version: 1,
            createdAt: '2026-08-01T00:00:00Z',
            characters: ['Alice'],
            localStorage: {
                global: {},
                characters: { Alice: { 'Alice:improve_counter_lifetime': lifetime({ '2026/9/1': 3, '2026/9/3': 7 }) } },
            },
            indexedDB: { multibinds: [], visitedRooms: [] },
        };
        await chrome.run(async () => { await restoreBackup(backup); });
        await firefox.apply(await chrome.upload());

        // Counts restored lower go out as a correction; a day missing from the
        // backup is kept (progress has no reset)
        const expected = { '2026/9/1': 3, '2026/9/2': 5, '2026/9/3': 7 };
        expect(chrome.lifetime()).toEqual(expected);
        expect(firefox.lifetime()).toEqual(expected);
    });
});
