import { PersistenceAdapter, PersistenceRecord } from './types';

interface StoreInitStatus {
  initialized: boolean;
  promise: Promise<void> | null;
}

type PersistenceDataType = 'array' | 'object' | 'primitive';

interface MetadataRecord {
  id: string;
  timestamp: number;
  dataType: PersistenceDataType;
}

interface NormalizedEntry {
  key: string;
  value: Record<string, unknown>;
}

const DB_VERSION = 3;
const METADATA_STORE = '__metadata__';
const INTERNAL_PREFIX = '__arkadia__';
const PARENT_FIELD = `${INTERNAL_PREFIX}parent`;
const INDEX_FIELD = `${INTERNAL_PREFIX}index`;
const VALUE_FIELD = `${INTERNAL_PREFIX}value`;
const PARENT_INDEX = `${INTERNAL_PREFIX}by_parent`;
const ENTRY_SEPARATOR = '::';

function buildMetadataKey(storeName: string, key: IDBValidKey | string): string {
  return `${storeName}:${String(key)}`;
}

function determineDataType(value: unknown): PersistenceDataType {
  if (Array.isArray(value)) {
    return 'array';
  }

  if (value !== null && typeof value === 'object') {
    return 'object';
  }

  return 'primitive';
}

function buildArrayEntryKey(parentKey: string, index: number): string {
  return `${parentKey}${ENTRY_SEPARATOR}${index}`;
}

function normalizeArrayEntry(parentKey: string, index: number, entry: unknown): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    [PARENT_FIELD]: parentKey,
    [INDEX_FIELD]: index,
  };

  if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
    Object.assign(normalized, entry as Record<string, unknown>);
  } else {
    normalized[VALUE_FIELD] = entry as unknown;
  }

  return normalized;
}

function normalizeData(key: string, value: unknown): { entries: NormalizedEntry[]; dataType: PersistenceDataType } {
  const dataType = determineDataType(value);

  if (dataType === 'array') {
    const arrayValue = value as unknown[];
    const entries = arrayValue.map((item, index) => ({
      key: buildArrayEntryKey(key, index),
      value: normalizeArrayEntry(key, index, item),
    }));

    return { entries, dataType };
  }

  if (dataType === 'object') {
    const objectValue = value as Record<string, unknown>;
    return {
      entries: [
        {
          key,
          value: { ...objectValue },
        },
      ],
      dataType,
    };
  }

  return {
    entries: [
      {
        key,
        value: { [VALUE_FIELD]: value },
      },
    ],
    dataType: 'primitive',
  };
}

function denormalizeArrayEntries(entries: Record<string, unknown>[]): unknown[] {
  const sorted = entries
    .slice()
    .sort((a, b) => {
      const aIndex = (a[INDEX_FIELD] as number | undefined) ?? 0;
      const bIndex = (b[INDEX_FIELD] as number | undefined) ?? 0;
      return aIndex - bIndex;
    });

  return sorted.map((entry) => {
    const hasPrimitiveValue = Object.prototype.hasOwnProperty.call(entry, VALUE_FIELD);
    const primitiveValue = entry[VALUE_FIELD];
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(entry)) {
      if (key === PARENT_FIELD || key === INDEX_FIELD || key === VALUE_FIELD) {
        continue;
      }

      result[key] = value;
    }

    if (hasPrimitiveValue) {
      return primitiveValue;
    }

    return result;
  });
}

function inferDataType(directValue: unknown, arrayEntries: Record<string, unknown>[]): PersistenceDataType {
  if (arrayEntries.length > 0) {
    return 'array';
  }

  if (Array.isArray(directValue)) {
    return 'array';
  }

  if (directValue !== null && typeof directValue === 'object') {
    const record = directValue as Record<string, unknown>;
    if ('data' in record && Array.isArray(record.data)) {
      return 'array';
    }

    return 'object';
  }

  return 'primitive';
}

function ensureParentIndex(store: IDBObjectStore): void {
  if (!store.indexNames.contains(PARENT_INDEX)) {
    store.createIndex(PARENT_INDEX, PARENT_FIELD, { unique: false });
  }
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
      ensureParentIndex(store);

      const cursorRequest = store.openCursor();

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result as IDBCursorWithValue | null;
        if (!cursor) {
          return;
        }

        const primaryKey = cursor.primaryKey as IDBValidKey;
        const key = String(primaryKey);
        const rawValue = cursor.value as unknown;

        if (
          rawValue !== null &&
          typeof rawValue === 'object' &&
          PARENT_FIELD in (rawValue as Record<string, unknown>)
        ) {
          cursor.continue();
          return;
        }

        let data: unknown = rawValue;
        if (rawValue && typeof rawValue === 'object' && 'data' in (rawValue as Record<string, unknown>)) {
          data = (rawValue as Record<string, unknown>).data;
        }

        const dataType = determineDataType(data);

        if (dataType === 'array') {
          cursor.delete();
          const normalized = normalizeData(key, data);
          for (const entry of normalized.entries) {
            store.put(entry.value, entry.key);
          }
        } else if (dataType === 'primitive') {
          if (
            !(
              rawValue &&
              typeof rawValue === 'object' &&
              VALUE_FIELD in (rawValue as Record<string, unknown>)
            )
          ) {
            cursor.update({ [VALUE_FIELD]: data });
          }
        } else if (dataType === 'object') {
          if (
            rawValue &&
            typeof rawValue === 'object' &&
            'data' in (rawValue as Record<string, unknown>)
          ) {
            cursor.update({ ...(data as Record<string, unknown>) });
          }
        }

        const metadataKey = buildMetadataKey(storeName, key);
        const metadataRequest = metadataStore.get(metadataKey);
        metadataRequest.onsuccess = () => {
          const existing = metadataRequest.result as MetadataRecord | undefined;
          const timestamp =
            existing?.timestamp ??
            (rawValue &&
            typeof rawValue === 'object' &&
            'timestamp' in (rawValue as Record<string, unknown>) &&
            typeof (rawValue as Record<string, unknown>).timestamp === 'number'
              ? Number((rawValue as Record<string, unknown>).timestamp)
              : Date.now());
          metadataStore.put({ id: metadataKey, timestamp, dataType });
        };

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

      const metadataKey = buildMetadataKey(storeName, key);
      const metadataRequest = metadataStore.get(metadataKey);
      const directRequest = store.get(key);
      const arrayEntries: Record<string, unknown>[] = [];

      if (store.indexNames.contains(PARENT_INDEX)) {
        const range = IDBKeyRange.only(key);
        const cursorRequest = store.index(PARENT_INDEX).openCursor(range);
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result as IDBCursorWithValue | null;
          if (!cursor) {
            return;
          }

          arrayEntries.push(cursor.value as Record<string, unknown>);
          cursor.continue();
        };
      }

      transaction.oncomplete = () => {
        const metadata = metadataRequest.result as MetadataRecord | undefined;
        const directValue = directRequest.result as unknown;

        if (!metadata && directValue === undefined && arrayEntries.length === 0) {
          resolve(null);
          return;
        }

        const dataType = metadata?.dataType ?? inferDataType(directValue, arrayEntries);
        const timestampFromMetadata = metadata?.timestamp ?? null;

        const timestamp =
          timestampFromMetadata ??
          (directValue && typeof directValue === 'object' && directValue !== null && 'timestamp' in (directValue as Record<string, unknown>)
            ? Number((directValue as Record<string, unknown>).timestamp)
            : Date.now());

        let data: unknown;

        if (dataType === 'array') {
          if (arrayEntries.length > 0) {
            data = denormalizeArrayEntries(arrayEntries);
          } else if (Array.isArray(directValue)) {
            data = directValue;
          } else if (
            directValue &&
            typeof directValue === 'object' &&
            'data' in (directValue as Record<string, unknown>) &&
            Array.isArray((directValue as Record<string, unknown>).data)
          ) {
            data = (directValue as Record<string, unknown>).data;
          } else {
            data = [];
          }
        } else if (dataType === 'primitive') {
          if (directValue && typeof directValue === 'object' && directValue !== null) {
            const record = directValue as Record<string, unknown>;
            if (VALUE_FIELD in record) {
              data = record[VALUE_FIELD];
            } else if ('data' in record) {
              data = record.data;
            } else {
              data = null;
            }
          } else {
            data = directValue ?? null;
          }
        } else {
          if (directValue && typeof directValue === 'object' && directValue !== null) {
            const record = directValue as Record<string, unknown>;
            if ('data' in record) {
              data = record.data;
            } else {
              data = record;
            }
          } else {
            data = directValue ?? null;
          }
        }

        if (data === null) {
          resolve(null);
          return;
        }

        resolve({ data: data as T, timestamp });
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

    const { entries, dataType } = normalizeData(key, record.data);

    await this.clearExistingEntries(db, storeName, key);

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName, METADATA_STORE], 'readwrite');
      const store = transaction.objectStore(storeName);
      const metadataStore = transaction.objectStore(METADATA_STORE);
      const metadataKey = buildMetadataKey(storeName, key);

      for (const entry of entries) {
        store.put(entry.value, entry.key);
      }

      metadataStore.put({ id: metadataKey, timestamp: record.timestamp, dataType });

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

    await this.clearExistingEntries(db, storeName, key);

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(METADATA_STORE, 'readwrite');
      const metadataStore = transaction.objectStore(METADATA_STORE);
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

    this.dbPromise = this.openDatabase(newVersion, (database, transaction) => {
      if (!database.objectStoreNames.contains(storeName)) {
        const store = database.createObjectStore(storeName);
        ensureParentIndex(store);
      } else if (transaction) {
        const existingStore = transaction.objectStore(storeName);
        ensureParentIndex(existingStore);
      }
    });

    await this.dbPromise;
  }

  private openDatabase(
    version?: number,
    upgradeCallback?: (db: IDBDatabase, transaction: IDBTransaction | null) => void,
  ): Promise<IDBDatabase> {
    const targetVersion = Math.max(version ?? DB_VERSION, DB_VERSION);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, targetVersion);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const transaction = request.transaction;
        try {
          if (!db.objectStoreNames.contains(METADATA_STORE)) {
            db.createObjectStore(METADATA_STORE, { keyPath: 'id' });
          }

          if (transaction) {
            for (const name of Array.from(db.objectStoreNames)) {
              if (name === METADATA_STORE) {
                continue;
              }

              const store = transaction.objectStore(name);
              ensureParentIndex(store);
            }
          }

          const previousVersion = (event as IDBVersionChangeEvent).oldVersion ?? 0;
          if (previousVersion < DB_VERSION) {
            migrateLegacyStores(transaction, db);
          }

          upgradeCallback?.(db, transaction ?? null);
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

  private clearExistingEntries(db: IDBDatabase, storeName: string, key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);

      store.delete(key);

      if (store.indexNames.contains(PARENT_INDEX)) {
        const range = IDBKeyRange.only(key);
        const cursorRequest = store.index(PARENT_INDEX).openKeyCursor(range);
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result as IDBCursor | null;
          if (!cursor) {
            return;
          }

          store.delete(cursor.primaryKey);
          cursor.continue();
        };
      }

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => {
        console.error(`IndexedDB cleanup failed for ${storeName}:${key}`, transaction.error);
        reject(transaction.error);
      };
      transaction.onabort = () => {
        console.error(`IndexedDB cleanup aborted for ${storeName}:${key}`, transaction.error);
        reject(transaction.error);
      };
    });
  }
}
