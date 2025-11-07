import {
  clearIndexedDB,
  getFromIndexedDB,
  IndexedDBConfig,
  storeInIndexedDB,
} from '@client/utils/dataCache';
import { RefreshMetadata, StorageStrategy } from '../types';

export interface IndexedDbSingleRecordStrategyOptions {
  snapshot: IndexedDBConfig;
  metadata?: IndexedDBConfig;
}

export class IndexedDbSingleRecordStrategy<TSnapshot, TMeta extends RefreshMetadata = RefreshMetadata>
  implements StorageStrategy<TSnapshot, TMeta>
{
  private readonly snapshotConfig: IndexedDBConfig;
  private readonly metadataConfig: IndexedDBConfig;
  private inMemorySnapshot: TSnapshot | undefined;
  private inMemoryMetadata: TMeta | undefined;

  constructor(options: IndexedDbSingleRecordStrategyOptions) {
    this.snapshotConfig = options.snapshot;
    this.metadataConfig =
      options.metadata ?? {
        ...options.snapshot,
        key: `metadata`,
      };
  }

  async readSnapshot(): Promise<TSnapshot | undefined> {
    try {
      const value = await getFromIndexedDB<TSnapshot>(this.snapshotConfig);
      if (value != null) {
        this.inMemorySnapshot = value;
      }
    } catch (error) {
      console.warn('Failed to read snapshot from IndexedDB:', error);
    }
    return this.inMemorySnapshot;
  }

  async writeSnapshot(snapshot: TSnapshot | undefined): Promise<void> {
    this.inMemorySnapshot = snapshot;
    if (snapshot === undefined) {
      await this.safeClear(this.snapshotConfig);
      return;
    }
    await this.safeStore(this.snapshotConfig, snapshot);
  }

  async readMetadata(): Promise<TMeta | undefined> {
    try {
      const value = await getFromIndexedDB<TMeta>(this.metadataConfig);
      if (value != null) {
        this.inMemoryMetadata = value;
      }
    } catch (error) {
      console.warn('Failed to read metadata from IndexedDB:', error);
    }
    return this.inMemoryMetadata;
  }

  async writeMetadata(metadata: TMeta | undefined): Promise<void> {
    this.inMemoryMetadata = metadata;
    if (metadata === undefined) {
      await this.safeClear(this.metadataConfig);
      return;
    }
    await this.safeStore(this.metadataConfig, metadata);
  }

  async clear(): Promise<void> {
    this.inMemorySnapshot = undefined;
    this.inMemoryMetadata = undefined;
    await Promise.all([
      this.safeClear(this.snapshotConfig),
      this.safeClear(this.metadataConfig),
    ]);
  }

  private async safeStore(config: IndexedDBConfig, data: unknown): Promise<void> {
    try {
      await storeInIndexedDB(config, data);
    } catch (error) {
      console.warn('Failed to store data in IndexedDB:', error);
    }
  }

  private async safeClear(config: IndexedDBConfig): Promise<void> {
    try {
      await clearIndexedDB(config);
    } catch (error) {
      console.warn('Failed to clear IndexedDB:', error);
    }
  }
}
