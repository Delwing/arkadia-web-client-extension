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
    try {
      return await this.runWithStore(
        storeName,
        'readonly',
        (store) => store.get(key),
        (result) => (result as PersistenceRecord<T> | undefined) ?? null,
      );
    } catch (error) {
      console.error(`IndexedDB load failed for ${storeName}:${key}`, error);
      throw error;
    }
  }

  async save<T>(storeName: string, key: string, record: PersistenceRecord<T>): Promise<void> {
    try {
      await this.runWithStore(storeName, 'readwrite', (store) => store.put(record, key), () => undefined);
    } catch (error) {
      console.error(`IndexedDB save failed for ${storeName}:${key}`, error);
      throw error;
    }
  }

  async loadRaw<T>(storeName: string, key: string): Promise<T | null> {
    try {
      return await this.runWithStore(
        storeName,
        'readonly',
        (store) => store.get(key),
        (result) => {
          if (result === undefined) {
            return null;
          }

          const value = result as PersistenceRecord<T> | T;
          if (
            value &&
            typeof value === 'object' &&
            'data' in value &&
            'timestamp' in value &&
            typeof (value as PersistenceRecord<T>).timestamp === 'number'
          ) {
            return (value as PersistenceRecord<T>).data;
          }

          return value as T;
        },
      );
    } catch (error) {
      console.error(`IndexedDB load failed for ${storeName}:${key}`, error);
      throw error;
    }
  }

  async saveRaw<T>(storeName: string, key: string, value: T): Promise<void> {
    try {
      await this.runWithStore(storeName, 'readwrite', (store) => store.put(value, key), () => undefined);
    } catch (error) {
      console.error(`IndexedDB save failed for ${storeName}:${key}`, error);
      throw error;
    }
  }

  async delete(storeName: string, key: string): Promise<void> {
    try {
      await this.runWithStore(storeName, 'readwrite', (store) => store.delete(key), () => undefined);
    } catch (error) {
      console.error(`IndexedDB delete failed for ${storeName}:${key}`, error);
      throw error;
    }
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

  private async runWithStore<TRequest, TResult>(
    storeName: string,
    mode: IDBTransactionMode,
    createRequest: (store: IDBObjectStore) => IDBRequest<TRequest>,
    transform: (value: TRequest) => TResult,
    allowRetry = true,
  ): Promise<TResult> {
    await this.ensureStore(storeName);
    const db = await this.dbPromise;

    return new Promise<TResult>((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        transaction = db.transaction(storeName, mode);
      } catch (error) {
        if (allowRetry && this.isMissingStoreError(error)) {
          this.retryWithFreshStore(storeName, mode, createRequest, transform, resolve, reject);
          return;
        }

        reject(error);
        return;
      }

      let store: IDBObjectStore;
      try {
        store = transaction.objectStore(storeName);
      } catch (error) {
        if (allowRetry && this.isMissingStoreError(error)) {
          this.retryWithFreshStore(storeName, mode, createRequest, transform, resolve, reject);
          return;
        }

        reject(error);
        return;
      }

      let request: IDBRequest<TRequest>;
      try {
        request = createRequest(store);
      } catch (error) {
        reject(error);
        return;
      }

      request.onsuccess = () => {
        try {
          resolve(transform(request.result));
        } catch (error) {
          reject(error);
        }
      };

      request.onerror = () => {
        const error = request.error;
        if (allowRetry && this.isMissingStoreError(error)) {
          this.retryWithFreshStore(storeName, mode, createRequest, transform, resolve, reject);
          return;
        }

        reject(error ?? new Error('IndexedDB request failed'));
      };
    });
  }

  private retryWithFreshStore<TRequest, TResult>(
    storeName: string,
    mode: IDBTransactionMode,
    createRequest: (store: IDBObjectStore) => IDBRequest<TRequest>,
    transform: (value: TRequest) => TResult,
    resolve: (value: TResult | PromiseLike<TResult>) => void,
    reject: (reason?: unknown) => void,
  ): void {
    this.storeStatus.delete(storeName);
    this.resetDatabase();
    this.runWithStore(storeName, mode, createRequest, transform, false).then(resolve).catch(reject);
  }

  private isMissingStoreError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'NotFoundError';
  }

  private resetDatabase(): void {
    const previousPromise = this.dbPromise;
    this.dbPromise = (async () => {
      try {
        const db = await previousPromise;
        try {
          db.close();
        } catch (closeError) {
          console.error('IndexedDB close failed', closeError);
        }
      } catch (error) {
        console.error('IndexedDB reset failed to retrieve previous database', error);
      }

      return this.openDatabase();
    })();
  }
}
