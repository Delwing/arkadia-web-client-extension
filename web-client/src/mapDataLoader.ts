import services from "@client/src/runtime/service-registry";
import { COLORS_DATASET_KEY, MAP_DATASET_KEY } from "@client/src/runtime/data";
import type { DataCatalogEntryMetadata } from "@client/src/runtime/data";

type LoaderResult<T> = {
    readonly data: T;
    readonly metadata: DataCatalogEntryMetadata;
};

const loadPromises = new Map<string, Promise<void>>();

function ensureLoad(key: string): Promise<void> {
    let pending = loadPromises.get(key);
    if (!pending) {
        pending = services.dataCatalog.load(key).finally(() => {
            loadPromises.delete(key);
        });
        loadPromises.set(key, pending);
    }
    return pending;
}

async function getReadyData<T>(key: string): Promise<LoaderResult<T>> {
    const metadata = services.dataCatalog.metadataFor(key);
    const cached = services.dataCatalog.get<T>(key);

    if (metadata?.status === 'ready' && typeof cached !== 'undefined') {
        return { data: cached, metadata };
    }

    return new Promise<LoaderResult<T>>((resolve, reject) => {
        let settled = false;

        const cleanup = () => {
            settled = true;
            subscription.unsubscribe();
        };

        const subscription = services.dataCatalog.ready$<T>(key).subscribe({
            next: (event) => {
                if (settled) {
                    return;
                }

                cleanup();
                resolve({ data: event.data, metadata: event.metadata });
            },
            error: (error) => {
                if (settled) {
                    return;
                }

                cleanup();
                reject(error);
            },
        });

        ensureLoad(key)
            .then(() => {
                if (settled) {
                    return;
                }

                const data = services.dataCatalog.get<T>(key);
                const entryMetadata = services.dataCatalog.metadataFor(key);

                if (typeof data !== 'undefined' && entryMetadata?.status === 'ready') {
                    cleanup();
                    resolve({ data, metadata: entryMetadata });
                }
            })
            .catch((error) => {
                if (settled) {
                    return;
                }

                cleanup();
                reject(error);
            });
    });
}

export async function loadMapData(): Promise<MapData.Map> {
    const { data } = await getReadyData<MapData.Map>(MAP_DATASET_KEY);
    return data;
}

export async function loadColors(): Promise<MapData.Env[]> {
    const { data } = await getReadyData<MapData.Env[]>(COLORS_DATASET_KEY);
    return data;
}
