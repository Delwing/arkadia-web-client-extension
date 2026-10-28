import type Client from "@client/Client";
import {getMapSettings} from "@modules/core/settings";
import {loadColors, loadMapData, subscribeToMapData} from "../mapDataLoader";
import {EmbeddedMap} from "../embed";
import {getEmbeddedMap, setEmbeddedMap} from "../embedRegistry";

/** The map download as the progress bar shows it. */
export interface MapLoadProgress {
    visible: boolean;
    /** 0–100, or null while the total size is unknown (version check, unsized download). */
    percent: number | null;
    /** Bytes received so far, when the total size is unknown. */
    loadedBytes?: number;
}

export interface MapBootstrap {
    getProgress(): MapLoadProgress;
    subscribeProgress(listener: (progress: MapLoadProgress) => void): () => void;
    /** Resolves once the map is on screen; rejects (after logging) if it never loads. */
    ready: Promise<void>;
}

function applySavedAlgorithm(pathFinder: { setAlgorithm?: (algorithm: any) => void } | null | undefined): void {
    const algorithm = getMapSettings().pathFindingAlgorithm;
    if (algorithm && pathFinder?.setAlgorithm) {
        pathFinder.setAlgorithm(algorithm);
    }
}

/**
 * Download map data and colours, put the embedded map on screen, and keep it in
 * step with every later change to the map data.
 */
export function bootstrapMap(client: Pick<Client, "Map">): MapBootstrap {
    let progress: MapLoadProgress = {visible: false, percent: 0};
    const listeners = new Set<(progress: MapLoadProgress) => void>();
    const setProgress = (next: MapLoadProgress) => {
        progress = next;
        for (const listener of [...listeners]) listener(progress);
    };

    const onDownloadProgress = (percent: number, loaded?: number) => {
        setProgress(percent < 0
            ? {visible: true, percent: null, loadedBytes: loaded}
            : {visible: true, percent});
    };

    const ready = Promise.all([loadMapData(onDownloadProgress), loadColors()])
        .then(([mapData, colors]) => {
            console.log('Map data and colors loaded successfully');
            setProgress({visible: false, percent: 100});

            const {startId, reader, pathFinder} = client.Map.initialize(mapData, colors);
            applySavedAlgorithm(pathFinder);
            const embedded = new EmbeddedMap(reader, startId);
            embedded.pathFinder = pathFinder;
            setEmbeddedMap(embedded);

            // Single place the view is reconciled with map data, however it changed:
            // a data refresh, a whole map pushed from the editor, or individual areas
            // synced from it. The view holds its own reader reference and the renderer
            // caches per-area geometry, so neither a swapped reader nor an in-place
            // edit shows up on its own.
            client.Map.onAreasChanged((areaIds) => {
                const currentEmbedded = getEmbeddedMap();
                const currentReader = client.Map.tryGetMapReader();
                if (!currentEmbedded || !currentReader) return;

                if (currentEmbedded.reader !== currentReader) {
                    // The map was rebuilt — the old reader (and its renderer) are stale.
                    currentEmbedded.reload(currentReader);
                    currentEmbedded.pathFinder = client.Map.getPathFinder();
                    applySavedAlgorithm(currentEmbedded.pathFinder);
                } else {
                    currentEmbedded.refreshAreas(areaIds);
                }
            });

            subscribeToMapData((newMapData) => {
                if (!newMapData) return;
                if (!getEmbeddedMap()) return;

                // initialize() announces the new areas, and the handler above swaps
                // the reader into the view.
                client.Map.initialize(newMapData, colors);
            }, {emitInitial: false});
        })
        .catch((error) => {
            setProgress({visible: false, percent: 0});
            console.error('Failed to load map data or colors:', error);
            throw error;
        });
    // Failure is already reported above; callers that don't await must not see an
    // unhandled rejection.
    ready.catch(() => undefined);

    return {
        getProgress: () => progress,
        subscribeProgress(listener) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        ready,
    };
}
