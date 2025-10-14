import { APIDataSource } from './APIDataSource';
import { GameDataCatalog } from './DataCatalog';
import { DataCatalogEntry } from './DataCatalogEntry';
import { IndexedDBPersistenceAdapter } from './IndexedDBPersistenceAdapter';
import {
  HerbsCollection,
  MagicsCollection,
  MagicKeysCollection,
  MapColors,
  MapExportData,
  MultibindRecord,
  MultibindsCollection,
  NpcCollection,
  NpcEntry,
  PeopleCollection,
  Person,
} from './entities';
import { WorkerDataSource } from './WorkerDataSource';
import { createPeopleWorker } from './createPeopleWorker';

const STORE_NAMES = {
  mapData: 'mapData',
  colors: 'colors',
  npcs: 'npcs',
  magic: 'magics',
  keys: 'magicKeys',
  herbs: 'herbs',
  people: 'people',
  multibinds: 'multibinds',
} as const;

type StoreNameKey = keyof typeof STORE_NAMES;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const mapPersistenceAdapter = new IndexedDBPersistenceAdapter('GameMapDataDB');
const sharedPersistenceAdapter = new IndexedDBPersistenceAdapter('GameDataDB');

const catalog = new GameDataCatalog();

const mapDataEntry = new DataCatalogEntry<MapExportData>({
  key: 'mapData',
  ttl: DAY_IN_MS,
  storeName: STORE_NAMES.mapData,
  persistenceKey: 'mapExport',
  persistenceAdapter: mapPersistenceAdapter,
  dataSource: new APIDataSource<MapExportData>(
    'https://delwing.github.io/arkadia-mapa/data/mapExport.json',
  ),
});

const colorsEntry = new DataCatalogEntry<MapColors>({
  key: 'colors',
  ttl: DAY_IN_MS,
  storeName: STORE_NAMES.colors,
  persistenceAdapter: mapPersistenceAdapter,
  dataSource: new APIDataSource<MapColors>(
    'https://delwing.github.io/arkadia-mapa/data/colors.json',
  ),
});

type PersistedMultibindRecord = MultibindRecord & { key: string };
type PersistedNpcEntry = NpcEntry & { key: string };

const npcsEntry = new DataCatalogEntry<NpcCollection, PersistedNpcEntry>({
  key: 'npcs',
  ttl: DAY_IN_MS,
  storeName: STORE_NAMES.npcs,
  persistenceKey: 'npc',
  persistenceAdapter: sharedPersistenceAdapter,
  dataSource: new APIDataSource<NpcCollection>(
    'https://delwing.github.io/arkadia-mapa/data/npc.json',
  ),
  collection: {
    toPersistenceItems: (collection) =>
      collection.map((entry) => ({
        ...entry,
        key: `${entry.loc}:${entry.name}`,
      })),
    fromPersistenceItems: (items) =>
      items.map(({ key: _ignored, name, loc, cmd, body, custom }) => {
        const entry: NpcEntry = {
          name,
          loc: Number(loc),
        };
        if (cmd !== undefined) {
          entry.cmd = cmd;
        }
        if (body !== undefined) {
          entry.body = body;
        }
        if (custom === true) {
          entry.custom = true;
        }
        return entry;
      }),
    getPersistenceKey: (entry) => entry.key,
    shouldPreserveItem: (entry) => entry.custom === true,
  },
});

const magicsEntry = new DataCatalogEntry<MagicsCollection>({
  key: 'magic',
  ttl: DAY_IN_MS,
  storeName: STORE_NAMES.magic,
  persistenceKey: 'magics',
  persistenceAdapter: sharedPersistenceAdapter,
  dataSource: new APIDataSource<MagicsCollection>(
    'https://raw.githubusercontent.com/tjurczyk/arkadia-data/refs/heads/master/magics_data.json',
  ),
});

const magicKeysEntry = new DataCatalogEntry<MagicKeysCollection>({
  key: 'keys',
  ttl: DAY_IN_MS,
  storeName: STORE_NAMES.keys,
  persistenceKey: 'keys',
  persistenceAdapter: sharedPersistenceAdapter,
  dataSource: new APIDataSource<MagicKeysCollection>(
    'https://raw.githubusercontent.com/tjurczyk/arkadia-data/refs/heads/master/magic_keys.json',
  ),
});

const herbsEntry = new DataCatalogEntry<HerbsCollection>({
  key: 'herbs',
  ttl: DAY_IN_MS,
  storeName: STORE_NAMES.herbs,
  persistenceKey: 'herbs',
  persistenceAdapter: sharedPersistenceAdapter,
  dataSource: new APIDataSource<HerbsCollection>(
    'https://raw.githubusercontent.com/tjurczyk/arkadia-data/refs/heads/master/herbs_data.json',
  ),
});

const peopleEntry = new DataCatalogEntry<PeopleCollection, Person>({
  key: 'people',
  ttl: 5 * 60_000,
  storeName: STORE_NAMES.people,
  persistenceAdapter: sharedPersistenceAdapter,
  dataSource: new WorkerDataSource<PeopleCollection>(() => createPeopleWorker()),
  collection: {
    toPersistenceItems: (collection) => collection.map((person) => ({ ...person })),
    fromPersistenceItems: (items) => items.map((person) => ({ ...person })),
    getPersistenceKey: (person) => person.id,
  },
});

const multibindsEntry = new DataCatalogEntry<MultibindsCollection, PersistedMultibindRecord>({
  key: 'multibinds',
  ttl: Number.POSITIVE_INFINITY,
  storeName: STORE_NAMES.multibinds,
  persistenceKey: 'multibinds',
  persistenceAdapter: sharedPersistenceAdapter,
  initialData: [],
  collection: {
    toPersistenceItems: (collection) =>
      collection.map((entry) => {
        const roomId = Number(entry.roomId);
        const index = Number(entry.index);
        const key = `${roomId}:${index}`;
        return {
          roomId,
          index,
          action: typeof entry.action === 'string' ? entry.action : String(entry.action ?? ''),
          key,
        };
      }),
    fromPersistenceItems: (items) =>
      items.map(({ key: _ignored, roomId, index, action }) => ({
        roomId: Number(roomId),
        index: Number(index),
        action: typeof action === 'string' ? action : String(action ?? ''),
      })),
    getPersistenceKey: (entry) => entry.key,
  },
});

catalog.register('mapData', mapDataEntry);
catalog.register('colors', colorsEntry);
catalog.register('npcs', npcsEntry);
catalog.register('magic', magicsEntry);
catalog.register('keys', magicKeysEntry);
catalog.register('herbs', herbsEntry);
catalog.register('people', peopleEntry);
catalog.register('multibinds', multibindsEntry);

export type CatalogEntityKey = StoreNameKey;
export const dataCatalog = catalog;
export const gameDataStores = STORE_NAMES;
