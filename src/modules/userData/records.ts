/**
 * Sync records and merge rules. See docs/dev/SYNC_V2_PLAN.md, sections 5 and 6.
 *
 * Every rule is order-independent and idempotent: resolve(a, b) equals
 * resolve(b, a), and resolving a record with itself returns it. That is what
 * lets records arrive in any order, more than once, from any device.
 */

export interface UserRecord<V = unknown> {
    /** Registry type, e.g. 'aliases'. */
    type: string;
    /** 'global' | `char:${name}` | `device:${deviceId}` */
    scope: string;
    /** Item key within the type and scope, e.g. an alias id. */
    key: string;
    /** Absent when deleted. */
    value?: V;
    deleted?: true;
    /** HLC stamp of this version. */
    stamp: string;
    /** Device that produced this version. */
    origin: string;
    /** The origin's local sequence number. */
    seq: number;
}

/** One device's contribution to a counter: its values and when it last changed them. */
export interface CounterSlot {
    v: Record<string, number>;
    s: string;
}

/** Counter record value: one slot per device. The counted value is the sum of the slots. */
export type CounterSlots = Record<string, CounterSlot>;

export type MergeRule<V = unknown> =
    /** Highest stamp wins. Things the user edits, and the latest reading of game state. */
    | { kind: 'newest' }
    /**
     * Lowest time wins: an observed transition, first seen is when it happened.
     * `time` reads the event's own timestamp from the value; ties and values
     * without one fall back to the stamp.
     */
    | { kind: 'earliest'; time?: (value: V) => number | undefined }
    /** The same fact seen by two devices is one item; any copy will do. */
    | { kind: 'union' }
    /** The value further along in `compare` order wins (max), or the lower one (min). */
    | { kind: 'max' | 'min'; compare: (a: V, b: V) => number }
    /** Per-device slots, summed. Local values are `Record<field, number>`. */
    | { kind: 'counter' }
    /** Field-level or domain merge. `merge` must be commutative and idempotent. */
    | { kind: 'custom'; merge: (a: V, b: V) => V };

export function recordId(record: { scope: string; key: string }): string {
    return `${record.scope}\u0000${record.key}`;
}

/** JSON with object keys sorted, so equal values serialize identically. */
export function canonicalJson(value: unknown): string {
    return JSON.stringify(value, (_key, val: unknown) => {
        if (val && typeof val === 'object' && !Array.isArray(val)) {
            const sorted: Record<string, unknown> = {};
            for (const key of Object.keys(val as Record<string, unknown>).sort()) {
                sorted[key] = (val as Record<string, unknown>)[key];
            }
            return sorted;
        }
        return val;
    }) ?? 'undefined';
}

export function valuesEqual(a: unknown, b: unknown): boolean {
    return a === b || canonicalJson(a) === canonicalJson(b);
}

export function sameRecord(a: UserRecord | undefined, b: UserRecord | undefined): boolean {
    if (!a || !b) return a === b;
    return a.stamp === b.stamp
        && a.origin === b.origin
        && !!a.deleted === !!b.deleted
        && valuesEqual(a.value, b.value);
}

function newer(a: UserRecord, b: UserRecord): UserRecord {
    if (a.stamp !== b.stamp) return a.stamp > b.stamp ? a : b;
    // Same stamp means same device and moment; pick deterministically.
    return canonicalJson(a.value) >= canonicalJson(b.value) ? a : b;
}

function older(a: UserRecord, b: UserRecord): UserRecord {
    return newer(a, b) === a ? b : a;
}

export function mergeCounterSlots(a: CounterSlots = {}, b: CounterSlots = {}): CounterSlots {
    const merged: CounterSlots = { ...a };
    for (const [device, slot] of Object.entries(b)) {
        const current = merged[device];
        if (!current || slot.s > current.s || (slot.s === current.s && canonicalJson(slot.v) > canonicalJson(current.v))) {
            merged[device] = slot;
        }
    }
    return merged;
}

/** The counted value: the sum of all slots, field by field. */
export function counterTotal(slots: CounterSlots | undefined): Record<string, number> {
    const total: Record<string, number> = {};
    for (const slot of Object.values(slots ?? {})) {
        for (const [field, n] of Object.entries(slot.v)) {
            total[field] = (total[field] ?? 0) + n;
        }
    }
    return total;
}

/**
 * Merge two versions of the same item. Metadata (stamp, origin, seq) comes
 * from the newer record, so the result is the same whichever arrives first.
 */
export function resolve<V>(rule: MergeRule<V>, a: UserRecord<V>, b: UserRecord<V>): UserRecord<V> {
    if (rule.kind === 'newest') {
        return newer(a, b) as UserRecord<V>;
    }

    // Only user-edited (newest) data can be deleted; elsewhere a tombstone
    // never wins over a value.
    if (a.deleted && !b.deleted) return b;
    if (b.deleted && !a.deleted) return a;
    if (a.deleted && b.deleted) return newer(a, b) as UserRecord<V>;

    switch (rule.kind) {
        case 'earliest': {
            const ta = rule.time?.(a.value as V);
            const tb = rule.time?.(b.value as V);
            if (ta !== undefined && tb !== undefined && ta !== tb) return ta < tb ? a : b;
            return older(a, b) as UserRecord<V>;
        }
        case 'union':
            return older(a, b) as UserRecord<V>;
        case 'max':
        case 'min': {
            const cmp = rule.compare(a.value as V, b.value as V);
            if (cmp === 0) return newer(a, b) as UserRecord<V>;
            const aWins = rule.kind === 'max' ? cmp > 0 : cmp < 0;
            return aWins ? a : b;
        }
        case 'counter': {
            const winner = newer(a, b);
            const slots = mergeCounterSlots(a.value as CounterSlots, b.value as CounterSlots);
            return valuesEqual(slots, winner.value) ? winner as UserRecord<V> : { ...winner, value: slots } as UserRecord<V>;
        }
        case 'custom': {
            const winner = newer(a, b) as UserRecord<V>;
            const merged = rule.merge(a.value as V, b.value as V);
            return valuesEqual(merged, winner.value) ? winner : { ...winner, value: merged };
        }
    }
}
