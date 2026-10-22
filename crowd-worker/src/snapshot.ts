/**
 * The public snapshot: built by the cron trigger, stored in KV, served from KV.
 *
 * Building it reads every variant and confirmation, so it must not happen per
 * request. The scheduled export rebuilds only when something was written since
 * the last export, plus once a day regardless — that daily pass is what picks
 * up a ban made without touching `meta`. Downloads then cost one KV read and no
 * D1 at all, and a client that already has the current version gets a 304.
 *
 * KV rather than R2: R2 needs enabling in the dashboard with a payment method
 * on file. KV's free tier allows 1k writes a day (an hourly export writes at
 * most 24) and 100k reads; past that, R2 is the move, and only this file and
 * the binding change.
 */

import type { CrowdKind } from './records';
import { readMeta, readSnapshot, setMeta } from './store';
import type { D1Database, KVNamespace } from './types';

export const SNAPSHOT_KEY = 'snapshot.json';

/** Rebuild at least this often, even with no new submissions. */
export const FORCED_EXPORT_MS = 24 * 60 * 60 * 1000;

const GROUPS: Record<CrowdKind, 'bronie' | 'tarcze' | 'zbroje' | 'odmiany'> = {
    bron: 'bronie',
    tarcza: 'tarcze',
    zbroja: 'zbroje',
    odmiana: 'odmiany',
};

export interface Snapshot {
    generatedAt: string;
    bronie: Record<string, unknown>[];
    tarcze: Record<string, unknown>[];
    zbroje: Record<string, unknown>[];
    odmiany: Record<string, unknown>[];
}

/** Stored beside the value, so a 304 needs no hashing at request time. */
interface SnapshotMetadata {
    etag: string;
}

function emptySnapshot(now: number): Snapshot {
    return { generatedAt: new Date(now).toISOString(), bronie: [], tarcze: [], zbroje: [], odmiany: [] };
}

/**
 * One entry per item name (or mianownik): the version most players agree on.
 * The others are kept under its `alternatives`, so two different items that
 * share a name both stay visible rather than the rarer one vanishing.
 */
export async function buildSnapshot(db: D1Database, now: number): Promise<Snapshot> {
    const snapshot = emptySnapshot(now);
    let leading: Record<string, unknown> | null = null;
    for (const row of await readSnapshot(db)) {
        const group = GROUPS[row.kind];
        if (!group) continue;
        const version = { ...JSON.parse(row.payload), confirmations: row.confirmations };
        if (row.rank === 1) {
            leading = version;
            snapshot[group].push(version);
        } else if (leading) {
            ((leading.alternatives ??= []) as unknown[]).push(version);
        }
    }
    return snapshot;
}

async function etagOf(text: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    return `"${hex.slice(0, 32)}"`;
}

export type ExportOutcome = 'exported' | 'unchanged';

/** The cron trigger's job. Reads only `meta` when nothing changed. */
export async function exportSnapshot(db: D1Database, kv: KVNamespace, now: number): Promise<ExportOutcome> {
    const meta = await readMeta(db);
    const lastExport = meta.last_export ?? 0;
    const stale = (meta.last_write ?? 0) >= lastExport || now - lastExport >= FORCED_EXPORT_MS;
    if (!stale) return 'unchanged';

    const text = JSON.stringify(await buildSnapshot(db, now));
    const metadata: SnapshotMetadata = { etag: await etagOf(text) };
    await kv.put(SNAPSHOT_KEY, text, { metadata });
    await setMeta(db, 'last_export', now);
    return 'exported';
}

/**
 * Serve the stored export. Before the first export there is nothing in KV; an
 * empty snapshot answers instead, uncached, so the first real one shows at once.
 */
export async function serveSnapshot(
    request: Request,
    kv: KVNamespace,
): Promise<Response> {
    const headers: Record<string, string> = {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
        'access-control-expose-headers': 'etag',
    };
    const { value, metadata } = await kv.getWithMetadata<SnapshotMetadata>(SNAPSHOT_KEY, 'text');
    if (value === null) {
        return new Response(JSON.stringify(emptySnapshot(Date.now())), {
            status: 200,
            headers: { ...headers, 'cache-control': 'no-store' },
        });
    }
    // Kept, but checked every time: the export can change any hour, and checking
    // a copy the browser has is a 304 that costs one KV read and no D1. A max-age
    // here once kept pages on an hour-old export.
    headers['cache-control'] = 'public, no-cache';
    const etag = metadata?.etag;
    if (etag) {
        headers.etag = etag;
        const ifNoneMatch = request.headers.get('if-none-match');
        if (ifNoneMatch && ifNoneMatch.split(',').some(tag => tag.trim().replace(/^W\//, '') === etag)) {
            return new Response(null, { status: 304, headers });
        }
    }
    return new Response(value, { status: 200, headers });
}
