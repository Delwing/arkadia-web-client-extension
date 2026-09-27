/**
 * Improvement (postepy) data shared by the counter and its sync types.
 *
 * Both lists are tied to the game's object number (obj_num), which changes
 * with every login and death: a life is one object number. That is what lets
 * two devices playing the same session, one after the other, recognize each
 * other's records instead of counting them twice.
 */

export type ImproveEntry = {
    state: string;
    time: number;
    delta: number;
    killsMy: number;
    killsTeam: number;
};

/** Stored /postepy session (character key `improve_counter`). */
export type ImproveSessionData = {
    entries?: ImproveEntry[];
    lastTime?: number;
    lastKills?: { my: number; team: number };
    level?: number;
    lastObjNum?: number;
    waitingForFirstCombat?: boolean;
    /** Life the entries belong to; null after a reset, until the new life is known. */
    obj?: number | null;
    /** When this device first saw that life (or reset): the newer life wins a merge. */
    since?: number;
    /** /postepy_reset: entries of this life up to then are gone on every device. */
    clearedAt?: number;
};

export type LifeCount = { count: number; noFormCount?: number };

/** One day of /postepy2 (character key `improve_counter_lifetime`). */
export type LifetimeDay = {
    date: string;
    /** Manual edits, imports and counts from before improvements were tied to a life. */
    count: number;
    noFormCount?: number;
    /** Improvements counted automatically, per life (object number). */
    lives?: Record<string, LifeCount>;
};

function canonical(value: unknown): string {
    return JSON.stringify(value, (_key, val: unknown) => {
        if (val && typeof val === 'object' && !Array.isArray(val)) {
            return Object.fromEntries(Object.keys(val).sort().map(k => [k, (val as Record<string, unknown>)[k]]));
        }
        return val;
    }) ?? '';
}

function sessionObj(data: ImproveSessionData): number | null {
    return typeof data.obj === 'number' ? data.obj : null;
}

/**
 * Merge two versions of the /postepy session. Commutative and idempotent.
 * - The same life on both: entries are united (a level is reached once per
 *   life; the earlier record of it wins), so a device resuming the session
 *   keeps the times recorded on the other one.
 * - A known life beats an unknown one (a reset waiting for its new life).
 * - Different lives: the newer one (`since`) replaces the older.
 */
export function mergeImproveSessions(a: ImproveSessionData, b: ImproveSessionData): ImproveSessionData {
    const objA = sessionObj(a);
    const objB = sessionObj(b);
    if (objA !== objB || objA === null) {
        if (objA !== null && objB === null) return a;
        if (objB !== null && objA === null) return b;
        const sinceA = a.since ?? 0;
        const sinceB = b.since ?? 0;
        if (sinceA !== sinceB) return sinceA > sinceB ? a : b;
        return canonical(a) >= canonical(b) ? a : b;
    }

    const clearedAt = Math.max(a.clearedAt ?? 0, b.clearedAt ?? 0);
    const byState = new Map<string, ImproveEntry>();
    for (const entry of [...(a.entries ?? []), ...(b.entries ?? [])]) {
        if (entry.time <= clearedAt) continue;
        const current = byState.get(entry.state);
        if (!current || entry.time < current.time
            || (entry.time === current.time && canonical(entry) < canonical(current))) {
            byState.set(entry.state, entry);
        }
    }
    const entries = [...byState.values()].sort((x, y) => x.time - y.time || (x.state < y.state ? -1 : 1));

    // Time of the last improvement; without any, when counting started.
    // A side still waiting for its first fight hasn't started counting.
    let timeSide: ImproveSessionData;
    let lastTime: number;
    if (entries.length > 0) {
        const last = entries[entries.length - 1];
        lastTime = last.time;
        const owns = (s: ImproveSessionData): boolean => (s.entries ?? []).some(e => e.time === last.time && e.state === last.state);
        timeSide = owns(a) && owns(b) ? (canonical(a.lastKills) >= canonical(b.lastKills) ? a : b) : owns(a) ? a : b;
    } else {
        const started = [a, b].filter(s => !s.waitingForFirstCombat);
        const pool = started.length > 0 ? started : [a, b];
        timeSide = pool.reduce((x, y) => {
            const tx = x.lastTime ?? 0;
            const ty = y.lastTime ?? 0;
            if (tx !== ty) return tx < ty ? x : y;
            return canonical(x) <= canonical(y) ? x : y;
        });
        lastTime = timeSide.lastTime ?? 0;
    }

    const merged: ImproveSessionData = {
        entries,
        lastTime,
        level: Math.max(a.level ?? -1, b.level ?? -1),
        lastObjNum: objA,
        waitingForFirstCombat: !!a.waitingForFirstCombat && !!b.waitingForFirstCombat && entries.length === 0,
        obj: objA,
        since: Math.min(a.since ?? Infinity, b.since ?? Infinity),
    };
    if (timeSide.lastKills) merged.lastKills = timeSide.lastKills;
    if (clearedAt > 0) merged.clearedAt = clearedAt;
    if (!Number.isFinite(merged.since)) delete merged.since;
    return merged;
}

/** Field-wise maximum: every device counting the same life's levels counts the same improvements. */
export function mergeLifeCounts(a: LifeCount, b: LifeCount): LifeCount {
    const merged: LifeCount = { count: Math.max(a.count ?? 0, b.count ?? 0) };
    const noForm = Math.max(a.noFormCount ?? 0, b.noFormCount ?? 0);
    if (noForm > 0) merged.noFormCount = noForm;
    return merged;
}

/** A day's totals: manual counts plus every life's. */
export function dayTotals(day: LifetimeDay): { count: number; noFormCount: number } {
    let count = day.count ?? 0;
    let noFormCount = day.noFormCount ?? 0;
    for (const life of Object.values(day.lives ?? {})) {
        count += life.count ?? 0;
        noFormCount += life.noFormCount ?? 0;
    }
    return { count, noFormCount };
}

/** Improvements counted for one life, over all days. */
export function lifeTotal(days: LifetimeDay[], obj: number): number {
    let total = 0;
    for (const day of days) {
        const life = day.lives?.[String(obj)];
        if (life) total += (life.count ?? 0) + (life.noFormCount ?? 0);
    }
    return total;
}

export function lifetimeDateOrder(date: string): number {
    const [y, m, d] = date.split('/').map(Number);
    return (y || 0) * 10_000 + (m || 0) * 100 + (d || 0);
}
