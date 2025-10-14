import { DataCatalogEntry } from './DataCatalogEntry';
import { DataStoreListener } from './types';

import {
  HerbsCollection,
  MagicKeysCollection,
  MagicsCollection,
  MapColors,
  MapExportData,
  MultibindsCollection,
  NpcCollection,
  PeopleCollection,
} from './entities';

export interface DataCatalogStore<T> {
  getData(options?: { forceReload?: boolean }): Promise<T>;
  addListener(listener: DataStoreListener<T>): () => void;
  invalidate(): Promise<void>;
  storeData(data: T, options?: { persist?: boolean; timestamp?: number }): Promise<void>;
  clearData(): Promise<void>;
}

export class DataCatalog {
  private readonly entries = new Map<string, DataCatalogEntry<unknown, unknown>>();
  private readonly stores = new Map<string, DataCatalogStore<unknown>>();

  register<T>(key: string, entry: DataCatalogEntry<T, unknown>): void {
    if (this.entries.has(key)) {
      throw new Error(`DataCatalog entry with key ${key} is already registered`);
    }

    this.entries.set(key, entry as DataCatalogEntry<unknown, unknown>);
  }

  async getData<T>(key: string, options?: { forceReload?: boolean }): Promise<T> {
    const entry = this.getEntry<T>(key);
    return entry.getData(options?.forceReload);
  }

  addListener<T>(key: string, listener: DataStoreListener<T>): () => void {
    const entry = this.getEntry<T>(key);
    return entry.addListener(listener);
  }

  async invalidate(key: string): Promise<void> {
    const entry = this.getEntry(key);
    await entry.invalidate();
  }

  async storeData<T>(
    key: string,
    data: T,
    options?: { persist?: boolean; timestamp?: number },
  ): Promise<void> {
    const entry = this.getEntry<T>(key);
    await entry.storeData(data, options);
  }

  async clearData(key: string): Promise<void> {
    const entry = this.getEntry(key);
    await entry.clearData();
  }

  getStore<T>(key: string): DataCatalogStore<T> {
    if (this.stores.has(key)) {
      return this.stores.get(key) as DataCatalogStore<T>;
    }

    const entry = this.getEntry<T>(key);
    const store: DataCatalogStore<T> = {
      getData: (options) => entry.getData(options?.forceReload),
      addListener: (listener) => entry.addListener(listener),
      invalidate: () => entry.invalidate(),
      storeData: (data, options) => entry.storeData(data, options),
      clearData: () => entry.clearData(),
    };

    this.stores.set(key, store as DataCatalogStore<unknown>);

    return store;
  }

  protected getEntry<T>(key: string): DataCatalogEntry<T, unknown> {
    const entry = this.entries.get(key);
    if (!entry) {
      throw new Error(`DataCatalog entry with key ${key} is not registered`);
    }

    return entry as DataCatalogEntry<T, unknown>;
  }
}

export class GameDataCatalog extends DataCatalog {
  getMapDataStore(): DataCatalogStore<MapExportData> {
    return this.getStore('mapData');
  }

  getMapColorsStore(): DataCatalogStore<MapColors> {
    return this.getStore('colors');
  }

  getNpcStore(): DataCatalogStore<NpcCollection> {
    return this.getStore('npcs');
  }

  getMagicsStore(): DataCatalogStore<MagicsCollection> {
    return this.getStore('magic');
  }

  getMagicKeysStore(): DataCatalogStore<MagicKeysCollection> {
    return this.getStore('keys');
  }

  getHerbsStore(): DataCatalogStore<HerbsCollection> {
    return this.getStore('herbs');
  }

  getPeopleStore(): DataCatalogStore<PeopleCollection> {
    return this.getStore('people');
  }

  getMultibindsStore(): DataCatalogStore<MultibindsCollection> {
    return this.getStore('multibinds');
  }
}
