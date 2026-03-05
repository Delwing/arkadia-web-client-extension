import { fetchWithCache } from '@modules/core/httpCache';

// Mock global fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe('fetchWithCache', () => {
    const TEST_URL = 'https://example.com/data.json';
    const TTL_MS = 60_000;

    beforeEach(() => {
        localStorage.clear();
        mockFetch.mockReset();
    });

    test('fetches fresh data when no cached entry exists', async () => {
        const data = { result: 'fresh' };
        mockFetch.mockResolvedValue({ json: () => Promise.resolve(data) });

        const result = await fetchWithCache(TEST_URL, TTL_MS);

        expect(mockFetch).toHaveBeenCalledWith(TEST_URL);
        expect(result).toEqual(data);
    });

    test('returns cached data when TTL has not expired', async () => {
        const cached = { value: { result: 'cached' }, cacheTime: Date.now(), ttl: TTL_MS };
        localStorage.setItem(TEST_URL, JSON.stringify(cached));

        const result = await fetchWithCache(TEST_URL, TTL_MS);

        expect(mockFetch).not.toHaveBeenCalled();
        expect(result).toEqual({ result: 'cached' });
    });

    test('fetches fresh data when TTL has expired', async () => {
        const expired = { value: { result: 'old' }, cacheTime: Date.now() - TTL_MS - 1000, ttl: TTL_MS };
        localStorage.setItem(TEST_URL, JSON.stringify(expired));

        const freshData = { result: 'new' };
        mockFetch.mockResolvedValue({ json: () => Promise.resolve(freshData) });

        const result = await fetchWithCache(TEST_URL, TTL_MS);

        expect(mockFetch).toHaveBeenCalledWith(TEST_URL);
        expect(result).toEqual(freshData);
    });

    test('fetches fresh data when cache entry is malformed', async () => {
        localStorage.setItem(TEST_URL, 'not-json');

        const data = { result: 'recovered' };
        mockFetch.mockResolvedValue({ json: () => Promise.resolve(data) });

        const result = await fetchWithCache(TEST_URL, TTL_MS);

        expect(mockFetch).toHaveBeenCalled();
        expect(result).toEqual(data);
    });

    test('stores fetched data in localStorage cache', async () => {
        const data = { result: 'stored' };
        mockFetch.mockResolvedValue({ json: () => Promise.resolve(data) });

        await fetchWithCache(TEST_URL, TTL_MS);

        const stored = JSON.parse(localStorage.getItem(TEST_URL)!);
        expect(stored.value).toEqual(data);
        expect(stored.ttl).toBe(TTL_MS);
        expect(typeof stored.cacheTime).toBe('number');
    });
});
