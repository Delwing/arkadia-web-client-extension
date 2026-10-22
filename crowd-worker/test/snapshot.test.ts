import { beforeEach, describe, expect, it } from 'vitest';
import { FORCED_EXPORT_MS, exportSnapshot, serveSnapshot } from '../src/snapshot';
import { storeItems } from '../src/store';
import { createFakeD1 } from './fakeD1';
import { createFakeKV } from './fakeKV';

let db: ReturnType<typeof createFakeD1>;
let kv: ReturnType<typeof createFakeKV>;
let reads: number;

const T0 = Date.UTC(2026, 9, 22, 12);

beforeEach(() => {
    db = createFakeD1();
    kv = createFakeKV();
    db.raw.exec("INSERT INTO contributors (id, secret_hash, created_at, registered_from) VALUES ('c1', 'h', 0, 'r')");
    // Count statements that touch the big tables, to prove an idle run skips them.
    reads = 0;
    const prepare = db.prepare.bind(db);
    db.prepare = (query: string) => {
        if (/FROM variants/.test(query)) reads++;
        return prepare(query);
    };
});

async function submit(at: number, mianownik = 'plecak'): Promise<void> {
    const payload = JSON.stringify({ mianownik });
    await storeItems(db, 'c1', [{ hash: `h-${mianownik}`, kind: 'odmiana', key: mianownik, payload }], 5, at);
}

function get(headers: Record<string, string> = {}): Promise<Response> {
    return serveSnapshot(new Request('https://crowd.test/crowd/snapshot', { headers }), kv, 3600);
}

describe('exportSnapshot', () => {
    it('exports on its first run, even with nothing in the database', async () => {
        expect(await exportSnapshot(db, kv, T0)).toBe('exported');
        expect(kv.puts).toBe(1);
    });

    it('does not read the big tables when nothing was written since', async () => {
        await submit(T0);
        await exportSnapshot(db, kv, T0 + 1);
        reads = 0;
        expect(await exportSnapshot(db, kv, T0 + 60 * 60 * 1000)).toBe('unchanged');
        expect(reads).toBe(0);
        expect(kv.puts).toBe(1);
    });

    it('exports again after a submission', async () => {
        await exportSnapshot(db, kv, T0);
        await submit(T0 + 10);
        expect(await exportSnapshot(db, kv, T0 + 20)).toBe('exported');
        const stored = JSON.parse(kv.values.get('snapshot.json')!.value);
        expect(stored.odmiany).toEqual([{ mianownik: 'plecak', confirmations: 1 }]);
    });

    it('exports once a day regardless, so a ban made by hand shows up', async () => {
        await exportSnapshot(db, kv, T0);
        expect(await exportSnapshot(db, kv, T0 + FORCED_EXPORT_MS)).toBe('exported');
    });
});

describe('serveSnapshot', () => {
    it('answers with an empty, uncached snapshot before the first export', async () => {
        const response = await get();
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.json()).toMatchObject({ bronie: [], odmiany: [] });
    });

    it('serves the export with an ETag, and 304 when the client has it', async () => {
        await submit(T0);
        await exportSnapshot(db, kv, T0 + 1);

        const first = await get();
        expect(first.status).toBe(200);
        const etag = first.headers.get('etag')!;
        expect(etag).toMatch(/^".+"$/);
        expect(first.headers.get('cache-control')).toBe('public, max-age=3600');
        expect((await first.json()).odmiany).toHaveLength(1);

        expect((await get({ 'if-none-match': etag })).status).toBe(304);
        expect((await get({ 'if-none-match': `W/${etag}` })).status).toBe(304);

        await submit(T0 + 2, 'torba');
        await exportSnapshot(db, kv, T0 + 3);
        expect((await get({ 'if-none-match': etag })).status).toBe(200);
    });
});
