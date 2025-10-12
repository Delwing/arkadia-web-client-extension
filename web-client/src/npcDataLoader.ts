import services from "@client/src/runtime/service-registry";
import { NPC_DATASET_KEY } from "@client/src/runtime/data";

let loadPromise: Promise<void> | null = null;

function ensureLoad(): Promise<void> {
    if (!loadPromise) {
        loadPromise = services.dataCatalog.load(NPC_DATASET_KEY).finally(() => {
            loadPromise = null;
        });
    }

    return loadPromise;
}

export async function loadNpcData<T = unknown>(): Promise<T> {
    const metadata = services.dataCatalog.metadataFor(NPC_DATASET_KEY);
    const cached = services.dataCatalog.get<T>(NPC_DATASET_KEY);

    if (metadata?.status === "ready" && typeof cached !== "undefined") {
        return cached;
    }

    await ensureLoad();

    const data = services.dataCatalog.get<T>(NPC_DATASET_KEY);
    if (typeof data === "undefined") {
        throw new Error("NPC data is unavailable after catalog load.");
    }

    return data;
}
