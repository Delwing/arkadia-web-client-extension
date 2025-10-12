import type { DataPersistenceAdapter } from './types';

interface IndexedDbAdapterConfig {
    readonly databaseName?: string;
    readonly storeName?: string;
    readonly version?: number;
}

export class IndexedDbPersistenceAdapter<T> implements DataPersistenceAdapter<T> {
    private readonly databaseName: string;
    private readonly storeName: string;
    private readonly version: number;

    constructor(
        private readonly key: string,
        config: IndexedDbAdapterConfig = {},
    ) {
        this.databaseName = config.databaseName ?? 'arkadia-data';
        this.storeName = config.storeName ?? 'catalog';
        this.version = config.version ?? 1;
    }

    async read(): Promise<T | undefined> {
        const db = await this.openDatabase();
        try {
            return await new Promise<T | undefined>((resolve, reject) => {
                const transaction = db.transaction(this.storeName, 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.get(this.key);
                request.onsuccess = () => {
                    resolve(request.result as T | undefined);
                };
                request.onerror = () => {
                    reject(request.error);
                };
            });
        } finally {
            db.close();
        }
    }

    async write(value: T): Promise<void> {
        const db = await this.openDatabase();
        try {
            await new Promise<void>((resolve, reject) => {
                const transaction = db.transaction(this.storeName, 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.put(value, this.key);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } finally {
            db.close();
        }
    }

    async clear(): Promise<void> {
        const db = await this.openDatabase();
        try {
            await new Promise<void>((resolve, reject) => {
                const transaction = db.transaction(this.storeName, 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.delete(this.key);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } finally {
            db.close();
        }
    }

    private openDatabase(): Promise<IDBDatabase> {
        const indexedDB = this.getIndexedDb();

        return new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(this.databaseName, this.version);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    private getIndexedDb(): IDBFactory {
        const factory =
            typeof window !== 'undefined'
                ? window.indexedDB
                : (globalThis as unknown as { indexedDB?: IDBFactory }).indexedDB;
        if (!factory) {
            throw new Error('IndexedDB is not available in this environment.');
        }

        return factory;
    }
}
