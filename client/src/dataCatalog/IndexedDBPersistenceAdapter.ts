import { PersistenceAdapter, PersistenceRecord } from './types';

interface StoreInitStatus {
  initialized: boolean;
  promise: Promise<void> | null;
}

interface MetadataRecord {
  id: string;
  timestamp: number;
}

const DB_VERSION = 2;
const METADATA_STORE = '__metadata__';

function buildMetadataKey(storeName: string, key: IDBValidKey | string): string {
  return `${storeName}:${String(key)}`;
}

function migrateLegacyStores(transaction: IDBTransaction | null, db: IDBDatabase): void {
  if (!transaction) {
    return;
  }

  try {
    const metadataStore = transaction.objectStore(METADATA_STORE);
    const storeNames = Array.from(db.objectStoreNames);

    for (const storeName of storeNames) {
      if (storeName === METADATA_STORE) {
        continue;
      }

      const store = transaction.objectStore(storeName);
      const cursorRequest = store.openCursor();

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result as IDBCursorWithValue | null;
        if (!cursor) {
          return;
        }

        const value = cursor.value as PersistenceRecord<unknown> | undefined;
        if (value && typeof value === 'object' && 'data' in value && 'timestamp' in value) {
          const metadataKey = buildMetadataKey(storeName, cursor.key ?? '');
          metadataStore.put({ id: metadataKey, timestamp: value.timestamp });
          cursor.update(value.data);
        }

        cursor.continue();
      };
    }
  } catch (error) {
    console.error('Failed to migrate IndexedDB stores to normalized structure', error);
  }
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
      const transaction = db.transaction([storeName, METADATA_STORE], 'readonly');
      const store = transaction.objectStore(storeName);
      const metadataStore = transaction.objectStore(METADATA_STORE);

      const dataRequest = store.get(key);
      const metadataRequest = metadataStore.get(buildMetadataKey(storeName, key));

      transaction.oncomplete = () => {
        const data = dataRequest.result as T | PersistenceRecord<T> | undefined;
        if (data === undefined) {
          resolve(null);
          return;
        }

        const metadata = metadataRequest.result as MetadataRecord | undefined;

        if (metadata?.timestamp !== undefined) {
          resolve({ data: data as T, timestamp: metadata.timestamp });
          return;
        }

        if (typeof data === 'object' && data !== null && 'data' in data && 'timestamp' in data) {
          resolve(data as PersistenceRecord<T>);
          return;
        }

        resolve({ data: data as T, timestamp: Date.now() });
      };

      transaction.onerror = () => {
        console.error(`IndexedDB load failed for ${storeName}:${key}`, transaction.error);
        reject(transaction.error);
      };
    });
  }

  async save<T>(storeName: string, key: string, record: PersistenceRecord<T>): Promise<void> {
    await this.ensureStore(storeName);
    const db = await this.dbPromise;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName, METADATA_STORE], 'readwrite');
      const store = transaction.objectStore(storeName);
      const metadataStore = transaction.objectStore(METADATA_STORE);

      const metadataKey = buildMetadataKey(storeName, key);
      store.put(record.data, key);
      metadataStore.put({ id: metadataKey, timestamp: record.timestamp });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => {
        console.error(`IndexedDB save failed for ${storeName}:${key}`, transaction.error);
        reject(transaction.error);
      };
      transaction.onabort = () => {
        console.error(`IndexedDB save aborted for ${storeName}:${key}`, transaction.error);
        reject(transaction.error);
      };
    });
  }

  async delete(storeName: string, key: string): Promise<void> {
    await this.ensureStore(storeName);
    const db = await this.dbPromise;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName, METADATA_STORE], 'readwrite');
      const store = transaction.objectStore(storeName);
      const metadataStore = transaction.objectStore(METADATA_STORE);

      store.delete(key);
      metadataStore.delete(buildMetadataKey(storeName, key));

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => {
        console.error(`IndexedDB delete failed for ${storeName}:${key}`, transaction.error);
        reject(transaction.error);
      };
      transaction.onabort = () => {
        console.error(`IndexedDB delete aborted for ${storeName}:${key}`, transaction.error);
        reject(transaction.error);
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

    const newVersion = Math.max(db.version + 1, DB_VERSION);
    db.close();

    this.dbPromise = this.openDatabase(newVersion, (database) => {
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName);
      }
    });

    await this.dbPromise;
  }

  private openDatabase(version?: number, upgradeCallback?: (db: IDBDatabase) => void): Promise<IDBDatabase> {
    const targetVersion = Math.max(version ?? DB_VERSION, DB_VERSION);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, targetVersion);

      request.onupgradeneeded = () => {
        const db = request.result;
        try {
          if (!db.objectStoreNames.contains(METADATA_STORE)) {
            db.createObjectStore(METADATA_STORE, { keyPath: 'id' });
          }

          if (request.oldVersion < DB_VERSION) {
            migrateLegacyStores(request.transaction, db);
          }

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
