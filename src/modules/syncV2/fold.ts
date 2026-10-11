/**
 * Encoding of records for the cloud and folding of the log into the base.
 * See docs/dev/SYNC_V2_PLAN.md, section 8.4.
 */

import { decrypt, encrypt, isEncryptedData } from '@modules/firebase/firebaseCrypto';
import { stampTime } from '@modules/userData/hlc';
import { recordId, resolve, type MergeRule, type UserRecord } from '@modules/userData/records';

/** Tombstones older than this are dropped from the base. */
export const TOMBSTONE_HORIZON_MS = 90 * 24 * 60 * 60 * 1000;

export interface EncodedRecords {
    data: string;
    encrypted: boolean;
    /** The JSON was gzipped and base64-encoded (before encryption). */
    compressed?: boolean;
}

async function pipeBytes(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
    const writer = stream.writable.getWriter();
    const written = writer.write(bytes as Uint8Array<ArrayBuffer>).then(() => writer.close());
    const reader = stream.readable.getReader();
    const parts: Uint8Array[] = [];
    let length = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        length += value.length;
    }
    await written;
    const out = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

function toBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function gzipText(text: string): Promise<string> {
    return toBase64(await pipeBytes(new TextEncoder().encode(text), new CompressionStream('gzip')));
}

async function gunzipText(text: string): Promise<string> {
    return new TextDecoder().decode(await pipeBytes(fromBase64(text), new DecompressionStream('gzip')));
}

/**
 * `compress` gzips the JSON. The base holds every record (visited rooms
 * alone run to tens of thousands) and Firestore takes at most ~11 MiB in one
 * commit; the repetitive JSON shrinks about tenfold.
 */
export async function encodeRecords(
    records: UserRecord[],
    passphrase: string | null,
    { compress = false }: { compress?: boolean } = {},
): Promise<EncodedRecords> {
    const json = JSON.stringify(records);
    const text = compress ? await gzipText(json) : json;
    const flag = compress ? { compressed: true as const } : {};
    if (!passphrase) return { data: text, encrypted: false, ...flag };
    return { data: JSON.stringify(await encrypt(text, passphrase)), encrypted: true, ...flag };
}

/** Throws when the data is encrypted and the passphrase is missing or wrong. */
export async function decodeRecords(
    data: string,
    encrypted: boolean,
    passphrase: string | null,
    compressed = false,
): Promise<UserRecord[]> {
    let text = data;
    if (encrypted) {
        if (!passphrase) throw new Error('Passphrase required');
        const parsed: unknown = JSON.parse(data);
        if (!isEncryptedData(parsed)) throw new Error('Invalid encrypted data');
        text = await decrypt(parsed, passphrase);
    }
    if (compressed) text = await gunzipText(text);
    return JSON.parse(text) as UserRecord[];
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
