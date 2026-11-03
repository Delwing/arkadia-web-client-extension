/**
 * Measures the client's IndexedDB databases: browsers report one total for a
 * site, never per database, so the only way to tell the logs from the map data
 * is to walk them. Runs in `storageScan.worker.ts`, off the main thread.
 *
 * Read in batches, and only ever read. A database is opened at whatever version
 * it is at; one that turns out not to exist is not created, and one another tab
 * wants to upgrade is let go of at once (and reported as not read in full).
 */
import { approxSize } from "./approxSize";
import type { DatabaseSize, LogSize, StorageScanRequest, StorageScanResponse } from "./storageScan.shared";
import { countSessions, LOGS_DB_NAME, openLogsDb, readSessionBatch } from "../logsDatabase";

const BATCH = 1000;

/** Opens an existing database without changing it; null when there is none. */
function openExisting(name: string): Promise<IDBDatabase | null> {
    return new Promise((resolve) => {
        let created = false;
        const request = indexedDB.open(name);
        request.onupgradeneeded = () => {
            // It did not exist: do not leave an empty one behind.
            created = true;
            request.transaction?.abort();
        };
        request.onsuccess = () => resolve(created ? null : request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
    });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/** Every store of a database, a batch at a time. */
export async function measureGeneric(db: IDBDatabase, name: string): Promise<DatabaseSize> {
    const size: DatabaseSize = { name, bytes: 0, records: 0 };
    for (const storeName of Array.from(db.objectStoreNames)) {
        let after: IDBValidKey | undefined;
        for (;;) {
            const store = db.transaction(storeName, "readonly").objectStore(storeName);
            const range = after === undefined ? undefined : IDBKeyRange.lowerBound(after, true);
            const keysRequest = store.getAllKeys(range, BATCH);
            // Requests of one transaction complete in order: the keys are in by now.
            const values = await request(store.getAll(range, BATCH));
            const keys = keysRequest.result;
            for (let i = 0; i < values.length; i += 1) {
                size.bytes += approxSize(keys[i]) + approxSize(values[i]);
            }
            size.records += values.length;
            if (values.length < BATCH) break;
            after = keys[keys.length - 1];
        }
    }
    return size;
}

/** The log database, per log; a log whose record count is unchanged keeps the size it had. */
export async function measureLogs(
    db: IDBDatabase,
    known: Record<string, LogSize>,
    onLog?: (done: number, total: number) => void,
): Promise<{ size: DatabaseSize; logSizes: Record<string, LogSize> }> {
    const counts = await countSessions(db);
    const logSizes: Record<string, LogSize> = {};
    const size: DatabaseSize = { name: LOGS_DB_NAME, bytes: 0, records: 0 };
    let done = 0;
    for (const [id, count] of counts) {
        let entry = known[id];
        if (!entry || entry.count !== count) {
            let bytes = 0;
            let after: number | null = null;
            for (;;) {
                const batch = await readSessionBatch(db, id, after, BATCH);
                // The key is [id, seq]: the id and a number, besides the record.
                for (const { entry: record } of batch) bytes += id.length + 8 + approxSize(record);
                if (batch.length < BATCH) break;
                after = batch[batch.length - 1].seq;
            }
            entry = { count, bytes };
        }
        logSizes[id] = entry;
        size.bytes += entry.bytes;
        size.records += count;
        done += 1;
        onLog?.(done, counts.size);
    }
    return { size, logSizes };
}

/** The whole scan a request asks for, reporting through `post`. */
export async function runScan(data: StorageScanRequest, post: (message: StorageScanResponse) => void): Promise<void> {
    const names = data.logsOnly
        ? [LOGS_DB_NAME]
        : typeof indexedDB.databases === "function"
          ? (await indexedDB.databases()).map((database) => database.name).filter((name): name is string => !!name)
          : [LOGS_DB_NAME];

    const databases: DatabaseSize[] = [];
    let logSizes: Record<string, LogSize> = {};
    for (let index = 0; index < names.length; index += 1) {
        const name = names[index];
        post({ type: "progress", database: name, done: index, total: names.length });
        // The log database through its own opener, which creates it properly
        // if it is not there yet (opening it bare would leave it without its store).
        const db = name === LOGS_DB_NAME ? await openLogsDb() : await openExisting(name);
        if (!db) continue;
        let released = false;
        db.onversionchange = () => {
            released = true;
            db.close();
        };
        try {
            if (name === LOGS_DB_NAME) {
                const measured = await measureLogs(db, data.logSizes, (done, total) =>
                    post({ type: "progress", database: name, done, total }),
                );
                databases.push(measured.size);
                logSizes = measured.logSizes;
            } else {
                databases.push(await measureGeneric(db, name));
            }
        } catch (error) {
            databases.push({
                name,
                bytes: 0,
                records: 0,
                error: released ? "zwolniona dla innej karty" : error instanceof Error ? error.message : String(error),
            });
        } finally {
            if (!released) db.close();
        }
    }
    post({ type: "done", databases, logSizes });
}
