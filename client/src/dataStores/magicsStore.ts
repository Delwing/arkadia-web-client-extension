import { DataStore, createDataStoreSingleton } from '../dataStore/DataStore';
import { FetchJsonLoader, JsonDatasetSnapshot } from '../dataStore/strategies/FetchJsonLoader';
import { IndexedDbSingleRecordStrategy } from '../dataStore/strategies/IndexedDbSingleRecordStrategy';
import { RefreshMetadata } from '../dataStore/types';

export interface MagicsFile {
  magics: Record<string, { regexps?: string[] }>;
}

export type MagicsSnapshot = JsonDatasetSnapshot<MagicsFile>;

export const MAGICS_URL =
  'https://raw.githubusercontent.com/tjurczyk/arkadia-data/refs/heads/master/magics_data.json';

const TTL = 24 * 60 * 60 * 1000;

export const getMagicsStore = createDataStoreSingleton(() =>
  new DataStore<MagicsSnapshot, RefreshMetadata>({
    loader: new FetchJsonLoader<MagicsFile>({
      url: MAGICS_URL,
    }),
    storage: new IndexedDbSingleRecordStrategy<MagicsSnapshot>({
      snapshot: { dbName: 'ArkadiaMagicsDB', storeName: 'magics', key: 'magics' },
    }),
    ttlMs: TTL,
  }),
);
