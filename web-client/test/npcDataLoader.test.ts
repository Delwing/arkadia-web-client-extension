import { loadNpcData } from '../src/npcDataLoader';
import { loadCachedJSON } from '@client/src/utils/dataCache.ts';

jest.mock('@client/src/utils/dataCache.ts', () => ({
  loadCachedJSON: jest.fn()
}));

describe('npcDataLoader', () => {
  beforeEach(() => {
    (loadCachedJSON as jest.Mock).mockClear();
  });

  test('loadNpcData passes correct options', () => {
    loadNpcData();
    expect(loadCachedJSON).toHaveBeenCalledWith({
      url: 'https://delwing.github.io/arkadia-mapa/data/npc.json',
      indexedDB: { dbName: 'ArkadiaNpcDB', storeName: 'npcData', key: 'npc' },
      ttl: 86400000
    });
  });
});
