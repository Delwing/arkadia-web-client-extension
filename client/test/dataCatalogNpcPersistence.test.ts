import { DataCatalogEntry } from '../src/dataCatalog/DataCatalogEntry';
import { IndexedDBPersistenceAdapter } from '../src/dataCatalog/IndexedDBPersistenceAdapter';
import { NpcCollection, NpcEntry } from '../src/dataCatalog/entities';

type PersistedNpcEntry = NpcEntry & { key: string };

describe('DataCatalogEntry NPC persistence', () => {
  test('preserves custom NPC entries when reloading from source', async () => {
    const adapter = new IndexedDBPersistenceAdapter(`TestNPCDB-${Date.now()}-${Math.random()}`);
    const storeName = `npc-store-${Math.random()}`;
    const load = jest.fn(async () => [{ name: 'Alice', loc: 1 }]);

    const entry = new DataCatalogEntry<NpcCollection, PersistedNpcEntry>({
      key: 'npcs',
      ttl: 60_000,
      storeName,
      persistenceAdapter: adapter,
      dataSource: { load },
      collection: {
        toPersistenceItems: (collection) =>
          collection.map((npc) => ({
            ...npc,
            key: `${npc.loc}:${npc.name}`,
          })),
        fromPersistenceItems: (items) =>
          items.map(({ key: _ignored, name, loc, custom }) => {
            const npc: NpcEntry = {
              name,
              loc: Number(loc),
            };
            if (custom === true) {
              npc.custom = true;
            }
            return npc;
          }),
        getPersistenceKey: (entry) => entry.key,
        shouldPreserveItem: (entry) => entry.custom === true,
      },
    });

    await entry.storeData([{ name: 'Alice', loc: 1 }]);
    await entry.storeData([
      { name: 'Alice', loc: 1 },
      { name: 'Custom NPC', loc: 999, custom: true },
    ]);

    const withCustom = await entry.getData();
    expect(withCustom).toEqual([
      { name: 'Alice', loc: 1 },
      { name: 'Custom NPC', loc: 999, custom: true },
    ]);

    load.mockResolvedValueOnce([{ name: 'Alice', loc: 1 }]);
    const reloaded = await entry.getData({ forceReload: true });

    expect(load).toHaveBeenCalledTimes(1);
    expect(reloaded).toEqual([
      { name: 'Alice', loc: 1 },
      { name: 'Custom NPC', loc: 999, custom: true },
    ]);
  });
});
