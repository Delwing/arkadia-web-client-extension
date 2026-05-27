import type { RefreshMetadata } from '@modules/data/dataStore/types';
import { getMapDataStore, getMapColorsStore } from '@web/dataStores/mapStore';
import { getHerbsStore } from '@modules/data/dataStores/herbsStore';
import { getMagicsStore } from '@modules/data/dataStores/magicsStore';
import { getMagicKeysStore } from '@modules/data/dataStores/magicKeysStore';
import { getKnowledgeStore } from '@modules/data/dataStores/knowledgeStore';
import { getWiedzaStore } from '@modules/data/dataStores/wiedzaStore';
import { getKnowledgeDetailsStore } from '@modules/data/dataStores/knowledgeDetailsStore';
import * as peopleStore from '@modules/data/peopleStore';
import * as npcStore from '@web/dataStores/npcStore';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

/**
 * Uniform descriptor for one cached remote data source. Adapts the various
 * heterogeneous DataStore singletons (and the few stores that expose only
 * module-level functions) to a single shape the popup can iterate over.
 */
export interface DataSource {
  id: string;
  label: string;
  /** TTL used to estimate the next fetch (refreshedAt + ttlMs). */
  ttlMs: number;
  /**
   * True when the store does not refresh purely on a timer but checks a remote
   * version first (map stores). The ttlMs is then only a fallback estimate.
   */
  versionChecked?: boolean;
  getMetadata: () => Promise<RefreshMetadata | undefined>;
  /** Raw cached snapshot, used to render the in-popup data preview. */
  getSnapshot: () => Promise<unknown>;
  refresh: () => Promise<unknown>;
}

export const DATA_SOURCES: DataSource[] = [
  {
    id: 'map',
    label: 'Mapa',
    ttlMs: SEVEN_DAYS_MS,
    versionChecked: true,
    getMetadata: () => getMapDataStore().getMetadata(),
    getSnapshot: () => getMapDataStore().getSnapshot(),
    refresh: () => getMapDataStore().refresh({ force: true }),
  },
  {
    id: 'mapColors',
    label: 'Kolory mapy',
    ttlMs: SEVEN_DAYS_MS,
    versionChecked: true,
    getMetadata: () => getMapColorsStore().getMetadata(),
    getSnapshot: () => getMapColorsStore().getSnapshot(),
    refresh: () => getMapColorsStore().refresh({ force: true }),
  },
  {
    id: 'people',
    label: 'Postacie',
    ttlMs: ONE_DAY_MS,
    getMetadata: () => peopleStore.getMetadata(),
    getSnapshot: () => peopleStore.getSnapshot(),
    refresh: () => peopleStore.forceRefresh(),
  },
  {
    id: 'herbs',
    label: 'Zioła',
    ttlMs: ONE_DAY_MS,
    getMetadata: () => getHerbsStore().getMetadata(),
    getSnapshot: () => getHerbsStore().getSnapshot(),
    refresh: () => getHerbsStore().refresh({ force: true }),
  },
  {
    id: 'magics',
    label: 'Magia',
    ttlMs: ONE_DAY_MS,
    getMetadata: () => getMagicsStore().getMetadata(),
    getSnapshot: () => getMagicsStore().getSnapshot(),
    refresh: () => getMagicsStore().refresh({ force: true }),
  },
  {
    id: 'magicKeys',
    label: 'Klucze magiczne',
    ttlMs: ONE_DAY_MS,
    getMetadata: () => getMagicKeysStore().getMetadata(),
    getSnapshot: () => getMagicKeysStore().getSnapshot(),
    refresh: () => getMagicKeysStore().refresh({ force: true }),
  },
  {
    id: 'knowledge',
    label: 'Wiedza (księgi)',
    ttlMs: ONE_DAY_MS,
    getMetadata: () => getKnowledgeStore().getMetadata(),
    getSnapshot: () => getKnowledgeStore().getSnapshot(),
    refresh: () => getKnowledgeStore().refresh({ force: true }),
  },
  {
    id: 'wiedza',
    label: 'Wiedza (definicje)',
    ttlMs: ONE_DAY_MS,
    getMetadata: () => getWiedzaStore().getMetadata(),
    getSnapshot: () => getWiedzaStore().getSnapshot(),
    refresh: () => getWiedzaStore().refresh({ force: true }),
  },
  {
    id: 'knowledgeDetails',
    label: 'Szczegóły wiedzy',
    ttlMs: ONE_DAY_MS,
    getMetadata: () => getKnowledgeDetailsStore().getMetadata(),
    getSnapshot: () => getKnowledgeDetailsStore().getSnapshot(),
    refresh: () => getKnowledgeDetailsStore().refresh({ force: true }),
  },
  {
    id: 'npc',
    label: 'NPC',
    ttlMs: ONE_DAY_MS,
    getMetadata: () => npcStore.getMetadata(),
    getSnapshot: () => npcStore.getSnapshot(),
    refresh: () => npcStore.refresh({ force: true }),
  },
];

/**
 * Timestamp (ms) at which the source is next due to refresh. Returns undefined
 * when the source has never been fetched (refreshedAt missing/zero).
 */
export function computeNextFetch(
  refreshedAt: number | undefined,
  ttlMs: number,
): number | undefined {
  if (!refreshedAt) {
    return undefined;
  }
  return refreshedAt + ttlMs;
}
