import { HybridLogicalClock } from '@modules/userData/hlc';
import { MemoryRecordStore } from '@modules/userData/recordStore';
import type { MergeRule, UserRecord } from '@modules/userData/records';
import { UserDataTracker } from '@modules/userData/tracker';
import { applyCounterChange, deviceScope, type ItemChange, type LocalItem, type UserDataType, type UserDataScope } from '@modules/userData/types';

/** A data type backed by a plain map, standing in for localStorage or IndexedDB. */
class MapType<V> implements UserDataType<V> {
    readonly data = new Map<string, LocalItem<V>>();
    writes: ItemChange<V>[][] = [];

    constructor(
        readonly id: string,
        readonly rule: MergeRule<V>,
        readonly deletable = false,
        readonly scope: UserDataScope = 'global',
    ) {}

    set(key: string, value: V, scope = 'global'): void {
        this.data.set(`${scope}|${key}`, { scope, key, value });
    }

    get(key: string, scope = 'global'): V | undefined {
        return this.data.get(`${scope}|${key}`)?.value;
    }

    delete(key: string, scope = 'global'): void {
        this.data.delete(`${scope}|${key}`);
    }

    read(): LocalItem<V>[] {
        return [...this.data.values()];
    }

    /** Runs right before a write, e.g. to record a kill in between read and write. */
    beforeWrite?: () => void;

    write(changes: ItemChange<V>[]): void {
        this.beforeWrite?.();
        this.writes.push(changes);
        for (const change of changes) {
            if (change.deleted) this.delete(change.key, change.scope);
            else if (this.rule.kind === 'counter') {
                const stored = this.get(change.key, change.scope) as Record<string, number> | undefined;
                this.set(change.key, applyCounterChange(stored, change as ItemChange<Record<string, number>>) as V, change.scope);
            } else this.set(change.key, change.value as V, change.scope);
        }
    }
}

interface Device {
    id: string;
    tracker: UserDataTracker;
    types: Record<string, MapType<any>>;
    store: MemoryRecordStore;
    advance(ms: number): void;
}

function makeTypes(deviceId: string) {
    return {
        aliases: new MapType<string>('aliases', { kind: 'newest' }, true),
        rooms: new MapType<true>('rooms', { kind: 'union' }),
        kills: new MapType<Record<string, number>>('kills', { kind: 'counter' }),
        levels: new MapType<{ at: number }>('levels', { kind: 'earliest', time: v => v.at }),
        layout: new MapType<string>('layout', { kind: 'newest' }, false, 'device'),
        _device: deviceId as never,
    };
}

function makeDevice(id: string, startMs: number, group: string[] = []): Device {
    let now = startMs;
    const types = makeTypes(id);
    const { _device: _, ...typeMap } = types;
    const store = new MemoryRecordStore();
    let saved: string | null = null;
    const clock = new HybridLogicalClock(id, { load: () => saved, save: s => { saved = s; } }, () => now);
    const tracker = new UserDataTracker({
        deviceId: id,
        types: Object.values(typeMap),
        store,
        clock,
        appliesFromDevice: other => group.includes(other),
    });
    return { id, tracker, types: typeMap, store, advance: ms => { now += ms; } };
}

/** Upload `from`'s outbox and deliver it to the others, like the cloud log would. */
async function sync(from: Device, ...to: Device[]): Promise<UserRecord[]> {
    await from.tracker.capture();
    const outbox = await from.tracker.outbox();
    for (const device of to) await device.tracker.apply(outbox);
    if (outbox.length > 0) await from.tracker.acknowledge(outbox[outbox.length - 1].seq);
    return outbox;
}

describe('UserDataTracker', () => {
    it('seeds the tracking copy from local data once, then only captures changes', async () => {
        const a = makeDevice('a', 1_000);
        a.types.aliases.set('x', 'look');
        a.types.rooms.set('12', true);

        const first = await a.tracker.capture();
        expect(first.map(r => r.key).sort()).toEqual(['12', 'x']);
        expect(await a.tracker.capture()).toEqual([]);

        a.types.aliases.set('x', 'glance');
        const second = await a.tracker.capture();
        expect(second).toHaveLength(1);
        expect(second[0]).toMatchObject({ key: 'x', value: 'glance', origin: 'a' });
        expect(second[0].seq).toBeGreaterThan(first[1].seq);
    });

    it('delivers an edit from one device to another', async () => {
        const a = makeDevice('a', 1_000);
        const b = makeDevice('b', 1_000);
        a.types.aliases.set('x', 'look');

        await sync(a, b);

        expect(b.types.aliases.get('x')).toBe('look');
        // Applied data is not captured again as a local change
        expect(await b.tracker.capture()).toEqual([]);
    });

    it('lets the newest edit win on both devices when the same item changes on both', async () => {
        const a = makeDevice('a', 1_000);
        const b = makeDevice('b', 1_000);
        a.types.aliases.set('x', 'from-a');
        await a.tracker.capture();
        b.advance(5_000);
        b.types.aliases.set('x', 'from-b');
        await b.tracker.capture();

        await sync(a, b);
        await sync(b, a);

        expect(a.types.aliases.get('x')).toBe('from-b');
        expect(b.types.aliases.get('x')).toBe('from-b');
    });

    it('does not overwrite a local edit that was not captured yet with an older remote version', async () => {
        const a = makeDevice('a', 1_000);
        const b = makeDevice('b', 1_000);
        a.types.aliases.set('x', 'old-from-a');
        await a.tracker.capture();

        // b edits later, but hasn't captured when a's older record arrives
        b.advance(5_000);
        b.types.aliases.set('x', 'new-on-b');
        await b.tracker.apply(await a.tracker.outbox());

        expect(b.types.aliases.get('x')).toBe('new-on-b');
    });

    it('propagates deletions of user-edited data', async () => {
        const a = makeDevice('a', 1_000);
        const b = makeDevice('b', 1_000);
        a.types.aliases.set('x', 'look');
        await sync(a, b);

        a.advance(1_000);
        a.types.aliases.delete('x');
        const records = await sync(a, b);

        expect(records[0]).toMatchObject({ key: 'x', deleted: true });
        expect(b.types.aliases.get('x')).toBeUndefined();
    });

    it('restores accumulated data that went missing locally instead of deleting it', async () => {
        const a = makeDevice('a', 1_000);
        a.types.rooms.set('12', true);
        await a.tracker.capture();

        a.types.rooms.delete('12');
        expect(await a.tracker.capture()).toEqual([]);
        expect(a.types.rooms.get('12')).toBe(true);
    });

    it('sums counters across devices and lets a device lower its own count', async () => {
        const a = makeDevice('a', 1_000);
        const b = makeDevice('b', 1_000);
        a.types.kills.set('goblin', { count: 5 });
        b.types.kills.set('goblin', { count: 3 });

        await sync(a, b);
        await sync(b, a);
        expect(a.types.kills.get('goblin')).toEqual({ count: 8 });
        expect(b.types.kills.get('goblin')).toEqual({ count: 8 });

        // Two more kills on b
        b.types.kills.set('goblin', { count: 10 });
        await sync(b, a);
        expect(a.types.kills.get('goblin')).toEqual({ count: 10 });

        // A manual correction on a: its own contribution drops from 5 to 1
        a.advance(1_000);
        a.types.kills.set('goblin', { count: 6 });
        await sync(a, b);
        expect(b.types.kills.get('goblin')).toEqual({ count: 6 });
    });

    it('keeps a count added between the tracker reading and writing a counter', async () => {
        const a = makeDevice('a', 1_000);
        const b = makeDevice('b', 1_000);
        a.types.kills.set('goblin', { count: 5 });
        b.types.kills.set('goblin', { count: 3 });
        await b.tracker.capture();

        // A kill lands on b while a's records are being applied
        b.types.kills.beforeWrite = () => b.types.kills.set('goblin', { count: 4 });
        await sync(a, b);
        b.types.kills.beforeWrite = undefined;

        expect(b.types.kills.get('goblin')).toEqual({ count: 9 });
        // ...and it is b's own change, captured and sent on
        await sync(b, a);
        expect(a.types.kills.get('goblin')).toEqual({ count: 9 });
    });

    it('corrects a local value that loses the merge instead of uploading it on every capture', async () => {
        const a = makeDevice('a', 1_000);
        a.types.levels.set('zwierzeta:srednia', { at: 100 });
        await a.tracker.capture();

        a.types.levels.set('zwierzeta:srednia', { at: 300 });
        expect(await a.tracker.capture()).toEqual([]);
        expect(a.types.levels.get('zwierzeta:srednia')).toEqual({ at: 100 });
        expect(await a.tracker.capture()).toEqual([]);
        expect(await a.tracker.outbox()).toHaveLength(1);
    });

    it('keeps the earliest observation and corrects a device that saw it later', async () => {
        const a = makeDevice('a', 1_000);
        const b = makeDevice('b', 1_000);
        a.types.levels.set('zwierzeta:srednia', { at: 100 });
        await a.tracker.capture();
        b.types.levels.set('zwierzeta:srednia', { at: 300 });
        await b.tracker.capture();

        await sync(b, a);
        await sync(a, b);

        expect(a.types.levels.get('zwierzeta:srednia')).toEqual({ at: 100 });
        expect(b.types.levels.get('zwierzeta:srednia')).toEqual({ at: 100 });
    });

    it('applies device-scoped values only from devices of the same sync group', async () => {
        const a = makeDevice('a', 1_000);
        const b = makeDevice('b', 1_000, ['a']);
        const c = makeDevice('c', 1_000);
        a.types.layout.set('bundle', 'wide', deviceScope('a'));
        b.types.layout.set('bundle', 'narrow', deviceScope('b'));
        c.types.layout.set('bundle', 'phone', deviceScope('c'));
        await b.tracker.capture();
        await c.tracker.capture();

        a.advance(5_000);
        await sync(a, b, c);

        expect(b.types.layout.get('bundle', deviceScope('b'))).toBe('wide');
        expect(c.types.layout.get('bundle', deviceScope('c'))).toBe('phone');
    });

    it('keeps records in the outbox until they are acknowledged', async () => {
        const a = makeDevice('a', 1_000);
        a.types.aliases.set('x', 'look');
        a.types.aliases.set('y', 'wave');
        const records = await a.tracker.capture();

        expect(await a.tracker.outbox()).toHaveLength(2);
        await a.tracker.acknowledge(records[0].seq);
        expect((await a.tracker.outbox()).map(r => r.key)).toEqual([records[1].key]);
    });

    it('replaces a queued record when the same item changes again before upload', async () => {
        const a = makeDevice('a', 1_000);
        a.types.aliases.set('x', 'look');
        await a.tracker.capture();
        a.types.aliases.set('x', 'glance');
        await a.tracker.capture();

        const outbox = await a.tracker.outbox();
        expect(outbox).toHaveLength(1);
        expect(outbox[0].value).toBe('glance');
    });

    it('ignores records of types this version does not know', async () => {
        const b = makeDevice('b', 1_000);
        await expect(b.tracker.apply([{
            type: 'fromTheFuture', scope: 'global', key: 'x', value: 1, stamp: '1', origin: 'z', seq: 1,
        }])).resolves.toBeUndefined();
    });
});
