/**
 * FirestoreTransport against a small in-memory fake of the firebase/firestore
 * functions it uses (documents, merge writes, arrayUnion, deleteField,
 * snapshot listeners, transactions).
 */

const store = new Map<string, Record<string, unknown>>();
const listeners = new Map<string, Set<(snap: unknown) => void>>();
const ops = { reads: 0, writes: 0 };

const ARRAY_UNION = Symbol('arrayUnion');
const DELETE = Symbol('delete');

function snap(path: string) {
    const data = store.get(path);
    return { exists: () => !!data, data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined) };
}

function mergeInto(target: Record<string, unknown>, patch: Record<string, unknown>) {
    for (const [key, value] of Object.entries(patch)) {
        if (value && typeof value === 'object' && (value as { kind?: symbol }).kind === ARRAY_UNION) {
            const current = Array.isArray(target[key]) ? target[key] as unknown[] : [];
            target[key] = [...current, ...(value as { items: unknown[] }).items];
        } else if (value && typeof value === 'object' && (value as { kind?: symbol }).kind === DELETE) {
            delete target[key];
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
            const nested = (target[key] && typeof target[key] === 'object' ? target[key] : {}) as Record<string, unknown>;
            target[key] = nested;
            mergeInto(nested, value as Record<string, unknown>);
        } else {
            target[key] = value;
        }
    }
}

function write(path: string, data: Record<string, unknown>, merge: boolean) {
    ops.writes += 1;
    const next = merge ? JSON.parse(JSON.stringify(store.get(path) ?? {})) : {};
    mergeInto(next, data);
    store.set(path, next);
    listeners.get(path)?.forEach(l => queueMicrotask(() => l(snap(path))));
}

vi.mock('firebase/firestore', () => ({
    doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
    getDoc: async (ref: { path: string }) => { ops.reads += 1; return snap(ref.path); },
    setDoc: async (ref: { path: string }, data: Record<string, unknown>, options?: { merge?: boolean }) => write(ref.path, data, !!options?.merge),
    arrayUnion: (...items: unknown[]) => ({ kind: ARRAY_UNION, items }),
    deleteField: () => ({ kind: DELETE }),
    onSnapshot: (ref: { path: string }, onNext: (s: unknown) => void) => {
        const set = listeners.get(ref.path) ?? new Set();
        set.add(onNext);
        listeners.set(ref.path, set);
        queueMicrotask(() => onNext(snap(ref.path)));
        return () => set.delete(onNext);
    },
    runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<void>) => {
        const writes: Array<() => void> = [];
        await fn({
            get: async (ref: { path: string }) => { ops.reads += 1; return snap(ref.path); },
            set: (ref: { path: string }, data: Record<string, unknown>, options?: { merge?: boolean }) =>
                writes.push(() => write(ref.path, data, !!options?.merge)),
            delete: (ref: { path: string }) => writes.push(() => { store.delete(ref.path); }),
        });
        writes.forEach(w => w());
    },
}));

import { FirestoreTransport, splitChunks } from '@modules/syncV2/firestoreTransport';
import type { LogDoc, SyncBatch } from '@modules/syncV2/transport';

const batch = (device: string, seq: number): SyncBatch => ({
    device, fromSeq: seq, toSeq: seq, stamp: `s${seq}`, encrypted: false, data: '[]',
});

describe('FirestoreTransport', () => {
    beforeEach(() => {
        store.clear();
        listeners.clear();
    });

    const transport = () => new FirestoreTransport({} as never, 'user-1');

    it('appends batches to users/{uid}/syncV2/log and delivers the log to listeners', async () => {
        const t = transport();
        const received: LogDoc[] = [];
        const unsubscribe = t.subscribeLog(log => received.push(log), () => undefined);
        await vi.waitFor(() => expect(received).toHaveLength(1));
        expect(received[0]).toEqual({ batches: [], folded: {}, watching: {} });

        await t.appendBatch(batch('pc', 1));
        await t.appendBatch(batch('phone', 1));

        await vi.waitFor(() => expect(received.at(-1)?.batches.map(b => b.device)).toEqual(['pc', 'phone']));
        expect(store.has('users/user-1/syncV2/log')).toBe(true);
        unsubscribe();
    });

    it('sets and clears the watching flag of a device', async () => {
        const t = transport();
        await t.setWatching('pc', 123);
        await t.setWatching('phone', 456);
        await t.setWatching('pc', null);
        expect(store.get('users/user-1/syncV2/log')?.watching).toEqual({ phone: 456 });
    });

    it('folds atomically: writes the base, empties the log and records the watermarks', async () => {
        const t = transport();
        await t.appendBatch(batch('pc', 3));

        await t.fold(async (base, log) => {
            expect(base).toBeNull();
            expect(log.batches).toHaveLength(1);
            return {
                base: { schemaVersion: 1, folded: { pc: 3 }, encrypted: false, data: '[1]', updatedAt: 7 },
                keep: [],
                folded: { pc: 3 },
            };
        });

        expect(store.get('users/user-1/syncV2/log')).toMatchObject({ batches: [], folded: { pc: 3 } });
        expect(await t.readBase()).toEqual({ schemaVersion: 1, folded: { pc: 3 }, encrypted: false, data: '[1]', updatedAt: 7 });
    });

    it('splits a large base over several documents and joins it back', async () => {
        const t = transport();
        const big = 'x'.repeat(1_500_000);
        const fold = (data: string) => t.fold(async () => ({
            base: { schemaVersion: 1, folded: {}, encrypted: false, data, updatedAt: 1 },
            keep: [],
            folded: {},
        }));

        await fold(big);
        expect(store.get('users/user-1/syncV2/base')?.chunks).toBe(3);
        expect(store.has('users/user-1/syncV2/base__2')).toBe(true);
        expect((await t.readBase())?.data).toBe(big);

        // Shrinking removes the chunks no longer used
        await fold('small');
        expect(store.has('users/user-1/syncV2/base__1')).toBe(false);
        expect((await t.readBase())?.data).toBe('small');
    });
});

describe('splitChunks', () => {
    it('keeps small data in one chunk', () => {
        expect(splitChunks('abc', 5)).toEqual(['abc']);
        expect(splitChunks('abcdefg', 3)).toEqual(['abc', 'def', 'g']);
    });
});
