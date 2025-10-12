import { firstValueFrom } from 'rxjs';

import type { DataCatalog } from './catalog';

/**
 * Ensures the dataset identified by `key` is loaded and returns the ready data.
 *
 * If the dataset is already cached and marked as ready, the cached data is
 * returned immediately without triggering a new load. Otherwise the catalog is
 * instructed to load the dataset and the returned promise resolves once the
 * ready event has been emitted.
 */
export async function ensureDatasetReady<T>(catalog: DataCatalog, key: string): Promise<T> {
    const metadata = catalog.metadataFor(key);
    const cached = catalog.get<T>(key);

    if (metadata?.status === 'ready' && typeof cached !== 'undefined') {
        return cached;
    }

    const readyPromise = firstValueFrom(catalog.ready$<T>(key));

    await catalog.load(key);

    const event = await readyPromise;
    return event.data;
}
