import { DataStore, createDataStoreSingleton } from '@modules/data/dataStore/DataStore';
import { Snapshot } from '@modules/data/dataStore/Snapshot';
import { FetchJsonLoader } from '@modules/data/dataStore/strategies/FetchJsonLoader';
import { IndexedDbSingleRecordStrategy } from '@modules/data/dataStore/strategies/IndexedDbSingleRecordStrategy';
import { RefreshMetadata } from '@modules/data/dataStore/types';

// API endpoint for wiedza data
export const WIEDZA_URL =
  'https://ethel.pl/wp-admin/admin-ajax.php?action=wiedza_data';

// Data structure returned by the API
export interface WiedzaApiResponse {
  success: boolean;
  data: {
    data: WiedzaCategory[];
  };
}

// Individual wiedza category
export interface WiedzaCategory {
  [key: string]: any; // Flexible structure for category data
}

// Snapshot stored in IndexedDB
export type WiedzaSnapshot = Snapshot<WiedzaApiResponse>;

/**
 * Creates and returns a singleton DataStore instance for wiedza data.
 * The store uses:
 * - FetchJsonLoader to fetch data from ethel.pl API
 * - IndexedDbSingleRecordStrategy for local caching
 * - 24-hour TTL for automatic refresh
 */
export const getWiedzaStore = createDataStoreSingleton(() => {
  return new DataStore<WiedzaSnapshot, RefreshMetadata>({
    loader: new FetchJsonLoader<WiedzaApiResponse>({
      url: WIEDZA_URL,
    }),
    storage: new IndexedDbSingleRecordStrategy<WiedzaSnapshot>({
      snapshot: {
        dbName: 'ArkadiaWiedzaDB',
        storeName: 'wiedza',
        key: 'wiedza',
      },
    }),
    ttlMs: 24 * 60 * 60 * 1000, // 24 hours
  });
});
