import { describe, expect, it } from 'vitest';
import { chargeQuota, nextUtcMidnight, quotaSubject, readQuota, utcDayStamp } from '../src/quota';
import { isOriginAllowed } from '../src/config';
import { FakeKV } from './helpers';

const SALT = 'test-salt';

describe('quotaSubject', () => {
    it('is stable for the same device', async () => {
        const a = await quotaSubject('device-abc-123', '1.2.3.4', SALT);
        const b = await quotaSubject('device-abc-123', '9.9.9.9', SALT);
        // A changing IP (mobile, CGNAT) must not reset or split a user's quota.
        expect(a).toBe(b);
    });

    it('differs between devices', async () => {
        const a = await quotaSubject('device-abc-123', '1.2.3.4', SALT);
        const b = await quotaSubject('device-xyz-789', '1.2.3.4', SALT);
        expect(a).not.toBe(b);
    });

    it('falls back to the IP when no usable device id is supplied', async () => {
        const a = await quotaSubject(null, '1.2.3.4', SALT);
        const b = await quotaSubject('', '1.2.3.4', SALT);
        // A too-short id is forgeable and would let a caller land on someone else's
        // counter, so it is treated as absent.
        const c = await quotaSubject('abc', '1.2.3.4', SALT);
        expect(a).toBe(b);
        expect(a).toBe(c);
    });

    it('separates devices by IP when no device id exists', async () => {
        const a = await quotaSubject(null, '1.2.3.4', SALT);
        const b = await quotaSubject(null, '5.6.7.8', SALT);
        expect(a).not.toBe(b);
    });

    it('never returns the raw device id or IP', async () => {
        const subject = await quotaSubject('device-abc-123', '1.2.3.4', SALT);
        expect(subject).not.toContain('device-abc');
        expect(subject).not.toContain('1.2.3.4');
        expect(subject).toMatch(/^[0-9a-f]{24}$/);
    });

    it('changes with the salt', async () => {
        const a = await quotaSubject('device-abc-123', null, 'salt-a');
        const b = await quotaSubject('device-abc-123', null, 'salt-b');
        expect(a).not.toBe(b);
    });
});

describe('daily quota accounting', () => {
    it('starts at zero', async () => {
        const status = await readQuota(new FakeKV(), 'subject', 20);
        expect(status.used).toBe(0);
        expect(status.remaining).toBe(20);
        expect(status.exceeded).toBe(false);
    });

    it('counts charges', async () => {
        const kv = new FakeKV();
        await chargeQuota(kv, 'subject', 20);
        await chargeQuota(kv, 'subject', 20);
        const status = await readQuota(kv, 'subject', 20);
        expect(status.used).toBe(2);
        expect(status.remaining).toBe(18);
    });

    it('blocks once the limit is reached', async () => {
        const kv = new FakeKV();
        for (let i = 0; i < 20; i++) await chargeQuota(kv, 'subject', 20);
        const status = await readQuota(kv, 'subject', 20);
        expect(status.exceeded).toBe(true);
        expect(status.remaining).toBe(0);
    });

    it('costs exactly one KV write per charge', async () => {
        // The write budget arithmetic in the README depends on this.
        const kv = new FakeKV();
        await chargeQuota(kv, 'subject', 20);
        expect(kv.writes).toBe(1);
    });

    it('keeps subjects independent', async () => {
        const kv = new FakeKV();
        await chargeQuota(kv, 'alice', 20);
        expect((await readQuota(kv, 'bob', 20)).used).toBe(0);
    });

    it('resets across a UTC day boundary', async () => {
        const kv = new FakeKV();
        const day1 = Date.UTC(2026, 7, 25, 12, 0, 0);
        const day2 = Date.UTC(2026, 7, 26, 12, 0, 0);
        await chargeQuota(kv, 'subject', 20, day1);
        expect((await readQuota(kv, 'subject', 20, day2)).used).toBe(0);
    });

    it('fails open when KV is unavailable', async () => {
        // Losing KV must not lock every user out of the assistant.
        const kv = new FakeKV();
        kv.broken = true;
        const status = await readQuota(kv, 'subject', 20);
        expect(status.exceeded).toBe(false);
        await expect(chargeQuota(kv, 'subject', 20)).resolves.toBeDefined();
    });

    it('treats a zero limit as unlimited rather than as a total block', async () => {
        const status = await readQuota(new FakeKV(), 'subject', 0);
        expect(status.exceeded).toBe(false);
    });
});

describe('UTC window helpers', () => {
    it('stamps the UTC day', () => {
        expect(utcDayStamp(Date.UTC(2026, 7, 25, 23, 59))).toBe('2026-08-25');
    });

    it('computes the next UTC midnight', () => {
        expect(nextUtcMidnight(Date.UTC(2026, 7, 25, 23, 59))).toBe(Date.UTC(2026, 7, 26));
    });
});

describe('origin allowlist', () => {
    it('allows everything when unconfigured', () => {
        expect(isOriginAllowed('https://evil.test', [])).toBe(true);
    });

    it('allows an exact match', () => {
        expect(isOriginAllowed('https://delwing.github.io', ['https://delwing.github.io'])).toBe(
            true,
        );
    });

    it('rejects an origin that is not listed', () => {
        expect(isOriginAllowed('https://evil.test', ['https://delwing.github.io'])).toBe(false);
    });

    it('supports wildcard subdomains', () => {
        expect(isOriginAllowed('https://preview.example.com', ['*.example.com'])).toBe(true);
        expect(isOriginAllowed('https://example.test', ['*.example.com'])).toBe(false);
    });

    it('rejects a missing Origin header, so curl cannot skip the allowlist', () => {
        // This assertion used to be the opposite. Allowing a null Origin meant the
        // allowlist only ever constrained browsers, while any script sailed past
        // it — and with Turnstile off for the first release, and the daily quota
        // keyed on a caller-supplied deviceId that can be rotated, that was the
        // last thing standing between a public URL and a drained free-tier quota.
        //
        // The real client is a browser calling cross-origin (page on one domain,
        // Worker on workers.dev), and browsers always send Origin there, so this
        // turns away nothing legitimate.
        expect(isOriginAllowed(null, ['https://delwing.github.io'])).toBe(false);
    });

    it('still lets an empty allowlist disable the check entirely', () => {
        // How local curl testing works: ALLOWED_ORIGINS= in .dev.vars.
        expect(isOriginAllowed(null, [])).toBe(true);
    });

    it('honours an explicit wildcard', () => {
        expect(isOriginAllowed('https://anything.test', ['*'])).toBe(true);
    });
});
