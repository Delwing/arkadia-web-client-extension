/**
 * Daily Firestore operation counters for sync v2, to check the free-tier
 * estimate (docs/dev/SYNC_V2_PLAN.md, section 9) against real sessions.
 * Stored in localStorage per day; read with getSyncUsage().
 */

import type { UsageCounter } from './engine';

export const USAGE_STORAGE_KEY = 'arkadia.syncV2.usage';

export interface DailyUsage {
    date: string;
    reads: number;
    writes: number;
    bytesDown: number;
    bytesUp: number;
}

function today(now: number): string {
    return new Date(now).toISOString().slice(0, 10);
}

export function getSyncUsage(now: number = Date.now()): DailyUsage {
    try {
        const stored = JSON.parse(localStorage.getItem(USAGE_STORAGE_KEY) ?? 'null') as DailyUsage | null;
        if (stored && stored.date === today(now)) return stored;
    } catch {
        // Corrupted counters start over
    }
    return { date: today(now), reads: 0, writes: 0, bytesDown: 0, bytesUp: 0 };
}

export function createUsageCounter(now: () => number = Date.now): UsageCounter {
    const add = (fields: Partial<Omit<DailyUsage, 'date'>>) => {
        const usage = getSyncUsage(now());
        for (const [field, value] of Object.entries(fields) as Array<[keyof Omit<DailyUsage, 'date'>, number]>) {
            usage[field] += value;
        }
        try {
            localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(usage));
        } catch {
            // Counters are diagnostics only
        }
    };
    return {
        read: (count, bytes = 0) => add({ reads: count, bytesDown: bytes }),
        write: (count, bytes = 0) => add({ writes: count, bytesUp: bytes }),
    };
}
