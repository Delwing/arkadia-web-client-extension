/**
 * Pool + runtime configuration.
 *
 * Everything tunable lives here and is driven by Worker vars/secrets, because
 * the numbers that matter most (Groq's free tokens-per-minute in particular) are
 * account-specific and undocumented. Hardcoding them guarantees a broken deploy
 * for anyone whose account differs. See worker/README.md.
 */

import type { Env } from './types';

export type ProviderName = 'gemini' | 'groq' | 'openrouter' | 'mock';

export interface PoolEntry {
    /** Stable id used as the pool-health key. Must not change across deploys. */
    id: string;
    provider: ProviderName;
    /** Model identifier as the provider expects it. */
    model: string;
    /** API key. Injected from secrets, never present in the config blob itself. */
    apiKey: string;
    /**
     * Ordering. Lower is tried first. Quality order, not cost order:
     * Gemini's Polish is materially better than the free alternatives.
     */
    priority: number;
    /**
     * Prompt budget for this entry, in tokens. Entries with a small budget get the
     * lean system prompt. This is the whole point of provider-aware sizing: Groq's
     * free tokens-per-minute ceiling can be low enough that the full knowledge
     * bundle is rejected outright with a 429 before the model ever sees it.
     */
    maxPromptTokens: number;
    /** Cap on generated tokens. Enforced server-side, never client-supplied. */
    maxOutputTokens: number;
    /**
     * Whether this entry can be trusted with the multi-step structured-proposal
     * protocol. Small/fast free models often cannot hold the JSON contract, so we
     * ask them for prose only and skip proposal extraction.
     */
    supportsToolLoop: boolean;
    /** Optional base URL override, for proxies or self-hosted gateways. */
    baseUrl?: string;
}

/** Serialized form in the `AI_POOL` var: keys are referenced by secret name. */
interface PoolEntrySpec {
    id: string;
    provider: ProviderName;
    model: string;
    /** Name of the Worker secret holding the API key for this entry. */
    keySecret?: string;
    priority?: number;
    maxPromptTokens?: number;
    maxOutputTokens?: number;
    supportsToolLoop?: boolean;
    baseUrl?: string;
}

/**
 * Per-provider defaults, used when a pool entry omits a field.
 *
 * `maxPromptTokens` values are deliberately conservative for Groq. Groq does not
 * publish a reliable free-tier tokens-per-minute table — the real number is
 * account- and model-specific and only visible at
 * https://console.groq.com/settings/limits. Override per entry once you have
 * checked yours.
 */
export const PROVIDER_DEFAULTS: Record<
    ProviderName,
    Pick<PoolEntry, 'priority' | 'maxPromptTokens' | 'maxOutputTokens' | 'supportsToolLoop'>
> = {
    // Best Polish of the free tier, generous TPM, ~1500 req/day.
    gemini: {
        priority: 10,
        maxPromptTokens: 24_000,
        maxOutputTokens: 1_500,
        supportsToolLoop: true,
    },
    // High requests/day, but free TPM is the binding constraint — lean prompt.
    groq: {
        priority: 20,
        maxPromptTokens: 4_000,
        maxOutputTokens: 1_000,
        supportsToolLoop: true,
    },
    // 20 req/min, 50 req/day (1000/day with $10 lifetime credits ever purchased).
    openrouter: {
        priority: 30,
        maxPromptTokens: 12_000,
        maxOutputTokens: 1_200,
        supportsToolLoop: false,
    },
    // Local smoke-test only; never reached unless explicitly configured.
    mock: {
        priority: 99,
        maxPromptTokens: 100_000,
        maxOutputTokens: 500,
        supportsToolLoop: true,
    },
};

export interface RuntimeConfig {
    pool: PoolEntry[];
    /** Questions per device per UTC day. Charged only on live provider calls. */
    dailyQuota: number;
    /** Origins permitted to call /ask. Empty list disables the check. */
    allowedOrigins: string[];
    /** Hard cap on the serialized `context` field, in bytes. */
    maxContextBytes: number;
    /** Hard cap on the question, in characters. */
    maxQuestionChars: number;
    turnstileSecret?: string;
    /** When false, Turnstile verification is skipped (local dev only). */
    turnstileEnabled: boolean;
    /** Write answers to the KV cache tier as well as the edge cache. */
    kvCacheWrites: boolean;
    /** TTL for cached answers, seconds. */
    cacheTtlSeconds: number;
}

const DEFAULTS = {
    dailyQuota: 20,
    maxContextBytes: 8_000,
    maxQuestionChars: 2_000,
    cacheTtlSeconds: 30 * 24 * 60 * 60, // 30 days; kbVersion invalidates implicitly
};

function parseNumber(value: string | undefined, fallback: number): number {
    if (value == null || value === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
    if (value == null || value === '') return fallback;
    return /^(1|true|yes|on)$/i.test(value.trim());
}

function parseList(value: string | undefined): string[] {
    if (!value) return [];
    return value
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
}

/**
 * Build the pool from the `AI_POOL` JSON var, resolving each entry's key from
 * the named secret. Entries whose secret is missing or blank are dropped
 * silently — that is how you disable a provider without editing config.
 */
export function buildPool(env: Env): PoolEntry[] {
    let specs: PoolEntrySpec[] = [];
    if (env.AI_POOL) {
        try {
            const parsed = JSON.parse(env.AI_POOL);
            if (Array.isArray(parsed)) specs = parsed as PoolEntrySpec[];
        } catch {
            // A malformed pool var must not take the Worker down at import time; an
            // empty pool surfaces as a clean `pool_exhausted` response instead.
            specs = [];
        }
    }

    const secrets = env as unknown as Record<string, string | undefined>;
    const pool: PoolEntry[] = [];
    const seen = new Set<string>();

    for (const spec of specs) {
        if (!spec || typeof spec !== 'object') continue;
        if (!spec.id || !spec.provider || !spec.model) continue;
        if (seen.has(spec.id)) continue; // ids must be unique — they key health state
        const defaults = PROVIDER_DEFAULTS[spec.provider];
        if (!defaults) continue;

        // The mock provider is the one entry that legitimately has no key.
        const apiKey =
            spec.provider === 'mock' ? 'mock' : (secrets[spec.keySecret ?? ''] ?? '').trim();
        if (!apiKey) continue;

        seen.add(spec.id);
        pool.push({
            id: spec.id,
            provider: spec.provider,
            model: spec.model,
            apiKey,
            priority: spec.priority ?? defaults.priority,
            maxPromptTokens: spec.maxPromptTokens ?? defaults.maxPromptTokens,
            maxOutputTokens: spec.maxOutputTokens ?? defaults.maxOutputTokens,
            supportsToolLoop: spec.supportsToolLoop ?? defaults.supportsToolLoop,
            baseUrl: spec.baseUrl,
        });
    }

    // Stable ordering: priority, then id, so failover order is deterministic and
    // testable rather than dependent on config-file ordering.
    pool.sort((a, b) =>
        a.priority !== b.priority ? a.priority - b.priority : a.id.localeCompare(b.id),
    );
    return pool;
}

export function loadConfig(env: Env): RuntimeConfig {
    return {
        pool: buildPool(env),
        dailyQuota: parseNumber(env.DAILY_QUOTA, DEFAULTS.dailyQuota),
        allowedOrigins: parseList(env.ALLOWED_ORIGINS),
        maxContextBytes: parseNumber(env.MAX_CONTEXT_BYTES, DEFAULTS.maxContextBytes),
        maxQuestionChars: parseNumber(env.MAX_QUESTION_CHARS, DEFAULTS.maxQuestionChars),
        turnstileSecret: env.TURNSTILE_SECRET,
        turnstileEnabled: parseBool(env.TURNSTILE_ENABLED, !!env.TURNSTILE_SECRET),
        kvCacheWrites: parseBool(env.KV_CACHE_WRITES, true),
        cacheTtlSeconds: parseNumber(env.CACHE_TTL_SECONDS, DEFAULTS.cacheTtlSeconds),
    };
}

/**
 * Origin allowlist — browsers only.
 *
 * A missing `Origin` header is **rejected** when a list is configured. It used
 * to be allowed through, on the reasoning that non-browser clients are
 * legitimate and the quota and Turnstile checks are the real defence. With
 * Turnstile off for the first release that left almost nothing: `curl` sends no
 * Origin, so it skipped the allowlist entirely, and the daily quota keys on a
 * caller-supplied `deviceId` that can simply be rotated. Anyone who found the
 * URL could drain the pool's free-tier quota.
 *
 * Safe because the only real caller is a browser making a *cross-origin*
 * request: the client is served from a Pages/Pages-like domain and the Worker
 * lives on workers.dev, and every browser sends `Origin` on cross-origin
 * requests — including same-origin non-GET, on current engines. Nothing
 * legitimate is turned away.
 *
 * An empty list still disables the check completely, which is what makes local
 * `curl` testing work (`ALLOWED_ORIGINS=` in .dev.vars).
 */
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
