const DB_NAME = "ArkadiaTransportStatsDB";
const STORE_NAME = "segments";
const DB_VERSION = 1;

function isIndexedDBSupported(): boolean {
    return typeof indexedDB !== "undefined";
}

let dbPromise: Promise<IDBDatabase> | null = null;

async function getDatabase(): Promise<IDBDatabase> {
    if (!isIndexedDBSupported()) {
        throw new Error("IndexedDB is not supported");
    }

    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error ?? new Error("Failed to open transport stats database"));
        });
    }

    return dbPromise;
}

export interface TransportSegmentRecord {
    transport: string;
    fromId: number;
    toId: number;
    fromLabel: string;
    toLabel: string;
    startedAt: number;
    endedAt: number;
    duration: number;
    expectedDuration?: number | null;
}

export async function recordTransportSegment(record: TransportSegmentRecord): Promise<void> {
    try {
        const db = await getDatabase();
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], "readwrite");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.add({ ...record, createdAt: Date.now() });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error ?? new Error("Failed to store transport segment"));
        });
    } catch (error) {
        if (typeof process === "undefined" || process.env.NODE_ENV !== "test") {
            console.warn("[Transport] Failed to persist transport stats", error);
        }
    }
}

export async function clearTransportStats(): Promise<void> {
    if (!isIndexedDBSupported()) {
        return;
    }

    await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.onsuccess = () => {
            dbPromise = null;
            resolve();
        };
        request.onerror = () => reject(request.error ?? new Error("Failed to clear transport stats"));
        request.onblocked = () => resolve();
    });
}

export async function getAllTransportSegments(): Promise<any[]> {
    try {
        const db = await getDatabase();
        return await new Promise<any[]>((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], "readonly");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result ?? []);
            request.onerror = () => reject(request.error ?? new Error("Failed to read transport stats"));
        });
    } catch {
        return [];
    }
}
