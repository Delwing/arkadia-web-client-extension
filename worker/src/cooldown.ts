/**
 * Rate-limit / quota response parsing.
 *
 * Every provider expresses "come back later" differently, and none of them
 * agree on units:
 *
 *   - RFC 9110 `Retry-After`: integer seconds OR an HTTP-date.
 *   - Groq: `retry-after` plus `x-ratelimit-reset-requests` /
 *     `x-ratelimit-reset-tokens` as *duration strings* like `2m59.56s`, `7.66s`,
 *     `1h2m3s`.
 *   - OpenAI-compatible shims: `x-ratelimit-reset-*` sometimes as a unix epoch.
 *   - Gemini: no reset header; a `RetryInfo` detail inside the JSON error body
 *     carrying `retryDelay: "17s"`.
 *
 * Everything below funnels into one answer: how many milliseconds until this
 * pool entry is worth trying again.
 */

/** Clamp so a hostile or garbled header cannot park a provider for a week. */
export const MIN_COOLDOWN_MS = 1_000;
export const MAX_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h
/** Used when we know we were rate-limited but got no usable hint at all. */
export const DEFAULT_COOLDOWN_MS = 60_000;

function clamp(ms: number): number {
    if (!Number.isFinite(ms)) return DEFAULT_COOLDOWN_MS;
    return Math.min(MAX_COOLDOWN_MS, Math.max(MIN_COOLDOWN_MS, Math.round(ms)));
}

/**
 * Parse a Go-style duration string as emitted by Groq's reset headers.
 * Accepts `1h2m3.5s`, `2m59.56s`, `7.66s`, `500ms`, `1h`.
 * Returns null if the string is not a duration.
 */
export function parseDurationString(value: string): number | null {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return null;
    // Must be composed purely of <number><unit> pairs.
    const pattern = /^(\d+(?:\.\d+)?(?:h|m|s|ms|us|ns))+$/;
    if (!pattern.test(trimmed)) return null;

    let total = 0;
    // `ms` must be matched before `m`, hence the alternation order.
    const partPattern = /(\d+(?:\.\d+)?)(ms|us|ns|h|m|s)/g;
    let match: RegExpExecArray | null;
    while ((match = partPattern.exec(trimmed)) !== null) {
        const amount = Number(match[1]);
        switch (match[2]) {
            case 'h':
                total += amount * 3_600_000;
                break;
            case 'm':
                total += amount * 60_000;
                break;
            case 's':
                total += amount * 1000;
                break;
            case 'ms':
                total += amount;
                break;
            case 'us':
                total += amount / 1000;
                break;
            case 'ns':
                total += amount / 1_000_000;
                break;
        }
    }
    return total;
}

/**
 * Parse a single header value into "milliseconds from `now` until reset".
 * Handles: plain seconds, duration strings, unix epoch (s or ms), HTTP-date/ISO.
 */
export function parseResetValue(value: string | null | undefined, now: number): number | null {
    if (value == null) return null;
    const raw = String(value).trim();
    if (!raw) return null;

    // Duration string first — `2m59.56s` would otherwise fail Number() anyway,
    // but `500ms` must not be read as the number 500.
    const duration = parseDurationString(raw);
    if (duration !== null) return duration;

    const asNumber = Number(raw);
    if (Number.isFinite(asNumber)) {
        if (asNumber < 0) return null;
        // Disambiguate delta-seconds from an absolute epoch. Anything at or above
        // ~1e9 is an epoch (year 2001+), not a plausible "wait N seconds".
        if (asNumber >= 1e12) return asNumber - now; // epoch millis
        if (asNumber >= 1e9) return asNumber * 1000 - now; // epoch seconds
        return asNumber * 1000; // delta seconds
    }

    // HTTP-date / ISO-8601.
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed - now;

    return null;
}

export interface CooldownSource {
    /** Header accessor; case-insensitive lookup expected (Headers.get is). */
    get(name: string): string | null;
}

/**
 * Header names checked, in priority order. `retry-after` is authoritative when
 * present because it is the provider explicitly telling us when to return.
 */
const RESET_HEADERS = [
    'retry-after',
    'x-ratelimit-reset-requests',
    'x-ratelimit-reset-tokens',
    'x-ratelimit-reset',
    'ratelimit-reset',
    'x-ratelimit-reset-after',
];

/**
 * Derive a cooldown from response headers. Returns null when no header offered
 * a usable value — the caller decides the fallback.
 */
export function cooldownFromHeaders(
    headers: CooldownSource,
    now: number = Date.now(),
): number | null {
    const candidates: number[] = [];
    for (const name of RESET_HEADERS) {
        const parsed = parseResetValue(headers.get(name), now);
        if (parsed !== null && parsed > 0) {
            // `retry-after` wins outright rather than being max()'d with the rest:
            // the reset headers describe *window* reset, which is often much further
            // out than the point at which a retry would actually succeed.
            if (name === 'retry-after') return clamp(parsed);
            candidates.push(parsed);
        }
    }
    if (candidates.length === 0) return null;
    return clamp(Math.min(...candidates));
}

/**
 * Dig a retry hint out of a provider's JSON error body.
 *
 * Gemini nests it as a google.rpc.RetryInfo detail:
 *   { error: { code: 429, status: "RESOURCE_EXHAUSTED", details: [
 *       { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "17s" } ] } }
 *
 * OpenAI-compatible providers sometimes put "try again in 6.9s" in the message,
 * and OpenRouter surfaces upstream metadata under `error.metadata`.
 */
export function cooldownFromBody(body: unknown, now: number = Date.now()): number | null {
    if (!body || typeof body !== 'object') return null;
    const root = body as Record<string, unknown>;
    const error = (root.error ?? root) as Record<string, unknown>;
    if (!error || typeof error !== 'object') return null;

    // google.rpc.RetryInfo
    const details = error.details;
    if (Array.isArray(details)) {
        for (const detail of details) {
            if (!detail || typeof detail !== 'object') continue;
            const entry = detail as Record<string, unknown>;
            const type = String(entry['@type'] ?? '');
            if (type.includes('RetryInfo') && typeof entry.retryDelay === 'string') {
                const parsed = parseResetValue(entry.retryDelay, now);
                if (parsed !== null && parsed > 0) return clamp(parsed);
            }
        }
    }

    // OpenRouter upstream metadata.
    const metadata = error.metadata as Record<string, unknown> | undefined;
    if (metadata) {
        for (const field of ['retry_after', 'retryAfter', 'reset']) {
            const parsed = parseResetValue(metadata[field] as string, now);
            if (parsed !== null && parsed > 0) return clamp(parsed);
        }
    }

    // Free-text hint: "...Please try again in 6.9s." / "in 2m59.56s".
    const message = typeof error.message === 'string' ? error.message : '';
    // The unit suffix must terminate the capture, or a sentence-ending period
    // ("try again in 6.9s.") is swallowed and the duration fails to parse.
    const textual = /try again in\s+((?:\d+(?:\.\d+)?(?:ms|h|m|s))+)/i.exec(message);
    if (textual) {
        const parsed = parseDurationString(textual[1]) ?? null;
        if (parsed !== null && parsed > 0) return clamp(parsed);
    }

    return null;
}

/**
 * Is this response a rate-limit / quota exhaustion, as opposed to a real error?
 *
 * 429 is the obvious case. Some providers answer an exhausted *daily* quota with
 * a 403 carrying a quota status, and upstream saturation shows up as 503 — both
 * warrant cooling the entry rather than failing the request.
 */
export function isQuotaError(status: number, body?: unknown): boolean {
    if (status === 429) return true;
    if (status === 503) return true;
    if (status === 403 || status === 400) {
        const text = JSON.stringify(body ?? '').toLowerCase();
        return (
            text.includes('quota') ||
            text.includes('resource_exhausted') ||
            // Both spellings occur: Gemini's Interactions API uses the snake_case
            // code `rate_limit_exceeded`, while prose messages say "rate limit".
            text.includes('rate limit') ||
            text.includes('rate_limit') ||
            text.includes('insufficient')
        );
    }
    return false;
}

/**
 * Full cooldown decision for a failed provider attempt.
 * Always returns a positive duration — a quota failure never leaves an entry hot.
 */
export function resolveCooldownMs(
    headers: CooldownSource | null,
    body: unknown,
    now: number = Date.now(),
): number {
    const fromHeaders = headers ? cooldownFromHeaders(headers, now) : null;
    if (fromHeaders !== null) return fromHeaders;
    const fromBody = cooldownFromBody(body, now);
    if (fromBody !== null) return fromBody;
    return DEFAULT_COOLDOWN_MS;
}
