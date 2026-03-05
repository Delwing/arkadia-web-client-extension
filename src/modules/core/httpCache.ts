/**
 * HTTP fetch with localStorage-based TTL caching.
 *
 * Cache keys are URLs stored directly in localStorage (not typed schema keys).
 */

interface CacheEntry {
    value: unknown;
    cacheTime: number;
    ttl: number;
}

/**
 * Fetch JSON from a URL with localStorage-based caching.
 * Returns cached data if it exists and has not expired; otherwise fetches fresh data.
 *
 * @param url - The URL to fetch
 * @param ttlMs - Cache time-to-live in milliseconds
 * @returns The fetched/cached data
 */
export async function fetchWithCache(url: string, ttlMs: number): Promise<unknown> {
    const raw = localStorage.getItem(url);
    if (raw) {
        try {
            const cached: CacheEntry = JSON.parse(raw);
            if (cached && cached.value && cached.cacheTime && cached.cacheTime + cached.ttl > Date.now()) {
                return cached.value;
            }
        } catch {
            // Invalid cache entry, proceed to fetch
        }
    }

    const response = await fetch(url);
    const data = await response.json();
    const entry: CacheEntry = { value: data, cacheTime: Date.now(), ttl: ttlMs };
    localStorage.setItem(url, JSON.stringify(entry));
    return data;
}
