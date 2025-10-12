import services from "@client/src/runtime/service-registry";
import { NPC_DATASET_KEY } from "@client/src/runtime/data";

async function loadCatalogDataset<T>(key: string): Promise<T> {
    const cached = services.dataCatalog.get<T>(key);
    if (cached !== undefined) {
        return cached;
    }

    await services.dataCatalog.load(key);

    const loaded = services.dataCatalog.get<T>(key);
    if (loaded === undefined) {
        throw new Error(`Dataset "${key}" was not available after loading.`);
    }

    return loaded;
}

export function loadNpcData<T = unknown>() {
    return loadCatalogDataset<T>(NPC_DATASET_KEY);
}
