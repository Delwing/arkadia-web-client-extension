import { storeInIndexedDB, getFromIndexedDB, clearIndexedDB } from '@client/utils/dataCache';

const CONFIG = { dbName: 'ArkadiaDataCacheTest', storeName: 'items', key: 'snapshot' };

/** Yields to the macrotask queue, so the next call starts in a fresh task. */
const nextTask = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('dataCache', () => {
    afterEach(async () => {
        await clearIndexedDB(CONFIG);
    });

    it('round-trips a record', async () => {
        await storeInIndexedDB(CONFIG, { entries: [{ name: 'fimir' }] });
        expect(await getFromIndexedDB(CONFIG)).toEqual({ entries: [{ name: 'fimir' }] });
    });

    it('returns null for a key that was never written', async () => {
        expect(await getFromIndexedDB({ ...CONFIG, key: 'absent' })).toBeNull();
    });

    it('clears a key', async () => {
        await storeInIndexedDB(CONFIG, { entries: [] });
        await clearIndexedDB(CONFIG);
        expect(await getFromIndexedDB(CONFIG)).toBeNull();
    });

    it('honours the ttl', async () => {
        await storeInIndexedDB(CONFIG, { entries: [] });
        expect(await getFromIndexedDB(CONFIG, 60_000)).toEqual({ entries: [] });
        // A ttl already in the past makes the stored record stale.
        expect(await getFromIndexedDB(CONFIG, -1)).toBeNull();
    });

    // The two below are the regression guard. The previous implementation created
    // the transaction in one helper and issued the request after an `await`, so the
    // transaction could already be inactive by the time the request ran. That threw
    // TransactionInactiveError, which the callers turned into "no data" - a silent
    // empty read that only showed up under a loaded CI runner.

    it('reads a record written in an earlier task', async () => {
        await storeInIndexedDB(CONFIG, { entries: [{ name: 'kikimora' }] });
        await nextTask();
        expect(await getFromIndexedDB(CONFIG)).toEqual({ entries: [{ name: 'kikimora' }] });
    });

    it('survives interleaved concurrent reads and writes', async () => {
        const keys = Array.from({ length: 25 }, (_, i) => `key-${i}`);
        await Promise.all(keys.map((key, i) =>
            storeInIndexedDB({ ...CONFIG, key }, { index: i })));

        const read = await Promise.all(keys.map(key =>
            getFromIndexedDB<{ index: number }>({ ...CONFIG, key })));

        expect(read.map(r => r?.index)).toEqual(keys.map((_, i) => i));
        await Promise.all(keys.map(key => clearIndexedDB({ ...CONFIG, key })));
    });
});
