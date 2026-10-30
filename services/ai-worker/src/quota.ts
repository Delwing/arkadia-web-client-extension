/**
 * Per-device daily quota, held in KV.
 *
 * ## Write budget
 *
 * The KV free tier allows ~1,000 writes/day, and every charged question costs
 * one. That is not an oversight — it is roughly the same order as the key pool's
 * own daily capacity, so the two ceilings are matched rather than the quota
 * counter being the thing that breaks first.
 *
 * Two rules keep it inside the budget:
 *
 *  - **Cache hits are free.** Quota exists to protect the upstream key pool. A
 *    cached answer never touches a provider, so it is never charged and never
 *    writes. As the cross-user hit rate climbs, KV writes fall proportionally.
 *  - **Charge on use, not on arrival.** The counter is incremented only once a
 *    live provider call is actually going to be made, after the cache lookup and
 *    after validation. Rejected and cached requests cost zero writes.
 *
 * Counters carry a TTL so they expire on their own. KV expiry does not count
 * against the delete allowance, unlike an explicit delete.
 */

import type { KVLike } from './poolHealth';
import { sha256Hex } from './normalize';

/** Counters live slightly over two days so a UTC-day rollover is never lossy. */
const QUOTA_TTL_SECONDS = 60 * 60 * 50;

export interface QuotaKV extends KVLike {
    get(key: string, type: 'text'): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface QuotaStatus {
    used: number;
    limit: number;
    remaining: number;
    exceeded: boolean;
    /** Epoch ms of the next UTC midnight, when the counter resets. */
    resetsAt: number;
}

/** UTC day stamp, e.g. `2026-08-25`. Quota windows are UTC days by definition. */
export function utcDayStamp(now: number = Date.now()): string {
    return new Date(now).toISOString().slice(0, 10);
}

export function nextUtcMidnight(now: number = Date.now()): number {
    const date = new Date(now);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

/**
 * Derive the quota subject.
 *
 * Prefers the client-supplied device id, which survives a changing IP (mobile,
 * CGNAT) so legitimate users are not punished for roaming. Falls back to the IP
 * when no usable device id is present. Both are hashed with a server-side salt:
 * the Worker has no business storing raw device ids or IPs, and a salted hash is
 * enough to count against.
 */
export async function quotaSubject(
    deviceId: string | null | undefined,
    ip: string | null,
    salt: string,
): Promise<string> {
    const trimmed = (deviceId ?? '').trim();
    // Anything shorter than 8 chars is trivially guessable/forgeable and would let
    // a caller collide onto someone else's counter; treat it as absent.
    const basis = trimmed.length >= 8 ? `d:${trimmed.slice(0, 128)}` : `i:${ip ?? 'unknown'}`;
    const digest = await sha256Hex(`${salt}|${basis}`);
    return digest.slice(0, 24);
}

function quotaKey(subject: string, day: string): string {
    return `quota:${day}:${subject}`;
}

/** Read the current quota status without charging it. */
export async function readQuota(
    kv: QuotaKV | undefined,
    subject: string,
    limit: number,
    now: number = Date.now(),
): Promise<QuotaStatus> {
    const resetsAt = nextUtcMidnight(now);
    if (!kv || limit <= 0) {
        return { used: 0, limit, remaining: limit, exceeded: false, resetsAt };
    }
    let used = 0;
    try {
        const raw = await kv.get(quotaKey(subject, utcDayStamp(now)), 'text');
        used = Number(raw) || 0;
    } catch {
        // KV read failure must not lock users out; fail open on the read path.
        used = 0;
    }
    return {
        used,
        limit,
        remaining: Math.max(0, limit - used),
        exceeded: used >= limit,
        resetsAt,
    };
}

/**
 * Charge one question against the subject's daily quota.
 *
 * Read-modify-write without a lock, so concurrent requests from one device can
 * under-count. That is an accepted trade: the alternative is a Durable Object,
 * and the failure mode here is "a determined user gets 21 questions instead of
 * 20", which does not threaten the pool.
 */
export async function chargeQuota(
    kv: QuotaKV | undefined,
    subject: string,
    limit: number,
    now: number = Date.now(),
): Promise<QuotaStatus> {
    const status = await readQuota(kv, subject, limit, now);
    if (!kv || limit <= 0) return status;

    const used = status.used + 1;
    try {
        await kv.put(quotaKey(subject, utcDayStamp(now)), String(used), {
            expirationTtl: QUOTA_TTL_SECONDS,
        });
    } catch {
        // Losing a write means one uncharged question. Acceptable; do not fail.
    }
    return {
        used,
        limit,
        remaining: Math.max(0, limit - used),
        exceeded: used > limit,
        resetsAt: status.resetsAt,
    };
}

/**
 * Optional per-IP burst limiter, backed by the Workers rate-limiting binding
 * when one is bound. Costs no KV writes.
 *
 * Note the binding's semantics: counters are local to the Cloudflare location
 * serving the request, so the effective global limit is per-PoP. For a
 * single-country player base that is close enough to a real limit; it is a
 * burst guard, not the primary control.
 */
export interface RateLimiterBinding {
    limit(options: { key: string }): Promise<{ success: boolean }>;
}

export async function checkBurst(
    limiter: RateLimiterBinding | undefined,
    key: string,
): Promise<boolean> {
    if (!limiter) return true;
    try {
        const { success } = await limiter.limit({ key });
        return success;
    } catch {
        // A broken limiter should not deny service.
        return true;
    }
}
