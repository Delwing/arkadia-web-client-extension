import { loadMapData, loadColors } from '../src/mapDataLoader';
import { loadCachedJSON } from '@client/src/utils/dataCache.ts';

jest.mock('@client/src/utils/dataCache.ts', () => ({
  loadCachedJSON: jest.fn()
}));

describe('mapDataLoader', () => {
  beforeEach(() => {
    (loadCachedJSON as jest.Mock).mockClear();
  });

  test('loadMapData passes correct options', () => {
    const onProgress = jest.fn();
    loadMapData(onProgress);
    expect(loadCachedJSON).toHaveBeenCalledWith({
      url: 'https://delwing.github.io/arkadia-mapa/data/mapExport.json',
      localStorageKey: 'cachedMapData',
      indexedDB: { dbName: 'ArkadiaMapDB', storeName: 'mapData', key: 'mapExport' },
      ttl: 86400000,
      onProgress
    });
  });

  test('loadColors passes correct options', () => {
    loadColors();
    expect(loadCachedJSON).toHaveBeenCalledWith({
      url: 'https://delwing.github.io/arkadia-mapa/data/colors.json',
      localStorageKey: 'cachedColors',
      ttl: 86400000
    });
  });
});
