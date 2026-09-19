export interface IndexedDBConfig {
    dbName: string;
    storeName: string;
    key: string;
}

const dbCache: Record<string, Promise<IDBDatabase>> = {};

function openDatabase(config: IndexedDBConfig, version?: number): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = version !== undefined ? indexedDB.open(config.dbName, version) : indexedDB.open(config.dbName);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(config.storeName)) {
                db.createObjectStore(config.storeName, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Failed to open IndexedDB'));
    });
}

async function ensureStoreExists(config: IndexedDBConfig, version?: number): Promise<IDBDatabase> {
    const db = await openDatabase(config, version);
    if (db.objectStoreNames.contains(config.storeName)) {
        return db;
    }

    const nextVersion = Math.max(db.version, 1) + 1;
    db.close();
    return ensureStoreExists(config, nextVersion);
}

async function getDatabase(config: IndexedDBConfig): Promise<IDBDatabase> {
    if (!dbCache[config.dbName]) {
        dbCache[config.dbName] = ensureStoreExists(config);
    }

    let db = await dbCache[config.dbName];
    if (!db.objectStoreNames.contains(config.storeName)) {
        db.close();
        dbCache[config.dbName] = ensureStoreExists(config, db.version + 1);
        db = await dbCache[config.dbName];
    }

    return db;
}

/**
 * Runs one IndexedDB request and resolves when its transaction COMMITS.
 *
 * It takes a callback rather than handing back an object store, and that shape is
 * load-bearing twice over:
 *
 * 1. A transaction goes inactive as soon as control returns to the event loop, so
 *    its first request has to be issued in the same task that created it. The old
 *    `getStore()` helper returned the store and let callers `await` before calling
 *    `.get()`/`.put()`, which put a microtask boundary in between. That works while
 *    the continuation happens to run in the same drain and throws
 *    `TransactionInactiveError` when it does not - so it passed locally and failed
 *    on a loaded CI runner, where the caller's error handling turned it into an
 *    empty result rather than a visible error.
 * 2. Resolving on `tx.oncomplete` instead of `request.onsuccess` means a resolved
 *    write is actually durable. A request succeeds well before its transaction
 *    commits, so the old code could report a successful write that a later read
 *    never saw.
 */
function runRequest<T>(
    config: IndexedDBConfig,
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest,
): Promise<T | undefined> {
    return getDatabase(config).then(db => new Promise<T | undefined>((resolve, reject) => {
        // Nothing may await between these two lines.
        const tx = db.transaction([config.storeName], mode);
        const req = run(tx.objectStore(config.storeName));

        let result: T | undefined;
        req.onsuccess = () => { result = req.result as T; };
        req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    }));
}

export async function storeInIndexedDB(config: IndexedDBConfig, data: any) {
    try {
        await runRequest(config, 'readwrite', store =>
            store.put({ id: config.key, data, timestamp: Date.now() }));
    } catch {
        throw new Error('Failed to store data in IndexedDB');
    }
}

export async function getFromIndexedDB<T = any>(config: IndexedDBConfig, ttl?: number): Promise<T | null> {
    try {
        const record = await runRequest<{ data: T; timestamp?: number }>(config, 'readonly', store =>
            store.get(config.key));
        if (!record) return null;
        if (ttl && !(record.timestamp && record.timestamp + ttl > Date.now())) return null;
        return record.data;
    } catch {
        throw new Error('Failed to get data from IndexedDB');
    }
}

export async function clearIndexedDB(config: IndexedDBConfig): Promise<void> {
    try {
        await runRequest(config, 'readwrite', store => store.delete(config.key));
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
