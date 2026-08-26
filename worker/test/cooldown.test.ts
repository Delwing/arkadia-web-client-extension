import { describe, expect, it } from 'vitest';
import {
    DEFAULT_COOLDOWN_MS,
    MAX_COOLDOWN_MS,
    MIN_COOLDOWN_MS,
    cooldownFromBody,
    cooldownFromHeaders,
    isQuotaError,
    parseDurationString,
    parseResetValue,
    resolveCooldownMs,
} from '../src/cooldown';
import { headers } from './helpers';

const NOW = 1_700_000_000_000;

describe("parseDurationString (Groq's Go-style reset values)", () => {
    it('parses the exact formats Groq documents', () => {
        // Straight from Groq's rate-limit header examples.
        expect(parseDurationString('2m59.56s')).toBeCloseTo(179_560, 0);
        expect(parseDurationString('7.66s')).toBeCloseTo(7_660, 0);
    });

    it('parses compound and sub-second durations', () => {
        expect(parseDurationString('1h2m3s')).toBe(3_723_000);
        expect(parseDurationString('500ms')).toBe(500);
        expect(parseDurationString('1h')).toBe(3_600_000);
    });

    it('rejects things that are not durations', () => {
        expect(parseDurationString('60')).toBeNull();
        expect(parseDurationString('')).toBeNull();
        expect(parseDurationString('soon')).toBeNull();
        expect(parseDurationString('2026-01-01T00:00:00Z')).toBeNull();
    });

    it("does not read '500ms' as 500 seconds", () => {
        // The `ms`-before-`m` alternation ordering is what makes this pass.
        expect(parseDurationString('500ms')).toBe(500);
    });
});

describe('parseResetValue', () => {
    it('reads Retry-After delta-seconds', () => {
        expect(parseResetValue('30', NOW)).toBe(30_000);
    });

    it('reads a duration string', () => {
        expect(parseResetValue('7.66s', NOW)).toBeCloseTo(7_660, 0);
    });

    it('distinguishes epoch seconds from delta seconds', () => {
        const epochSeconds = String(Math.floor(NOW / 1000) + 120);
        expect(parseResetValue(epochSeconds, NOW)).toBeCloseTo(120_000, -2);
    });

    it('distinguishes epoch milliseconds', () => {
        expect(parseResetValue(String(NOW + 45_000), NOW)).toBe(45_000);
    });

    it('reads an HTTP-date', () => {
        const future = new Date(NOW + 90_000).toUTCString();
        // toUTCString drops sub-second precision, so allow a second of slack.
        expect(parseResetValue(future, NOW)).toBeGreaterThan(89_000);
    });

    it('returns null for junk and for absent values', () => {
        expect(parseResetValue(null, NOW)).toBeNull();
        expect(parseResetValue(undefined, NOW)).toBeNull();
        expect(parseResetValue('', NOW)).toBeNull();
        expect(parseResetValue('later', NOW)).toBeNull();
    });
});

describe('cooldownFromHeaders', () => {
    it('prefers retry-after over window-reset headers', () => {
        // retry-after says when a retry will work; the reset headers say when the
        // whole window rolls over, which is usually much later.
        const result = cooldownFromHeaders(
            headers({ 'retry-after': '5', 'x-ratelimit-reset-requests': '2m59.56s' }),
            NOW,
        );
        expect(result).toBe(5_000);
    });

    it('falls back to the soonest reset header when retry-after is absent', () => {
        const result = cooldownFromHeaders(
            headers({
                'x-ratelimit-reset-requests': '2m59.56s',
                'x-ratelimit-reset-tokens': '7.66s',
            }),
            NOW,
        );
        // The token window reopens first; that is the one worth waiting for.
        expect(result).toBeCloseTo(7_660, -2);
    });

    it('returns null when nothing usable is present', () => {
        expect(
            cooldownFromHeaders(headers({ 'content-type': 'application/json' }), NOW),
        ).toBeNull();
    });

    it('clamps absurd values', () => {
        const result = cooldownFromHeaders(headers({ 'retry-after': '999999999' }), NOW);
        expect(result).toBe(MAX_COOLDOWN_MS);
    });

    it('clamps values below the floor', () => {
        const result = cooldownFromHeaders(headers({ 'retry-after': '0.001' }), NOW);
        expect(result).toBe(MIN_COOLDOWN_MS);
    });
});

describe('cooldownFromBody', () => {
    it('reads a google.rpc.RetryInfo detail', () => {
        const body = {
            error: {
                code: 429,
                status: 'RESOURCE_EXHAUSTED',
                details: [
                    {
                        '@type': 'type.googleapis.com/google.rpc.RetryInfo',
                        retryDelay: '17s',
                    },
                ],
            },
        };
        expect(cooldownFromBody(body, NOW)).toBe(17_000);
    });

    it('reads OpenRouter upstream metadata', () => {
        const body = { error: { code: 429, metadata: { retry_after: '12' } } };
        expect(cooldownFromBody(body, NOW)).toBe(12_000);
    });

    it("reads a free-text 'try again in' hint", () => {
        const body = {
            error: { message: 'Rate limit reached. Please try again in 6.9s.' },
        };
        expect(cooldownFromBody(body, NOW)).toBeCloseTo(6_900, -2);
    });

    it('returns null for an unhelpful body', () => {
        expect(cooldownFromBody({ error: { message: 'nope' } }, NOW)).toBeNull();
        expect(cooldownFromBody(null, NOW)).toBeNull();
        expect(cooldownFromBody('string', NOW)).toBeNull();
    });
});

describe('isQuotaError', () => {
    it('treats 429 and 503 as quota failures', () => {
        expect(isQuotaError(429)).toBe(true);
        expect(isQuotaError(503)).toBe(true);
    });

    it("recognises Gemini's string-coded quota errors", () => {
        // Gemini's Interactions API returns a snake_case string code, not a number.
        expect(isQuotaError(403, { error: { code: 'quota_exceeded' } })).toBe(true);
        expect(isQuotaError(400, { error: { code: 'rate_limit_exceeded' } })).toBe(true);
    });

    it('does not treat ordinary client errors as quota failures', () => {
        expect(isQuotaError(400, { error: { message: 'bad model' } })).toBe(false);
        expect(isQuotaError(401)).toBe(false);
        expect(isQuotaError(500)).toBe(false);
    });
});

describe('resolveCooldownMs', () => {
    it('prefers headers over body', () => {
        const result = resolveCooldownMs(
            headers({ 'retry-after': '10' }),
            { error: { details: [{ '@type': 'RetryInfo', retryDelay: '99s' }] } },
            NOW,
        );
        expect(result).toBe(10_000);
    });

    it('falls back to the body when headers are silent', () => {
        // This is the Gemini case: no rate-limit headers are documented at all.
        const result = resolveCooldownMs(
            headers({}),
            {
                error: {
                    details: [
                        { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '25s' },
                    ],
                },
            },
            NOW,
        );
        expect(result).toBe(25_000);
    });

    it('always returns a positive cooldown, even with no information', () => {
        expect(resolveCooldownMs(null, null, NOW)).toBe(DEFAULT_COOLDOWN_MS);
        expect(resolveCooldownMs(headers({}), {}, NOW)).toBe(DEFAULT_COOLDOWN_MS);
    });
});
