import { IndexedDbRecordStore } from '@modules/userData/recordStore';
import type { UserRecord } from '@modules/userData/records';

function rec(key: string, seq: number, extra: Partial<UserRecord> = {}): UserRecord {
    return { type: 'aliases', scope: 'global', key, value: key, stamp: `s${seq}`, origin: 'a', seq, ...extra };
}

let dbCount = 0;
/** A database of its own per test. */
const newStoreName = () => `ArkadiaUserDataTest${++dbCount}`;

describe('IndexedDbRecordStore', () => {
    it('keeps the latest record per item, by type', async () => {
        const store = new IndexedDbRecordStore(newStoreName());
        await store.putRecords([rec('x', 1), rec('y', 2), rec('x', 3, { value: 'changed' }), rec('z', 4, { type: 'triggers' })]);

        const aliases = await store.getRecords('aliases');
        expect(aliases.map(r => [r.key, r.value]).sort()).toEqual([['x', 'changed'], ['y', 'y']]);
        expect(await store.getRecords('triggers')).toHaveLength(1);
    });

    it('queues one outbox entry per item, oldest first, and drops acknowledged ones', async () => {
        const store = new IndexedDbRecordStore(newStoreName());
        await store.putOutbox([rec('x', 1), rec('y', 2)]);
        await store.putOutbox([rec('x', 3)]);

        expect((await store.getOutbox()).map(r => r.seq)).toEqual([2, 3]);
        await store.removeOutbox(2);
        expect((await store.getOutbox()).map(r => r.key)).toEqual(['x']);
    });

    it('reserves consecutive sequence numbers that survive reopening', async () => {
        const name = newStoreName();
        expect(await new IndexedDbRecordStore(name).reserveSeq(3)).toBe(1);
        expect(await new IndexedDbRecordStore(name).reserveSeq(2)).toBe(4);
    });
});
