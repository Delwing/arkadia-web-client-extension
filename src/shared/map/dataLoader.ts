/// <reference path="../../../client/src/types/MapData.d.ts" />

type MapDataStore<T> = {
    refresh(options?: { onProgress?: MapProgressListener }): Promise<{ data: T } | undefined>;
    getSnapshot(): Promise<{ data: T } | undefined>;
    subscribe(listener: (snapshot: { data: T } | undefined) => void, options?: MapSubscriptionOptions): () => void;
};

export interface MapStoreProvider {
    getMapDataStore(): MapDataStore<MapData.Map>;
    getMapColorsStore(): MapDataStore<MapData.Env[]>;
}

export type MapProgressListener = (progress: number, loaded?: number, total?: number) => void;

export interface MapSubscriptionOptions {
    emitInitial?: boolean;
}

const buildProgressHandler = (
    listeners: Set<MapProgressListener>,
    onProgress?: MapProgressListener,
): MapProgressListener | undefined => {
    const allListeners: MapProgressListener[] = [];
    if (onProgress) {
        allListeners.push(onProgress);
    }
    if (listeners.size > 0) {
        listeners.forEach(listener => {
            allListeners.push(listener);
        });
    }
    if (allListeners.length === 0) {
        return undefined;
    }
    return (progress, loaded, total) => {
        for (const listener of allListeners) {
            listener(progress, loaded, total);
        }
    };
};

export function createMapDataLoader(provider: MapStoreProvider) {
    const progressListeners = new Set<MapProgressListener>();

    const loadMapData = async (onProgress?: MapProgressListener): Promise<MapData.Map> => {
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
        options?: MapSubscriptionOptions,
    ) => {
        const store = provider.getMapDataStore();
        return store.subscribe(snapshot => listener(snapshot?.data), options);
    };

    const subscribeToMapColors = (
        listener: (colors: MapData.Env[] | undefined) => void,
        options?: MapSubscriptionOptions,
    ) => {
        const store = provider.getMapColorsStore();
        return store.subscribe(snapshot => listener(snapshot?.data), options);
    };

    const subscribeToMapDataProgress = (listener: MapProgressListener) => {
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
