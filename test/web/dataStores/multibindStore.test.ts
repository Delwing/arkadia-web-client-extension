import {
  applyLocalChange,
  clear,
  getSnapshot,
  replaceAll,
  subscribe,
  type StoredMultibindRecord,
} from '@web/dataStores/multibindStore';

describe('multibindStore', () => {
  beforeEach(async () => {
    await clear();
  });

  it('normalizes and persists multibinds when replacing', async () => {
    const result = await replaceAll([
      { roomId: 2, index: 1, action: 'go north' },
      { roomId: 2, index: 1, action: 'go east' },
      { roomId: '3', index: '2', action: 42 },
      { roomId: 'bad', index: 3, action: 'noop' },
    ]);

    expect(result).toEqual([
      { roomId: 2, index: 1, action: 'go east' },
      { roomId: 3, index: 2, action: '42' },
    ]);

    const snapshot = await getSnapshot();
    expect(snapshot).toEqual(result);
  });

  it('emits the initial snapshot to subscribers', async () => {
    await replaceAll([
      { roomId: 7, index: 1, action: 'alpha' },
      { roomId: 7, index: 2, action: 'beta' },
    ]);

    const emissions: StoredMultibindRecord[][] = [];
    await new Promise<void>((resolve) => {
      const unsubscribe = subscribe((snapshot) => {
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
    await applyLocalChange(() => [
      { roomId: 1, index: 1, action: 'first' },
      { roomId: 1, index: 1, action: 'second' },
      { roomId: 4, index: 2, action: null as unknown as string },
      { roomId: 5, index: NaN as unknown as number, action: 'invalid' },
    ]);

    const snapshot = await getSnapshot();
    expect(snapshot).toEqual([
      { roomId: 1, index: 1, action: 'second' },
      { roomId: 4, index: 2, action: '' },
    ]);
  });
});
