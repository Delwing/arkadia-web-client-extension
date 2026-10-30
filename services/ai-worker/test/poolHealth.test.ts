import { describe, expect, it } from 'vitest';
import { HEALTH_KEY, PoolHealth } from '../src/poolHealth';
import { FakeClock, FakeKV } from './helpers';

function makeHealth(kv: FakeKV, clock: FakeClock, overrides = {}) {
    return new PoolHealth(kv, {
        persistMinCooldownMs: 5 * 60 * 1000,
        persistMinIntervalMs: 60 * 1000,
        now: clock.now,
        ...overrides,
    });
}

describe('PoolHealth cooldown tracking', () => {
    it('marks an entry cooling and reports it as unavailable', async () => {
        const clock = new FakeClock();
        const health = makeHealth(new FakeKV(), clock);
        await health.load();

        health.markCooling('gemini-1', 30_000, 'HTTP 429');
        expect(health.isCooling('gemini-1')).toBe(true);
        expect(health.isCooling('groq-1')).toBe(false);
    });

    it('recovers implicitly once the cooldown elapses, with no write', async () => {
        const clock = new FakeClock();
        const kv = new FakeKV();
        const health = makeHealth(kv, clock);
        await health.load();

        health.markCooling('gemini-1', 30_000);
        expect(health.isCooling('gemini-1')).toBe(true);

        clock.advance(31_000);
        expect(health.isCooling('gemini-1')).toBe(false);
        // Recovery is derived from the timestamp; it must not cost a KV write.
        await health.flush();
        expect(kv.writes).toBe(0);
    });

    it('reports the earliest available moment across entries', async () => {
        const clock = new FakeClock();
        const health = makeHealth(new FakeKV(), clock);
        await health.load();

        health.markCooling('a', 60_000);
        health.markCooling('b', 10_000);
        expect(health.earliestAvailable(['a', 'b'])).toBe(clock.now() + 10_000);
    });

    it('reports 0 when at least one entry is available', async () => {
        const clock = new FakeClock();
        const health = makeHealth(new FakeKV(), clock);
        await health.load();

        health.markCooling('a', 60_000);
        expect(health.earliestAvailable(['a', 'b'])).toBe(0);
    });
});

describe('PoolHealth write budget', () => {
    it('writes nothing on a successful request', async () => {
        const kv = new FakeKV();
        const health = makeHealth(kv, new FakeClock());
        await health.load();

        health.markHealthy('gemini-1');
        await health.flush();
        expect(kv.writes).toBe(0);
    });

    it('does not persist short cooldowns', async () => {
        // A 30s tokens-per-minute cooldown expires before another isolate could act
        // on it; persisting it would burn the 1,000/day allowance for nothing.
        const kv = new FakeKV();
        const health = makeHealth(kv, new FakeClock());
        await health.load();

        health.markCooling('groq-1', 30_000, 'TPM');
        expect(health.shouldWrite()).toBe(false);
        await health.flush();
        expect(kv.writes).toBe(0);
        // …but the entry is still cooling in memory for this isolate.
        expect(health.isCooling('groq-1')).toBe(true);
    });

    it('persists a long cooldown, which is the state that matters', async () => {
        const kv = new FakeKV();
        const health = makeHealth(kv, new FakeClock());
        await health.load();

        health.markCooling('gemini-1', 6 * 60 * 60 * 1000, 'daily quota');
        expect(await health.flush()).toBe(true);
        expect(kv.writes).toBe(1);
        expect(kv.store.get(HEALTH_KEY)).toContain('gemini-1');
    });

    it('does not re-write while an entry is already cooling', async () => {
        const kv = new FakeKV();
        const clock = new FakeClock();
        const health = makeHealth(kv, clock);
        await health.load();

        health.markCooling('gemini-1', 60 * 60 * 1000);
        await health.flush();
        expect(kv.writes).toBe(1);

        // A second failure on an entry already known to be down is not a transition.
        clock.advance(120_000);
        health.markCooling('gemini-1', 60 * 60 * 1000);
        await health.flush();
        expect(kv.writes).toBe(1);
    });

    it('debounces qualifying transitions', async () => {
        const kv = new FakeKV();
        const clock = new FakeClock();
        const health = makeHealth(kv, clock);
        await health.load();

        health.markCooling('a', 60 * 60 * 1000);
        await health.flush();
        expect(kv.writes).toBe(1);

        // A different entry going down 5s later is a real transition, but the
        // debounce window has not elapsed.
        clock.advance(5_000);
        health.markCooling('b', 60 * 60 * 1000);
        await health.flush();
        expect(kv.writes).toBe(1);

        clock.advance(60_000);
        health.markCooling('c', 60 * 60 * 1000);
        await health.flush();
        expect(kv.writes).toBe(2);
    });

    it('persists an early recovery', async () => {
        const kv = new FakeKV();
        const clock = new FakeClock();
        const health = makeHealth(kv, clock);
        await health.load();

        health.markCooling('gemini-1', 60 * 60 * 1000);
        await health.flush();
        expect(kv.writes).toBe(1);

        clock.advance(61_000);
        // Succeeded before the recorded cooldown was up — worth telling others.
        health.markHealthy('gemini-1');
        await health.flush();
        expect(kv.writes).toBe(2);
        expect(kv.store.get(HEALTH_KEY)).not.toContain('gemini-1');
    });
});

describe('PoolHealth durability', () => {
    it('round-trips state through KV', async () => {
        const kv = new FakeKV();
        const clock = new FakeClock();

        const first = makeHealth(kv, clock);
        await first.load();
        first.markCooling('gemini-1', 60 * 60 * 1000, 'daily quota');
        await first.flush();

        const second = makeHealth(kv, clock);
        await second.load();
        expect(second.isCooling('gemini-1')).toBe(true);
        expect(second.snapshot().entries['gemini-1'].reason).toBe('daily quota');
    });

    it('survives a corrupt blob', async () => {
        const kv = new FakeKV();
        kv.store.set(HEALTH_KEY, '{not json');
        const health = makeHealth(kv, new FakeClock());
        await health.load();
        expect(health.isCooling('anything')).toBe(false);
    });

    it('survives KV being unavailable', async () => {
        const kv = new FakeKV();
        kv.broken = true;
        const health = makeHealth(kv, new FakeClock());
        await expect(health.load()).resolves.toBeUndefined();
        health.markCooling('a', 60 * 60 * 1000);
        // A failed health write must never fail the user's request.
        await expect(health.flush()).resolves.toBe(false);
    });

    it('prunes expired entries when it writes', async () => {
        const kv = new FakeKV();
        const clock = new FakeClock();
        const health = makeHealth(kv, clock);
        await health.load();

        health.markCooling('old', 6 * 60 * 1000);
        await health.flush();
        clock.advance(10 * 60 * 1000);

        health.markCooling('new', 60 * 60 * 1000);
        await health.flush();

        const stored = JSON.parse(kv.store.get(HEALTH_KEY)!);
        expect(Object.keys(stored.entries)).toEqual(['new']);
    });
});
