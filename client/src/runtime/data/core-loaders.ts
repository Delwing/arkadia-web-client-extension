import type {
    DataLoader,
    MapDataCatalog as MapDataCatalogContract,
    NpcDataCatalog as NpcDataCatalogContract,
} from './catalog';
import { MapDataCatalog as MapDataCatalogImpl, NpcDataCatalog as NpcDataCatalogImpl } from './default-catalog';
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
    readonly mapCatalog?: MapDataCatalogContract;
    readonly npcCatalog?: NpcDataCatalogContract;
}

export interface CoreLoaderResult {
    readonly mapCatalog: MapDataCatalogContract;
    readonly npcCatalog: NpcDataCatalogContract;
}

export function createJsonLoader<T>(source: DataSource<T>): DataLoader<T> {
    return async ({ persist }) => {
        const data = await source();
        await persist(data);
        return data;
    };
}

export function registerCoreLoaders(options: CoreLoaderOptions = {}): CoreLoaderResult {
    const mapCatalog = options.mapCatalog ?? new MapDataCatalogImpl();
    const npcCatalog = options.npcCatalog ?? new NpcDataCatalogImpl();
    const mapPersistence = options.mapPersistence ?? new IndexedDbPersistenceAdapter(MAP_DATASET_KEY);
    const npcPersistence = options.npcPersistence ?? new LocalStoragePersistenceAdapter(NPC_DATASET_KEY);
    const colorPersistence = options.colorPersistence ?? new LocalStoragePersistenceAdapter(COLORS_DATASET_KEY);

    const mapLoader = createJsonLoader(
        options.mapSource ?? createFetchJsonSource('https://delwing.github.io/arkadia-mapa/data/mapExport.json'),
    );
    const npcLoader = createJsonLoader(
        options.npcSource ?? createFetchJsonSource('https://delwing.github.io/arkadia-mapa/data/npc.json'),
    );
    const colorLoader = createJsonLoader(
        options.colorSource ?? createFetchJsonSource('https://delwing.github.io/arkadia-mapa/data/colors.json'),
    );

    mapCatalog.register({
        key: MAP_DATASET_KEY,
        loader: mapLoader,
        persistence: mapPersistence,
    });

    mapCatalog.register({
        key: COLORS_DATASET_KEY,
        loader: colorLoader,
        persistence: colorPersistence,
    });

    npcCatalog.register({
        key: NPC_DATASET_KEY,
        loader: npcLoader,
        persistence: npcPersistence,
    });

    return {
        mapCatalog,
        npcCatalog,
    };
}

function createFetchJsonSource<T>(resourceUrl: string): DataSource<T> {
    return async () => {
        if (typeof fetch !== 'function') {
            throw new Error('Fetch API is not available to load core dataset.');
        }

        const response = await fetch(resourceUrl);
        if (!response.ok) {
            throw new Error(`Failed to load dataset from ${resourceUrl}: ${response.status} ${response.statusText}`);
        }

        return (await response.json()) as T;
    };
}
