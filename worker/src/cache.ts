/**
 * Two-tier cross-user answer cache.
 *
 * This is the single biggest quota multiplier in the Worker. Everyone shares one
 * key pool and MUD players ask the same handful of questions forever, so a good
 * hit rate is worth more than any amount of failover cleverness.
 *
 * ## Why two tiers
 *
 * **Tier 1 — the edge Cache API (`caches.default`).** Free, no write quota, and
 * fast. Its weakness is that it is per-colo: a hit only helps users routed to the
 * same Cloudflare location. For this project that weakness barely bites, because
 * the player base is essentially one country and therefore one or two colos.
 *
 * **Tier 2 — KV.** Globally readable, so it catches the cross-colo misses tier 1
 * cannot. Its weakness is the ~1,000 writes/day free allowance, shared with the
 * quota counters. A tier-2 write happens only on a full miss, and can be turned
 * off entirely with `KV_CACHE_WRITES=false` if the write budget gets tight.
 *
 * A tier-2 hit is promoted into tier 1 so the next local reader gets the fast
 * path, and that promotion costs nothing.
 *
 * Entries are keyed on `hash(normalizedQuestion + kbVersion)`, so shipping a new
 * knowledge bundle invalidates every answer at once with no KV sweep — which
 * matters, since sweeping would burn the delete allowance.
 */

import type { QuotaKV } from './quota';
import type { Proposal } from './types';

export interface CachedAnswer {
    /** The assistant's Polish prose answer. */
    answer: string;
    proposals: Proposal[];
    /** Which pool entry produced it, for debugging. */
    source: string;
    /** Epoch ms when it was generated. */
    createdAt: number;
    kbVersion: string;
}

export type CacheTier = 'edge' | 'kv' | null;

export interface CacheLookup {
    value: CachedAnswer | null;
    tier: CacheTier;
}

/** Minimal Cache API surface, so tests can supply a fake. */
export interface CacheLike {
    match(request: Request): Promise<Response | undefined>;
    put(request: Request, response: Response): Promise<void>;
}

/**
 * The Cache API is keyed on a Request, so we synthesise a stable fake URL from
 * the cache key. The host is never contacted; it exists only to be a valid URL.
 */
function edgeRequest(key: string): Request {
    return new Request(`https://cache.invalid/answer/${encodeURIComponent(key)}`, {
        method: 'GET',
    });
}

export class AnswerCache {
    constructor(
        private readonly kv: QuotaKV | undefined,
        private readonly edge: CacheLike | undefined,
        private readonly options: {
            ttlSeconds: number;
            kvWrites: boolean;
        },
    ) {}

    async get(key: string): Promise<CacheLookup> {
        // Tier 1.
        if (this.edge) {
            try {
                const hit = await this.edge.match(edgeRequest(key));
                if (hit) {
                    const value = (await hit.json()) as CachedAnswer;
                    if (value && typeof value.answer === 'string') {
                        return { value, tier: 'edge' };
                    }
                }
            } catch {
                // A poisoned edge entry falls through to tier 2 rather than erroring.
            }
        }

        // Tier 2.
        if (this.kv) {
            try {
                const raw = await this.kv.get(key, 'text');
                if (raw) {
                    const value = JSON.parse(raw) as CachedAnswer;
                    if (value && typeof value.answer === 'string') {
                        return { value, tier: 'kv' };
                    }
                }
            } catch {
                // Ignore and treat as a miss.
            }
        }

        return { value: null, tier: null };
    }

    /** Promote a KV hit into the edge tier. Free, so always worth doing. */
    async promote(key: string, value: CachedAnswer): Promise<void> {
        if (!this.edge) return;
        try {
            await this.edge.put(edgeRequest(key), this.toResponse(value));
        } catch {
            // Non-fatal.
        }
    }

    async put(key: string, value: CachedAnswer): Promise<void> {
        if (this.edge) {
            try {
                await this.edge.put(edgeRequest(key), this.toResponse(value));
            } catch {
                // Non-fatal.
            }
        }
        if (this.kv && this.options.kvWrites) {
            try {
                await this.kv.put(key, JSON.stringify(value), {
                    expirationTtl: Math.max(60, Math.floor(this.options.ttlSeconds)),
                });
            } catch {
                // Non-fatal — the answer was already streamed to the user.
            }
        }
    }

    private toResponse(value: CachedAnswer): Response {
        return new Response(JSON.stringify(value), {
            headers: {
                'content-type': 'application/json',
                // Cache API honours Cache-Control for expiry.
                'cache-control': `public, max-age=${Math.max(60, Math.floor(this.options.ttlSeconds))}`,
            },
        });
    }
}
