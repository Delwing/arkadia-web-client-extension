import { describe, expect, it } from 'vitest';
import { AnswerCache, type CachedAnswer, type CacheLike } from '../src/cache';
import { FakeKV } from './helpers';

/** In-memory stand-in for `caches.default`. */
class FakeEdgeCache implements CacheLike {
    private store = new Map<string, string>();
    puts = 0;

    async match(request: Request): Promise<Response | undefined> {
        const body = this.store.get(request.url);
        return body === undefined ? undefined : new Response(body);
    }

    async put(request: Request, response: Response): Promise<void> {
        this.puts++;
        this.store.set(request.url, await response.text());
    }
}

const ANSWER: CachedAnswer = {
    answer: 'Odpowiedz po polsku.',
    proposals: [],
    source: 'gemini-1',
    createdAt: 1_700_000_000_000,
    kbVersion: 'v1',
};

function make(kv?: FakeKV, edge?: FakeEdgeCache, kvWrites = true) {
    return new AnswerCache(kv, edge, { ttlSeconds: 3600, kvWrites });
}

describe('AnswerCache', () => {
    it('misses on an empty cache', async () => {
        const result = await make(new FakeKV(), new FakeEdgeCache()).get('key');
        expect(result.value).toBeNull();
        expect(result.tier).toBeNull();
    });

    it('round-trips through the edge tier', async () => {
        const edge = new FakeEdgeCache();
        const cache = make(new FakeKV(), edge);
        await cache.put('key', ANSWER);
        const result = await cache.get('key');
        expect(result.value?.answer).toBe(ANSWER.answer);
        expect(result.tier).toBe('edge');
    });

    it('falls back to KV when the edge tier misses', async () => {
        // The cross-colo case: another location wrote it, this one has not seen it.
        const kv = new FakeKV();
        await make(kv, undefined).put('key', ANSWER);

        const result = await make(kv, new FakeEdgeCache()).get('key');
        expect(result.value?.answer).toBe(ANSWER.answer);
        expect(result.tier).toBe('kv');
    });

    it('promotes a KV hit into the edge tier for free', async () => {
        const kv = new FakeKV();
        await make(kv, undefined).put('key', ANSWER);

        const edge = new FakeEdgeCache();
        const cache = make(kv, edge);
        const hit = await cache.get('key');
        await cache.promote('key', hit.value!);

        expect((await cache.get('key')).tier).toBe('edge');
    });

    it('writes to both tiers by default', async () => {
        const kv = new FakeKV();
        const edge = new FakeEdgeCache();
        await make(kv, edge).put('key', ANSWER);
        expect(kv.writes).toBe(1);
        expect(edge.puts).toBe(1);
    });

    it('skips KV writes when the write budget is tight', async () => {
        // KV_CACHE_WRITES=false — the edge tier keeps working on its own.
        const kv = new FakeKV();
        const edge = new FakeEdgeCache();
        await make(kv, edge, false).put('key', ANSWER);
        expect(kv.writes).toBe(0);
        expect(edge.puts).toBe(1);
    });

    it('works with no edge cache at all, as in unit tests', async () => {
        const kv = new FakeKV();
        const cache = make(kv, undefined);
        await cache.put('key', ANSWER);
        expect((await cache.get('key')).tier).toBe('kv');
    });

    it('treats a poisoned KV entry as a miss rather than throwing', async () => {
        const kv = new FakeKV();
        kv.store.set('key', '{not json');
        await expect(make(kv, new FakeEdgeCache()).get('key')).resolves.toMatchObject({
            value: null,
        });
    });

    it('survives KV being unavailable', async () => {
        const kv = new FakeKV();
        kv.broken = true;
        const cache = make(kv, new FakeEdgeCache());
        await expect(cache.get('key')).resolves.toMatchObject({ value: null });
        await expect(cache.put('key', ANSWER)).resolves.toBeUndefined();
    });

    it('preserves proposals across the round trip', async () => {
        const withProposals: CachedAnswer = {
            ...ANSWER,
            proposals: [{ kind: 'settingChange', key: 'settings.shortenExits', value: true, label: 'x' }],
        };
        const cache = make(new FakeKV(), new FakeEdgeCache());
        await cache.put('key', withProposals);
        const result = await cache.get('key');
        expect(result.value?.proposals).toHaveLength(1);
    });
});
