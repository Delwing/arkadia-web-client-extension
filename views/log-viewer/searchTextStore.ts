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
 *
 * The text is stored deflate-compressed (`packed`): game text repeats a lot,
 * and measured on real logs it takes about a third of the room the browser's
 * own compression leaves it (1.15 MB against 3.68 MB for 8.65 M characters).
 * Unpacking costs about 3 ms per million characters on a search. An entry
 * stored plain by an earlier build is still read, and packed when it is.
 */
import type { SearchText } from "@ui/logViewer";

export const SEARCH_DB_NAME = "ArkadiaLogSearchDB";
const SEARCH_DB_VERSION = 1;
const TEXTS = "texts";

export interface StoredSearchText extends SearchText {
    /** Record count of the log when this was built. */
    count: number;
}

/** An entry as stored: its text packed, or plain in one from before packing. */
type StoredRecord = Omit<StoredSearchText, "text"> & { text?: string; packed?: Uint8Array };

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
    const writer = stream.writable.getWriter();
    const written = writer.write(bytes as Uint8Array<ArrayBuffer>).then(() => writer.close());
    // Bad input fails both ends; the read side reports it, so this one must not go unhandled.
    written.catch(() => undefined);
    const reader = stream.readable.getReader();
    const parts: Uint8Array[] = [];
    let length = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        length += value.length;
    }
    await written;
    const out = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

/** The text deflate-compressed; null where the browser cannot (it is then stored plain). */
export async function packText(text: string): Promise<Uint8Array | null> {
    if (typeof CompressionStream === "undefined") return null;
    try {
        return await pipe(new TextEncoder().encode(text), new CompressionStream("deflate-raw"));
    } catch {
        return null;
    }
}

export async function unpackText(packed: Uint8Array): Promise<string> {
    return new TextDecoder().decode(await pipe(packed, new DecompressionStream("deflate-raw")));
}

/** The record to store for an entry: its text packed where possible. */
async function toRecord(entry: StoredSearchText): Promise<StoredRecord> {
    const packed = await packText(entry.text);
    if (!packed) return entry;
    const { text: _text, ...rest } = entry;
    return { ...rest, packed };
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
    /**
     * Writes under way. Packing comes before the write, so a write can still be
     * on its way when the owner lets go; the connection is closed after them.
     */
    private writes = new Set<Promise<void>>();

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
                // Opened for a write still under way: closed once it is done.
                if (db && this.writes.size > 0) {
                    void this.settled().then(() => db.close());
                    return db;
                }
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
        const record = await new Promise<StoredRecord | null>((resolve) => {
            try {
                const request = db.transaction(TEXTS, "readonly").objectStore(TEXTS).get(id);
                request.onsuccess = () => resolve((request.result as StoredRecord | undefined) ?? null);
                request.onerror = () => resolve(null);
            } catch {
                resolve(null);
            }
        });
        if (!record) return null;
        const { packed, text, ...rest } = record;
        if (packed) {
            try {
                return { ...rest, text: await unpackText(packed) };
            } catch {
                // Unreadable: as good as missing, so the log is read and this built again.
                return null;
            }
        }
        if (typeof text !== "string") return null;
        const entry: StoredSearchText = { ...rest, text };
        // Stored plain by an earlier build: packed now, in the background.
        void this.put(id, entry);
        return entry;
    }

    /** Stores an entry. Fire and forget: a failed write costs a later re-read. */
    put(id: string, entry: StoredSearchText): Promise<void> {
        // The connection is asked for now, before the packing: a `release`
        // meanwhile then waits for this write instead of dropping it.
        const connecting = this.connection();
        const write = (async () => {
            const record = await toRecord(entry);
            const db = await connecting;
            if (!db) return;
            await this.write(db, id, record);
        })();
        this.writes.add(write);
        void write.finally(() => this.writes.delete(write));
        return write;
    }

    private settled(): Promise<unknown> {
        return Promise.allSettled([...this.writes]);
    }

    private write(db: IDBDatabase, id: string, record: StoredRecord): Promise<void> {
        return new Promise<void>((resolve) => {
            try {
                const tx = db.transaction(TEXTS, "readwrite");
                tx.objectStore(TEXTS).put(record, id);
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
        // After the writes still under way, which hold this connection.
        void this.settled().then(() => pending?.then((db) => db?.close()));
    }
}
