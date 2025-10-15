import { DataCatalogEntry } from '../src/dataCatalog/DataCatalogEntry';
import { IndexedDBPersistenceAdapter } from '../src/dataCatalog/IndexedDBPersistenceAdapter';

describe('DataCatalogEntry listeners', () => {
  test('does not notify listeners when reloading identical data', async () => {
    const adapter = new IndexedDBPersistenceAdapter(`TestDB-${Date.now()}-${Math.random()}`);
    const data = { value: 1 };
    const load = jest.fn(async () => data);

    const entry = new DataCatalogEntry<{ value: number }>({
      key: 'test',
      ttl: 60_000,
      storeName: 'store',
      persistenceAdapter: adapter,
      dataSource: { load },
    });

    const listener = jest.fn();
    entry.addListener(listener);

    await entry.getData();
    expect(listener).toHaveBeenCalledTimes(1);

    await entry.getData({ forceReload: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('notifies listeners when data changes on reload', async () => {
    const adapter = new IndexedDBPersistenceAdapter(`TestDB-${Date.now()}-${Math.random()}`);
    const load = jest
      .fn()
      .mockResolvedValueOnce({ value: 1 })
      .mockResolvedValueOnce({ value: 2 });

    const entry = new DataCatalogEntry<{ value: number }>({
      key: 'test',
      ttl: 60_000,
      storeName: 'store',
      persistenceAdapter: adapter,
      dataSource: { load },
    });

    const listener = jest.fn();
    entry.addListener(listener);

    await entry.getData();
    await entry.getData({ forceReload: true });

    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('notifies listeners when data mutates in place', async () => {
    const adapter = new IndexedDBPersistenceAdapter(`TestDB-${Date.now()}-${Math.random()}`);

    const entry = new DataCatalogEntry<{ value: number }>({
      key: 'test',
      ttl: 60_000,
      storeName: 'store',
      persistenceAdapter: adapter,
    });

    const listener = jest.fn();
    entry.addListener(listener);

    const data = { value: 1 };
    await entry.storeData(data, { persist: false });
    expect(listener).toHaveBeenCalledTimes(1);

    data.value = 2;
    await entry.storeData(data, { persist: false });
    expect(listener).toHaveBeenCalledTimes(2);

    await entry.storeData({ value: 2 }, { persist: false });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
