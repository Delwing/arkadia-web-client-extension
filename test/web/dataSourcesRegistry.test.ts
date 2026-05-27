import { DATA_SOURCES, computeNextFetch } from '@web/dataSourcesRegistry';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe('dataSourcesRegistry', () => {
  describe('computeNextFetch', () => {
    it('returns refreshedAt + ttl when fetched', () => {
      expect(computeNextFetch(1000, ONE_DAY_MS)).toBe(1000 + ONE_DAY_MS);
    });

    it('returns undefined when never fetched', () => {
      expect(computeNextFetch(undefined, ONE_DAY_MS)).toBeUndefined();
      expect(computeNextFetch(0, ONE_DAY_MS)).toBeUndefined();
    });
  });

  describe('DATA_SOURCES', () => {
    it('has unique ids', () => {
      const ids = DATA_SOURCES.map(s => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('includes the requested core sources', () => {
      const ids = DATA_SOURCES.map(s => s.id);
      expect(ids).toEqual(
        expect.arrayContaining(['map', 'people', 'herbs', 'knowledge']),
      );
    });

    it('exposes a positive ttl, getMetadata, getSnapshot and refresh for every source', () => {
      for (const source of DATA_SOURCES) {
        expect(source.ttlMs).toBeGreaterThan(0);
        expect(typeof source.getMetadata).toBe('function');
        expect(typeof source.getSnapshot).toBe('function');
        expect(typeof source.refresh).toBe('function');
        expect(source.label.length).toBeGreaterThan(0);
      }
    });

    it('marks map stores as version-checked', () => {
      const map = DATA_SOURCES.find(s => s.id === 'map');
      const mapColors = DATA_SOURCES.find(s => s.id === 'mapColors');
      expect(map?.versionChecked).toBe(true);
      expect(mapColors?.versionChecked).toBe(true);
    });
  });
});
