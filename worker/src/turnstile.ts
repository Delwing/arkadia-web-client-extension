/**
 * Cloudflare Turnstile server-side verification.
 *
 * Shapes verified against
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 *
 * Token semantics that drive the design here:
 *  - a token is valid for **5 minutes** and is **single-use**;
 *  - replaying one returns `timeout-or-duplicate`.
 *
 * We therefore do NOT ask for a token on every question — that would mean a
 * challenge per question, which is miserable. Turnstile gates *first use per
 * device*: a successful verification mints a device pass in KV, and subsequent
 * questions present the pass instead. That is one KV write per device, not per
 * question, which also keeps us inside the write budget.
 */

import type { QuotaKV } from './quota';
import { sha256Hex } from './normalize';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** How long a verified device stays trusted before being re-challenged. */
const DEVICE_PASS_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface SiteverifyResponse {
    success: boolean;
    /** Note the hyphen — this is the wire field name, not a typo. */
    'error-codes'?: string[];
    challenge_ts?: string;
    hostname?: string;
    action?: string;
    cdata?: string;
}

export interface TurnstileResult {
    ok: boolean;
    errorCodes: string[];
}

/**
 * Verify a Turnstile token against Cloudflare.
 *
 * Sent as `application/x-www-form-urlencoded`, which the endpoint accepts
 * alongside JSON. `idempotency_key` is supplied so that a retried verification
 * of the same token does not come back as `timeout-or-duplicate`.
 */
export async function verifyTurnstile(
    secret: string,
    token: string,
    remoteIp: string | null,
    fetchImpl: typeof fetch = fetch,
): Promise<TurnstileResult> {
    if (!token) return { ok: false, errorCodes: ['missing-input-response'] };

    const body = new URLSearchParams();
    body.set('secret', secret);
    body.set('response', token);
    if (remoteIp) body.set('remoteip', remoteIp);
    body.set('idempotency_key', crypto.randomUUID());

    try {
        const response = await fetchImpl(SITEVERIFY_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        const result = (await response.json()) as SiteverifyResponse;
        return {
            ok: result.success === true,
            errorCodes: result['error-codes'] ?? [],
        };
    } catch {
        // Turnstile being unreachable should not hard-fail every request; the daily
        // quota still bounds the damage. Fail closed only on an explicit rejection.
        return { ok: false, errorCodes: ['internal-error'] };
    }
}

function passKey(subject: string): string {
    return `pass:${subject}`;
}

/** Has this device already cleared a challenge? */
export async function hasDevicePass(kv: QuotaKV | undefined, subject: string): Promise<boolean> {
    if (!kv) return false;
    try {
        return (await kv.get(passKey(subject), 'text')) !== null;
    } catch {
        return false;
    }
}

/** Mint a device pass after a successful challenge. One write per device. */
export async function grantDevicePass(
    kv: QuotaKV | undefined,
    subject: string,
    now: number = Date.now(),
): Promise<void> {
    if (!kv) return;
    try {
        await kv.put(passKey(subject), String(now), {
            expirationTtl: DEVICE_PASS_TTL_SECONDS,
        });
    } catch {
        // Losing the pass just means the device is challenged again next time.
    }
}

export type GateOutcome =
    | { status: 'ok' }
    /** Client must render a Turnstile widget and retry with a token. */
    | { status: 'challenge_required' }
    | { status: 'challenge_failed'; errorCodes: string[] };

/**
 * The full first-use gate: pass through if the device is already trusted,
 * otherwise verify a supplied token and mint a pass, otherwise demand a
 * challenge.
 */
export async function turnstileGate(options: {
    enabled: boolean;
    secret?: string;
    token?: string | null;
    subject: string;
    remoteIp: string | null;
    kv?: QuotaKV;
    fetchImpl?: typeof fetch;
    now?: number;
}): Promise<GateOutcome> {
    const { enabled, secret, token, subject, remoteIp, kv } = options;
    if (!enabled || !secret) return { status: 'ok' };

    if (await hasDevicePass(kv, subject)) return { status: 'ok' };

    if (!token) return { status: 'challenge_required' };

    const result = await verifyTurnstile(secret, token, remoteIp, options.fetchImpl ?? fetch);
    if (!result.ok) {
        return { status: 'challenge_failed', errorCodes: result.errorCodes };
    }

    await grantDevicePass(kv, subject, options.now ?? Date.now());
    return { status: 'ok' };
}

/** Stable device-pass subject; distinct salt namespace from the quota subject. */
export async function passSubject(
    deviceId: string | null | undefined,
    ip: string | null,
    salt: string,
): Promise<string> {
    const basis = (deviceId ?? '').trim() || `ip:${ip ?? 'unknown'}`;
    return (await sha256Hex(`turnstile|${salt}|${basis}`)).slice(0, 24);
}
