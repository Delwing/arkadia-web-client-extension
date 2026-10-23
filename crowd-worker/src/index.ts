/**
 * Arkadia crowd Worker.
 *
 * Gathers the spis zlomu and the odmiany of item names from players who opted
 * in, and serves the merged result to anyone.
 *
 * Three properties shape the design:
 *
 * 1. It stores observations, not truth. Each distinct version of a record is a
 *    variant; each player who sent it is a confirmation. The snapshot shows the
 *    version most players agree on, so one wrong or hostile source cannot
 *    overwrite what several others saw.
 *
 * 2. Clients ask before they send. `/crowd/have` takes hashes and answers with
 *    the ones worth uploading, so a full sync of a list the Worker mostly
 *    knows costs reads, not writes — D1's free plan allows far more of those.
 *
 * 3. Reading costs no D1. A cron trigger exports the snapshot to KV once new
 *    uploads have settled. See snapshot.ts.
 *
 * 4. There is no identity provider. See auth.ts.
 */

import { mintCredentials, parseBearer, sha256, timingSafeEqual } from './auth';
import { isOriginAllowed, loadConfig, type RuntimeConfig } from './config';
import { corsHeaders, errorResponse, json } from './http';
import { canonicalize, hashRecord, isCrowdKind } from './records';
import { exportSnapshot, serveSnapshot } from './snapshot';
import {
    countRegistrations,
    findWanted,
    insertContributor,
    mergeContributor,
    readContributor,
    setQuota,
    storeItems,
    type ContributorRow,
    type StoredItem,
} from './store';
import type { D1Database, Env } from './types';

// Only the handler object may be exported from this module: workerd treats
// every named export of the entry as a handler and refuses anything else.

/** Ceiling on a request body, checked before parsing. */
const MAX_BODY_BYTES = 1024 * 1024;
/** Hashes per `/crowd/have`. */
const MAX_HAVE_HASHES = 5000;
/** Items per `/crowd/submit`. */
const MAX_SUBMIT_ITEMS = 500;

const HASH_PATTERN = /^[0-9a-f]{64}$/;

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const origin = request.headers.get('origin');
        const config = loadConfig(env);
        const allowed = config.allowedOrigins;

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(origin, allowed) });
        }

        if (url.pathname === '/health') {
            return json(
                { status: 'ok', database: Boolean(env.DB), snapshots: Boolean(env.SNAPSHOTS) },
                200,
                origin,
                allowed,
            );
        }

        // Public, from anywhere: the merged list is meant to be read.
        if (url.pathname === '/crowd/snapshot') {
            if (request.method !== 'GET') {
                return errorResponse('method_not_allowed', 'GET only', 405, origin, allowed);
            }
            if (!env.SNAPSHOTS) {
                return errorResponse('unavailable', 'Snapshot bucket not bound', 503, origin, allowed);
            }
            return serveSnapshot(request, env.SNAPSHOTS);
        }

        const db = env.DB;
        if (!db) {
            return errorResponse('unavailable', 'Database not bound', 503, origin, allowed);
        }

        if (!url.pathname.startsWith('/crowd/')) {
            return errorResponse('not_found', 'No such route', 404, origin, allowed);
        }
        if (request.method !== 'POST') {
            return errorResponse('method_not_allowed', 'POST only', 405, origin, allowed);
        }
        if (!isOriginAllowed(origin, allowed)) {
            return errorResponse('forbidden_origin', 'Origin not allowed', 403, origin, allowed);
        }

        const body = await readJsonBody(request);
        if (body === 'too_large') {
            return errorResponse('too_large', 'Request body too large', 413, origin, allowed);
        }
        if (body === 'malformed') {
            return errorResponse('bad_request', 'Malformed JSON', 400, origin, allowed);
        }

        // The way in, so it cannot require a credential.
        if (url.pathname === '/crowd/register') {
            return handleRegister(request, db, config, origin);
        }

        const contributor = await authenticate(request, db);
        if (!contributor) {
            return errorResponse('unauthorized', 'Invalid contributor credential', 401, origin, allowed);
        }

        switch (url.pathname) {
            case '/crowd/have':
                return handleHave(db, config, contributor, body, origin);
            case '/crowd/submit':
                return handleSubmit(db, config, contributor, body, origin);
            case '/crowd/merge':
                return handleMerge(db, config, contributor, body, origin);
            default:
                return errorResponse('not_found', 'No such route', 404, origin, allowed);
        }
    },

    /** Every five minutes (wrangler.jsonc `triggers`). A no-op beyond one tiny read when nothing is due. */
    async scheduled(_controller: unknown, env: Env): Promise<void> {
        if (!env.DB || !env.SNAPSHOTS) return;
        const outcome = await exportSnapshot(env.DB, env.SNAPSHOTS, Date.now());
        console.log(`[crowd] snapshot export: ${outcome}`);
    },
};

async function authenticate(request: Request, db: D1Database): Promise<ContributorRow | null> {
    const credentials = parseBearer(request.headers.get('authorization'));
    return credentials ? verify(db, credentials) : null;
}

async function verify(db: D1Database, credentials: { contributorId: string; secret: string }): Promise<ContributorRow | null> {
    const row = await readContributor(db, credentials.contributorId);
    if (!row) return null;
    const presented = await sha256(credentials.secret);
    return timingSafeEqual(presented, row.secret_hash) ? row : null;
}

function utcDay(now: number): string {
    return new Date(now).toISOString().slice(0, 10);
}

async function handleRegister(
    request: Request,
    db: D1Database,
    config: RuntimeConfig,
    origin: string | null,
): Promise<Response> {
    const allowed = config.allowedOrigins;
    const now = Date.now();
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const registeredFrom = await sha256(`${ip}|${utcDay(now)}`);
    if ((await countRegistrations(db, registeredFrom)) >= config.maxRegistrationsPerIp) {
        return errorResponse('rate_limited', 'Too many registrations today', 429, origin, allowed);
    }
    const credentials = mintCredentials();
    await insertContributor(db, credentials.contributorId, await sha256(credentials.secret), registeredFrom, now);
    return json(credentials, 200, origin, allowed);
}

async function handleHave(
    db: D1Database,
    config: RuntimeConfig,
    contributor: ContributorRow,
    body: unknown,
    origin: string | null,
): Promise<Response> {
    const allowed = config.allowedOrigins;
    const hashes = (body as { hashes?: unknown })?.hashes;
    if (
        !Array.isArray(hashes)
        || hashes.length > MAX_HAVE_HASHES
        || !hashes.every(h => typeof h === 'string' && HASH_PATTERN.test(h))
    ) {
        return errorResponse('bad_request', `hashes: up to ${MAX_HAVE_HASHES} sha-256 hex strings`, 400, origin, allowed);
    }
    // A banned contributor is told nothing is wanted, so it stops sending
    // without learning that it was banned.
    if (contributor.banned) return json({ wanted: [] }, 200, origin, allowed);
    const wanted = hashes.length ? await findWanted(db, contributor.id, hashes, config.maxConfirmations) : [];
    return json({ wanted }, 200, origin, allowed);
}

async function handleSubmit(
    db: D1Database,
    config: RuntimeConfig,
    contributor: ContributorRow,
    body: unknown,
    origin: string | null,
): Promise<Response> {
    const allowed = config.allowedOrigins;
    const items = (body as { items?: unknown })?.items;
    if (!Array.isArray(items) || items.length > MAX_SUBMIT_ITEMS) {
        return errorResponse('bad_request', `items: an array of up to ${MAX_SUBMIT_ITEMS}`, 400, origin, allowed);
    }

    const stored: StoredItem[] = [];
    const rejected: { index: number; reason: string }[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < items.length; index++) {
        const item = items[index] as { kind?: unknown; record?: unknown } | null;
        if (!item || !isCrowdKind(item.kind)) {
            rejected.push({ index, reason: 'unknown kind' });
            continue;
        }
        const result = canonicalize(item.kind, item.record);
        if (!result.ok) {
            rejected.push({ index, reason: result.reason });
            continue;
        }
        const hash = await hashRecord(result.record);
        if (seen.has(hash)) continue;
        seen.add(hash);
        stored.push({
            hash,
            kind: result.record.kind,
            key: result.record.key,
            payload: JSON.stringify(result.record.payload),
        });
    }

    const now = Date.now();
    const day = utcDay(now);
    const used = contributor.quota_day === day ? contributor.quota_used : 0;
    if (used + stored.length > config.maxItemsPerDay) {
        return errorResponse('rate_limited', 'Daily item quota reached', 429, origin, allowed);
    }

    // Accepted and dropped look the same to a banned contributor, for the
    // same reason as in handleHave.
    if (stored.length && !contributor.banned) {
        await storeItems(db, contributor.id, stored, config.maxConfirmations, now);
        await setQuota(db, contributor.id, day, used + stored.length);
    }
    return json({ accepted: stored.length, rejected }, 200, origin, allowed);
}

/**
 * A device that adopted another device's credential (the player's settings
 * sync carries it) hands over the one it held, proving it with its secret, so
 * one player stops counting as two.
 */
async function handleMerge(
    db: D1Database,
    config: RuntimeConfig,
    contributor: ContributorRow,
    body: unknown,
    origin: string | null,
): Promise<Response> {
    const allowed = config.allowedOrigins;
    const { contributorId, secret } = (body ?? {}) as { contributorId?: unknown; secret?: unknown };
    if (typeof contributorId !== 'string' || typeof secret !== 'string') {
        return errorResponse('bad_request', 'contributorId and secret of the credential to merge', 400, origin, allowed);
    }
    if (contributorId === contributor.id) return json({ merged: false }, 200, origin, allowed);
    const from = await verify(db, { contributorId, secret });
    // Unknown already (merged before, or the database was reset): nothing left to do
    if (!from) return json({ merged: false }, 200, origin, allowed);
    await mergeContributor(db, from, contributor, Date.now());
    return json({ merged: true }, 200, origin, allowed);
}

async function readJsonBody(request: Request): Promise<unknown | 'too_large' | 'malformed'> {
    const declared = Number(request.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return 'too_large';
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return 'too_large';
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return 'malformed';
    }
}
