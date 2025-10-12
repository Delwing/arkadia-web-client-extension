import type { DataCatalog, DataCatalogEntryMetadata } from '@client/src/runtime/data';
import { NPC_DATASET_KEY } from '@client/src/runtime/data';

describe('npcDataLoader', () => {
  let metadataByKey: Map<string, DataCatalogEntryMetadata | undefined>;
  let dataByKey: Map<string, unknown>;
  let dataCatalogMock: jest.Mocked<DataCatalog>;

  const requireLoader = async () => {
    const module = await import('../src/npcDataLoader');
    return module;
  };

  beforeEach(() => {
    metadataByKey = new Map();
    dataByKey = new Map();

    dataCatalogMock = {
      register: jest.fn(),
      load: jest.fn(),
      loadAll: jest.fn(),
      clear: jest.fn(),
      set: jest.fn(),
      get: jest.fn((key: string) => dataByKey.get(key)),
      metadataFor: jest.fn((key: string) => metadataByKey.get(key)),
      ready$: jest.fn(() => {
        throw new Error('ready$ should not be called in npcDataLoader tests');
      }),
    } as jest.Mocked<DataCatalog>;

    jest.resetModules();
    jest.doMock('@client/src/runtime/service-registry', () => ({
      __esModule: true,
      default: { dataCatalog: dataCatalogMock },
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('loadNpcData returns cached catalog data when ready', async () => {
    const cachedData = [{ name: 'npc', loc: 1 }];
    dataByKey.set(NPC_DATASET_KEY, cachedData);
    metadataByKey.set(NPC_DATASET_KEY, {
      key: NPC_DATASET_KEY,
      status: 'ready',
      source: 'cache',
    });

    const { loadNpcData } = await requireLoader();

    await expect(loadNpcData<typeof cachedData>()).resolves.toBe(cachedData);
    expect(dataCatalogMock.load).not.toHaveBeenCalled();
  });

  test('loadNpcData triggers catalog load when data not ready', async () => {
    metadataByKey.set(NPC_DATASET_KEY, { key: NPC_DATASET_KEY, status: 'idle' });

    let resolveLoad: () => void = () => {};
    dataCatalogMock.load.mockImplementation(() => new Promise<void>((resolve) => {
      resolveLoad = resolve;
    }));

    const { loadNpcData } = await requireLoader();

    const resultPromise = loadNpcData<unknown[]>();
    expect(dataCatalogMock.load).toHaveBeenCalledWith(NPC_DATASET_KEY);

    const npcData: unknown[] = [];
    dataByKey.set(NPC_DATASET_KEY, npcData);
    metadataByKey.set(NPC_DATASET_KEY, {
      key: NPC_DATASET_KEY,
      status: 'ready',
      source: 'loader',
    });

    resolveLoad();

    await expect(resultPromise).resolves.toBe(npcData);
  });

  test('loadNpcData propagates load errors', async () => {
    const loadError = new Error('boom');
    metadataByKey.set(NPC_DATASET_KEY, { key: NPC_DATASET_KEY, status: 'idle' });
    dataCatalogMock.load.mockRejectedValue(loadError);

    const { loadNpcData } = await requireLoader();

    await expect(loadNpcData()).rejects.toBe(loadError);
    expect(dataCatalogMock.load).toHaveBeenCalledWith(NPC_DATASET_KEY);
  });
});
