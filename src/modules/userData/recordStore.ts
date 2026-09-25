/**
 * Persistence for the tracking copy (the last known record of every synced
 * item) and the outbox (this device's records not yet uploaded).
 * See docs/dev/SYNC_V2_PLAN.md, section 6.
 */

import { recordId, type UserRecord } from './records';

export interface RecordStore {
    getRecords(type: string): Promise<UserRecord[]>;
    putRecords(records: UserRecord[]): Promise<void>;
    /** This device's records waiting for upload, oldest first. */
    getOutbox(): Promise<UserRecord[]>;
    /** Queue records for upload; a newer record of the same item replaces the queued one. */
    putOutbox(records: UserRecord[]): Promise<void>;
    /** Drop queued records up to and including `seq` (they were uploaded). */
    removeOutbox(uptoSeq: number): Promise<void>;
    /** Reserve `count` consecutive local sequence numbers; returns the first. */
    reserveSeq(count: number): Promise<number>;
    /** Whether a type's local data was captured at least once (its seed). */
    isSeeded(type: string): Promise<boolean>;
    markSeeded(type: string): Promise<void>;
    /** Forget everything: records, outbox and seed marks (sequence numbers keep counting). */
    clear(): Promise<void>;
}

const itemKey = (r: UserRecord) => `${r.type}\u0000${recordId(r)}`;

export class MemoryRecordStore implements RecordStore {
    private records = new Map<string, UserRecord>();
    private outbox = new Map<string, UserRecord>();
    private seq = 0;
    private seeded = new Set<string>();

    async getRecords(type: string): Promise<UserRecord[]> {
        return [...this.records.values()].filter(r => r.type === type);
    }

    async putRecords(records: UserRecord[]): Promise<void> {
        for (const r of records) this.records.set(itemKey(r), r);
    }

    async getOutbox(): Promise<UserRecord[]> {
        return [...this.outbox.values()].sort((a, b) => a.seq - b.seq);
    }

    async putOutbox(records: UserRecord[]): Promise<void> {
        for (const r of records) this.outbox.set(itemKey(r), r);
    }

    async removeOutbox(uptoSeq: number): Promise<void> {
        for (const [key, r] of this.outbox) {
            if (r.seq <= uptoSeq) this.outbox.delete(key);
        }
    }

    async reserveSeq(count: number): Promise<number> {
        const first = this.seq + 1;
        this.seq += count;
        return first;
    }

    async isSeeded(type: string): Promise<boolean> {
        return this.seeded.has(type);
    }

    async markSeeded(type: string): Promise<void> {
        this.seeded.add(type);
    }

    async clear(): Promise<void> {
        this.records.clear();
        this.outbox.clear();
        this.seeded.clear();
    }
}

const DB_NAME = 'ArkadiaUserData';
const DB_VERSION = 1;
const RECORDS = 'records';
const OUTBOX = 'outbox';
const META = 'meta';

function request<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
    });
}

function done(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
}

export class IndexedDbRecordStore implements RecordStore {
    private dbPromise: Promise<IDBDatabase> | null = null;

    constructor(private readonly dbName: string = DB_NAME) {}

    private db(): Promise<IDBDatabase> {
        if (!this.dbPromise) {
            this.dbPromise = new Promise((resolve, reject) => {
                const req = indexedDB.open(this.dbName, DB_VERSION);
                req.onupgradeneeded = () => {
                    const db = req.result;
                    if (!db.objectStoreNames.contains(RECORDS)) {
                        const store = db.createObjectStore(RECORDS, { keyPath: ['type', 'scope', 'key'] });
                        store.createIndex('type', 'type');
                    }
                    if (!db.objectStoreNames.contains(OUTBOX)) {
                        const store = db.createObjectStore(OUTBOX, { keyPath: ['type', 'scope', 'key'] });
                        store.createIndex('seq', 'seq');
                    }
                    if (!db.objectStoreNames.contains(META)) {
                        db.createObjectStore(META);
                    }
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => {
                    this.dbPromise = null;
                    reject(req.error ?? new Error('Failed to open user data database'));
                };
            });
        }
        return this.dbPromise;
    }

    async getRecords(type: string): Promise<UserRecord[]> {
        const db = await this.db();
        const tx = db.transaction(RECORDS, 'readonly');
        return request(tx.objectStore(RECORDS).index('type').getAll(type));
    }

    async putRecords(records: UserRecord[]): Promise<void> {
        if (records.length === 0) return;
        const db = await this.db();
        const tx = db.transaction(RECORDS, 'readwrite');
        const store = tx.objectStore(RECORDS);
        for (const r of records) store.put(r);
        await done(tx);
    }

    async getOutbox(): Promise<UserRecord[]> {
        const db = await this.db();
        const tx = db.transaction(OUTBOX, 'readonly');
        return request(tx.objectStore(OUTBOX).index('seq').getAll());
    }

    async putOutbox(records: UserRecord[]): Promise<void> {
        if (records.length === 0) return;
        const db = await this.db();
        const tx = db.transaction(OUTBOX, 'readwrite');
        const store = tx.objectStore(OUTBOX);
        for (const r of records) store.put(r);
        await done(tx);
    }

    async removeOutbox(uptoSeq: number): Promise<void> {
        const db = await this.db();
        const tx = db.transaction(OUTBOX, 'readwrite');
        const index = tx.objectStore(OUTBOX).index('seq');
        const cursorReq = index.openCursor(IDBKeyRange.upperBound(uptoSeq));
        cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
        await done(tx);
    }

    async reserveSeq(count: number): Promise<number> {
        const db = await this.db();
        const tx = db.transaction(META, 'readwrite');
        const store = tx.objectStore(META);
        let first = 1;
        // Read and write in the same callback so the transaction stays active.
        const getReq = store.get('seq');
        getReq.onsuccess = () => {
            const current = (getReq.result as number | undefined) ?? 0;
            first = current + 1;
            store.put(current + count, 'seq');
        };
        await done(tx);
        return first;
    }

    async isSeeded(type: string): Promise<boolean> {
        const db = await this.db();
        const tx = db.transaction(META, 'readonly');
        return (await request(tx.objectStore(META).get(`seeded:${type}`))) === true;
    }

    async markSeeded(type: string): Promise<void> {
        const db = await this.db();
        const tx = db.transaction(META, 'readwrite');
        tx.objectStore(META).put(true, `seeded:${type}`);
        await done(tx);
    }

    async clear(): Promise<void> {
        const db = await this.db();
        const tx = db.transaction([RECORDS, OUTBOX, META], 'readwrite');
        tx.objectStore(RECORDS).clear();
        tx.objectStore(OUTBOX).clear();
        const meta = tx.objectStore(META);
        const keysReq = meta.getAllKeys();
        keysReq.onsuccess = () => {
            for (const key of keysReq.result) {
                if (typeof key === 'string' && key.startsWith('seeded:')) meta.delete(key);
            }
        };
        await done(tx);
    }
}
