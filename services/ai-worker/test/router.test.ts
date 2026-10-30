/**
 * Router tests.
 *
 * These drive the router through a fake `fetch` that returns canned provider
 * responses, so failover ordering, cooldown marking and the exhaustion path are
 * all exercised with no network and no keys.
 */

import { describe, expect, it } from 'vitest';
import { route, selectCandidates, type RouterEvent } from '../src/router';
import { buildPool, type PoolEntry, type RuntimeConfig } from '../src/config';
import { PoolHealth } from '../src/poolHealth';
import { FakeClock, FakeKV, collect, sseStream } from './helpers';
import type { Env } from '../src/types';

function entry(overrides: Partial<PoolEntry> & { id: string }): PoolEntry {
    return {
        provider: 'groq',
        model: 'test-model',
        apiKey: 'test-key',
        priority: 10,
        maxPromptTokens: 8_000,
        maxOutputTokens: 500,
        supportsToolLoop: true,
        ...overrides,
    };
}

function config(pool: PoolEntry[]): RuntimeConfig {
    return {
        pool,
        dailyQuota: 20,
        allowedOrigins: [],
        maxContextBytes: 8_000,
        maxQuestionChars: 2_000,
        turnstileEnabled: false,
        kvCacheWrites: true,
        cacheTtlSeconds: 3600,
    };
}

/** An OpenAI-compatible SSE success response. */
function okStream(text: string, trailer = ''): Response {
    const frames = text
        .split(' ')
        .map(
            word =>
                `data: ${JSON.stringify({ choices: [{ delta: { content: `${word} ` } }] })}\n\n`,
        );
    if (trailer) {
        frames.push(`data: ${JSON.stringify({ choices: [{ delta: { content: trailer } }] })}\n\n`);
    }
    frames.push('data: [DONE]\n\n');
    return new Response(sseStream(frames), { status: 200 });
}

function rateLimited(retryAfter = '30'): Response {
    return new Response(JSON.stringify({ error: { message: 'rate limit' } }), {
        status: 429,
        headers: { 'retry-after': retryAfter, 'content-type': 'application/json' },
    });
}

function serverError(): Response {
    return new Response(JSON.stringify({ error: { message: 'boom' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
    });
}

/** Fake fetch that returns queued responses per call, recording call order. */
function fakeFetch(responses: Response[]) {
    const calls: string[] = [];
    let index = 0;
    const impl = (async (input: RequestInfo | URL) => {
        calls.push(String(input));
        const response = responses[Math.min(index, responses.length - 1)];
        index++;
        return response;
    }) as unknown as typeof fetch;
    return {
        impl,
        calls,
        get count() {
            return index;
        },
    };
}

async function run(
    pool: PoolEntry[],
    responses: Response[],
    health?: PoolHealth,
): Promise<{ events: RouterEvent[]; calls: string[] }> {
    const kv = new FakeKV();
    const resolvedHealth = health ?? new PoolHealth(kv, { now: () => 1_700_000_000_000 });
    await resolvedHealth.load();
    const fetcher = fakeFetch(responses);
    const events = await collect(
        route({
            question: 'jak ustawic trigger',
            userMessage: 'jak ustawic trigger',
            config: config(pool),
            health: resolvedHealth,
            fetchImpl: fetcher.impl,
            now: () => 1_700_000_000_000,
        }),
    );
    return { events, calls: fetcher.calls };
}

describe('selectCandidates', () => {
    it('returns entries in pool order', async () => {
        const health = new PoolHealth(undefined);
        await health.load();
        const pool = [entry({ id: 'a' }), entry({ id: 'b' }), entry({ id: 'c' })];
        expect(selectCandidates(pool, health).map(e => e.id)).toEqual(['a', 'b', 'c']);
    });

    it('skips cooling entries', async () => {
        const health = new PoolHealth(undefined);
        await health.load();
        health.markCooling('b', 60_000);
        const pool = [entry({ id: 'a' }), entry({ id: 'b' }), entry({ id: 'c' })];
        expect(selectCandidates(pool, health).map(e => e.id)).toEqual(['a', 'c']);
    });
});

describe('failover ordering', () => {
    it('uses the highest-priority entry when it works', async () => {
        const pool = [
            entry({
                id: 'gemini-1',
                provider: 'gemini',
                baseUrl: 'https://x/openai',
                priority: 10,
            }),
            entry({ id: 'groq-1', priority: 20 }),
        ];
        const { events, calls } = await run(pool, [okStream('odpowiedz po polsku')]);
        expect(calls).toHaveLength(1);
        const result = events.find(e => e.type === 'result');
        expect(result).toBeDefined();
        expect(result && result.type === 'result' && result.source).toBe('gemini-1');
    });

    it('retries the same question on the next provider after a 429', async () => {
        const pool = [entry({ id: 'first', priority: 10 }), entry({ id: 'second', priority: 20 })];
        const { events, calls } = await run(pool, [rateLimited(), okStream('druga odpowiedz')]);

        expect(calls).toHaveLength(2);
        const result = events.find(e => e.type === 'result');
        expect(result && result.type === 'result' && result.source).toBe('second');
        // The user sees one answer, not an error.
        expect(events.some(e => e.type === 'exhausted')).toBe(false);
    });

    it('walks the whole pool in priority order', async () => {
        const pool = [
            entry({ id: 'p1', priority: 10 }),
            entry({ id: 'p2', priority: 20 }),
            entry({ id: 'p3', priority: 30 }),
        ];
        const { events, calls } = await run(pool, [
            rateLimited(),
            rateLimited(),
            okStream('trzecia odpowiedz'),
        ]);
        expect(calls).toHaveLength(3);
        const result = events.find(e => e.type === 'result');
        expect(result && result.type === 'result' && result.source).toBe('p3');
    });

    it('fails over on a plain server error too', async () => {
        const pool = [entry({ id: 'a', priority: 10 }), entry({ id: 'b', priority: 20 })];
        const { events } = await run(pool, [serverError(), okStream('ok odpowiedz')]);
        const result = events.find(e => e.type === 'result');
        expect(result && result.type === 'result' && result.source).toBe('b');
    });
});

describe('cooldown marking', () => {
    it('cools an entry that rate-limits, using the Retry-After it sent', async () => {
        const clock = new FakeClock();
        const health = new PoolHealth(new FakeKV(), { now: clock.now });
        await health.load();
        const pool = [entry({ id: 'a', priority: 10 }), entry({ id: 'b', priority: 20 })];

        await run(pool, [rateLimited('45'), okStream('odpowiedz')], health);

        expect(health.isCooling('a')).toBe(true);
        expect(health.cooledUntil('a')).toBe(clock.now() + 45_000);
        expect(health.isCooling('b')).toBe(false);
    });

    it('does NOT cool an entry for a non-quota failure', async () => {
        // A 500 says nothing about our key's standing; cooling would shrink the pool
        // for a reason unrelated to quota.
        const health = new PoolHealth(new FakeKV(), { now: () => 1_700_000_000_000 });
        await health.load();
        const pool = [entry({ id: 'a', priority: 10 }), entry({ id: 'b', priority: 20 })];

        await run(pool, [serverError(), okStream('odpowiedz')], health);

        expect(health.isCooling('a')).toBe(false);
    });

    it('skips an already-cooling entry entirely', async () => {
        const health = new PoolHealth(new FakeKV(), { now: () => 1_700_000_000_000 });
        await health.load();
        health.markCooling('a', 300_000);
        const pool = [entry({ id: 'a', priority: 10 }), entry({ id: 'b', priority: 20 })];

        const { calls, events } = await run(pool, [okStream('odpowiedz z b')], health);

        // Only one upstream call: `a` was never attempted.
        expect(calls).toHaveLength(1);
        const result = events.find(e => e.type === 'result');
        expect(result && result.type === 'result' && result.source).toBe('b');
    });
});

describe('graceful exhaustion', () => {
    it('reports pool_exhausted with a retryAfter when every entry is cooling', async () => {
        const clock = new FakeClock();
        const health = new PoolHealth(new FakeKV(), { now: clock.now });
        await health.load();
        health.markCooling('a', 120_000);
        health.markCooling('b', 300_000);

        const pool = [entry({ id: 'a' }), entry({ id: 'b' })];
        const kvFetch = fakeFetch([okStream('never used')]);
        const events = await collect(
            route({
                question: 'q',
                userMessage: 'q',
                config: config(pool),
                health,
                fetchImpl: kvFetch.impl,
                now: clock.now,
            }),
        );

        expect(kvFetch.count).toBe(0);
        const exhausted = events.find(e => e.type === 'exhausted');
        expect(exhausted).toBeDefined();
        // The soonest entry back is `a`, in 120s — that is what the client waits for.
        expect(exhausted && exhausted.type === 'exhausted' && exhausted.retryAfter).toBe(120);
    });

    it('reports pool_exhausted when every provider fails in-flight', async () => {
        const pool = [entry({ id: 'a', priority: 10 }), entry({ id: 'b', priority: 20 })];
        const { events } = await run(pool, [rateLimited(), rateLimited()]);
        const exhausted = events.find(e => e.type === 'exhausted');
        expect(exhausted).toBeDefined();
        expect(exhausted && exhausted.type === 'exhausted' && exhausted.tried).toEqual(['a', 'b']);
    });

    it('reports exhaustion immediately for an empty pool', async () => {
        const health = new PoolHealth(undefined);
        await health.load();
        const events = await collect(
            route({ question: 'q', userMessage: 'q', config: config([]), health }),
        );
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('exhausted');
    });
});

describe('mid-stream failure', () => {
    it('tells the client to restart when a provider dies after emitting text', async () => {
        // OpenRouter documents that once the first token is sent, the 200 is
        // committed and errors must arrive in-band. We cannot un-send the text, so
        // the client is told to discard it.
        const midStream = new Response(
            sseStream([
                `data: ${JSON.stringify({ choices: [{ delta: { content: 'czesciowa ' } }] })}\n\n`,
                `data: ${JSON.stringify({
                    error: { code: 429, message: 'rate limited' },
                    choices: [{ finish_reason: 'error' }],
                })}\n\n`,
            ]),
            { status: 200 },
        );

        const pool = [entry({ id: 'a', priority: 10 }), entry({ id: 'b', priority: 20 })];
        const { events } = await run(pool, [midStream, okStream('pelna odpowiedz')]);

        const restartIndex = events.findIndex(e => e.type === 'restart');
        expect(restartIndex).toBeGreaterThan(-1);
        // Everything before the restart came from the failed provider.
        expect(events.slice(0, restartIndex).some(e => e.type === 'delta')).toBe(true);
        const result = events.find(e => e.type === 'result');
        expect(result && result.type === 'result' && result.source).toBe('b');
    });

    it('does not emit a restart when the first provider fails before any text', async () => {
        const pool = [entry({ id: 'a', priority: 10 }), entry({ id: 'b', priority: 20 })];
        const { events } = await run(pool, [rateLimited(), okStream('odpowiedz')]);
        expect(events.some(e => e.type === 'restart')).toBe(false);
    });
});

describe('proposal handling', () => {
    it('extracts proposals and keeps them out of the prose stream', async () => {
        const proposalBlock =
            '\n```proposals\n[{"kind":"alias","pattern":"^zz$","command":"zabij","label":"Alias zz"}]\n```';
        const pool = [entry({ id: 'a' })];
        const { events } = await run(pool, [okStream('odpowiedz tekstowa', proposalBlock)]);

        const prose = events
            .filter((e): e is Extract<RouterEvent, { type: 'delta' }> => e.type === 'delta')
            .map(e => e.text)
            .join('');
        expect(prose).not.toContain('```');
        expect(prose).not.toContain('proposals');

        const result = events.find(e => e.type === 'result');
        expect(result && result.type === 'result' && result.proposals).toHaveLength(1);
    });

    it('drops proposals from entries that cannot hold the JSON contract', async () => {
        const proposalBlock =
            '\n```proposals\n[{"kind":"alias","pattern":"^zz$","command":"zabij","label":"x"}]\n```';
        const pool = [entry({ id: 'a', supportsToolLoop: false })];
        const { events } = await run(pool, [okStream('odpowiedz', proposalBlock)]);
        const result = events.find(e => e.type === 'result');
        expect(result && result.type === 'result' && result.proposals).toEqual([]);
    });
});

describe('buildPool', () => {
    it('orders by priority then id, independent of config order', () => {
        const env: Env = {
            AI_POOL: JSON.stringify([
                { id: 'z', provider: 'groq', model: 'm', keySecret: 'GROQ_KEY_1', priority: 30 },
                { id: 'a', provider: 'groq', model: 'm', keySecret: 'GROQ_KEY_1', priority: 10 },
                { id: 'b', provider: 'groq', model: 'm', keySecret: 'GROQ_KEY_2', priority: 10 },
            ]),
            GROQ_KEY_1: 'k1',
            GROQ_KEY_2: 'k2',
        };
        expect(buildPool(env).map(e => e.id)).toEqual(['a', 'b', 'z']);
    });

    it('drops entries whose key secret is unset — the disable switch', () => {
        const env: Env = {
            AI_POOL: JSON.stringify([
                { id: 'has-key', provider: 'groq', model: 'm', keySecret: 'GROQ_KEY_1' },
                { id: 'no-key', provider: 'groq', model: 'm', keySecret: 'GROQ_KEY_2' },
            ]),
            GROQ_KEY_1: 'k1',
        };
        expect(buildPool(env).map(e => e.id)).toEqual(['has-key']);
    });

    it('supports multiple keys for one provider', () => {
        const env: Env = {
            AI_POOL: JSON.stringify([
                {
                    id: 'g1',
                    provider: 'gemini',
                    model: 'm',
                    keySecret: 'GEMINI_KEY_1',
                    priority: 10,
                },
                {
                    id: 'g2',
                    provider: 'gemini',
                    model: 'm',
                    keySecret: 'GEMINI_KEY_2',
                    priority: 11,
                },
            ]),
            GEMINI_KEY_1: 'a',
            GEMINI_KEY_2: 'b',
        };
        const pool = buildPool(env);
        expect(pool).toHaveLength(2);
        expect(pool.map(e => e.apiKey)).toEqual(['a', 'b']);
    });

    it('applies provider defaults, so Groq gets the lean prompt budget', () => {
        const env: Env = {
            AI_POOL: JSON.stringify([
                { id: 'gem', provider: 'gemini', model: 'm', keySecret: 'GEMINI_KEY_1' },
                { id: 'grq', provider: 'groq', model: 'm', keySecret: 'GROQ_KEY_1' },
            ]),
            GEMINI_KEY_1: 'a',
            GROQ_KEY_1: 'b',
        };
        const pool = buildPool(env);
        const gemini = pool.find(e => e.id === 'gem')!;
        const groq = pool.find(e => e.id === 'grq')!;
        expect(groq.maxPromptTokens).toBeLessThan(gemini.maxPromptTokens);
    });

    it('survives a malformed AI_POOL rather than crashing the Worker', () => {
        expect(buildPool({ AI_POOL: '{{{' } as Env)).toEqual([]);
        expect(buildPool({} as Env)).toEqual([]);
    });

    it('rejects duplicate ids, which would collide in the health blob', () => {
        const env: Env = {
            AI_POOL: JSON.stringify([
                { id: 'dup', provider: 'groq', model: 'm1', keySecret: 'GROQ_KEY_1' },
                { id: 'dup', provider: 'groq', model: 'm2', keySecret: 'GROQ_KEY_1' },
            ]),
            GROQ_KEY_1: 'k',
        };
        expect(buildPool(env)).toHaveLength(1);
    });
});
