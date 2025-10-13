import { dataCatalog } from './catalogInstance';
import {
  HerbsCollection,
  MagicsCollection,
  MagicKeysCollection,
  MapColors,
  MapExportData,
  NpcCollection,
  PeopleCollection,
} from './entities';

const safeLoad = async <T>(loader: () => Promise<T>): Promise<T | null> => {
  try {
    return await loader();
  } catch (error) {
    console.warn('Failed to retrieve data catalog entry', error);
    return null;
  }
};

export async function demonstrateDataCatalogLifecycle(): Promise<void> {
  const mapDataStore = dataCatalog.getMapDataStore();
  const peopleStore = dataCatalog.getPeopleStore();
  const colorsStore = dataCatalog.getMapColorsStore();
  const npcStore = dataCatalog.getNpcStore();
  const magicsStore = dataCatalog.getMagicsStore();
  const magicKeysStore = dataCatalog.getMagicKeysStore();
  const herbsStore = dataCatalog.getHerbsStore();

  const unsubscribeMap = mapDataStore.addListener((data) => {
    console.log('[Listener] mapData updated: loaded', data.length, 'areas');
  });
  const unsubscribePeople = peopleStore.addListener((people) => {
    console.log('[Listener] people updated:', people.map((person) => person.name).join(', '));
  });

  const mapDataFirst = await safeLoad<MapExportData>(() => mapDataStore.getData());
  console.log('First mapData load (source/API):', mapDataFirst);

  const mapDataSecond = await safeLoad<MapExportData>(() => mapDataStore.getData());
  console.log('Second mapData load (cached within TTL):', mapDataSecond);

  const mapDataForced = await mapDataStore.getData({ forceReload: true });
  console.log('Forced mapData reload (ignores cached 24h TTL):', mapDataForced);

  const peopleFirst = await safeLoad<PeopleCollection>(() => peopleStore.getData());
  console.log('First people load (worker):', peopleFirst);

  const peopleSecond = await safeLoad<PeopleCollection>(() => peopleStore.getData());
  console.log('Second people load (cached worker result):', peopleSecond);

  const peopleForced = await peopleStore.getData({ forceReload: true });
  console.log('Forced people reload (reruns worker without waiting 5 minutes):', peopleForced);

  const colors = await safeLoad<MapColors>(() => colorsStore.getData());
  const npcs = await safeLoad<NpcCollection>(() => npcStore.getData());
  const magics = await safeLoad<MagicsCollection>(() => magicsStore.getData());
  const magicKeys = await safeLoad<MagicKeysCollection>(() => magicKeysStore.getData());
  const herbs = await safeLoad<HerbsCollection>(() => herbsStore.getData());

  console.log('Loaded colors:', colors);
  console.log('Loaded npcs:', npcs);
  console.log('Loaded magics:', magics);
  console.log('Loaded magic keys:', magicKeys);
  console.log('Loaded herbs:', herbs);

  unsubscribeMap();
  unsubscribePeople();
}
