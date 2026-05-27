import { DataStore, createDataStoreSingleton } from '@modules/data/dataStore/DataStore';
import { FetchJsonLoader, JsonDatasetSnapshot } from '@modules/data/dataStore/strategies/FetchJsonLoader';
import { IndexedDbSingleRecordStrategy } from '@modules/data/dataStore/strategies/IndexedDbSingleRecordStrategy';
import { RefreshMetadata } from '@modules/data/dataStore/types';

export interface HerbForms {
  mianownik: string;
  dopelniacz: string;
  biernik: string;
  mnoga_mianownik: string;
  mnoga_dopelniacz: string;
  mnoga_biernik: string;
  /** Instrumental case, used by the "nabij fajke <herb>" command. */
  narzednik: string;
}

export interface HerbUse {
  action: string;
  effect: string;
  dont_bind?: boolean;
  /**
   * Marks a use that signals the herb can be smoked. Such entries carry no real
   * action/effect — they only flag smokability and are rendered with a pipe
   * glyph rather than as a bindable action.
   */
  smokable?: boolean;
}

export interface HerbsData {
  herb_id_to_odmiana: Record<string, HerbForms>;
  version: number;
  herb_id_to_use: Record<string, HerbUse[]>;
}

/** Whether a herb can be smoked (any of its uses is flagged `smokable`). */
export function isHerbSmokable(uses: HerbUse[] | undefined): boolean {
  return Array.isArray(uses) && uses.some(use => use.smokable === true);
}

/**
 * Real, bindable actions for a herb — excludes `dont_bind` entries and
 * `smokable` markers (which have no real action).
 */
export function getBindableUses(uses: HerbUse[] | undefined): HerbUse[] {
  if (!uses) return [];
  return uses.filter(use => !use.dont_bind && !use.smokable);
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
