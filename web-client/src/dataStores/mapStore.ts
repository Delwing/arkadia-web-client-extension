import { DataStore, createDataStoreSingleton } from '@client/src/dataStore/DataStore';
import {
  FetchJsonLoader,
  JsonDatasetSnapshot,
} from '@client/src/dataStore/strategies/FetchJsonLoader';
import { IndexedDbSingleRecordStrategy } from '@client/src/dataStore/strategies/IndexedDbSingleRecordStrategy';
import { RefreshMetadata } from '@client/src/dataStore/types';

export const MAP_DATA_URL = 'https://delwing.github.io/arkadia-mapa/data/mapExport.json';
export const MAP_COLORS_URL = 'https://delwing.github.io/arkadia-mapa/data/colors.json';

const TTL = 24 * 60 * 60 * 1000;

export type MapDataSnapshot = JsonDatasetSnapshot<MapData.Map>;
export type MapColorsSnapshot = JsonDatasetSnapshot<MapData.Env[]>;

export const getMapDataStore = createDataStoreSingleton(() =>
  new DataStore<MapDataSnapshot, RefreshMetadata>({
    loader: new FetchJsonLoader<MapData.Map>({
      url: MAP_DATA_URL,
    }),
    storage: new IndexedDbSingleRecordStrategy<MapDataSnapshot>({
      snapshot: { dbName: 'ArkadiaMapDB', storeName: 'mapData', key: 'mapExport' },
    }),
    ttlMs: TTL,
  }),
);

export const getMapColorsStore = createDataStoreSingleton(() =>
  new DataStore<MapColorsSnapshot, RefreshMetadata>({
    loader: new FetchJsonLoader<MapData.Env[]>({
      url: MAP_COLORS_URL,
    }),
    storage: new IndexedDbSingleRecordStrategy<MapColorsSnapshot>({
      snapshot: { dbName: 'ArkadiaMapDB', storeName: 'mapColors', key: 'colors' },
    }),
    ttlMs: TTL,
  }),
);
