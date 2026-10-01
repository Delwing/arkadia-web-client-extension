/**
 * Moves session logs out of the old database (`ArkadiaMessagesDB`, one object
 * store per session) into the current one (`ArkadiaLogsDB`, see
 * `logsDatabase.ts`).
 *
 * The move runs in the background, one session at a time: copied, then dropped
 * from the old database, so the disk never holds two copies of more than one
 * log. It is safe to stop at any point and runs again on every start until the
 * old database is gone:
 *
 * - A session copied but not yet dropped (the tab closed in between) is found
 *   already present, by its first record, and only dropped.
 * - A tab still running a build from before the move keeps writing to the old
 *   database, and recreates its session's store once it has been moved. The
 *   next run finds that store again and appends it after what was moved.
 *
 * One tab moves at a time (a Web Lock); the others hear its progress on a
 * broadcast channel. The log viewers show that progress instead of the old
 * sessions: until a session has been moved it is not listed at all.
 */
import {
    edgeRecord,
    openLogsDb,
    writeSession,
    type StoredLogEntry,
} from "./logsDatabase";

export const LEGACY_LOGS_DB_NAME = "ArkadiaMessagesDB";
const LOCK_NAME = "arkadia-logs-migration";
const CHANNEL_NAME = "arkadia-logs-migration";

/** Sessions moved so far, of all the old database held when the move began. */
export interface LogsMigrationProgress {
    done: number;
    total: number;
}

type Listener = (progress: LogsMigrationProgress | null) => void;

let progress: LogsMigrationProgress | null = null;
const listeners = new Set<Listener>();
const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL_NAME);

function setProgress(next: LogsMigrationProgress | null, broadcast = true): void {
    progress = next;
    if (broadcast) channel?.postMessage(next);
    for (const listener of listeners) listener(next);
}

if (channel) {
    channel.onmessage = (event: MessageEvent<LogsMigrationProgress | null>) => setProgress(event.data, false);
}

/**
 * Calls `listener` with the move's progress now and on every change; null
 * when no move is running. A tab that opened mid-move hears nothing until the
 * moving tab's next step, so use `legacyLogsPending` for the first answer.
 */
export function subscribeLogsMigration(listener: Listener): () => void {
    listeners.add(listener);
    listener(progress);
    return () => {
        listeners.delete(listener);
    };
}

/**
 * Whether the old database still exists, without creating it. Where the
 * browser cannot list databases, the answer is false: a viewer then lists what
 * has been moved without saying more is on the way.
 */
export async function legacyLogsPending(): Promise<boolean> {
    if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return false;
    try {
        const databases = await indexedDB.databases();
        return databases.some(database => database.name === LEGACY_LOGS_DB_NAME);
    } catch {
        return false;
    }
}

function request<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/** Opens the old database at `version` (current when omitted), running `change` if that is an upgrade. */
function openLegacy(version?: number, change?: (db: IDBDatabase) => void): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = version === undefined ? indexedDB.open(LEGACY_LOGS_DB_NAME) : indexedDB.open(LEGACY_LOGS_DB_NAME, version);
        req.onupgradeneeded = () => change?.(req.result);
        req.onsuccess = () => {
            // An old-build tab upgrading (creating its store) waits on us.
            req.result.onversionchange = () => req.result.close();
            resolve(req.result);
        };
        req.onerror = () => reject(req.error);
        req.onblocked = () => console.warn("[Logs] Moving logs waits for another tab to release the old database");
    });
}

function deleteLegacy(): Promise<void> {
    return new Promise(resolve => {
        const req = indexedDB.deleteDatabase(LEGACY_LOGS_DB_NAME);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        // Resolves on its own once the other connection closes.
        req.onblocked = () => console.warn("[Logs] Removing the old log database waits for another tab");
    });
}

function byStart(a: string, b: string): number {
    const start = (name: string) => Number.parseInt(name.slice("session_".length), 10) || 0;
    return start(a) - start(b);
}

function sameEntry(a: StoredLogEntry, b: StoredLogEntry): boolean {
    return a.text === b.text && a.timestamp === b.timestamp && a.type === b.type;
}

/** Moves one session's records into the current database; see the module comment for what may already be there. */
async function copySession(target: IDBDatabase, name: string, entries: StoredLogEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const first = await edgeRecord(target, name, "next");
    if (first && sameEntry(first.entry, entries[0])) return;
    const last = first ? await edgeRecord(target, name, "prev") : null;
    const offset = last ? last.seq + 1 : 0;
    await writeSession(
        target,
        name,
        entries.map((entry, index) => ({ seq: offset + index, entry })),
    );
}

async function run(): Promise<void> {
    // Where databases cannot be listed, opening the old one is how to find out;
    // that creates it empty, and it is deleted again just below.
    if (typeof indexedDB.databases === "function" && !(await legacyLogsPending())) return;

    let legacy = await openLegacy();
    const names = Array.from(legacy.objectStoreNames).sort(byStart);
    if (names.length === 0) {
        legacy.close();
        await deleteLegacy();
        return;
    }

    const target = await openLogsDb();
    if (!target) {
        legacy.close();
        return;
    }

    setProgress({ done: 0, total: names.length });
    try {
        for (let index = 0; index < names.length; index += 1) {
            const name = names[index];
            if (legacy.objectStoreNames.contains(name)) {
                const entries = (await request(
                    legacy.transaction(name, "readonly").objectStore(name).getAll(),
                )) as StoredLogEntry[];
                await copySession(target, name, entries);
                // Dropping a store is a schema change: the connection it came
                // from is closed first, and the upgrade's own one reads the next.
                const version = legacy.version;
                legacy.close();
                legacy = await openLegacy(version + 1, db => {
                    if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
                });
            }
            setProgress({ done: index + 1, total: names.length });
        }
        const left = legacy.objectStoreNames.length;
        legacy.close();
        // A store created meanwhile (an old-build tab) waits for the next start.
        if (left === 0) await deleteLegacy();
    } finally {
        // Closing twice is harmless; the finally covers a failure midway.
        legacy.close();
        target.close();
        setProgress(null);
    }
}

let started: Promise<void> | null = null;

/** Starts the move, once per page; resolves when it is done or was not needed. */
export function migrateLegacyLogs(): Promise<void> {
    started ??= (async () => {
        try {
            if (typeof navigator !== "undefined" && navigator.locks) {
                await navigator.locks.request(LOCK_NAME, run);
            } else {
                await run();
            }
        } catch (error) {
            console.error("[Logs] Moving logs to the new database failed:", error);
            setProgress(null);
        }
    })();
    return started;
}
