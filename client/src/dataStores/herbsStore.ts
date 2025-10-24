import { DataStore, createDataStoreSingleton } from '../dataStore/DataStore';
import { FetchJsonLoader, JsonDatasetSnapshot } from '../dataStore/strategies/FetchJsonLoader';
import { IndexedDbSingleRecordStrategy } from '../dataStore/strategies/IndexedDbSingleRecordStrategy';
import { RefreshMetadata } from '../dataStore/types';

export interface HerbForms {
  mianownik: string;
  dopelniacz: string;
  biernik: string;
  mnoga_mianownik: string;
  mnoga_dopelniacz: string;
  mnoga_biernik: string;
}

export interface HerbUse {
  action: string;
  effect: string;
  dont_bind?: boolean;
}

export interface HerbsData {
  herb_id_to_odmiana: Record<string, HerbForms>;
  version: number;
  herb_id_to_use: Record<string, HerbUse[]>;
}

export const HERBS_URL =
  'https://raw.githubusercontent.com/tjurczyk/arkadia-data/refs/heads/master/herbs_data.json';

export type HerbsSnapshot = JsonDatasetSnapshot<HerbsData>;

const TTL = 24 * 60 * 60 * 1000;

export const getHerbsStore = createDataStoreSingleton(() =>
  new DataStore<HerbsSnapshot, RefreshMetadata>({
    loader: new FetchJsonLoader<HerbsData>({
      url: HERBS_URL,
    }),
    storage: new IndexedDbSingleRecordStrategy<HerbsSnapshot>({
      snapshot: { dbName: 'ArkadiaHerbsDB', storeName: 'herbs', key: 'herbs' },
    }),
    ttlMs: TTL,
  }),
);
