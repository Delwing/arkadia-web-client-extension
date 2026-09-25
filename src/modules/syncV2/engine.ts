/**
 * Sync v2 engine: connects the change tracker to the cloud log.
 * See docs/dev/SYNC_V2_PLAN.md, section 8.
 *
 * - Upload: capture local changes and append them to the log as one batch —
 *   every 5 minutes while playing, every ~15 s while another of the user's
 *   devices is watching, and at once when the tab is hidden or closed.
 *   Batches too big for the log (the first full upload, restores) are
 *   folded straight into the base.
 * - Download: one listener on the log, attached only while the tab is
 *   visible. Batches from other devices above this device's cursor are
 *   applied; a device that fell behind a compaction reads the base first.
 * - Compaction: when the log grows past ~64 KiB, fold it into the base.
 */

import type { UserDataTracker } from '@modules/userData/tracker';
import type { UserRecord } from '@modules/userData/records';
import type { UserDataType } from '@modules/userData/types';
import { compactRecords, decodeRecords, encodeRecords, foldRecords } from './fold';
import type { BaseDoc, LogDoc, SyncBatch, SyncTransport } from './transport';

export interface SyncEngineTimings {
    /** Upload interval while playing. */
    idleMs: number;
    /** Upload interval while another device watches. */
    watchingMs: number;
    /** A watching flag older than this is stale (tab killed without saying so). */
    watchingTtlMs: number;
    /** Fold the log into the base when it grows past this many bytes. */
    foldLogBytes: number;
    /** Batches larger than this go straight into the base. */
    directFoldBytes: number;
}

export const DEFAULT_TIMINGS: SyncEngineTimings = {
    idleMs: 5 * 60 * 1000,
    watchingMs: 15 * 1000,
    watchingTtlMs: 10 * 60 * 1000,
    foldLogBytes: 64 * 1024,
    directFoldBytes: 32 * 1024,
};

/** Page visibility, injectable for tests. */
export interface VisibilitySource {
    isVisible(): boolean;
    onChange(listener: (visible: boolean) => void): () => void;
    onPageHide(listener: () => void): () => void;
}

export interface CursorStore {
    load(): Record<string, number>;
    save(cursors: Record<string, number>): void;
}

export interface UsageCounter {
    read(count: number, bytes?: number): void;
    write(count: number, bytes?: number): void;
}

export interface SyncEngineOptions {
    deviceId: string;
    tracker: UserDataTracker;
    types: UserDataType[];
    transport: SyncTransport;
    /** Passphrase to encrypt uploads with: set when encryption is on, otherwise null. */
    encryptionKey: () => string | null;
    /**
     * Passphrase to decrypt with, whenever one is known: data encrypted before
     * encryption was switched off still has to be read.
     */
    decryptionKey: () => string | null;
    /** Encryption is on but no passphrase is known: sync pauses. */
    locked: () => boolean;
    visibility: VisibilitySource;
    cursors: CursorStore;
    usage?: UsageCounter;
    timings?: Partial<SyncEngineTimings>;
    now?: () => number;
    onError?: (error: unknown) => void;
    /** What was uploaded and applied, for the console. */
    log?: (message: string) => void;
}

/** "aliases×2, kills×5": record counts per type. */
function describe(records: UserRecord[]): string {
    const counts = new Map<string, number>();
    for (const r of records) counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
    return [...counts].map(([type, n]) => `${type}×${n}`).join(', ');
}

export class SyncEngineV2 {
    private readonly timings: SyncEngineTimings;
    private readonly now: () => number;
    private readonly rules: Map<string, UserDataType['rule']>;
    private cursors: Record<string, number>;
    private unsubscribeLog: (() => void) | null = null;
    private cleanups: Array<() => void> = [];
    private timer: ReturnType<typeof setTimeout> | null = null;
    private running = false;
    private watchedByOthers = false;
    private lastLogBytes = 0;
    private received = false;
    private receiveWaiters: Array<{ resolve: () => void; reject: (error: unknown) => void }> = [];
    private queue: Promise<unknown> = Promise.resolve();

    constructor(private readonly options: SyncEngineOptions) {
        this.timings = { ...DEFAULT_TIMINGS, ...options.timings };
        this.now = options.now ?? Date.now;
        this.rules = new Map(options.types.map(t => [t.id, t.rule]));
        this.cursors = options.cursors.load();
    }

    start(): void {
        if (this.running) return;
        this.running = true;
        const { visibility } = this.options;
        this.cleanups.push(
            visibility.onChange(visible => { void (visible ? this.onVisible() : this.onHidden()); }),
            visibility.onPageHide(() => { void this.flush(); }),
        );
        if (visibility.isVisible()) void this.onVisible();
        this.schedule();
    }

    async stop(): Promise<void> {
        if (!this.running) return;
        this.running = false;
        this.cleanups.forEach(cleanup => cleanup());
        this.cleanups = [];
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        this.detach();
        await this.serial(() => this.options.transport.setWatching(this.options.deviceId, null)).catch(() => undefined);
    }

    /**
     * Delete all sync data in the cloud and start over from this device: its
     * tracking copy and cursors are cleared, so its next upload is everything
     * it has. Other devices keep their data.
     */
    resetCloud(): Promise<void> {
        return this.serial(async () => {
            await this.options.transport.clear();
            await this.options.tracker.reset();
            this.cursors = {};
            this.options.cursors.save(this.cursors);
            this.lastLogBytes = 0;
            await this.upload();
        });
    }

    /** Capture local changes and upload them now. */
    flush(): Promise<void> {
        return this.serial(() => this.upload());
    }

    private serial<T>(task: () => Promise<T>): Promise<T> {
        const run = this.queue.then(task, task);
        this.queue = run.catch(error => this.options.onError?.(error));
        return run;
    }

    private schedule(): void {
        if (this.timer) clearTimeout(this.timer);
        if (!this.running) return;
        const interval = this.watchedByOthers ? this.timings.watchingMs : this.timings.idleMs;
        this.timer = setTimeout(() => {
            void this.flush().finally(() => this.schedule());
        }, interval);
    }

    private async onVisible(): Promise<void> {
        if (!this.running) return;
        await this.serial(async () => {
            await this.options.transport.setWatching(this.options.deviceId, this.now());
            this.options.usage?.write(1);
        });
        this.attach();
    }

    private async onHidden(): Promise<void> {
        await this.flush();
        this.detach();
        await this.serial(async () => {
            await this.options.transport.setWatching(this.options.deviceId, null);
            this.options.usage?.write(1);
        });
    }

    private attach(): void {
        if (this.unsubscribeLog || !this.running) return;
        this.unsubscribeLog = this.options.transport.subscribeLog(
            log => { void this.serial(() => this.receive(log)).catch(error => this.failWaiters(error)); },
            error => {
                this.options.onError?.(error);
                this.failWaiters(error);
            },
        );
    }

    /** A redownload waiting for data that can't be applied fails instead of hanging. */
    private failWaiters(error: unknown): void {
        this.receiveWaiters.splice(0).forEach(waiter => waiter.reject(error));
    }

    private detach(): void {
        this.unsubscribeLog?.();
        this.unsubscribeLog = null;
    }

    private async receive(log: LogDoc): Promise<void> {
        const { deviceId, tracker, decryptionKey, locked, usage } = this.options;
        this.lastLogBytes = JSON.stringify(log.batches).length;
        usage?.read(1, this.lastLogBytes);

        const now = this.now();
        const watched = Object.entries(log.watching ?? {})
            .some(([device, since]) => device !== deviceId && now - since < this.timings.watchingTtlMs);
        if (watched !== this.watchedByOthers) {
            this.watchedByOthers = watched;
            this.schedule();
        }

        if (locked()) {
            this.failWaiters(new Error('Sync is locked: no passphrase'));
            return;
        }
        const key = decryptionKey();

        // Batches this device never saw were folded into the base: read it first.
        const behind = Object.entries(log.folded ?? {})
            .some(([device, seq]) => device !== deviceId && seq > (this.cursors[device] ?? 0));
        if (behind) {
            const base = await this.options.transport.readBase();
            usage?.read(1, base?.data.length ?? 0);
            if (base) {
                const records = await decodeRecords(base.data, base.encrypted, key);
                await tracker.apply(records);
                this.options.log?.(`Applied the base: ${records.length} records (${describe(records)})`);
                for (const [device, seq] of Object.entries(base.folded)) {
                    this.cursors[device] = Math.max(this.cursors[device] ?? 0, seq);
                }
            }
        }

        const fresh = log.batches
            .filter(b => b.device !== deviceId && b.toSeq > (this.cursors[b.device] ?? 0))
            .sort((a, b) => (a.stamp < b.stamp ? -1 : a.stamp > b.stamp ? 1 : 0));
        if (fresh.length > 0) {
            const records: UserRecord[] = [];
            for (const batch of fresh) records.push(...await decodeRecords(batch.data, batch.encrypted, key));
            await tracker.apply(records);
            const devices = [...new Set(fresh.map(b => b.device))].join(', ');
            this.options.log?.(`Applied ${records.length} records from ${devices}: ${describe(records)}`);
            for (const batch of fresh) {
                this.cursors[batch.device] = Math.max(this.cursors[batch.device] ?? 0, batch.toSeq);
            }
        }
        this.options.cursors.save(this.cursors);

        // Upload right after the first snapshot: this device merges what the
        // cloud has before its own data goes up, and doesn't wait a full interval.
        if (!this.received) {
            this.received = true;
            await this.upload();
        }
        this.receiveWaiters.splice(0).forEach(waiter => waiter.resolve());
    }

    /**
     * Apply other devices' interface and button settings here (copy from a
     * device, join a group) and upload the result as this device's own.
     */
    async applyDeviceValues(devices: string[]): Promise<boolean> {
        const found = await this.options.tracker.applyDeviceValues(devices);
        if (found) await this.flush();
        return found;
    }

    /**
     * Read everything in the cloud again (the base and every batch) and apply
     * it. Merging is idempotent, so this only fills in what this device lacks.
     * Resolves once the data is applied.
     */
    async redownload(): Promise<void> {
        if (!this.running) return;
        const applied = new Promise<void>((resolve, reject) => this.receiveWaiters.push({ resolve, reject }));
        await this.serial(async () => {
            this.cursors = {};
            this.options.cursors.save(this.cursors);
        });
        // A fresh subscription delivers the current log, now read from the start.
        this.detach();
        this.attach();
        await applied;
    }

    private async upload(): Promise<void> {
        const { deviceId, tracker, transport, encryptionKey, locked, usage } = this.options;
        if (locked()) return;
        await tracker.capture();
        const outbox = await tracker.outbox();
        if (outbox.length === 0) return;

        const toSeq = Math.max(...outbox.map(r => r.seq));
        const encoded = await encodeRecords(outbox, encryptionKey());
        if (encoded.data.length > this.timings.directFoldBytes) {
            await this.fold(outbox);
        } else {
            const batch: SyncBatch = {
                device: deviceId,
                fromSeq: Math.min(...outbox.map(r => r.seq)),
                toSeq,
                stamp: outbox.reduce((max, r) => (r.stamp > max ? r.stamp : max), ''),
                ...encoded,
            };
            await transport.appendBatch(batch);
            usage?.write(1, encoded.data.length);
            this.lastLogBytes += encoded.data.length;
        }
        await tracker.acknowledge(toSeq);
        this.options.log?.(`Uploaded ${outbox.length} records: ${describe(outbox)}`);

        if (this.lastLogBytes > this.timings.foldLogBytes) await this.fold([]);
    }

    /** Fold the whole log (plus `extra` records of this device) into the base. */
    private async fold(extra: UserRecord[]): Promise<void> {
        const { deviceId, transport, encryptionKey, decryptionKey, usage } = this.options;
        const key = decryptionKey();
        let baseBytes = 0;
        await transport.fold(async (base, log) => {
            const folded: Record<string, number> = { ...(base?.folded ?? {}), ...(log.folded ?? {}) };
            let records = base ? await decodeRecords(base.data, base.encrypted, key) : [];
            for (const batch of log.batches) {
                records = foldRecords(records, await decodeRecords(batch.data, batch.encrypted, key), this.rules);
                folded[batch.device] = Math.max(folded[batch.device] ?? 0, batch.toSeq);
            }
            if (extra.length > 0) {
                records = foldRecords(records, extra, this.rules);
                folded[deviceId] = Math.max(folded[deviceId] ?? 0, ...extra.map(r => r.seq));
            }
            const encoded = await encodeRecords(compactRecords(records, this.now()), encryptionKey());
            baseBytes = encoded.data.length;
            const next: BaseDoc = { schemaVersion: 1, folded, updatedAt: this.now(), ...encoded };
            return { base: next, keep: [], folded };
        });
        usage?.read(2);
        usage?.write(2, baseBytes);
        this.lastLogBytes = 0;
    }
}
