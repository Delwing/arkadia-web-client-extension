/**
 * Each log's search text (`SearchText`), kept so an All-logs search reads it
 * instead of parsing the log.
 *
 * A database of its own (`ArkadiaLogSearchDB`) rather than a store in
 * `ArkadiaLogsDB`: adding one there is a version upgrade, which waits for every
 * tab's logger to let go and would stop an older tab still running its old
 * build from logging at all. Everything here can be rebuilt from the logs, so
 * this database can be lost or deleted at any time and costs only a slower
 * first search.
 *
 * An entry carries the record count it was built at; one whose log has a
 * different count is stale and is built again.
 */
import type { SearchText } from "@ui/logViewer";

export const SEARCH_DB_NAME = "ArkadiaLogSearchDB";
const SEARCH_DB_VERSION = 1;
const TEXTS = "texts";

export interface StoredSearchText extends SearchText {
    /** Record count of the log when this was built. */
    count: number;
}

function open(): Promise<IDBDatabase | null> {
    return new Promise((resolve) => {
        try {
            const request = indexedDB.open(SEARCH_DB_NAME, SEARCH_DB_VERSION);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(TEXTS)) request.result.createObjectStore(TEXTS);
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

/**
 * One reader's connection, opened on first use. Every failure reads as "not
 * stored": the caller then parses the log, as it would without this.
 */
export class SearchTextStore {
    private db: Promise<IDBDatabase | null> | null = null;
    private released = false;

    private connection(): Promise<IDBDatabase | null> {
        if (this.released) return Promise.resolve(null);
        this.db ??= open().then((db) => {
            if (db) {
                db.onversionchange = () => {
                    db.close();
                    this.db = null;
                };
                db.onclose = () => {
                    this.db = null;
                };
            }
            if (this.released) {
                db?.close();
                return null;
            }
            return db;
        });
        return this.db;
    }

    async get(id: string): Promise<StoredSearchText | null> {
        const db = await this.connection();
        if (!db) return null;
        return new Promise((resolve) => {
            try {
                const request = db.transaction(TEXTS, "readonly").objectStore(TEXTS).get(id);
                request.onsuccess = () => resolve((request.result as StoredSearchText | undefined) ?? null);
                request.onerror = () => resolve(null);
            } catch {
                resolve(null);
            }
        });
    }

    /** Stores an entry. Fire and forget: a failed write costs a later re-read. */
    async put(id: string, entry: StoredSearchText): Promise<void> {
        const db = await this.connection();
        if (!db) return;
        await new Promise<void>((resolve) => {
            try {
                const tx = db.transaction(TEXTS, "readwrite");
                tx.objectStore(TEXTS).put(entry, id);
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
                tx.onabort = () => resolve();
            } catch {
                resolve();
            }
        });
    }

    /** Drops the entries of logs that are no longer stored. */
    async prune(keep: ReadonlySet<string>): Promise<void> {
        const db = await this.connection();
        if (!db) return;
        await new Promise<void>((resolve) => {
            try {
                const tx = db.transaction(TEXTS, "readwrite");
                const store = tx.objectStore(TEXTS);
                const request = store.getAllKeys();
                request.onsuccess = () => {
                    for (const key of request.result) {
                        if (typeof key === "string" && !keep.has(key)) store.delete(key);
                    }
                };
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
                tx.onabort = () => resolve();
            } catch {
                resolve();
            }
        });
    }

    release(): void {
        this.released = true;
        const pending = this.db;
        this.db = null;
        void pending?.then((db) => db?.close());
    }
}
