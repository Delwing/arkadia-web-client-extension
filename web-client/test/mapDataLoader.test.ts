import { Subject } from 'rxjs';
import type {
  DataCatalog,
  DataCatalogEntryMetadata,
  DataCatalogReadyEvent,
} from '@client/src/runtime/data';
import { COLORS_DATASET_KEY, MAP_DATASET_KEY } from '@client/src/runtime/data';

describe('mapDataLoader', () => {
  let metadataByKey: Map<string, DataCatalogEntryMetadata | undefined>;
  let dataByKey: Map<string, unknown>;
  let readySubjects: Map<string, Subject<DataCatalogReadyEvent<unknown>>>;
  let dataCatalogMock: jest.Mocked<DataCatalog>;

  const requireLoader = async () => {
    const module = await import('../src/mapDataLoader');
    return module;
  };

  beforeEach(() => {
    metadataByKey = new Map();
    dataByKey = new Map();
    readySubjects = new Map();

    dataCatalogMock = {
      register: jest.fn(),
      load: jest.fn(),
      loadAll: jest.fn(),
      clear: jest.fn(),
      set: jest.fn(),
      get: jest.fn((key: string) => dataByKey.get(key)),
      metadataFor: jest.fn((key: string) => metadataByKey.get(key)),
      ready$: jest.fn((key?: string) => {
        if (!key) {
          throw new Error('Global ready$ not supported in tests');
        }
        let subject = readySubjects.get(key);
        if (!subject) {
          subject = new Subject<DataCatalogReadyEvent<unknown>>();
          readySubjects.set(key, subject);
        }
        return subject.asObservable();
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

  test('loadMapData triggers catalog load and resolves when ready data arrives', async () => {
    const mapMetadata: DataCatalogEntryMetadata = { key: MAP_DATASET_KEY, status: 'idle' };
    metadataByKey.set(MAP_DATASET_KEY, mapMetadata);

    let resolveLoad: () => void = () => {};
    dataCatalogMock.load.mockImplementation(() => new Promise<void>((resolve) => {
      resolveLoad = resolve;
    }));

    const { loadMapData } = await requireLoader();

    const resultPromise = loadMapData();

    expect(dataCatalogMock.load).toHaveBeenCalledWith(MAP_DATASET_KEY);

    const readySubject = readySubjects.get(MAP_DATASET_KEY);
    expect(readySubject).toBeDefined();

    const readyMetadata: DataCatalogEntryMetadata = {
      key: MAP_DATASET_KEY,
      status: 'ready',
      source: 'loader',
    };

    const mapData = { rooms: [] } as unknown as MapData.Map;
    dataByKey.set(MAP_DATASET_KEY, mapData);
    metadataByKey.set(MAP_DATASET_KEY, readyMetadata);

    readySubject!.next({ key: MAP_DATASET_KEY, data: mapData, metadata: readyMetadata });
    resolveLoad();

    await expect(resultPromise).resolves.toBe(mapData);
  });

  test('loadMapData returns cached data without reloading', async () => {
    const cachedMetadata: DataCatalogEntryMetadata = {
      key: MAP_DATASET_KEY,
      status: 'ready',
      source: 'cache',
    };
    const mapData = { rooms: [] } as unknown as MapData.Map;
    metadataByKey.set(MAP_DATASET_KEY, cachedMetadata);
    dataByKey.set(MAP_DATASET_KEY, mapData);

    const { loadMapData } = await requireLoader();

    await expect(loadMapData()).resolves.toBe(mapData);
    expect(dataCatalogMock.load).not.toHaveBeenCalled();
    expect(dataCatalogMock.ready$).not.toHaveBeenCalled();
  });

  test('loadMapData propagates load errors when data unavailable', async () => {
    metadataByKey.set(MAP_DATASET_KEY, { key: MAP_DATASET_KEY, status: 'idle' });
    const loadError = new Error('boom');
    dataCatalogMock.load.mockRejectedValue(loadError);

    const { loadMapData } = await requireLoader();

    await expect(loadMapData()).rejects.toBe(loadError);
    expect(dataCatalogMock.load).toHaveBeenCalledWith(MAP_DATASET_KEY);
  });

  test('loadColors uses the catalog just like map data', async () => {
    metadataByKey.set(COLORS_DATASET_KEY, { key: COLORS_DATASET_KEY, status: 'idle' });

    let resolveLoad: () => void = () => {};
    dataCatalogMock.load.mockImplementation((key: string) => {
      if (key !== COLORS_DATASET_KEY) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        resolveLoad = resolve;
      });
    });

    const { loadColors } = await requireLoader();

    const resultPromise = loadColors();
    expect(dataCatalogMock.load).toHaveBeenCalledWith(COLORS_DATASET_KEY);

    const readySubject = readySubjects.get(COLORS_DATASET_KEY);
    expect(readySubject).toBeDefined();

    const readyMetadata: DataCatalogEntryMetadata = {
      key: COLORS_DATASET_KEY,
      status: 'ready',
      source: 'loader',
    };
    const colorsData = [] as unknown as MapData.Env[];
    dataByKey.set(COLORS_DATASET_KEY, colorsData);
    metadataByKey.set(COLORS_DATASET_KEY, readyMetadata);

    readySubject!.next({ key: COLORS_DATASET_KEY, data: colorsData, metadata: readyMetadata });
    resolveLoad();

    await expect(resultPromise).resolves.toBe(colorsData);
  });
});
