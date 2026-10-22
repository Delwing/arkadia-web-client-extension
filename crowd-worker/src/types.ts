/**
 * Bindings and wire types for the crowd Worker.
 */

/** Bindings and vars. */
export interface Env {
    /** The crowd database: contributors, variants, confirmations. */
    DB?: D1Database;
    /** Holds the exported snapshot, built by the cron trigger. */
    SNAPSHOTS?: KVNamespace;

    /** Comma-separated origin allowlist for the write routes. */
    ALLOWED_ORIGINS?: string;
    /** Items one contributor may submit per UTC day. */
    MAX_ITEMS_PER_DAY?: string;
    /** Confirmations kept per variant; past it the variant is settled. */
    MAX_CONFIRMATIONS?: string;
    /** New contributors one IP may register per UTC day. */
    MAX_REGISTRATIONS_PER_IP?: string;
    /** Seconds a browser or proxy may reuse the snapshot without revalidating. */
    SNAPSHOT_MAX_AGE_SECONDS?: string;
}

/** Minimal D1 shape, so the project typechecks without workers-types. */
export interface D1Database {
    prepare(query: string): D1PreparedStatement;
}

export interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = Record<string, unknown>>(): Promise<T | null>;
    all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
    run(): Promise<{ meta: { changes: number } }>;
}

export type ErrorStatus =
    | 'unauthorized'
    | 'bad_request'
    | 'forbidden_origin'
    | 'not_found'
    | 'method_not_allowed'
    | 'too_large'
    | 'rate_limited'
    | 'unavailable';

/** Minimal KV shape: only what the export and the snapshot route use. */
export interface KVNamespace {
    getWithMetadata<M>(key: string, type: 'text'): Promise<{ value: string | null; metadata: M | null }>;
    put(key: string, value: string, options?: { metadata?: unknown }): Promise<void>;
}
