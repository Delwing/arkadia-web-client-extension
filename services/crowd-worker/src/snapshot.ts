/**
 * The public snapshot: built by the cron trigger, stored in KV, served from KV.
 *
 * Building it reads every variant and confirmation, so it must not happen per
 * request. The scheduled export (every five minutes) rebuilds only when something
 * was written since the last export and the uploads have gone quiet - or have
 * waited an hour, so steady uploads still show - plus once a day regardless — that daily pass is what picks
 * up a ban made without touching `meta`. Downloads then cost one KV read and no
 * D1 at all, and a client that already has the current version gets a 304.
 *
 * KV rather than R2: R2 needs enabling in the dashboard with a payment method
 * on file. KV's free tier allows 1k writes a day (an export writes once, and
 * only when something changed) and 100k reads; past that, R2 is the move, and only this file and
 * the binding change.
 */

import type { CrowdKind } from './records';
import { readMeta, readSnapshot, setMeta } from './store';
import type { D1Database, KVNamespace } from './types';

export const SNAPSHOT_KEY = 'snapshot.json';

/** Rebuild at least this often, even with no new submissions. */
export const FORCED_EXPORT_MS = 24 * 60 * 60 * 1000;

/**
 * Wait for uploads to go quiet this long before exporting. A first sync sends
 * a whole list in batches over several minutes; exporting in the middle of it
 * publishes a fraction of the list for the next hour.
 */
export const QUIET_MS = 5 * 60 * 1000;

/** But never hold back new data longer than this, however steady the uploads. */
export const MAX_WAIT_MS = 60 * 60 * 1000;

const GROUPS: Partial<Record<CrowdKind, 'bronie' | 'tarcze' | 'zbroje' | 'ubrania' | 'dodatki' | 'odmiany' | 'ignorowane'>> = {
    bron: 'bronie',
    tarcza: 'tarcze',
    zbroja: 'zbroje',
    ubranie: 'ubrania',
    dodatek: 'dodatki',
    odmiana: 'odmiany',
    ignorowany: 'ignorowane',
};

/** Records that are a field of an item, and the field they fill */
const ATTACHED: Partial<Record<CrowdKind, string>> = {
    iline: 'iLine',
    altname: 'shortAlt',
};

export interface Snapshot {
    generatedAt: string;
    bronie: Record<string, unknown>[];
    tarcze: Record<string, unknown>[];
    zbroje: Record<string, unknown>[];
    ubrania: Record<string, unknown>[];
    dodatki: Record<string, unknown>[];
    odmiany: Record<string, unknown>[];
    ignorowane: Record<string, unknown>[];
}

/** Stored beside the value, so a 304 needs no hashing at request time. */
interface SnapshotMetadata {
    etag: string;
}

function emptySnapshot(now: number): Snapshot {
    return { generatedAt: new Date(now).toISOString(), bronie: [], tarcze: [], zbroje: [], ubrania: [], dodatki: [], odmiany: [], ignorowane: [] };
}

/**
 * One entry per item name (or mianownik): the version most players agree on.
 * The others are kept under its `alternatives`, so two different items that
 * share a name both stay visible rather than the rarer one vanishing.
 *
 * An item's `i` line and evaluated name are voted on as records of their own
 * (records.ts says why); the leading one of each is set on the item here, on
 * the leading version and on its alternatives alike.
 */
export async function buildSnapshot(db: D1Database, now: number): Promise<Snapshot> {
    const snapshot = emptySnapshot(now);
    const items = new Map<string, { group: NonNullable<(typeof GROUPS)[CrowdKind]>; versions: Version[] }>();
    const attached: { key: string; field: string; value: unknown }[] = [];
    // Rows come ranked within their key; Map keeps that order
    for (const row of await readSnapshot(db)) {
        const field = ATTACHED[row.kind];
        if (field) {
            if (row.rank === 1) attached.push({ key: row.key, field, value: JSON.parse(row.payload)[field] });
            continue;
        }
        const group = GROUPS[row.kind];
        if (!group) continue;
        const itemKey = `${row.kind}:${row.key}`;
        const item = items.get(itemKey) ?? { group, versions: [] };
        item.versions.push({ ...JSON.parse(row.payload), confirmations: row.confirmations });
        items.set(itemKey, item);
    }
    for (const { group, versions } of items.values()) {
        const [leading, ...others] = foldUnknownCover(versions);
        if (others.length) leading!.alternatives = others;
        snapshot[group].push(leading!);
    }
    for (const { key, field, value } of attached) {
        for (const version of items.get(key)?.versions ?? []) version[field] = value;
    }
    return snapshot;
}

type Version = Record<string, unknown> & { confirmations: number };

/** The same version but for its description and what it covers. */
function sameButCover(a: Version, b: Version): boolean {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every(k => ['opis', 'oslona', 'confirmations'].includes(k) || a[k] === b[k]);
}

/**
 * An empty `oslona` is an evaluation that did not say what the piece covers
 * (an entry older than the line was read), not a version that covers nothing.
 * It counts for the most confirmed version that matches it otherwise, so it
 * cannot outvote the ones that know. Ranked again afterwards; the sort is
 * stable, so ties keep the order first seen.
 */
function foldUnknownCover(versions: Version[]): Version[] {
    const kept = versions.filter(v => v.oslona !== '');
    if (kept.length === versions.length || !kept.length) return versions;
    const left: Version[] = [];
    for (const blank of versions.filter(v => v.oslona === '')) {
        const target = kept.find(v => sameButCover(v, blank));
        if (target) target.confirmations += blank.confirmations;
        else left.push(blank);
    }
    return [...kept, ...left].sort((a, b) => b.confirmations - a.confirmations);
}

async function etagOf(text: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    return `"${hex.slice(0, 32)}"`;
}

export type ExportOutcome = 'exported' | 'unchanged' | 'settling';

/** The cron trigger's job. Reads only `meta` when nothing changed. */
export async function exportSnapshot(db: D1Database, kv: KVNamespace, now: number): Promise<ExportOutcome> {
    const meta = await readMeta(db);
    const lastExport = meta.last_export ?? 0;
    const lastWrite = meta.last_write ?? 0;
    const forced = now - lastExport >= FORCED_EXPORT_MS;
    if (!forced) {
        if (lastWrite < lastExport) return 'unchanged';
        const waitingSince = (meta.dirty_since ?? 0) > lastExport ? meta.dirty_since! : lastWrite;
        const quiet = now - lastWrite >= QUIET_MS;
        const waitedEnough = now - waitingSince >= MAX_WAIT_MS;
        if (!quiet && !waitedEnough) return 'settling';
    }

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
