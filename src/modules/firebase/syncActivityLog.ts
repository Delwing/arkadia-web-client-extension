/**
 * Sync activity log: the last few things synchronization did in this tab
 * (uploads, applied changes, errors, starts and pauses), shown at the bottom
 * of the cloud sync page. Kept in memory only — it starts empty on reload.
 */

export type SyncActivityLevel = 'info' | 'success' | 'warning' | 'error';

export interface SyncActivityEntry {
    id: number;
    at: number;
    level: SyncActivityLevel;
    text: string;
}

const MAX_ENTRIES = 100;

let entries: SyncActivityEntry[] = [];
let nextId = 1;
const listeners = new Set<(entries: SyncActivityEntry[]) => void>();

export function logSyncActivity(level: SyncActivityLevel, text: string, at = Date.now()): void {
    entries = [...entries, { id: nextId++, at, level, text }].slice(-MAX_ENTRIES);
    listeners.forEach(listener => listener(entries));
}

/** Oldest first. */
export function getSyncActivity(): SyncActivityEntry[] {
    return entries;
}

export function onSyncActivity(listener: (entries: SyncActivityEntry[]) => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export function clearSyncActivity(): void {
    entries = [];
    listeners.forEach(listener => listener(entries));
}
