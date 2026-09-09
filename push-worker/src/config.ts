/**
 * Runtime configuration, read from Worker vars and secrets.
 *
 * Deliberately a separate copy of the AI Worker's equivalent rather than a
 * shared module: the two Workers share *conventions*, not code, so that neither
 * can break the other's deploy. See README.md.
 */

import type { Env } from './types';

export interface RuntimeConfig {
    allowedOrigins: string[];
    vapidSubject: string;
    /** JWK JSON for the VAPID private key, or undefined when unset. */
    vapidPrivateKey: string | undefined;
    maxSubscriptionsPerUser: number;
    /**
     * Serve the `/dev` test harness. Never true in a deployed Worker: the var is
     * set in the `dev` environment block, which `wrangler deploy` does not
     * publish. Authentication is unaffected either way.
     */
    devTestPage: boolean;
}

const DEFAULTS = {
    maxSubscriptionsPerUser: 10,
} as const;

function parseList(value: string | undefined): string[] {
    if (!value) return [];
    return value
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean);
}

function parseNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(env: Env): RuntimeConfig {
    return {
        allowedOrigins: parseList(env.ALLOWED_ORIGINS),
        vapidSubject: env.VAPID_SUBJECT ?? '',
        vapidPrivateKey: env.VAPID_PRIVATE_KEY,
        maxSubscriptionsPerUser: parseNumber(
            env.MAX_SUBSCRIPTIONS_PER_USER,
            DEFAULTS.maxSubscriptionsPerUser,
        ),
        // Defaults to false, and only the literal string "true" enables it — a
        // stray "1" or "yes" in the wrong environment must not expose the page.
        devTestPage: env.DEV_TEST_PAGE === 'true',
    };
}

export function isOriginAllowed(origin: string | null, allowed: string[]): boolean {
    if (allowed.length === 0) return true;
    if (!origin) return false;
    return allowed.some(entry => {
        if (entry === '*') return true;
        if (entry.startsWith('*.')) {
            // Wildcard subdomain: *.example.com matches https://a.example.com
            const suffix = entry.slice(1); // ".example.com"
            try {
                return new URL(origin).hostname.endsWith(suffix);
            } catch {
                return false;
            }
        }
        return entry === origin;
    });
}
