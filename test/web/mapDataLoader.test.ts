import {
  loadMapData,
  loadColors,
  subscribeToMapColors,
  subscribeToMapData,
  subscribeToMapDataProgress,
} from '@web/mapDataLoader';

const mockMapDataStore = {
  refresh: jest.fn(),
  getSnapshot: jest.fn(),
  subscribe: jest.fn(),
};

const mockMapColorsStore = {
  refresh: jest.fn(),
  getSnapshot: jest.fn(),
  subscribe: jest.fn(),
};

vi.mock('@web/dataStores/mapStore', () => ({
  getMapDataStore: jest.fn(() => mockMapDataStore),
  getMapColorsStore: jest.fn(() => mockMapColorsStore),
}));

describe('mapDataLoader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('loadMapData returns refreshed data', async () => {
    const expected = { rooms: [] } as any;
    mockMapDataStore.refresh.mockResolvedValue({ data: expected });

    const result = await loadMapData();

    expect(result).toBe(expected);
    expect(mockMapDataStore.refresh).toHaveBeenCalledWith({ onProgress: undefined });
    expect(mockMapDataStore.getSnapshot).not.toHaveBeenCalled();
  });

  test('loadMapData falls back to cached data when refresh fails', async () => {
    const fallback = { rooms: ['cached'] } as any;
    const error = new Error('network');
    mockMapDataStore.refresh.mockRejectedValue(error);
    mockMapDataStore.getSnapshot.mockResolvedValue({ data: fallback });

    await expect(loadMapData()).resolves.toBe(fallback);
    expect(mockMapDataStore.getSnapshot).toHaveBeenCalled();
  });

  test('loadMapData forwards progress to listeners', async () => {
    const map = { rooms: ['a'] } as any;
    const provided = jest.fn();
    const subscriber = jest.fn();
    const unsubscribe = subscribeToMapDataProgress(subscriber);
    mockMapDataStore.refresh.mockImplementation(async ({ onProgress }) => {
      onProgress?.(25);
      onProgress?.(100);
      return { data: map };
    });

    await loadMapData(provided);

    expect(provided).toHaveBeenCalledWith(25, undefined, undefined);
    expect(subscriber).toHaveBeenCalledWith(25, undefined, undefined);
    unsubscribe();
  });

  test('loadColors returns refreshed data', async () => {
    const colors = [{ id: 1 }] as any;
    mockMapColorsStore.refresh.mockResolvedValue({ data: colors });

    await expect(loadColors()).resolves.toBe(colors);
  });

  test('loadColors falls back to cached data when refresh fails', async () => {
    const colors = [{ id: 2 }] as any;
    mockMapColorsStore.refresh.mockRejectedValue(new Error('fail'));
    mockMapColorsStore.getSnapshot.mockResolvedValue({ data: colors });

    await expect(loadColors()).resolves.toBe(colors);
  });

  test('subscribeToMapData proxies subscriptions', () => {
    const unsubscribe = jest.fn();
    const listener = jest.fn();
    const options = { emitInitial: false };
    mockMapDataStore.subscribe.mockReturnValue(unsubscribe);

    const result = subscribeToMapData(listener, options);

    expect(mockMapDataStore.subscribe).toHaveBeenCalledWith(expect.any(Function), options);
    const handler = mockMapDataStore.subscribe.mock.calls[0][0];
    handler({ data: { rooms: [] } } as any);
    expect(listener).toHaveBeenCalledWith({ rooms: [] });
    handler(undefined);
    expect(listener).toHaveBeenCalledWith(undefined);
    expect(result).toBe(unsubscribe);
  });

  test('subscribeToMapColors proxies subscriptions', () => {
    const unsubscribe = jest.fn();
    const listener = jest.fn();
    mockMapColorsStore.subscribe.mockReturnValue(unsubscribe);

    const result = subscribeToMapColors(listener);

    expect(mockMapColorsStore.subscribe).toHaveBeenCalledWith(expect.any(Function), undefined);
    const handler = mockMapColorsStore.subscribe.mock.calls[0][0];
    handler({ data: [{ id: 1 }] } as any);
    expect(listener).toHaveBeenCalledWith([{ id: 1 }]);
    handler(undefined);
    expect(listener).toHaveBeenCalledWith(undefined);
    expect(result).toBe(unsubscribe);
  });
});
