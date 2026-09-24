/**
 * Cloud side of sync v2: one shared `log` document that every device appends
 * batches to, and one `base` document with the compacted state.
 * See docs/dev/SYNC_V2_PLAN.md, section 8.
 */

/** One device's upload: its records with sequence numbers fromSeq..toSeq. */
export interface SyncBatch {
    device: string;
    fromSeq: number;
    toSeq: number;
    /** Newest HLC stamp in the batch. */
    stamp: string;
    encrypted: boolean;
    /** JSON of UserRecord[], or JSON of EncryptedData when encrypted. */
    data: string;
}

export interface LogDoc {
    batches: SyncBatch[];
    /** Per device: its batches up to this seq are in the base and gone from the log. */
    folded: Record<string, number>;
    /** Devices currently visible and listening, with when they said so (ms). */
    watching: Record<string, number>;
}

export interface BaseDoc {
    schemaVersion: 1;
    folded: Record<string, number>;
    encrypted: boolean;
    /** JSON of UserRecord[], or JSON of EncryptedData when encrypted. */
    data: string;
    updatedAt: number;
}

export interface FoldResult {
    base: BaseDoc;
    /** Log batches that stay in the log (not folded). */
    keep: SyncBatch[];
    folded: Record<string, number>;
}

export interface SyncTransport {
    /** Listen to the log. Returns the unsubscribe function. */
    subscribeLog(onLog: (log: LogDoc) => void, onError: (error: unknown) => void): () => void;
    appendBatch(batch: SyncBatch): Promise<void>;
    setWatching(device: string, since: number | null): Promise<void>;
    readBase(): Promise<BaseDoc | null>;
    /** Atomically replace the base and the log's batches (a transaction; `update` may run more than once). */
    fold(update: (base: BaseDoc | null, log: LogDoc) => Promise<FoldResult>): Promise<void>;
    /** Delete the log and the base. */
    clear(): Promise<void>;
}

export function emptyLog(): LogDoc {
    return { batches: [], folded: {}, watching: {} };
}

/**
 * In-memory transport with Firestore's semantics for the parts sync uses:
 * snapshot listeners that receive the whole document on every change,
 * atomic appends and transactions. Used by tests.
 */
export class MemoryTransport implements SyncTransport {
    log: LogDoc = emptyLog();
    base: BaseDoc | null = null;
    private listeners = new Set<(log: LogDoc) => void>();
    /** Counts of operations, like Firestore would bill them. */
    ops = { reads: 0, writes: 0 };

    subscribeLog(onLog: (log: LogDoc) => void): () => void {
        this.listeners.add(onLog);
        this.ops.reads += 1;
        const snapshot = this.snapshot();
        queueMicrotask(() => onLog(snapshot));
        return () => { this.listeners.delete(onLog); };
    }

    async appendBatch(batch: SyncBatch): Promise<void> {
        this.log = { ...this.log, batches: [...this.log.batches, batch] };
        this.ops.writes += 1;
        this.emit();
    }

    async setWatching(device: string, since: number | null): Promise<void> {
        const watching = { ...this.log.watching };
        if (since === null) delete watching[device];
        else watching[device] = since;
        this.log = { ...this.log, watching };
        this.ops.writes += 1;
        this.emit();
    }

    async readBase(): Promise<BaseDoc | null> {
        this.ops.reads += 1;
        return this.base ? { ...this.base } : null;
    }

    async fold(update: (base: BaseDoc | null, log: LogDoc) => Promise<FoldResult>): Promise<void> {
        for (;;) {
            const log = this.snapshot();
            const base = this.base;
            this.ops.reads += 2;
            const result = await update(base ? { ...base } : null, log);
            // Something appended meanwhile: retry, like a Firestore transaction.
            if (this.log.batches.length !== log.batches.length) continue;
            this.base = result.base;
            this.log = { ...this.log, batches: result.keep, folded: result.folded };
            this.ops.writes += 2;
            this.emit();
            return;
        }
    }

    async clear(): Promise<void> {
        this.log = emptyLog();
        this.base = null;
        this.ops.writes += 2;
        this.emit();
    }

    listenerCount(): number {
        return this.listeners.size;
    }

    private snapshot(): LogDoc {
        return JSON.parse(JSON.stringify(this.log)) as LogDoc;
    }

    private emit(): void {
        for (const listener of this.listeners) {
            this.ops.reads += 1;
            const snapshot = this.snapshot();
            queueMicrotask(() => listener(snapshot));
        }
    }
}
