/**
 * D1 queries.
 *
 * Every write route costs a fixed handful of queries however many items it
 * carries: the items travel as one JSON parameter and SQLite's json_each fans
 * them out. A statement per item would hit the free plan's cap on queries per
 * invocation long before the body size limit.
 */

import type { CrowdKind } from './records';
import type { D1Database } from './types';

export interface ContributorRow {
    id: string;
    secret_hash: string;
    banned: number;
    quota_day: string;
    quota_used: number;
}

export interface StoredItem {
    hash: string;
    kind: CrowdKind;
    key: string;
    payload: string;
}

export async function countRegistrations(db: D1Database, registeredFrom: string): Promise<number> {
    const row = await db
        .prepare('SELECT COUNT(*) AS n FROM contributors WHERE registered_from = ?1')
        .bind(registeredFrom)
        .first<{ n: number }>();
    return row?.n ?? 0;
}

export async function insertContributor(
    db: D1Database,
    id: string,
    secretHash: string,
    registeredFrom: string,
    now: number,
): Promise<void> {
    await db
        .prepare('INSERT INTO contributors (id, secret_hash, created_at, registered_from) VALUES (?1, ?2, ?3, ?4)')
        .bind(id, secretHash, now, registeredFrom)
        .run();
}

export async function readContributor(db: D1Database, id: string): Promise<ContributorRow | null> {
    return db
        .prepare('SELECT id, secret_hash, banned, quota_day, quota_used FROM contributors WHERE id = ?1')
        .bind(id)
        .first<ContributorRow>();
}

export async function setQuota(db: D1Database, id: string, day: string, used: number): Promise<void> {
    await db
        .prepare('UPDATE contributors SET quota_day = ?2, quota_used = ?3 WHERE id = ?1')
        .bind(id, day, used)
        .run();
}

/**
 * Of these hashes, the ones worth sending: not yet confirmed by this
 * contributor, and not already settled by enough others.
 */
export async function findWanted(
    db: D1Database,
    contributorId: string,
    hashes: string[],
    maxConfirmations: number,
): Promise<string[]> {
    const { results } = await db
        .prepare(
            `SELECT j.value AS hash FROM json_each(?1) j
             WHERE NOT EXISTS (SELECT 1 FROM confirmations c WHERE c.hash = j.value AND c.contributor = ?2)
               AND (SELECT COUNT(*) FROM confirmations c WHERE c.hash = j.value) < ?3`,
        )
        .bind(JSON.stringify(hashes), contributorId, maxConfirmations)
        .all<{ hash: string }>();
    return results.map(row => row.hash);
}

/**
 * Store new variants and this contributor's confirmation of each, and mark the
 * export stale. Three queries, however many items.
 */
export async function storeItems(
    db: D1Database,
    contributorId: string,
    items: StoredItem[],
    maxConfirmations: number,
    now: number,
): Promise<void> {
    const batch = JSON.stringify(items);
    await db
        .prepare(
            `INSERT OR IGNORE INTO variants (hash, kind, key, payload, created_at)
             SELECT json_extract(value, '$.hash'), json_extract(value, '$.kind'),
                    json_extract(value, '$.key'), json_extract(value, '$.payload'), ?2
             FROM json_each(?1)`,
        )
        .bind(batch, now)
        .run();
    await db
        .prepare(
            `INSERT OR IGNORE INTO confirmations (hash, contributor, created_at)
             SELECT json_extract(j.value, '$.hash'), ?2, ?3 FROM json_each(?1) j
             WHERE (SELECT COUNT(*) FROM confirmations c WHERE c.hash = json_extract(j.value, '$.hash')) < ?4`,
        )
        .bind(batch, contributorId, now, maxConfirmations)
        .run();
    await setMeta(db, 'last_write', now);
}

export type MetaKey = 'last_write' | 'last_export';

export async function readMeta(db: D1Database): Promise<Partial<Record<MetaKey, number>>> {
    const { results } = await db.prepare('SELECT key, value FROM meta').all<{ key: MetaKey; value: number }>();
    return Object.fromEntries(results.map(row => [row.key, row.value]));
}

export async function setMeta(db: D1Database, key: MetaKey, value: number): Promise<void> {
    await db
        .prepare('INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
        .bind(key, value)
        .run();
}

export interface SnapshotRow {
    kind: CrowdKind;
    payload: string;
    confirmations: number;
}

/**
 * The leading version of every record: most distinct contributors, earliest
 * seen on a tie. Banned contributors count for nothing, so banning one drops
 * whatever only they vouched for.
 */
export async function readSnapshot(db: D1Database): Promise<SnapshotRow[]> {
    const { results } = await db
        .prepare(
            `WITH counted AS (
                 SELECT v.hash, v.kind, v.key, v.payload,
                        COUNT(*) AS confirmations, MIN(c.created_at) AS first_seen
                 FROM variants v
                 JOIN confirmations c ON c.hash = v.hash
                 JOIN contributors p ON p.id = c.contributor AND p.banned = 0
                 GROUP BY v.hash
             ), ranked AS (
                 SELECT kind, payload, confirmations,
                        ROW_NUMBER() OVER (PARTITION BY kind, key ORDER BY confirmations DESC, first_seen ASC) AS rank
                 FROM counted
             )
             SELECT kind, payload, confirmations FROM ranked WHERE rank = 1 ORDER BY kind, payload`,
        )
        .all<SnapshotRow>();
    return results;
}
