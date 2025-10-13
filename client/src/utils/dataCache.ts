export interface IndexedDBConfig {
    dbName: string;
    storeName: string;
    key: string;
}

interface MetadataRecord {
    id: string;
    timestamp: number;
}

interface EntryRecord<T = unknown> {
    id: string;
    data: T;
}

const DB_VERSION = 2;

function isIndexedDBSupported() {
    return typeof indexedDB !== "undefined";
}

const dbCache: Record<string, Promise<IDBDatabase>> = {};

function getMetadataStoreName(config: IndexedDBConfig): string {
    return `${config.storeName}_metadata`;
}

async function getDatabase(config: IndexedDBConfig): Promise<IDBDatabase> {
    if (!dbCache[config.dbName]) {
        dbCache[config.dbName] = new Promise((resolve, reject) => {
            if (!isIndexedDBSupported()) {
                reject(new Error('IndexedDB is not supported'));
                return;
            }

            const request = indexedDB.open(config.dbName, DB_VERSION);
            request.onupgradeneeded = (event) => {
                const db = request.result;
                const metadataStoreName = getMetadataStoreName(config);

                if (!db.objectStoreNames.contains(config.storeName)) {
                    db.createObjectStore(config.storeName, { keyPath: 'id' });
                }

                if (!db.objectStoreNames.contains(metadataStoreName)) {
                    db.createObjectStore(metadataStoreName, { keyPath: 'id' });
                }

                if ((event.oldVersion ?? 0) < DB_VERSION) {
                    migrateToNormalizedStore(request.transaction, config.storeName, metadataStoreName);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(new Error('Failed to open IndexedDB'));
        });
    }
    return dbCache[config.dbName];
}

function migrateToNormalizedStore(
    transaction: IDBTransaction | null,
    storeName: string,
    metadataStoreName: string,
) {
    if (!transaction) {
        return;
    }

    try {
        const entriesStore = transaction.objectStore(storeName);
        const metadataStore = transaction.objectStore(metadataStoreName);
        const cursorRequest = entriesStore.openCursor();

        cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result as IDBCursorWithValue | null;
            if (!cursor) {
                return;
            }

            const value = cursor.value as Partial<EntryRecord> & { timestamp?: number };
            const recordId = (cursor.key as string) ?? value?.id;

            if (recordId) {
                const timestamp = value?.timestamp ?? Date.now();
                metadataStore.put({ id: recordId, timestamp });

                if (value && 'data' in value && value.data !== undefined) {
                    cursor.update({ id: recordId, data: value.data });
                }
            }

            cursor.continue();
        };
    } catch (error) {
        console.error('Failed to migrate IndexedDB store to normalized structure', error);
    }
}

async function getStores(config: IndexedDBConfig, mode: IDBTransactionMode) {
    const db = await getDatabase(config);
    const metadataStoreName = getMetadataStoreName(config);
    const transaction = db.transaction([config.storeName, metadataStoreName], mode);

    return {
        transaction,
        entriesStore: transaction.objectStore(config.storeName),
        metadataStore: transaction.objectStore(metadataStoreName),
    };
}

async function getEntriesStore(config: IndexedDBConfig, mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await getDatabase(config);
    return db.transaction(config.storeName, mode).objectStore(config.storeName);
}

async function getMetadataStore(config: IndexedDBConfig, mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await getDatabase(config);
    return db
        .transaction(getMetadataStoreName(config), mode)
        .objectStore(getMetadataStoreName(config));
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
        transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    });
}

export async function storeInIndexedDB(config: IndexedDBConfig, data: any) {
    try {
        const { transaction, entriesStore, metadataStore } = await getStores(config, 'readwrite');
        const timestamp = Date.now();

        await requestToPromise(entriesStore.put({ id: config.key, data }));
        await requestToPromise(metadataStore.put({ id: config.key, timestamp }));
        await waitForTransaction(transaction);
    } catch {
        throw new Error('Failed to store data in IndexedDB');
    }
}

async function readEntryRecord<T>(config: IndexedDBConfig): Promise<EntryRecord<T> | null> {
    const entriesStore = await getEntriesStore(config, 'readonly');
    const request = entriesStore.get(config.key);
    try {
        const result = (await requestToPromise(request)) as EntryRecord<T> | undefined;
        return result ?? null;
    } catch {
        throw new Error('Failed to get data from IndexedDB');
    }
}

async function readMetadataRecord(config: IndexedDBConfig): Promise<MetadataRecord | null> {
    const metadataStore = await getMetadataStore(config, 'readonly');
    const request = metadataStore.get(config.key);
    try {
        const result = (await requestToPromise(request)) as MetadataRecord | undefined;
        return result ?? null;
    } catch {
        throw new Error('Failed to get data from IndexedDB');
    }
}

export async function getFromIndexedDB<T = any>(config: IndexedDBConfig, ttl?: number): Promise<T | null> {
    try {
        const entry = await readEntryRecord<T>(config);
        if (!entry) {
            return null;
        }

        let metadata = await readMetadataRecord(config);

        if (!metadata) {
            // Fallback for legacy entries where timestamp lived with the data
            const legacyTimestamp = (entry as unknown as { timestamp?: number }).timestamp;
            if (legacyTimestamp) {
                metadata = { id: config.key, timestamp: legacyTimestamp };
            }
        }

        if (ttl && metadata && metadata.timestamp + ttl <= Date.now()) {
            return null;
        }

        return entry.data as T;
    } catch {
        throw new Error('Failed to get data from IndexedDB');
    }
}

export async function clearIndexedDB(config: IndexedDBConfig): Promise<void> {
    try {
        const { transaction, entriesStore, metadataStore } = await getStores(config, 'readwrite');
        await requestToPromise(entriesStore.delete(config.key));
        await requestToPromise(metadataStore.delete(config.key));
        await waitForTransaction(transaction);
    } catch {
        throw new Error('Failed to clear IndexedDB');
    }
}

export async function updateIndexedDB<T>(config: IndexedDBConfig, url: string): Promise<T> {
    try {
        const response = await fetch(url);
        const data = await response.json();
        await storeInIndexedDB(config, data);
        return data as T;
    } catch {
        throw new Error('Failed to update IndexedDB');
    }
}


export interface LoadOptions {
    url: string;
    localStorageKey?: string;
    indexedDB?: IndexedDBConfig;
    ttl?: number;
    onProgress?: (progress: number, loaded?: number, total?: number) => void;
}

export async function loadCachedJSON<T>(options: LoadOptions): Promise<T> {
    if (options.indexedDB) {
        try {
            const data = await getFromIndexedDB(options.indexedDB, options.ttl);
            if (data) {
                options.onProgress?.(100);
                return data as T;
            }
        } catch (e) {
            console.warn('Failed to load from IndexedDB:', e);
        }
    }

    const response = await fetch(options.url);
    let data: T;
    const totalHeader = (response as any).headers?.get?.('Content-Length');
    const total = parseInt(totalHeader || '0', 10);
    if (response.body && total) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
                chunks.push(value);
                received += value.length;
                options.onProgress?.(Math.min(100, (received / total) * 100), received, total);
            }
        }
        const all = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) {
            all.set(chunk, offset);
            offset += chunk.length;
        }
        data = JSON.parse(new TextDecoder().decode(all));
    } else {
        data = await response.json();
        options.onProgress?.(100, total || undefined, total || undefined);
    }

    if (options.indexedDB) {
        try {
            await storeInIndexedDB(options.indexedDB, data);
        } catch (e) {
            console.warn('Failed to store in IndexedDB:', e);
        }
    }

    return data;
}
