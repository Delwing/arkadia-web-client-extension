/**
 * Bindings and wire types for the push Worker.
 */

/** Bindings and vars. Secrets are `string | undefined` because they may be unset. */
export interface Env {
    /** KV namespace holding one subscription document per user. */
    PUSH_KV?: KVNamespace;

    /** Comma-separated origin allowlist. */
    ALLOWED_ORIGINS?: string;
    /** `sub` claim for the VAPID JWT. A `mailto:` or `https:` URI. */
    VAPID_SUBJECT?: string;
    /** Ceiling on subscriptions retained per user. Oldest evicted past it. */
    MAX_SUBSCRIPTIONS_PER_USER?: string;
    /**
     * Local testing only: serve the self-contained test page at `/dev`.
     *
     * This does NOT weaken authentication — every push route requires a bearer
     * credential either way. It only exposes the test harness.
     *
     * Set exclusively in the `dev` environment in wrangler.jsonc, which
     * `wrangler deploy` never publishes. Never add it to the top-level vars.
     */
    DEV_TEST_PAGE?: string;

    /** Secrets. */
    /**
     * Private half of the Web Push VAPID keypair, as JWK JSON. The public half
     * is derived from its `x`/`y`, so it is not stored separately.
     *
     * Rotating this invalidates every existing push subscription silently — see
     * the note in wrangler.jsonc.
     */
    VAPID_PRIVATE_KEY?: string;
}

/** Minimal KVNamespace shape, so the project typechecks without workers-types. */
export interface KVNamespace {
    get(key: string, type: 'text'): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
}

/**
 * One browser's push subscription, as the Push API hands it to us.
 *
 * `endpoint` is the push service URL to POST to; `p256dh` and `auth` are the
 * client's public key and shared secret, used for payload encryption. They are
 * stored unused until phase 3 — a payload-less push needs neither.
 */
export interface StoredSubscription {
    endpoint: string;
    p256dh: string;
    auth: string;
    /** Free-text device label, for the "your devices" list. */
    label?: string;
    /** Epoch ms. Used to evict the oldest past MAX_SUBSCRIPTIONS_PER_USER. */
    createdAt: number;
}

/**
 * The single KV document held per push account, at `push:{pushId}`.
 *
 * `secretHash` is the SHA-256 of the account's secret — never the secret — so
 * this document grants nothing to anyone who reads it.
 */
export interface SubscriptionDoc {
    secretHash: string;
    subscriptions: StoredSubscription[];
}

export type ErrorStatus =
    | 'unauthorized'
    | 'bad_request'
    | 'forbidden_origin'
    | 'not_found'
    | 'method_not_allowed'
    | 'too_large'
    | 'internal_error';
