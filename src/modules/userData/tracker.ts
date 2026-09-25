/**
 * Change tracking for synced data. See docs/dev/SYNC_V2_PLAN.md, section 6.
 *
 * - capture: compare each type's local items with the tracking copy; new or
 *   changed items become records stamped by this device and queued in the
 *   outbox.
 * - apply: merge records from other devices into the tracking copy and write
 *   items whose merged value differs from local data through the adapter.
 *
 * Capture and apply run one at a time, and apply captures the affected type
 * first, so a local edit not captured yet is never overwritten by an older
 * remote version.
 */

import { formatStamp, type HybridLogicalClock } from './hlc';
import type { RecordStore } from './recordStore';
import {
    counterTotal,
    recordId,
    resolve,
    sameRecord,
    valuesEqual,
    type CounterSlots,
    type UserRecord,
} from './records';
import { deviceFromScope, deviceScope, type ItemChange, type LocalItem, type UserDataType } from './types';

export interface TrackerOptions {
    deviceId: string;
    types: UserDataType[];
    store: RecordStore;
    clock: HybridLogicalClock;
    /**
     * Whether device-scoped values from another device apply here (it is in
     * this device's sync group). This device's own values always apply.
     */
    appliesFromDevice?: (deviceId: string) => boolean;
    /**
     * Types whose first capture on this device records real edits rather than
     * data from before sync (e.g. changes never uploaded by the previous sync):
     * they get normal stamps instead of the lowest ones.
     */
    firstCaptureIsEdit?: (typeId: string) => boolean;
    /** A type failed to capture or apply; the other types went on. Logged by default. */
    onError?: (typeId: string, stage: 'capture' | 'apply', error: unknown) => void;
}

type Draft = Omit<UserRecord, 'seq'>;

/** A type's capture or apply taking longer than this is reported in the console. */
const SLOW_TYPE_MS = 15_000;

/** Counter values without zero fields, so `{a: 0}` equals `{}`. */
function nonZero(values: Record<string, number> | undefined): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [field, n] of Object.entries(values ?? {})) {
        if (n !== 0) result[field] = n;
    }
    return result;
}

function fieldMax(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
    const result: Record<string, number> = { ...a };
    for (const [field, n] of Object.entries(b)) result[field] = Math.max(result[field] ?? 0, n);
    return nonZero(result);
}

function subtract(total: Record<string, number>, others: Record<string, number>): Record<string, number> {
    const result: Record<string, number> = {};
    for (const field of new Set([...Object.keys(total), ...Object.keys(others)])) {
        result[field] = (total[field] ?? 0) - (others[field] ?? 0);
    }
    return nonZero(result);
}

export class UserDataTracker {
    private readonly types: Map<string, UserDataType>;
    private queue: Promise<unknown> = Promise.resolve();

    constructor(private readonly options: TrackerOptions) {
        this.types = new Map(options.types.map(t => [t.id, t]));
    }

    /** Capture local changes of the given types (all by default). Returns the new records. */
    capture(typeIds?: string[]): Promise<UserRecord[]> {
        return this.serial(async () => {
            const records: UserRecord[] = [];
            for (const type of this.selectTypes(typeIds)) {
                try {
                    records.push(...await this.watch(type, 'capture', () => this.captureType(type)));
                } catch (error) {
                    this.reportError(type, 'capture', error);
                }
            }
            return records;
        });
    }

    /**
     * Merge records from other devices and write the results to local data.
     * `fromCloud`: the records are the cloud state this device starts from
     * (after another device replaced the cloud data): on first contact,
     * counters take the cloud count instead of the higher of the two.
     */
    apply(records: UserRecord[], options: { fromCloud?: boolean } = {}): Promise<void> {
        return this.serial(async () => {
            const byType = new Map<string, UserRecord[]>();
            for (const record of records) {
                this.options.clock.receive(record.stamp);
                const list = byType.get(record.type) ?? [];
                list.push(record);
                byType.set(record.type, list);
            }
            // Each type is applied even when another fails; then the failure
            // is reported so the records are delivered again (merging is
            // idempotent) and the failed type is retried.
            const failed: string[] = [];
            for (const [typeId, typeRecords] of byType) {
                const type = this.types.get(typeId);
                // Types this version doesn't know are skipped; a newer client
                // will pick them up from the cloud.
                if (!type) continue;
                // Capture first so an uncaptured local edit isn't overwritten by
                // an older remote version. Except on first contact with data
                // never captured on this device, which predates sync:
                // - newest: the remote version wins, and what only this device
                //   has is captured right after;
                // - counter: local counts are mostly the same counts the other
                //   devices already hold (copied by the previous sync), so
                //   they merge by maximum and only the excess becomes this
                //   device's own count. Captured first, they would be added
                //   on top and every count would double.
                // Other rules merge, so capturing first loses nothing.
                try {
                    await this.watch(type, 'apply', async () => {
                        const firstContact = (type.rule.kind === 'newest' || type.rule.kind === 'counter')
                            && !(await this.options.store.isSeeded(type.id));
                        if (!firstContact) await this.captureType(type);
                        await this.applyType(type, typeRecords, firstContact && !options.fromCloud);
                        if (firstContact) await this.captureType(type);
                    });
                } catch (error) {
                    this.reportError(type, 'apply', error);
                    failed.push(type.id);
                }
            }
            if (failed.length > 0) throw new Error(`Failed to apply ${failed.join(', ')}`);
        });
    }

    /** This device's records waiting for upload, oldest first. */
    outbox(): Promise<UserRecord[]> {
        return this.options.store.getOutbox();
    }

    /**
     * Apply device-scoped values (interface, buttons) of the given devices here:
     * per item, the newest among them. For copying another device's settings
     * and for joining a sync group. Returns whether any value was found.
     */
    applyDeviceValues(devices: string[]): Promise<boolean> {
        return this.serial(async () => {
            const scopes = new Set(devices.map(deviceScope));
            const ownScope = deviceScope(this.options.deviceId);
            let found = false;
            for (const type of this.types.values()) {
                if (type.scope !== 'device') continue;
                const newest = new Map<string, UserRecord>();
                for (const record of await this.options.store.getRecords(type.id)) {
                    if (record.deleted || !scopes.has(record.scope)) continue;
                    const current = newest.get(record.key);
                    if (!current || record.stamp > current.stamp) newest.set(record.key, record);
                }
                if (newest.size === 0) continue;
                found = true;
                const local = new Map((await type.read()).map(item => [recordId(item), item]));
                const writes: ItemChange[] = [];
                const sources = new Map<string, UserRecord>();
                for (const [key, record] of newest) {
                    const item = local.get(recordId({ scope: ownScope, key }));
                    if (!item || !valuesEqual(item.value, record.value)) {
                        writes.push({ scope: ownScope, key, value: record.value });
                        sources.set(key, record);
                    }
                }
                if (writes.length > 0) await type.write(writes);
                await this.adopt(type, sources);
            }
            return found;
        });
    }

    /** Forget the tracking copy and the outbox; the next capture seeds from local data again. */
    reset(): Promise<void> {
        return this.serial(() => this.options.store.clear());
    }

    /** Records up to and including `seq` were uploaded. */
    acknowledge(uptoSeq: number): Promise<void> {
        return this.serial(() => this.options.store.removeOutbox(uptoSeq));
    }

    /**
     * Run one type's capture or apply, warning while it takes unusually long:
     * everything after it waits, so a stuck type is worth naming.
     */
    private async watch<T>(type: UserDataType, stage: 'capture' | 'apply', work: () => Promise<T>): Promise<T> {
        const started = Date.now();
        const timer = setInterval(() => {
            console.warn(`[UserData] ${stage} of ${type.id} still running after ${Math.round((Date.now() - started) / 1000)} s`);
        }, SLOW_TYPE_MS);
        try {
            return await work();
        } finally {
            clearInterval(timer);
        }
    }

    /** One type failing (bad local data, storage errors) doesn't stop the others from syncing. */
    private reportError(type: UserDataType, stage: 'capture' | 'apply', error: unknown): void {
        if (this.options.onError) this.options.onError(type.id, stage, error);
        else console.error(`[UserData] ${stage} of ${type.id} failed:`, error);
    }

    private serial<T>(task: () => Promise<T>): Promise<T> {
        const run = this.queue.then(task, task);
        this.queue = run.catch(() => undefined);
        return run;
    }

    private selectTypes(typeIds?: string[]): UserDataType[] {
        if (!typeIds) return [...this.types.values()];
        return typeIds.map(id => this.types.get(id)).filter((t): t is UserDataType => !!t);
    }

    private ownScope(type: UserDataType, scope: string): boolean {
        return type.scope !== 'device' || scope === deviceScope(this.options.deviceId);
    }

    private async captureType(type: UserDataType): Promise<UserRecord[]> {
        const { store, clock, deviceId } = this.options;
        const localItems = await type.read();
        const local = new Map(localItems.map(item => [recordId(item), item]));
        const tracked = new Map((await store.getRecords(type.id)).map(r => [recordId(r), r]));

        // A type's first capture on this device (its seed) records data that
        // existed before sync, not edits: it gets the lowest stamps, so on
        // first contact the other devices' versions win and data only this
        // device has is still added. Otherwise a fresh device's defaults
        // would overwrite the user's real settings.
        const firstCapture = !(await store.isSeeded(type.id));
        const seeding = firstCapture && !this.options.firstCaptureIsEdit?.(type.id);
        let seedCounter = 0;
        const stamp = (): string => seeding
            ? formatStamp({ wall: 0, counter: seedCounter++, device: deviceId })
            : clock.tick();

        const drafts: Draft[] = [];
        const draft = (item: { scope: string; key: string }, fields: Partial<Draft>): void => {
            drafts.push({ type: type.id, scope: item.scope, key: item.key, stamp: stamp(), origin: deviceId, ...fields });
        };

        for (const [id, item] of local) {
            const current = tracked.get(id);
            if (type.rule.kind === 'counter') {
                const slots = (current?.value ?? {}) as CounterSlots;
                const others: CounterSlots = { ...slots };
                delete others[deviceId];
                const mine = subtract(nonZero(item.value as Record<string, number>), counterTotal(others));
                if (current && valuesEqual(nonZero(slots[deviceId]?.v), mine)) continue;
                const slotStamp = stamp();
                drafts.push({
                    type: type.id, scope: item.scope, key: item.key, stamp: slotStamp, origin: deviceId,
                    value: { [deviceId]: { v: mine, s: slotStamp } },
                });
                continue;
            }
            if (current && !current.deleted && valuesEqual(current.value, item.value)) continue;
            draft(item, { value: item.value });
        }

        const writes: ItemChange[] = [];
        for (const [id, current] of tracked) {
            if (local.has(id) || current.deleted || !this.ownScope(type, current.scope)) continue;
            if (type.scope === 'device') continue;
            if (type.deletable) {
                draft(current, { deleted: true });
            } else {
                // Accumulated data has no reset: restore what local storage lost.
                if (type.rule.kind === 'counter') {
                    writes.push({ scope: current.scope, key: current.key, value: counterTotal(current.value as CounterSlots), previous: {} });
                } else {
                    writes.push({ scope: current.scope, key: current.key, value: current.value });
                }
            }
        }

        if (firstCapture) await store.markSeeded(type.id);
        if (drafts.length === 0) {
            if (writes.length > 0) await type.write(writes);
            return [];
        }

        const firstSeq = await store.reserveSeq(drafts.length);
        const own: UserRecord[] = drafts.map((d, i) => ({ ...d, seq: firstSeq + i }));
        const merged: UserRecord[] = [];
        const accepted: UserRecord[] = [];
        for (const record of own) {
            const id = recordId(record);
            const current = tracked.get(id);
            const resolved = current ? resolve(type.rule, current, record) : record;
            // A local value that loses the merge (e.g. progress going back
            // under max) changes nothing and isn't uploaded.
            if (!sameRecord(resolved, current)) {
                merged.push(resolved);
                accepted.push(record);
            }
            // The merge can differ from the local value (e.g. an earlier
            // level-up already known): bring local data in line, or the same
            // local value would be captured again on every tick.
            const item = local.get(id);
            if (type.rule.kind !== 'counter' && !resolved.deleted && item && !valuesEqual(resolved.value, item.value)) {
                writes.push({ scope: resolved.scope, key: resolved.key, value: resolved.value });
            }
        }

        if (writes.length > 0) await type.write(writes);
        await store.putRecords(merged);
        await store.putOutbox(accepted);
        return accepted;
    }

    private async applyType(type: UserDataType, incoming: UserRecord[], firstContact = false): Promise<void> {
        const { store } = this.options;
        const tracked = new Map((await store.getRecords(type.id)).map(r => [recordId(r), r]));
        const changed: UserRecord[] = [];
        for (const record of incoming) {
            const id = recordId(record);
            const current = tracked.get(id);
            const resolved = current ? resolve(type.rule, current, record) : record;
            if (sameRecord(resolved, current)) continue;
            tracked.set(id, resolved);
            changed.push(resolved);
        }
        if (changed.length === 0) return;

        const local = new Map((await type.read()).map(item => [recordId(item), item]));
        const sources = new Map<string, UserRecord>();
        const writes = type.scope === 'device'
            ? this.deviceWrites(tracked, changed, local, sources)
            : this.sharedWrites(type, changed, local, firstContact);

        // Local data first: if writing fails, the tracking copy keeps the old
        // record and nothing claims the new value is applied.
        if (writes.length > 0) await type.write(writes);
        await store.putRecords(changed);
        await this.adopt(type, sources);
    }

    /**
     * After another device's value was written here (`sources`, by key), take
     * what local data now holds as this device's value, under the source's
     * stamp: the UI may normalize an applied value (the layout re-saved by the
     * window manager), and that is not a new edit. With a fresh stamp it would
     * win over the next change made on the other device, and bounce back and
     * forth between devices that normalize differently. Not uploaded.
     */
    private async adopt(type: UserDataType, sources: Map<string, UserRecord>): Promise<void> {
        if (sources.size === 0) return;
        const ownScope = deviceScope(this.options.deviceId);
        const local = new Map((await type.read()).map(item => [recordId(item), item]));
        const adopted: UserRecord[] = [];
        for (const [key, source] of sources) {
            const item = local.get(recordId({ scope: ownScope, key }));
            adopted.push({
                type: type.id,
                scope: ownScope,
                key,
                value: item ? item.value : source.value,
                stamp: source.stamp,
                origin: source.origin,
                seq: 0,
            });
        }
        await this.options.store.putRecords(adopted);
    }

    private sharedWrites(
        type: UserDataType,
        changed: UserRecord[],
        local: Map<string, LocalItem>,
        firstContact: boolean,
    ): ItemChange[] {
        const writes: ItemChange[] = [];
        for (const record of changed) {
            const item = local.get(recordId(record));
            if (type.rule.kind === 'counter') {
                const previous = nonZero(item?.value as Record<string, number>);
                const remote = counterTotal(record.value as CounterSlots);
                const total = firstContact ? fieldMax(remote, previous) : remote;
                if (!valuesEqual(nonZero(total), previous)) {
                    writes.push({ scope: record.scope, key: record.key, value: total, previous });
                }
            } else if (record.deleted) {
                if (item) writes.push({ scope: record.scope, key: record.key, deleted: true });
            } else if (!item || !valuesEqual(item.value, record.value)) {
                writes.push({ scope: record.scope, key: record.key, value: record.value });
            }
        }
        return writes;
    }

    /**
     * Device-scoped values: the newest value among this device and the devices
     * of its sync group is the one used here.
     */
    private deviceWrites(
        tracked: Map<string, UserRecord>,
        changed: UserRecord[],
        local: Map<string, LocalItem>,
        sources: Map<string, UserRecord>,
    ): ItemChange[] {
        const { deviceId, appliesFromDevice } = this.options;
        const applies = (scope: string): boolean => {
            const device = deviceFromScope(scope);
            return device === deviceId || (!!device && !!appliesFromDevice?.(device));
        };
        const ownScope = deviceScope(deviceId);
        const writes: ItemChange[] = [];
        const keys = new Set(changed.filter(r => applies(r.scope)).map(r => r.key));
        for (const key of keys) {
            let effective: UserRecord | undefined;
            for (const record of tracked.values()) {
                if (record.key !== key || record.deleted || !applies(record.scope)) continue;
                // An adopted value shares its source's stamp: this device's copy wins the tie.
                if (!effective || record.stamp > effective.stamp
                    || (record.stamp === effective.stamp && record.scope === ownScope)) effective = record;
            }
            if (!effective || effective.scope === ownScope) continue;
            const item = local.get(recordId({ scope: ownScope, key }));
            if (!item || !valuesEqual(item.value, effective.value)) {
                writes.push({ scope: ownScope, key, value: effective.value });
                sources.set(key, effective);
            }
        }
        return writes;
    }
}
