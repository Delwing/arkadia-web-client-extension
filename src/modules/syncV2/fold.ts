/**
 * Encoding of records for the cloud and folding of the log into the base.
 * See docs/dev/SYNC_V2_PLAN.md, section 8.4.
 */

import { decrypt, encrypt, isEncryptedData } from '@modules/firebase/firebaseCrypto';
import { stampTime } from '@modules/userData/hlc';
import { recordId, resolve, type MergeRule, type UserRecord } from '@modules/userData/records';

/** Tombstones older than this are dropped from the base. */
export const TOMBSTONE_HORIZON_MS = 90 * 24 * 60 * 60 * 1000;

export async function encodeRecords(records: UserRecord[], passphrase: string | null): Promise<{ data: string; encrypted: boolean }> {
    const json = JSON.stringify(records);
    if (!passphrase) return { data: json, encrypted: false };
    return { data: JSON.stringify(await encrypt(json, passphrase)), encrypted: true };
}

/** Throws when the data is encrypted and the passphrase is missing or wrong. */
export async function decodeRecords(data: string, encrypted: boolean, passphrase: string | null): Promise<UserRecord[]> {
    if (!encrypted) return JSON.parse(data) as UserRecord[];
    if (!passphrase) throw new Error('Passphrase required');
    const parsed: unknown = JSON.parse(data);
    if (!isEncryptedData(parsed)) throw new Error('Invalid encrypted data');
    return JSON.parse(await decrypt(parsed, passphrase)) as UserRecord[];
}

const itemKey = (r: UserRecord) => `${r.type}\u0000${recordId(r)}`;

/**
 * Merge records into the base by their types' rules. Types this version
 * doesn't know keep the newest record, so nothing of theirs is lost.
 */
export function foldRecords(base: UserRecord[], incoming: UserRecord[], rules: Map<string, MergeRule<any>>): UserRecord[] {
    const merged = new Map(base.map(r => [itemKey(r), r]));
    for (const record of incoming) {
        const key = itemKey(record);
        const current = merged.get(key);
        const rule = rules.get(record.type) ?? { kind: 'newest' };
        merged.set(key, current ? resolve(rule, current, record) : record);
    }
    return [...merged.values()];
}

/**
 * Drop what no device needs any more:
 * - knowledge ticks at or before the latest level change of their category
 *   (ticks only count until the next level-up);
 * - tombstones older than the horizon.
 */
export function compactRecords(records: UserRecord[], now: number): UserRecord[] {
    const latestLevel = new Map<string, number>();
    for (const r of records) {
        if (r.type !== 'knowledgeLevels' || r.deleted) continue;
        const category = r.key.split('/')[1];
        const timestamp = (r.value as { timestamp?: number } | undefined)?.timestamp;
        if (!category || typeof timestamp !== 'number') continue;
        const id = `${r.scope}\u0000${category}`;
        latestLevel.set(id, Math.max(latestLevel.get(id) ?? 0, timestamp));
    }

    return records.filter(r => {
        if (r.deleted) return now - stampTime(r.stamp) < TOMBSTONE_HORIZON_MS;
        if (r.type === 'knowledgeTicks') {
            const [, category, time] = r.key.split('/');
            const levelAt = latestLevel.get(`${r.scope}\u0000${category}`);
            if (levelAt !== undefined && Number(time) <= levelAt) return false;
        }
        return true;
    });
}
