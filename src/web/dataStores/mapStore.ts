import { DataStore, createDataStoreSingleton } from '@modules/data/dataStore/DataStore';
import {
  FetchJsonLoader,
  JsonDatasetSnapshot,
} from '@modules/data/dataStore/strategies/FetchJsonLoader';
import { IndexedDbSingleRecordStrategy } from '@modules/data/dataStore/strategies/IndexedDbSingleRecordStrategy';
import {
  VersionCheckingLoader,
  GITHUB_RELEASES_LATEST_URL,
  extractGitHubReleaseTag,
} from '@modules/data/dataStore/strategies/VersionCheckingLoader';
import { RefreshMetadata } from '@modules/data/dataStore/types';

export const MAP_DATA_URL = import.meta.env.VITE_MAP_DATA_URL ?? 'https://delwing.github.io/arkadia-mapa/data/mapExport.json';
export const MAP_COLORS_URL = import.meta.env.VITE_MAP_COLORS_URL ?? 'https://delwing.github.io/arkadia-mapa/data/colors.json';
export const MAP_RELEASE_URL = import.meta.env.VITE_MAP_RELEASE_URL ?? GITHUB_RELEASES_LATEST_URL('Delwing', 'arkadia-mapa');

const FALLBACK_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days - used only when GitHub API is unavailable

export type MapDataSnapshot = JsonDatasetSnapshot<MapData.Map>;
export type MapColorsSnapshot = JsonDatasetSnapshot<MapData.Env[]>;

export const getMapDataStore = createDataStoreSingleton(() =>
  new DataStore<MapDataSnapshot, RefreshMetadata>({
    loader: new VersionCheckingLoader<MapDataSnapshot>({
      inner: new FetchJsonLoader<MapData.Map>({
        url: MAP_DATA_URL,
      }),
      versionUrl: MAP_RELEASE_URL,
      extractVersion: extractGitHubReleaseTag,
      fallbackTtlMs: FALLBACK_TTL,
    }),
    storage: new IndexedDbSingleRecordStrategy<MapDataSnapshot>({
      snapshot: { dbName: 'ArkadiaMapDB', storeName: 'mapData', key: 'mapExport' },
    }),
  }),
);

export const getMapColorsStore = createDataStoreSingleton(() =>
  new DataStore<MapColorsSnapshot, RefreshMetadata>({
    loader: new VersionCheckingLoader<MapColorsSnapshot>({
      inner: new FetchJsonLoader<MapData.Env[]>({
        url: MAP_COLORS_URL,
      }),
      versionUrl: MAP_RELEASE_URL,
      extractVersion: extractGitHubReleaseTag,
      fallbackTtlMs: FALLBACK_TTL,
    }),
    storage: new IndexedDbSingleRecordStrategy<MapColorsSnapshot>({
      snapshot: { dbName: 'ArkadiaMapDB', storeName: 'mapColors', key: 'colors' },
    }),
  }),
);
