export interface IndexedDBConfig {
    dbName: string;
    storeName: string;
    key: string;
}

function isIndexedDBSupported() {
    return typeof indexedDB !== "undefined";
}

async function openDatabase(config: IndexedDBConfig): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (!isIndexedDBSupported()) {
            reject(new Error('IndexedDB is not supported'));
            return;
        }

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

async function storeInIndexedDB(config: IndexedDBConfig, data: any) {
    const db = await openDatabase(config);
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction([config.storeName], 'readwrite');
        const store = tx.objectStore(config.storeName);
        const req = store.put({ id: config.key, data, timestamp: Date.now() });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error('Failed to store data in IndexedDB'));
    });
}

async function getFromIndexedDB(config: IndexedDBConfig, ttl?: number) {
    const db = await openDatabase(config);
    return new Promise<any>((resolve, reject) => {
        const tx = db.transaction([config.storeName], 'readonly');
        const store = tx.objectStore(config.storeName);
        const req = store.get(config.key);
        req.onsuccess = () => {
            if (req.result) {
                if (!ttl || (req.result.timestamp && req.result.timestamp + ttl > Date.now())) {
                    resolve(req.result.data);
                    return;
                }
            }
            resolve(null);
        };
        req.onerror = () => reject(new Error('Failed to get data from IndexedDB'));
    });
}

export async function clearIndexedDB(config: IndexedDBConfig): Promise<void> {
    const db = await openDatabase(config);
    return new Promise((resolve, reject) => {
        const tx = db.transaction([config.storeName], 'readwrite');
        const store = tx.objectStore(config.storeName);
        const req = store.delete(config.key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error('Failed to clear IndexedDB'));
    });
}

export async function updateIndexedDB<T>(config: IndexedDBConfig, url: string): Promise<T> {
    const response = await fetch(url);
    const data = await response.json();
    await storeInIndexedDB(config, data);
    return data as T;
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
