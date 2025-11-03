type NpcRecord = { name: string; loc: number };

declare const global: typeof globalThis & { fetch: jest.Mock };

const fetchMock = jest.fn();

type NpcStoreModule = typeof import('../src/dataStores/npcStore');
let npcStore: NpcStoreModule;

function mockFetchResponse(data: NpcRecord[]) {
  return Promise.resolve({
    json: () => Promise.resolve(data),
    headers: { get: () => null },
  } as any);
}

async function loadStoreModule() {
  jest.resetModules();
  fetchMock.mockReset();
  global.fetch = fetchMock;
  npcStore = await import('../src/dataStores/npcStore');
}

describe('npcStore', () => {
  beforeEach(async () => {
    await loadStoreModule();
    await npcStore.clearRemote();
    await npcStore.clearLocal();
  });

  test('keeps local entries after downloading fresh data', async () => {
    fetchMock.mockImplementation(() => mockFetchResponse([
      { name: 'Remote NPC', loc: 1 },
    ]));

    await npcStore.refresh({ force: true });
    await npcStore.addLocalNpc({ name: 'Local NPC', loc: 2 });

    fetchMock.mockImplementation(() => mockFetchResponse([
      { name: 'Remote NPC', loc: 1 },
      { name: 'Another Remote', loc: 3 },
    ]));

    await npcStore.refresh({ force: true });

    const snapshot = await npcStore.getSnapshot();
    expect(snapshot?.all.data).toEqual([
      { name: 'Remote NPC', loc: 1, source: 'remote' },
      { name: 'Another Remote', loc: 3, source: 'remote' },
      { name: 'Local NPC', loc: 2, source: 'local' },
    ]);
  });

  test('forced refresh bypasses ttl when requested', async () => {
    fetchMock.mockImplementation(() => mockFetchResponse([
      { name: 'Remote NPC', loc: 1 },
    ]));

    await npcStore.refresh({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();

    await npcStore.refresh();
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockImplementation(() => mockFetchResponse([
      { name: 'Remote NPC', loc: 1 },
      { name: 'Fresh Remote', loc: 2 },
    ]));

    await npcStore.refresh({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('clear actions reset remote and local state', async () => {
    fetchMock.mockImplementation(() => mockFetchResponse([
      { name: 'Remote NPC', loc: 1 },
    ]));

    await npcStore.refresh({ force: true });
    await npcStore.addLocalNpc({ name: 'Local NPC', loc: 2 });

    await npcStore.clearRemote();
    let snapshot = await npcStore.getSnapshot();
    expect(snapshot?.all.data).toEqual([
      { name: 'Local NPC', loc: 2, source: 'local' },
    ]);

    await npcStore.clearLocal();
    snapshot = await npcStore.getSnapshot();
    expect(snapshot?.all.data ?? []).toEqual([]);

    await npcStore.setLocalNpcs([
      { name: 'Imported NPC', loc: 5 },
    ]);
    snapshot = await npcStore.getSnapshot();
    expect(snapshot?.all.data).toEqual([
      { name: 'Imported NPC', loc: 5, source: 'local' },
    ]);
  });
});
