/**
 * Pool health tracking, persisted as a single JSON blob in KV.
 *
 * ## Why one blob, and why writes are rare
 *
 * The KV free tier allows on the order of 1,000 writes/day. A naive
 * "record every rate-limit response" design burns that in an afternoon and then
 * the pool loses its memory entirely. So writes are governed by three rules:
 *
 *  1. **Transitions only.** Nothing is written on a successful request. Health
 *     is only touched when an entry enters or leaves cooldown.
 *  2. **Long cooldowns only.** A 30-second tokens-per-minute cooldown does not
 *     deserve a durable write — it will have expired before most other isolates
 *     could act on it. Only cooldowns at or above `persistMinCooldownMs`
 *     (default 5 min — i.e. hourly/daily quota exhaustion, the state that
 *     actually matters across isolates) reach KV. Shorter cooldowns live in
 *     isolate memory and simply expire.
 *  3. **Debounced.** Even qualifying transitions are rate-limited to at most one
 *     write per `persistMinIntervalMs` (default 60s) across the whole blob.
 *
 * Recovery is *implicit*: an entry is healthy again once `cooledUntil` is in the
 * past, which requires no write at all. Expired entries are pruned
 * opportunistically, only when some other qualifying write is already happening.
 *
 * ## Consistency
 *
 * KV is eventually consistent and this blob is read-modify-written without any
 * locking, so concurrent isolates can clobber each other's updates. That is
 * acceptable and deliberate: the blob is a performance hint, not a ledger. The
 * worst case of a lost write is one extra doomed request to a cooling provider,
 * which the router handles by failing over anyway.
 */

export interface EntryHealth {
    /** Epoch ms until which this entry should not be tried. */
    cooledUntil: number;
    /** Last observed reason, for operator debugging via the /health endpoint. */
    reason?: string;
    /** Consecutive failures; used to back off repeat offenders. */
    failures?: number;
}

export interface PoolHealthBlob {
    version: 1;
    /** Keyed by pool entry id. */
    entries: Record<string, EntryHealth>;
    /** Epoch ms of the last durable write, for debouncing. */
    updatedAt: number;
}

export const EMPTY_HEALTH: PoolHealthBlob = {
    version: 1,
    entries: {},
    updatedAt: 0,
};

export const HEALTH_KEY = 'pool:health:v1';

export interface PoolHealthOptions {
    /** Cooldowns shorter than this are never persisted. Default 5 min. */
    persistMinCooldownMs?: number;
    /** Minimum gap between durable writes. Default 60s. */
    persistMinIntervalMs?: number;
    now?: () => number;
}

/** Minimal KV surface we depend on, so tests can supply a plain fake. */
export interface KVLike {
    get(key: string, type: 'text'): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

function parseBlob(raw: string | null): PoolHealthBlob {
    if (!raw) return { ...EMPTY_HEALTH, entries: {} };
    try {
        const parsed = JSON.parse(raw) as PoolHealthBlob;
        if (!parsed || parsed.version !== 1 || typeof parsed.entries !== 'object') {
            return { ...EMPTY_HEALTH, entries: {} };
        }
        return {
            version: 1,
            entries: parsed.entries ?? {},
            updatedAt: Number(parsed.updatedAt) || 0,
        };
    } catch {
        // A corrupt blob must not take the whole endpoint down; start clean.
        return { ...EMPTY_HEALTH, entries: {} };
    }
}

/**
 * Read-modify-write wrapper around the health blob.
 *
 * Intended lifecycle: construct once per request, `load()`, consult
 * `isCooling()`, record outcomes, then `flush()` (typically inside
 * `ctx.waitUntil` so the user is never made to wait on a KV write).
 */
export class PoolHealth {
    private blob: PoolHealthBlob = { ...EMPTY_HEALTH, entries: {} };
    private loaded = false;
    /** Set when a change occurred that is worth a durable write. */
    private dirty = false;
    private readonly persistMinCooldownMs: number;
    private readonly persistMinIntervalMs: number;
    private readonly now: () => number;

    constructor(
        private readonly kv: KVLike | undefined,
        options: PoolHealthOptions = {},
    ) {
        this.persistMinCooldownMs = options.persistMinCooldownMs ?? 5 * 60 * 1000;
        this.persistMinIntervalMs = options.persistMinIntervalMs ?? 60 * 1000;
        this.now = options.now ?? (() => Date.now());
    }

    async load(): Promise<void> {
        if (this.loaded) return;
        this.loaded = true;
        if (!this.kv) return;
        try {
            this.blob = parseBlob(await this.kv.get(HEALTH_KEY, 'text'));
        } catch {
            // KV unavailable — operate with an empty in-memory view.
            this.blob = { ...EMPTY_HEALTH, entries: {} };
        }
    }

    /** True when the entry is in cooldown and should be skipped. */
    isCooling(id: string): boolean {
        const entry = this.blob.entries[id];
        return !!entry && entry.cooledUntil > this.now();
    }

    /** Epoch ms when the entry becomes available again, or 0 if it is available. */
    cooledUntil(id: string): number {
        const entry = this.blob.entries[id];
        if (!entry) return 0;
        return entry.cooledUntil > this.now() ? entry.cooledUntil : 0;
    }

    /**
     * Earliest moment any entry in `ids` becomes available.
     * Returns 0 if at least one is available right now.
     */
    earliestAvailable(ids: string[]): number {
        let earliest = Number.POSITIVE_INFINITY;
        for (const id of ids) {
            const until = this.cooledUntil(id);
            if (until === 0) return 0;
            earliest = Math.min(earliest, until);
        }
        return Number.isFinite(earliest) ? earliest : 0;
    }

    /** Record that an entry hit a quota/rate limit and must cool down. */
    markCooling(id: string, cooldownMs: number, reason?: string): void {
        const now = this.now();
        const previous = this.blob.entries[id];
        const wasCooling = !!previous && previous.cooledUntil > now;
        const cooledUntil = now + cooldownMs;

        this.blob.entries[id] = {
            cooledUntil,
            reason,
            failures: (previous?.failures ?? 0) + 1,
        };

        // Rule 1 + 2: a durable write only for a genuine down-transition carrying a
        // cooldown long enough that another isolate could still act on it.
        if (!wasCooling && cooldownMs >= this.persistMinCooldownMs) {
            this.dirty = true;
        }
    }

    /**
     * Record a success. Clears any lingering cooldown state for the entry.
     * Only marks the blob dirty if a *persisted* cooldown was actually cleared —
     * a healthy entry succeeding again writes nothing.
     */
    markHealthy(id: string): void {
        const entry = this.blob.entries[id];
        if (!entry) return;
        const wasCooling = entry.cooledUntil > this.now();
        delete this.blob.entries[id];
        // Recovering early (before the recorded cooldown elapsed) is a real
        // transition worth persisting; an entry whose cooldown had merely expired
        // is pruned silently.
        if (wasCooling) this.dirty = true;
    }

    /** Drop entries whose cooldown has long expired, to keep the blob small. */
    private prune(): void {
        const now = this.now();
        for (const [id, entry] of Object.entries(this.blob.entries)) {
            if (entry.cooledUntil <= now) delete this.blob.entries[id];
        }
    }

    /** Snapshot for the /health endpoint. */
    snapshot(): PoolHealthBlob {
        return { ...this.blob, entries: { ...this.blob.entries } };
    }

    /** True when `flush()` would actually write. Exposed for tests. */
    shouldWrite(): boolean {
        if (!this.dirty || !this.kv) return false;
        return this.now() - this.blob.updatedAt >= this.persistMinIntervalMs;
    }

    /**
     * Persist if — and only if — a qualifying transition happened and the
     * debounce window has elapsed. Safe to call unconditionally.
     * Returns true when a write was issued.
     */
    async flush(): Promise<boolean> {
        if (!this.shouldWrite()) {
            // Drop the flag either way; the in-memory state already reflects reality
            // and a deferred write of stale data has no value.
            this.dirty = false;
            return false;
        }
        this.prune();
        this.blob.updatedAt = this.now();
        this.dirty = false;
        try {
            await this.kv!.put(HEALTH_KEY, JSON.stringify(this.blob));
            return true;
        } catch {
            // A failed health write is never worth failing the user's request over.
            return false;
        }
    }
}
