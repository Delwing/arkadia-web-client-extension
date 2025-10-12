import type { DataCatalog, DataLoader } from './catalog';
import { DefaultDataCatalog } from './default-catalog';
import { COLORS_DATASET_KEY, MAP_DATASET_KEY, NPC_DATASET_KEY } from './dataset-keys';
export { MAP_DATASET_KEY, NPC_DATASET_KEY, COLORS_DATASET_KEY } from './dataset-keys';
import type { DataPersistenceAdapter } from './persistence/types';
import { IndexedDbPersistenceAdapter } from './persistence/indexeddb-adapter';
import { LocalStoragePersistenceAdapter } from './persistence/local-storage-adapter';

export type DataSource<T> = () => Promise<T>;

export interface CoreLoaderOptions {
    readonly mapSource?: DataSource<unknown>;
    readonly npcSource?: DataSource<unknown>;
    readonly colorSource?: DataSource<unknown>;
    readonly mapPersistence?: DataPersistenceAdapter<unknown>;
    readonly npcPersistence?: DataPersistenceAdapter<unknown>;
    readonly colorPersistence?: DataPersistenceAdapter<unknown>;
    readonly catalog?: DataCatalog;
    readonly fetchTimeoutMs?: number;
}

const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

export function createJsonLoader<T>(source: DataSource<T>): DataLoader<T> {
    return async ({ persist }) => {
        const data = await source();
        await persist(data);
        return data;
    };
}

export function registerCoreLoaders(options: CoreLoaderOptions = {}): DataCatalog {
    const catalog = options.catalog ?? new DefaultDataCatalog();
    const mapPersistence = options.mapPersistence ?? new IndexedDbPersistenceAdapter(MAP_DATASET_KEY);
    const npcPersistence = options.npcPersistence ?? new LocalStoragePersistenceAdapter(NPC_DATASET_KEY);
    const colorPersistence = options.colorPersistence ?? new LocalStoragePersistenceAdapter(COLORS_DATASET_KEY);
    const fetchTimeoutMs = options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

    const mapLoader = createJsonLoader(
        options.mapSource ?? createFetchJsonSource('https://delwing.github.io/arkadia-mapa/data/mapExport.json', fetchTimeoutMs),
    );
    const npcLoader = createJsonLoader(
        options.npcSource ?? createFetchJsonSource('https://delwing.github.io/arkadia-mapa/data/npc.json', fetchTimeoutMs),
    );
    const colorLoader = createJsonLoader(
        options.colorSource ?? createFetchJsonSource('https://delwing.github.io/arkadia-mapa/data/colors.json', fetchTimeoutMs),
    );

    catalog.register({
        key: MAP_DATASET_KEY,
        loader: mapLoader,
        persistence: mapPersistence,
    });

    catalog.register({
        key: NPC_DATASET_KEY,
        loader: npcLoader,
        persistence: npcPersistence,
    });

    catalog.register({
        key: COLORS_DATASET_KEY,
        loader: colorLoader,
        persistence: colorPersistence,
    });

    return catalog;
}

function createFetchJsonSource<T>(resourceUrl: string, timeoutMs: number): DataSource<T> {
    return async () => {
        if (typeof fetch !== 'function') {
            throw new Error('Fetch API is not available to load core dataset.');
        }

        const supportsAbort = typeof AbortController === 'function';
        const controller = supportsAbort ? new AbortController() : undefined;

        const fetchTask = (async () => {
            const response = await fetch(resourceUrl, controller ? { signal: controller.signal } : undefined);
            if (!response.ok) {
                throw new Error(`Failed to load dataset from ${resourceUrl}: ${response.status} ${response.statusText}`);
            }

            return (await response.json()) as T;
        })();

        if (!timeoutMs || timeoutMs <= 0) {
            return await fetchTask;
        }

        let timedOut = false;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const timeoutTask = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
                timedOut = true;
                if (controller) {
                    controller.abort();
                }
                reject(new Error(`Timed out loading dataset from ${resourceUrl} after ${timeoutMs} ms.`));
            }, timeoutMs);
        });

        try {
            return await Promise.race([fetchTask, timeoutTask]);
        } catch (error) {
            if (timedOut) {
                // Ensure the fetch task rejection is handled when timing out.
                void fetchTask.catch(() => undefined);

                if (controller && controller.signal.aborted && error instanceof DOMException && error.name === 'AbortError') {
                    throw new Error(`Timed out loading dataset from ${resourceUrl} after ${timeoutMs} ms.`);
                }
            }

            throw error;
        } finally {
            if (typeof timeoutId !== 'undefined') {
                clearTimeout(timeoutId);
            }
        }
    };
}
