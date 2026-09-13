import { DataStore, createDataStoreSingleton } from '@modules/data/dataStore/DataStore';
import { FetchJsonLoader, JsonDatasetSnapshot } from '@modules/data/dataStore/strategies/FetchJsonLoader';
import { IndexedDbSingleRecordStrategy } from '@modules/data/dataStore/strategies/IndexedDbSingleRecordStrategy';
import { RefreshMetadata } from '@modules/data/dataStore/types';

/**
 * Grammatical cases of `odmiana` in magics_data_v3, singular first, then the
 * `mnoga_` plurals. Kept in data order so flattened forms come out predictably.
 */
export const MAGIC_CASES = [
  'mianownik',
  'dopelniacz',
  'celownik',
  'biernik',
  'narzednik',
  'miejscownik',
  'mnoga_mianownik',
  'mnoga_dopelniacz',
  'mnoga_celownik',
  'mnoga_biernik',
  'mnoga_narzednik',
  'mnoga_miejscownik',
] as const;

export type MagicCase = (typeof MAGIC_CASES)[number];

/**
 * Forms of one item per case. A case holds a list because variants of the same
 * item share it - "otwarta"/"zamknieta" containers and alternate phrasings.
 */
export type MagicForms = Partial<Record<MagicCase, string[]>>;

export interface MagicEntry {
  type: string[];
  /** v3: declined forms grouped by case. */
  odmiana?: MagicForms;
  /** v3: forms that fit no case - irregular phrases and typos kept for matching. */
  dodatkowe_regexps?: string[];
  /**
   * v2: every form in one flat list, with no way to tell which case was matched.
   * Still read so a cached v2 snapshot keeps colouring items until it refreshes.
   */
  regexps?: string[];
}

export interface MagicsFile {
  version?: number;
  magics: Record<string, MagicEntry>;
}

export type MagicsSnapshot = JsonDatasetSnapshot<MagicsFile>;

export const MAGICS_URL =
  'https://raw.githubusercontent.com/tjurczyk/arkadia-data/refs/heads/master/magics_data_v3.json';

const TTL = 24 * 60 * 60 * 1000;

export const getMagicsStore = createDataStoreSingleton(() =>
  new DataStore<MagicsSnapshot, RefreshMetadata>({
    loader: new FetchJsonLoader<MagicsFile>({
      url: MAGICS_URL,
    }),
    storage: new IndexedDbSingleRecordStrategy<MagicsSnapshot>({
      // The record key carries the schema version: a v2 snapshot cached under
      // 'magics' has no `odmiana`, so it is dropped rather than served for up
      // to a TTL after the upgrade.
      snapshot: { dbName: 'ArkadiaMagicsDB', storeName: 'magics', key: 'magics_v3' },
    }),
    ttlMs: TTL,
  }),
);
