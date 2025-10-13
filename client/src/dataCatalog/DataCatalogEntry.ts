import { IndexedDBPersistenceAdapter } from './IndexedDBPersistenceAdapter';
import { DataSource, DataStoreListener, PersistenceRecord } from './types';

interface DataCatalogEntryOptions<T> {
  key: string;
  ttl: number;
  storeName: string;
  persistenceAdapter: IndexedDBPersistenceAdapter;
  dataSource: DataSource<T>;
  persistenceKey?: string;
}

export class DataCatalogEntry<T> {
  private data: T | null = null;
  private timestamp = 0;
  private loadingPromise: Promise<T> | null = null;
  private readonly listeners = new Set<DataStoreListener<T>>();
  private readonly persistenceKey: string;

  constructor(private readonly options: DataCatalogEntryOptions<T>) {
    this.persistenceKey = options.persistenceKey ?? options.key;
  }

  async getData(forceReload = false): Promise<T> {
    if (!forceReload && this.data !== null && !this.isExpired()) {
      return this.data;
    }

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = this.loadData(forceReload)
      .catch((error) => {
        this.loadingPromise = null;
        throw error;
      })
      .then((value) => {
        this.loadingPromise = null;
        return value;
      });

    return this.loadingPromise;
  }

  addListener(listener: DataStoreListener<T>): () => void {
    this.listeners.add(listener);
    if (this.data !== null) {
      listener(this.data);
    }

    return () => this.listeners.delete(listener);
  }

  async invalidate(): Promise<void> {
    this.data = null;
    this.timestamp = 0;
    await this.options.persistenceAdapter.delete(this.options.storeName, this.persistenceKey);
  }

  private async loadData(forceReload: boolean): Promise<T> {
    if (!forceReload) {
      const persisted = await this.safeLoadFromPersistence();
      if (persisted) {
        return persisted;
      }
    }

    const freshData = await this.safeLoadFromSource();
    await this.persist(freshData);
    this.updateMemory(freshData);
    return freshData;
  }

  private async safeLoadFromPersistence(): Promise<T | null> {
    try {
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
      return record.data;
    } catch (error) {
      console.error(`Failed to read persisted data for ${this.options.key}`, error);
      return null;
    }
  }

  private async safeLoadFromSource(): Promise<T> {
    try {
      return await this.options.dataSource.load();
    } catch (error) {
      console.error(`Failed to load data from source for ${this.options.key}`, error);
      throw error;
    }
  }

  private async persist(data: T): Promise<void> {
    const record: PersistenceRecord<T> = {
      data,
      timestamp: Date.now(),
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
}
