import { IndexedDBPersistenceAdapter } from "../dataCatalog/IndexedDBPersistenceAdapter";

export interface IndexedDBConfig {
    dbName: string;
    storeName: string;
    key: string;
}

function isIndexedDBSupported() {
    return typeof indexedDB !== "undefined";
}

const adapterCache = new Map<string, IndexedDBPersistenceAdapter>();

function getAdapter(dbName: string): IndexedDBPersistenceAdapter {
    let adapter = adapterCache.get(dbName);
    if (!adapter) {
        adapter = new IndexedDBPersistenceAdapter(dbName);
        adapterCache.set(dbName, adapter);
    }
    return adapter;
}

export async function storeInIndexedDB(config: IndexedDBConfig, data: any) {
    if (!isIndexedDBSupported()) {
        throw new Error('IndexedDB is not supported');
    }

    try {
        const adapter = getAdapter(config.dbName);
        await adapter.save(config.storeName, config.key, { data, timestamp: Date.now() });
    } catch {
        throw new Error('Failed to store data in IndexedDB');
    }
}

export async function getFromIndexedDB<T = any>(config: IndexedDBConfig, ttl?: number): Promise<T | null> {
    if (!isIndexedDBSupported()) {
        throw new Error('IndexedDB is not supported');
    }

    try {
        const adapter = getAdapter(config.dbName);
        const record = await adapter.load<T>(config.storeName, config.key);
        if (!record) {
            return null;
        }

        if (ttl && record.timestamp + ttl <= Date.now()) {
            return null;
        }

        return record.data as T;
    } catch {
        throw new Error('Failed to get data from IndexedDB');
    }
}

export async function clearIndexedDB(config: IndexedDBConfig): Promise<void> {
    if (!isIndexedDBSupported()) {
        throw new Error('IndexedDB is not supported');
    }

    try {
        const adapter = getAdapter(config.dbName);
        await adapter.delete(config.storeName, config.key);
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
