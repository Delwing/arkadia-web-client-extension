import { PersistenceAdapter, PersistenceRecord } from './types';

interface StoreInitStatus {
  initialized: boolean;
  promise: Promise<void> | null;
}

export class IndexedDBPersistenceAdapter implements PersistenceAdapter {
  private dbPromise: Promise<IDBDatabase>;
  private storeStatus = new Map<string, StoreInitStatus>();

  constructor(private readonly dbName: string) {
    this.dbPromise = this.openDatabase();
  }

  async load<T>(storeName: string, key: string): Promise<PersistenceRecord<T> | null> {
    await this.ensureStore(storeName);
    const db = await this.dbPromise;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve((request.result as PersistenceRecord<T> | undefined) ?? null);
      };

      request.onerror = () => {
        console.error(`IndexedDB load failed for ${storeName}:${key}`, request.error);
        reject(request.error);
      };
    });
  }

  async save<T>(storeName: string, key: string, record: PersistenceRecord<T>): Promise<void> {
    await this.ensureStore(storeName);
    const db = await this.dbPromise;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(record, key);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error(`IndexedDB save failed for ${storeName}:${key}`, request.error);
        reject(request.error);
      };
    });
  }

  async delete(storeName: string, key: string): Promise<void> {
    await this.ensureStore(storeName);
    const db = await this.dbPromise;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error(`IndexedDB delete failed for ${storeName}:${key}`, request.error);
        reject(request.error);
      };
    });
  }

  private async ensureStore(storeName: string): Promise<void> {
    const status = this.storeStatus.get(storeName);
    if (status?.initialized) {
      return;
    }

    if (status?.promise) {
      await status.promise;
      return;
    }

    const initPromise = this.initializeStore(storeName);
    this.storeStatus.set(storeName, { initialized: false, promise: initPromise });
    await initPromise;
    this.storeStatus.set(storeName, { initialized: true, promise: null });
  }

  private async initializeStore(storeName: string): Promise<void> {
    const db = await this.dbPromise;
    if (db.objectStoreNames.contains(storeName)) {
      return;
    }

    const newVersion = db.version + 1;
    db.close();

    this.dbPromise = this.openDatabase(newVersion, (database) => {
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName);
      }
    });

    await this.dbPromise;
  }

  private openDatabase(version?: number, upgradeCallback?: (db: IDBDatabase) => void): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, version);

      request.onupgradeneeded = () => {
        const db = request.result;
        try {
          upgradeCallback?.(db);
        } catch (error) {
          console.error('IndexedDB upgrade callback failed', error);
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error('IndexedDB open failed', request.error);
        reject(request.error);
      };
    });
  }
}
