import type {RefreshMetadata, StorageStrategy} from './dataStore/types';

type MetadataRecord<TMeta> = {
  id: string;
  value: TMeta;
};

type CollectionEntryRecord<TEntry> = {
  id: string;
  order: number;
  value: TEntry;
};

export interface IndexedDbCollectionStrategyOptions<TEntry> {
  dbName: string;
  entriesStore: string;
  metadataStore: string;
  metadataKey?: string;
  version?: number;
  buildEntryId: (entry: TEntry, index: number) => string;
}

async function openDatabase(options: IndexedDbCollectionStrategyOptions<any>): Promise<IDBDatabase> {
  return await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(options.dbName, options.version ?? 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(options.entriesStore)) {
        db.createObjectStore(options.entriesStore, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(options.metadataStore)) {
        db.createObjectStore(options.metadataStore, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
    request.onblocked = () => reject(new Error('Opening collection database was blocked'));
  });
}

async function runRequest<T>(request: IDBRequest<T>): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB operation failed'));
  });
}

export class IndexedDbCollectionStrategy<TEntry, TMeta extends RefreshMetadata>
  implements StorageStrategy<TEntry[], TMeta>
{
  private readonly options: IndexedDbCollectionStrategyOptions<TEntry>;
  private readonly metadataKey: string;
  private inMemorySnapshot: TEntry[] | undefined;
  private inMemoryMetadata: TMeta | undefined;

  constructor(options: IndexedDbCollectionStrategyOptions<TEntry>) {
    this.options = options;
    this.metadataKey = options.metadataKey ?? 'metadata';
  }

  async readSnapshot(): Promise<TEntry[] | undefined> {
    if (this.inMemorySnapshot) {
      return this.inMemorySnapshot;
    }

    try {
      const db = await openDatabase(this.options);
      try {
        const transaction = db.transaction([this.options.entriesStore], 'readonly');
        const store = transaction.objectStore(this.options.entriesStore);
        const rawRecords = (await runRequest(store.getAll())) as Array<
          CollectionEntryRecord<TEntry> | (TEntry & { id?: string })
        >;
        if (rawRecords.length === 0) {
          this.inMemorySnapshot = undefined;
          return this.inMemorySnapshot;
        }
        this.inMemorySnapshot = rawRecords
            .map((record, index) => {
              if (record && typeof record === 'object' && 'value' in record) {
                const typedRecord = record as CollectionEntryRecord<TEntry>;
                return {order: typedRecord.order ?? index, entry: typedRecord.value};
              }
              const {id: _id, ...rest} = record as TEntry & { id?: string };
              return {order: index, entry: rest as TEntry};
            })
            .sort((a, b) => a.order - b.order)
            .map(({entry}) => entry);
        return this.inMemorySnapshot;
      } finally {
        db.close();
      }
    } catch (error) {
      console.warn('Failed to read collection from IndexedDB:', error);
      return this.inMemorySnapshot;
    }
  }

  async writeSnapshot(snapshot: TEntry[] | undefined): Promise<void> {
    this.inMemorySnapshot = snapshot;

    try {
      const db = await openDatabase(this.options);
      try {
        const transaction = db.transaction([this.options.entriesStore], 'readwrite');
        const store = transaction.objectStore(this.options.entriesStore);
        await runRequest(store.clear());
        if (snapshot) {
          snapshot.forEach((entry, index) => {
            const record: CollectionEntryRecord<TEntry> = {
              id: this.options.buildEntryId(entry, index),
              order: index,
              value: entry,
            };
            store.put(record);
          });
        }
        await new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error ?? new Error('Failed to store collection snapshot'));
          transaction.onabort = () => reject(transaction.error ?? new Error('Storing collection snapshot was aborted'));
        });
      } finally {
        db.close();
      }
    } catch (error) {
      console.warn('Failed to store collection in IndexedDB:', error);
    }
  }

  async readMetadata(): Promise<TMeta | undefined> {
    if (this.inMemoryMetadata) {
      return this.inMemoryMetadata;
    }

    try {
      const db = await openDatabase(this.options);
      try {
        const transaction = db.transaction([this.options.metadataStore], 'readonly');
        const store = transaction.objectStore(this.options.metadataStore);
        const record = (await runRequest(store.get(this.metadataKey))) as MetadataRecord<TMeta> | undefined;
        if (record?.value) {
          this.inMemoryMetadata = record.value;
        }
        return this.inMemoryMetadata;
      } finally {
        db.close();
      }
    } catch (error) {
      console.warn('Failed to read collection metadata from IndexedDB:', error);
      return this.inMemoryMetadata;
    }
  }

  async writeMetadata(metadata: TMeta | undefined): Promise<void> {
    this.inMemoryMetadata = metadata;

    try {
      const db = await openDatabase(this.options);
      try {
        const transaction = db.transaction([this.options.metadataStore], 'readwrite');
        const store = transaction.objectStore(this.options.metadataStore);
        if (metadata === undefined) {
          await runRequest(store.delete(this.metadataKey));
        } else {
          const record: MetadataRecord<TMeta> = { id: this.metadataKey, value: metadata };
          await runRequest(store.put(record));
        }
        await new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error ?? new Error('Failed to store collection metadata'));
          transaction.onabort = () => reject(transaction.error ?? new Error('Storing collection metadata was aborted'));
        });
      } finally {
        db.close();
      }
    } catch (error) {
      console.warn('Failed to store collection metadata in IndexedDB:', error);
    }
  }

  async clear(): Promise<void> {
    this.inMemorySnapshot = undefined;
    this.inMemoryMetadata = undefined;

    try {
      const db = await openDatabase(this.options);
      try {
        const transaction = db.transaction(
          [this.options.entriesStore, this.options.metadataStore],
          'readwrite',
        );
        await Promise.all([
          runRequest(transaction.objectStore(this.options.entriesStore).clear()),
          runRequest(transaction.objectStore(this.options.metadataStore).clear()),
        ]);
        await new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error ?? new Error('Failed to clear collection cache'));
          transaction.onabort = () => reject(transaction.error ?? new Error('Clearing collection cache was aborted'));
        });
      } finally {
        db.close();
      }
    } catch (error) {
      console.warn('Failed to clear collection cache in IndexedDB:', error);
    }
  }

  invalidateCache(): void {
    this.inMemorySnapshot = undefined;
    this.inMemoryMetadata = undefined;
  }
}
