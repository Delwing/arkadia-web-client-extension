import { IndexedDBPersistenceAdapter } from './IndexedDBPersistenceAdapter';
import {
  DataSource,
  DataStoreGetOptions,
  DataStoreListener,
  DataStoreProgressListener,
  PersistenceRecord,
} from './types';

interface CollectionPersistenceOptions<T, Persisted> {
  toPersistenceItems(data: T): Persisted[];
  fromPersistenceItems(items: Persisted[]): T;
  getPersistenceKey(item: Persisted): string;
}

interface DataCatalogEntryOptions<T, Persisted = T> {
  key: string;
  ttl: number;
  storeName: string;
  persistenceAdapter: IndexedDBPersistenceAdapter;
  dataSource?: DataSource<T>;
  persistenceKey?: string;
  initialData?: T;
  collection?: CollectionPersistenceOptions<T, Persisted>;
}

interface CollectionIndexRecord {
  keys: string[];
}

const COLLECTION_INDEX_SUFFIX = '__collection_index__';

export class DataCatalogEntry<T, Persisted = T> {
  private data: T | null = null;
  private timestamp = 0;
  private loadingPromise: Promise<T> | null = null;
  private readonly listeners = new Set<DataStoreListener<T>>();
  private readonly persistenceKey: string;
  private loadProgressListeners: Set<DataStoreProgressListener> | null = null;
  private currentProgress = 0;

  constructor(private readonly options: DataCatalogEntryOptions<T, Persisted>) {
    this.persistenceKey = options.persistenceKey ?? options.key;
    if (options.initialData !== undefined) {
      this.data = options.initialData ?? null;
      this.timestamp = Date.now();
    }
  }

  async getData(
    forceReloadOrOptions?: boolean | DataStoreGetOptions,
  ): Promise<T> {
    const { forceReload, onProgress } = this.normalizeGetDataOptions(forceReloadOrOptions);

    if (!forceReload && this.data !== null && !this.isExpired()) {
      onProgress?.(1);
      return this.data;
    }

    let persisted: T | null = null;
    if (!forceReload) {
      persisted = await this.safeLoadFromPersistence(onProgress);
      if (persisted !== null) {
        return persisted;
      }
    }

    if (!this.options.dataSource) {
      if (forceReload) {
        persisted = await this.safeLoadFromPersistence(onProgress);
      }

      if (persisted !== null) {
        return persisted;
      }

      if (this.data !== null) {
        onProgress?.(1);
        return this.data;
      }

      throw new Error(
        `DataCatalog entry with key ${this.options.key} has no data source and no stored data`,
      );
    }

    if (this.loadingPromise) {
      if (onProgress) {
        this.addProgressListener(onProgress);
      }
      return this.loadingPromise;
    }

    this.loadProgressListeners = new Set();
    this.currentProgress = 0;
    if (onProgress) {
      this.addProgressListener(onProgress);
    }

    const progressCallback: DataStoreProgressListener = (progress) => {
      this.notifyProgressListeners(progress);
    };

    this.loadingPromise = this.loadData(forceReload, progressCallback)
      .then((value) => {
        this.notifyProgressListeners(1);
        this.loadingPromise = null;
        this.clearProgressListeners();
        return value;
      })
      .catch((error) => {
        this.loadingPromise = null;
        this.clearProgressListeners();
        throw error;
      });

    return this.loadingPromise;
  }

  private normalizeGetDataOptions(
    forceReloadOrOptions?: boolean | DataStoreGetOptions,
  ): { forceReload: boolean; onProgress?: DataStoreProgressListener } {
    if (typeof forceReloadOrOptions === 'boolean' || forceReloadOrOptions === undefined) {
      return { forceReload: forceReloadOrOptions ?? false };
    }

    return {
      forceReload: forceReloadOrOptions.forceReload ?? false,
      onProgress: forceReloadOrOptions.onProgress,
    };
  }

  private addProgressListener(listener: DataStoreProgressListener): void {
    if (!this.loadProgressListeners) {
      this.loadProgressListeners = new Set();
    }

    this.loadProgressListeners.add(listener);

    try {
      listener(this.currentProgress);
    } catch (error) {
      console.error(`Data progress listener for ${this.options.key} failed`, error);
    }
  }

  private notifyProgressListeners(progress: number): void {
    this.currentProgress = progress;
    if (!this.loadProgressListeners || this.loadProgressListeners.size === 0) {
      return;
    }

    for (const listener of this.loadProgressListeners) {
      try {
        listener(progress);
      } catch (error) {
        console.error(`Data progress listener for ${this.options.key} failed`, error);
      }
    }
  }

  private clearProgressListeners(): void {
    this.loadProgressListeners = null;
    this.currentProgress = 0;
  }

  addListener(listener: DataStoreListener<T>): () => void {
    this.listeners.add(listener);
    if (this.data !== null) {
      listener(this.data);
    }

    return () => this.listeners.delete(listener);
  }

  async invalidate(): Promise<void> {
    await this.clearData();
  }

  async storeData(data: T, options?: { persist?: boolean; timestamp?: number }): Promise<void> {
    const timestamp = options?.timestamp ?? Date.now();
    this.updateMemory(data, timestamp);
    if (options?.persist === false) {
      return;
    }

    await this.persist(data, timestamp);
  }

  async clearData(): Promise<void> {
    this.data = null;
    this.timestamp = 0;
    this.loadingPromise = null;
    this.clearProgressListeners();
    if (!this.options.collection) {
      await this.options.persistenceAdapter.delete(this.options.storeName, this.persistenceKey);
      return;
    }

    await this.clearCollectionPersistence();
  }

  private async loadData(
    forceReload: boolean,
    onProgress?: DataStoreProgressListener,
  ): Promise<T> {
    if (!this.options.dataSource) {
      throw new Error(`No data source configured for ${this.options.key}`);
    }

    if (!forceReload) {
      const persisted = await this.safeLoadFromPersistence(onProgress);
      if (persisted) {
        return persisted;
      }
    }

    const freshData = await this.safeLoadFromSource(onProgress);
    await this.persist(freshData);
    this.updateMemory(freshData);
    return freshData;
  }

  private async safeLoadFromPersistence(
    onProgress?: DataStoreProgressListener,
  ): Promise<T | null> {
    try {
      if (this.options.collection) {
        return await this.safeLoadCollectionFromPersistence(onProgress);
      }

      const record = await this.options.persistenceAdapter.load<T>(
        this.options.storeName,
        this.persistenceKey,
      );
      if (!record) {
        return null;
      }

      if (this.isRecordExpired(record)) {
        return null;
      }

      this.updateMemory(record.data, record.timestamp);
      onProgress?.(1);
      return record.data;
    } catch (error) {
      console.error(`Failed to read persisted data for ${this.options.key}`, error);
      return null;
    }
  }

  private async safeLoadFromSource(
    onProgress?: DataStoreProgressListener,
  ): Promise<T> {
    try {
      return await this.options.dataSource!.load(onProgress);
    } catch (error) {
      console.error(`Failed to load data from source for ${this.options.key}`, error);
      throw error;
    }
  }

  private async persist(data: T, timestamp: number = Date.now()): Promise<void> {
    if (this.options.collection) {
      await this.persistCollection(data, timestamp);
      return;
    }

    const record: PersistenceRecord<T> = {
      data,
      timestamp,
    };

    try {
      await this.options.persistenceAdapter.save(
        this.options.storeName,
        this.persistenceKey,
        record,
      );
    } catch (error) {
      console.error(`Failed to persist data for ${this.options.key}`, error);
    }
  }

  private updateMemory(data: T, timestamp: number = Date.now()): void {
    this.data = data;
    this.timestamp = timestamp;
    this.notifyListeners(data);
  }

  private isExpired(): boolean {
    return Date.now() - this.timestamp > this.options.ttl;
  }

  private isRecordExpired(record: PersistenceRecord<T>): boolean {
    return Date.now() - record.timestamp > this.options.ttl;
  }

  private notifyListeners(data: T): void {
    for (const listener of this.listeners) {
      try {
        listener(data);
      } catch (error) {
        console.error(`Data listener for ${this.options.key} failed`, error);
      }
    }
  }

  private getCollectionIndexKey(): string {
    return `${this.persistenceKey}::${COLLECTION_INDEX_SUFFIX}`;
  }

  private async safeLoadCollectionFromPersistence(
    onProgress?: DataStoreProgressListener,
  ): Promise<T | null> {
    const options = this.options.collection;
    if (!options) {
      return null;
    }

    try {
      const indexRecord = await this.options.persistenceAdapter.load<CollectionIndexRecord>(
        this.options.storeName,
        this.getCollectionIndexKey(),
      );
      if (!indexRecord) {
        return null;
      }

      if (this.isRecordExpired(indexRecord)) {
        return null;
      }

      const keys = Array.isArray(indexRecord.data?.keys)
        ? indexRecord.data.keys.filter((value): value is string => typeof value === 'string')
        : [];

      const items: Persisted[] = [];
      for (const key of keys) {
        try {
          const value = await this.options.persistenceAdapter.loadRaw<Persisted>(
            this.options.storeName,
            key,
          );
          if (value === null) {
            continue;
          }
          items.push(value);
        } catch (error) {
          console.error(`Failed to read persisted item for ${this.options.key}:${key}`, error);
        }
      }

      const data = options.fromPersistenceItems(items);
      this.updateMemory(data, indexRecord.timestamp);
      onProgress?.(1);
      return data;
    } catch (error) {
      console.error(`Failed to read persisted collection data for ${this.options.key}`, error);
      return null;
    }
  }

  private async persistCollection(data: T, timestamp: number): Promise<void> {
    const options = this.options.collection;
    if (!options) {
      return;
    }

    const items = options.toPersistenceItems(data);
    const uniqueItems = new Map<string, Persisted>();
    for (const item of items) {
      const key = options.getPersistenceKey(item);
      if (typeof key !== 'string' || !key) {
        continue;
      }
      uniqueItems.set(key, item);
    }

    const keys = Array.from(uniqueItems.keys());

    try {
      const previousIndex = await this.options.persistenceAdapter.load<CollectionIndexRecord>(
        this.options.storeName,
        this.getCollectionIndexKey(),
      );
      const previousKeys = Array.isArray(previousIndex?.data?.keys)
        ? previousIndex.data.keys.filter((value): value is string => typeof value === 'string')
        : [];

      await Promise.all(
        keys.map((key) =>
          this.options.persistenceAdapter.saveRaw(
            this.options.storeName,
            key,
            uniqueItems.get(key)!,
          ),
        ),
      );

      const keysToDelete = previousKeys.filter((key) => !uniqueItems.has(key));
      await Promise.all(
        keysToDelete.map((key) =>
          this.options.persistenceAdapter.delete(this.options.storeName, key),
        ),
      );

      await this.options.persistenceAdapter.save(this.options.storeName, this.getCollectionIndexKey(), {
        data: { keys },
        timestamp,
      });
    } catch (error) {
      console.error(`Failed to persist collection data for ${this.options.key}`, error);
    }
  }

  private async clearCollectionPersistence(): Promise<void> {
    try {
      const indexRecord = await this.options.persistenceAdapter.load<CollectionIndexRecord>(
        this.options.storeName,
        this.getCollectionIndexKey(),
      );
      const keys = Array.isArray(indexRecord?.data?.keys)
        ? indexRecord.data.keys.filter((value): value is string => typeof value === 'string')
        : [];

      await Promise.all(
        keys.map((key) => this.options.persistenceAdapter.delete(this.options.storeName, key)),
      );

      await this.options.persistenceAdapter.delete(
        this.options.storeName,
        this.getCollectionIndexKey(),
      );
    } catch (error) {
      console.error(`Failed to clear persisted collection data for ${this.options.key}`, error);
    }
  }
}
