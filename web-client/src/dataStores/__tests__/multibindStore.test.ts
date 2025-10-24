const DB_NAME = 'ArkadiaMultibindsDB';

async function deleteDatabase() {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to reset multibinds database'));
  });
}

type MultibindStoreModule = typeof import('../multibindStore');

async function importStore(): Promise<MultibindStoreModule> {
  jest.resetModules();
  return await import('../multibindStore');
}

async function prepareStore(): Promise<MultibindStoreModule> {
  await deleteDatabase();
  const store = await importStore();
  await store.clear();
  return store;
}

describe('multibindStore', () => {
  it('normalizes and persists multibinds when replacing', async () => {
    const store = await prepareStore();

    const result = await store.replaceAll([
      { roomId: 2, index: 1, action: 'go north' },
      { roomId: 2, index: 1, action: 'go east' },
      { roomId: '3' as unknown as number, index: '2' as unknown as number, action: 42 as unknown as string },
      { roomId: 'bad' as unknown as number, index: 3, action: 'noop' },
    ]);

    expect(result).toEqual([
      { roomId: 2, index: 1, action: 'go east' },
      { roomId: 3, index: 2, action: '42' },
    ]);

    const snapshot = await store.getSnapshot();
    expect(snapshot).toEqual(result);
  });

  it('emits the initial snapshot to subscribers', async () => {
    const store = await prepareStore();

    await store.replaceAll([
      { roomId: 7, index: 1, action: 'alpha' },
      { roomId: 7, index: 2, action: 'beta' },
    ]);

    const emissions: Array<Array<{ roomId: number; index: number; action: string }>> = [];
    await new Promise<void>((resolve) => {
      const unsubscribe = store.subscribe((snapshot) => {
        emissions.push(snapshot);
        if (emissions.length >= 1) {
          unsubscribe();
          resolve();
        }
      });
    });

    expect(emissions).toEqual([
      [
        { roomId: 7, index: 1, action: 'alpha' },
        { roomId: 7, index: 2, action: 'beta' },
      ],
    ]);
  });

  it('deduplicates and normalizes during applyLocalChange', async () => {
    const store = await prepareStore();

    await store.applyLocalChange(() => [
      { roomId: 1, index: 1, action: 'first' },
      { roomId: 1, index: 1, action: 'second' },
      { roomId: 4, index: 2, action: null as unknown as string },
      { roomId: 5, index: Number.NaN as unknown as number, action: 'invalid' },
    ]);

    const snapshot = await store.getSnapshot();
    expect(snapshot).toEqual([
      { roomId: 1, index: 1, action: 'second' },
      { roomId: 4, index: 2, action: '' },
    ]);
  });

  it('reads legacy multibind records stored with nested values', async () => {
    await deleteDatabase();

    const openRequest = indexedDB.open(DB_NAME, 2);
    openRequest.onupgradeneeded = () => {
      const db = openRequest.result;
      if (!db.objectStoreNames.contains('multibinds')) {
        db.createObjectStore('multibinds', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'id' });
      }
    };

    const db: IDBDatabase = await new Promise((resolve, reject) => {
      openRequest.onsuccess = () => resolve(openRequest.result);
      openRequest.onerror = () => reject(openRequest.error ?? new Error('Failed to seed legacy multibinds'));
    });

    try {
      const transaction = db.transaction(['multibinds'], 'readwrite');
      const store = transaction.objectStore('multibinds');
      store.put({
        id: '1:1',
        order: 0,
        value: { data: { roomId: 1, index: 1, action: 'alpha' } },
      });
      store.put({
        id: '1:2',
        order: 1,
        value: { value: { roomId: 1, index: 2, action: 'beta' } },
      });

      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error('Failed to store legacy multibinds'));
        transaction.onabort = () => reject(transaction.error ?? new Error('Storing legacy multibinds was aborted'));
      });
    } finally {
      db.close();
    }

    const store = await importStore();
    const snapshot = await store.getSnapshot();

    expect(snapshot).toEqual([
      { roomId: 1, index: 1, action: 'alpha' },
      { roomId: 1, index: 2, action: 'beta' },
    ]);
  });
});

