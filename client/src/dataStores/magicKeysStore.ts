import { DataStore, createDataStoreSingleton } from '../dataStore/DataStore';
import { FetchJsonLoader, JsonDatasetSnapshot } from '../dataStore/strategies/FetchJsonLoader';
import { IndexedDbSingleRecordStrategy } from '../dataStore/strategies/IndexedDbSingleRecordStrategy';
import { RefreshMetadata } from '../dataStore/types';

export interface MagicKeysData {
  magic_keys: string[];
}

export type MagicKeysSnapshot = JsonDatasetSnapshot<MagicKeysData>;

export const MAGIC_KEYS_URL =
  'https://raw.githubusercontent.com/tjurczyk/arkadia-data/refs/heads/master/magic_keys.json';

const TTL = 24 * 60 * 60 * 1000;

export const getMagicKeysStore = createDataStoreSingleton(() =>
  new DataStore<MagicKeysSnapshot, RefreshMetadata>({
    loader: new FetchJsonLoader<MagicKeysData>({
      url: MAGIC_KEYS_URL,
    }),
    storage: new IndexedDbSingleRecordStrategy<MagicKeysSnapshot>({
      snapshot: { dbName: 'ArkadiaMagicKeysDB', storeName: 'magicKeys', key: 'keys' },
    }),
    ttlMs: TTL,
  }),
);
