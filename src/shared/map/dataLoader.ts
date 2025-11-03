import type { ProgressListener, SubscriptionOptions } from "../../../client/src/dataStore/types";

type MapDataStore<T> = {
    refresh(options?: { onProgress?: ProgressListener }): Promise<{ data: T } | undefined>;
    getSnapshot(): Promise<{ data: T } | undefined>;
    subscribe(listener: (snapshot: { data: T } | undefined) => void, options?: SubscriptionOptions): () => void;
};

export interface MapStoreProvider {
    getMapDataStore(): MapDataStore<MapData.Map>;
    getMapColorsStore(): MapDataStore<MapData.Env[]>;
}

const buildProgressHandler = (
    listeners: Set<ProgressListener>,
    onProgress?: ProgressListener,
): ProgressListener | undefined => {
    const allListeners: ProgressListener[] = [];
    if (onProgress) {
        allListeners.push(onProgress);
    }
    if (listeners.size > 0) {
        allListeners.push(...listeners);
    }
    if (allListeners.length === 0) {
        return undefined;
    }
    return (progress, loaded, total) => {
        for (const listener of [...allListeners]) {
            listener(progress, loaded, total);
        }
    };
};

export function createMapDataLoader(provider: MapStoreProvider) {
    const progressListeners = new Set<ProgressListener>();

    const loadMapData = async (onProgress?: ProgressListener): Promise<MapData.Map> => {
        const store = provider.getMapDataStore();
        const combinedProgress = buildProgressHandler(progressListeners, onProgress);
        try {
            const snapshot = await store.refresh({ onProgress: combinedProgress });
            if (!snapshot) {
                throw new Error("Map data unavailable");
            }
            return snapshot.data;
        } catch (error) {
            const fallback = await store.getSnapshot();
            if (fallback) {
                return fallback.data;
            }
            throw error;
        }
    };

    const loadColors = async (): Promise<MapData.Env[]> => {
        const store = provider.getMapColorsStore();
        try {
            const snapshot = await store.refresh();
            if (!snapshot) {
                throw new Error("Map colors unavailable");
            }
            return snapshot.data;
        } catch (error) {
            const fallback = await store.getSnapshot();
            if (fallback) {
                return fallback.data;
            }
            throw error;
        }
    };

    const subscribeToMapData = (
        listener: (map: MapData.Map | undefined) => void,
        options?: SubscriptionOptions,
    ) => {
        const store = provider.getMapDataStore();
        return store.subscribe(snapshot => listener(snapshot?.data), options);
    };

    const subscribeToMapColors = (
        listener: (colors: MapData.Env[] | undefined) => void,
        options?: SubscriptionOptions,
    ) => {
        const store = provider.getMapColorsStore();
        return store.subscribe(snapshot => listener(snapshot?.data), options);
    };

    const subscribeToMapDataProgress = (listener: ProgressListener) => {
        progressListeners.add(listener);
        return () => {
            progressListeners.delete(listener);
        };
    };

    return {
        loadMapData,
        loadColors,
        subscribeToMapData,
        subscribeToMapColors,
        subscribeToMapDataProgress,
    };
}
