export interface IndexedDBConfig {
    dbName: string;
    storeName: string;
    key: string;
}

const dbCache: Record<string, Promise<IDBDatabase>> = {};

async function getDatabase(config: IndexedDBConfig): Promise<IDBDatabase> {
    if (!dbCache[config.dbName]) {
        dbCache[config.dbName] = new Promise((resolve, reject) => {
            const request = indexedDB.open(config.dbName, 1);
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
    return dbCache[config.dbName];
}

async function getStore(config: IndexedDBConfig, mode: IDBTransactionMode) {
    const db = await getDatabase(config);
    return db.transaction([config.storeName], mode).objectStore(config.storeName);
}

export async function storeInIndexedDB(config: IndexedDBConfig, data: any) {
    try {
        const store = await getStore(config, 'readwrite');
        await new Promise<void>((resolve, reject) => {
            const req = store.put({ id: config.key, data, timestamp: Date.now() });
            req.onsuccess = () => resolve(undefined);
            req.onerror = () => reject(new Error('Failed to store data in IndexedDB'));
        });
    } catch {
        throw new Error('Failed to store data in IndexedDB');
    }
}

export async function getFromIndexedDB<T = any>(config: IndexedDBConfig, ttl?: number): Promise<T | null> {
    try {
        const store = await getStore(config, 'readonly');
        return await new Promise<any>((resolve, reject) => {
            const req = store.get(config.key);
            req.onsuccess = () => {
                if (req.result) {
                    if (!ttl || (req.result.timestamp && req.result.timestamp + ttl > Date.now())) {
                        resolve(req.result.data as T);
                        return;
                    }
                }
                resolve(null);
            };
            req.onerror = () => reject(new Error('Failed to get data from IndexedDB'));
        });
    } catch {
        throw new Error('Failed to get data from IndexedDB');
    }
}

export async function clearIndexedDB(config: IndexedDBConfig): Promise<void> {
    try {
        const store = await getStore(config, 'readwrite');
        await new Promise<void>((resolve, reject) => {
            const req = store.delete(config.key);
            req.onsuccess = () => resolve(undefined);
            req.onerror = () => reject(new Error('Failed to clear IndexedDB'));
        });
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
