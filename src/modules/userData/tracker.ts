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
}

type Draft = Omit<UserRecord, 'seq'>;

/** Counter values without zero fields, so `{a: 0}` equals `{}`. */
function nonZero(values: Record<string, number> | undefined): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [field, n] of Object.entries(values ?? {})) {
        if (n !== 0) result[field] = n;
    }
    return result;
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
                records.push(...await this.captureType(type));
            }
            return records;
        });
    }

    /** Merge records from other devices and write the results to local data. */
    apply(records: UserRecord[]): Promise<void> {
        return this.serial(async () => {
            const byType = new Map<string, UserRecord[]>();
            for (const record of records) {
                this.options.clock.receive(record.stamp);
                const list = byType.get(record.type) ?? [];
                list.push(record);
                byType.set(record.type, list);
            }
            for (const [typeId, typeRecords] of byType) {
                const type = this.types.get(typeId);
                // Types this version doesn't know are skipped; a newer client
                // will pick them up from the cloud.
                if (!type) continue;
                // Capture first so an uncaptured local edit isn't overwritten by
                // an older remote version. Except for newest-wins data never
                // captured on this device: that predates sync, so the remote
                // version wins, and what only this device has is captured right
                // after. Other rules merge, so capturing first loses nothing
                // (and counters need this device's own count captured first).
                const firstContact = type.rule.kind === 'newest' && !(await this.options.store.isSeeded(type.id));
                if (!firstContact) await this.captureType(type);
                await this.applyType(type, typeRecords);
                if (firstContact) await this.captureType(type);
            }
        });
    }

    /** This device's records waiting for upload, oldest first. */
    outbox(): Promise<UserRecord[]> {
        return this.options.store.getOutbox();
    }

    /** Records up to and including `seq` were uploaded. */
    acknowledge(uptoSeq: number): Promise<void> {
        return this.serial(() => this.options.store.removeOutbox(uptoSeq));
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
        const seeding = !(await store.isSeeded(type.id));
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

        if (seeding) await store.markSeeded(type.id);
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

    private async applyType(type: UserDataType, incoming: UserRecord[]): Promise<void> {
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
        const writes = type.scope === 'device'
            ? this.deviceWrites(tracked, changed, local)
            : this.sharedWrites(type, changed, local);

        // Local data first: if writing fails, the tracking copy keeps the old
        // record and nothing claims the new value is applied.
        if (writes.length > 0) await type.write(writes);
        await store.putRecords(changed);
    }

    private sharedWrites(type: UserDataType, changed: UserRecord[], local: Map<string, LocalItem>): ItemChange[] {
        const writes: ItemChange[] = [];
        for (const record of changed) {
            const item = local.get(recordId(record));
            if (type.rule.kind === 'counter') {
                const total = counterTotal(record.value as CounterSlots);
                const previous = nonZero(item?.value as Record<string, number>);
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
    private deviceWrites(tracked: Map<string, UserRecord>, changed: UserRecord[], local: Map<string, LocalItem>): ItemChange[] {
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
                if (!effective || record.stamp > effective.stamp) effective = record;
            }
            if (!effective) continue;
            const item = local.get(recordId({ scope: ownScope, key }));
            if (!item || !valuesEqual(item.value, effective.value)) {
                writes.push({ scope: ownScope, key, value: effective.value });
            }
        }
        return writes;
    }
}
