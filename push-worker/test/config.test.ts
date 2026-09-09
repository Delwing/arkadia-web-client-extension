import { describe, expect, it } from 'vitest';
import { isOriginAllowed, loadConfig } from '../src/config';

describe('loadConfig', () => {
    it('falls back to a sane subscription ceiling', () => {
        expect(loadConfig({}).maxSubscriptionsPerUser).toBe(10);
        expect(loadConfig({ MAX_SUBSCRIPTIONS_PER_USER: '3' }).maxSubscriptionsPerUser).toBe(3);
        // Garbage and non-positive values fall back rather than disabling the cap.
        expect(loadConfig({ MAX_SUBSCRIPTIONS_PER_USER: 'lots' }).maxSubscriptionsPerUser).toBe(10);
        expect(loadConfig({ MAX_SUBSCRIPTIONS_PER_USER: '0' }).maxSubscriptionsPerUser).toBe(10);
    });

    it('reports the VAPID key as absent when the secret is unset', () => {
        expect(loadConfig({}).vapidPrivateKey).toBeUndefined();
        expect(loadConfig({ VAPID_PRIVATE_KEY: '{"kty":"EC"}' }).vapidPrivateKey).toBe(
            '{"kty":"EC"}',
        );
    });

    it('keeps the test page off unless explicitly enabled', () => {
        // This is the guard that keeps DEV_TEST_PAGE from ever mattering on the
        // deployed Worker, which sets no such var.
        expect(loadConfig({}).devTestPage).toBe(false);
        expect(loadConfig({ DEV_TEST_PAGE: 'true' }).devTestPage).toBe(true);
        for (const value of ['1', 'yes', 'TRUE', 'on', '']) {
            expect(loadConfig({ DEV_TEST_PAGE: value }).devTestPage).toBe(false);
        }
    });

    it('splits and trims the origin allowlist', () => {
        expect(loadConfig({ ALLOWED_ORIGINS: 'https://a.test, https://b.test' }).allowedOrigins)
            .toEqual(['https://a.test', 'https://b.test']);
        expect(loadConfig({}).allowedOrigins).toEqual([]);
    });
});

describe('isOriginAllowed', () => {
    const allowed = ['https://delwing.github.io'];

    it('matches an allowlisted origin exactly', () => {
        expect(isOriginAllowed('https://delwing.github.io', allowed)).toBe(true);
        expect(isOriginAllowed('https://evil.test', allowed)).toBe(false);
    });

    it('rejects a missing Origin when an allowlist is configured', () => {
        expect(isOriginAllowed(null, allowed)).toBe(false);
    });

    it('allows everything when the allowlist is empty, for local dev', () => {
        expect(isOriginAllowed(null, [])).toBe(true);
        expect(isOriginAllowed('https://anything.test', [])).toBe(true);
    });

    it('supports wildcard subdomains', () => {
        expect(isOriginAllowed('https://a.example.com', ['*.example.com'])).toBe(true);
        expect(isOriginAllowed('https://example.com.evil.test', ['*.example.com'])).toBe(false);
        expect(isOriginAllowed('not a url', ['*.example.com'])).toBe(false);
    });
});
