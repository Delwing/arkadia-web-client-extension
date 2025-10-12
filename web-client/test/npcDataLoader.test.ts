import { loadNpcData } from '../src/npcDataLoader';
import services from '@client/src/runtime/service-registry';
import { NPC_DATASET_KEY } from '@client/src/runtime/data';
import type { DataCatalog } from '@client/src/runtime/data';
import type { ServiceRegistry } from '@client/src/runtime/service-registry';

jest.mock('@client/src/runtime/service-registry', () => {
  const load = jest.fn();
  const get = jest.fn();

  return {
    __esModule: true,
    default: {
      dataCatalog: {
        register: jest.fn(),
        load,
        loadAll: jest.fn(),
        get,
        metadataFor: jest.fn(),
        ready$: jest.fn(),
      },
    },
  };
});

const mockServices = services as jest.Mocked<ServiceRegistry>;
const mockCatalog = mockServices.dataCatalog as jest.Mocked<DataCatalog>;

describe('npcDataLoader', () => {
  beforeEach(() => {
    mockCatalog.load.mockReset();
    mockCatalog.get.mockReset();
  });

  test('loadNpcData loads NPC dataset via catalog when not cached', async () => {
    const npcData = [{ name: 'foo', loc: 1 }];
    mockCatalog.get
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(npcData as unknown);
    mockCatalog.load.mockResolvedValue(undefined);

    await expect(loadNpcData()).resolves.toBe(npcData);

    expect(mockCatalog.load).toHaveBeenCalledWith(NPC_DATASET_KEY);
    expect(mockCatalog.get).toHaveBeenCalledTimes(2);
  });

  test('loadNpcData returns cached NPC data without reloading', async () => {
    const cachedNpcData = [{ name: 'bar', loc: 2 }];
    mockCatalog.get.mockReturnValueOnce(cachedNpcData as unknown);

    await expect(loadNpcData()).resolves.toBe(cachedNpcData);

    expect(mockCatalog.load).not.toHaveBeenCalled();
    expect(mockCatalog.get).toHaveBeenCalledTimes(1);
  });

  test('loadNpcData surfaces loader errors', async () => {
    const error = new Error('boom');
    mockCatalog.get.mockReturnValueOnce(undefined);
    mockCatalog.load.mockRejectedValue(error);

    await expect(loadNpcData()).rejects.toBe(error);

    expect(mockCatalog.load).toHaveBeenCalledWith(NPC_DATASET_KEY);
  });
});
