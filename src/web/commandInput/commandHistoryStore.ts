/**
 * Persistence seam for command history. The engine keeps the in-memory history
 * ring; a store just loads/saves the newest-first list (no sentinel — that's an
 * engine-internal detail).
 *
 * The default `localStorageHistoryStore` keeps history under a single shared key
 * so every UI on the same profile (stock web + alt-ui) reads and writes one
 * history. History is device-local by nature, so it is intentionally *not*
 * routed through the synced settings slices.
 */
export interface CommandHistoryStore {
    /** Load persisted entries, newest-first, without the sentinel. */
    load(): string[];
    /** Persist entries, newest-first, without the sentinel. */
    save(entries: string[]): void;
}

const DEFAULT_KEY = 'commandHistory';
const DEFAULT_MAX_ENTRIES = 1000;

export function localStorageHistoryStore(
    key: string = DEFAULT_KEY,
    maxEntries: number = DEFAULT_MAX_ENTRIES,
): CommandHistoryStore {
    return {
        load(): string[] {
            try {
                const stored = localStorage.getItem(key);
                if (!stored) return [];
                const parsed = JSON.parse(stored);
                if (!Array.isArray(parsed)) return [];
                return parsed.filter((e: unknown): e is string => typeof e === 'string' && e !== '');
            } catch {
                // ignore corrupt storage
                return [];
            }
        },
        save(entries: string[]): void {
            try {
                localStorage.setItem(key, JSON.stringify(entries.slice(0, maxEntries)));
            } catch {
                // ignore storage errors (quota, private mode, etc.)
            }
        },
    };
}
