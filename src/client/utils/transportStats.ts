const DB_NAME = "ArkadiaTransportStatsDB";
const STORE_NAME = "segments";
const DB_VERSION = 2;

let dbPromise: Promise<IDBDatabase> | null = null;

async function getDatabase(): Promise<IDBDatabase> {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = event => {
                const db = request.result;
                const transaction = request.transaction;
                if (!transaction) {
                    return;
                }

                const createStore = () => {
                    if (db.objectStoreNames.contains(STORE_NAME)) {
                        db.deleteObjectStore(STORE_NAME);
                    }
                    const store = db.createObjectStore(STORE_NAME, { keyPath: "segmentKey" });
                    store.createIndex("bySegment", "segmentKey", { unique: true });
                    return store;
                };

                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    createStore();
                    return;
                }

                if (event.oldVersion < 2) {
                    const existingStore = transaction.objectStore(STORE_NAME);
                    const migrateRequest = existingStore.getAll();
                    migrateRequest.onsuccess = () => {
                        const rawRecords = Array.isArray(migrateRequest.result) ? migrateRequest.result : [];
                        const store = createStore();
                        const migrated = rawRecords.reduce<StoredTransportSegmentRecord[]>((acc, entry) => {
                            const migratedRecord = migrateLegacyRecord(entry as any);
                            if (migratedRecord) {
                                const existingIndex = acc.findIndex(item => item.segmentKey === migratedRecord.segmentKey);
                                if (existingIndex >= 0) {
                                    acc[existingIndex] = mergeStoredSegments(acc[existingIndex], migratedRecord);
                                } else {
                                    acc.push(migratedRecord);
                                }
                            }
                            return acc;
                        }, []);
                        migrated.forEach(record => {
                            store.add(record);
                        });
                    };
                    migrateRequest.onerror = () => {
                        createStore();
                    };
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error ?? new Error("Failed to open transport stats database"));
        });
    }

    return dbPromise;
}

interface TransportSegmentDurationEntry {
    duration: number;
    startedAt: number;
    endedAt: number;
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

export interface StoredTransportSegmentRecord {
    segmentKey: string;
    transport: string;
    fromId: number;
    toId: number;
    fromLabel: string;
    toLabel: string;
    shortestDuration: TransportSegmentDurationEntry;
    longestDuration: TransportSegmentDurationEntry;
    expectedDuration?: number | null;
    updatedAt: number;
}

interface LegacyTransportSegmentRecord extends TransportSegmentRecord {
    id?: number;
    createdAt?: number;
}

function createSegmentKey(record: { transport: string; fromId: number; toId: number }): string {
    return `${record.transport}::${record.fromId}->${record.toId}`;
}

function toDurationEntry(record: TransportSegmentRecord): TransportSegmentDurationEntry {
    return {
        duration: record.duration,
        startedAt: record.startedAt,
        endedAt: record.endedAt,
    };
}

function mergeStoredSegments(
    current: StoredTransportSegmentRecord,
    incoming: StoredTransportSegmentRecord
): StoredTransportSegmentRecord {
    const shortest =
        incoming.shortestDuration.duration < current.shortestDuration.duration
            ? incoming.shortestDuration
            : current.shortestDuration;
    const longest =
        incoming.longestDuration.duration > current.longestDuration.duration
            ? incoming.longestDuration
            : current.longestDuration;

    return {
        ...current,
        fromLabel: incoming.fromLabel || current.fromLabel,
        toLabel: incoming.toLabel || current.toLabel,
        shortestDuration: shortest,
        longestDuration: longest,
        expectedDuration:
            incoming.expectedDuration !== undefined ? incoming.expectedDuration : current.expectedDuration ?? null,
        updatedAt: Math.max(current.updatedAt, incoming.updatedAt),
    };
}

function migrateLegacyRecord(entry: LegacyTransportSegmentRecord): StoredTransportSegmentRecord | null {
    if (!entry || typeof entry.transport !== "string") {
        return null;
    }
    const segmentKey = createSegmentKey(entry);
    const duration = toDurationEntry(entry);
    return {
        segmentKey,
        transport: entry.transport,
        fromId: entry.fromId,
        toId: entry.toId,
        fromLabel: entry.fromLabel,
        toLabel: entry.toLabel,
        shortestDuration: duration,
        longestDuration: duration,
        expectedDuration: entry.expectedDuration ?? null,
        updatedAt: Date.now(),
    };
}

export async function recordTransportSegment(record: TransportSegmentRecord): Promise<void> {
    try {
        const db = await getDatabase();
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], "readwrite");
            const store = transaction.objectStore(STORE_NAME);
            const segmentKey = createSegmentKey(record);
            const getRequest = store.get(segmentKey);
            getRequest.onsuccess = () => {
                const existing = getRequest.result as StoredTransportSegmentRecord | undefined;
                const duration = toDurationEntry(record);
                const expectedDuration =
                    record.expectedDuration !== undefined
                        ? record.expectedDuration
                        : existing?.expectedDuration ?? null;
                const baseRecord: StoredTransportSegmentRecord = existing
                    ? {
                          ...existing,
                          fromLabel: record.fromLabel,
                          toLabel: record.toLabel,
                          expectedDuration,
                          updatedAt: Date.now(),
                      }
                    : {
                          segmentKey,
                          transport: record.transport,
                          fromId: record.fromId,
                          toId: record.toId,
                          fromLabel: record.fromLabel,
                          toLabel: record.toLabel,
                          shortestDuration: duration,
                          longestDuration: duration,
                          expectedDuration,
                          updatedAt: Date.now(),
                      };

                const nextRecord: StoredTransportSegmentRecord = existing
                    ? {
                          ...baseRecord,
                          shortestDuration:
                              duration.duration < existing.shortestDuration.duration
                                  ? duration
                                  : existing.shortestDuration,
                          longestDuration:
                              duration.duration > existing.longestDuration.duration ? duration : existing.longestDuration,
                      }
                    : baseRecord;

                const putRequest = store.put(nextRecord);
                putRequest.onsuccess = () => resolve();
                putRequest.onerror = () => reject(putRequest.error ?? new Error("Failed to store transport segment"));
            };
            getRequest.onerror = () => reject(getRequest.error ?? new Error("Failed to read transport segment"));
        });
    } catch (error) {
        if (typeof process === "undefined" || process.env.NODE_ENV !== "test") {
            console.warn("[Transport] Failed to persist transport stats", error);
        }
    }
}

export async function deleteTransportSegment(
    transport: string,
    fromId: number,
    toId: number,
): Promise<void> {
    try {
        const db = await getDatabase();
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], "readwrite");
            const store = transaction.objectStore(STORE_NAME);
            const segmentKey = createSegmentKey({ transport, fromId, toId });
            const request = store.delete(segmentKey);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error ?? new Error("Failed to delete transport segment"));
        });
    } catch (error) {
        if (typeof process === "undefined" || process.env.NODE_ENV !== "test") {
            console.warn("[Transport] Failed to delete transport segment", error);
        }
    }
}

export async function clearTransportStats(): Promise<void> {
    try {
        const db = await getDatabase();
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], "readwrite");
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error ?? new Error("Failed to clear transport stats"));
            transaction.onabort = () => reject(transaction.error ?? new Error("Failed to clear transport stats"));
            const store = transaction.objectStore(STORE_NAME);
            store.clear();
        });
        db.close();
    } catch (error) {
        if (typeof process === "undefined" || process.env.NODE_ENV !== "test") {
            console.warn("[Transport] Failed to clear transport stats", error);
        }
    } finally {
        dbPromise = null;
    }
}

export async function getAllTransportSegments(): Promise<StoredTransportSegmentRecord[]> {
    try {
        const db = await getDatabase();
        return await new Promise<StoredTransportSegmentRecord[]>((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], "readonly");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve((request.result as StoredTransportSegmentRecord[]) ?? []);
            request.onerror = () => reject(request.error ?? new Error("Failed to read transport stats"));
        });
    } catch {
        return [];
    }
}
