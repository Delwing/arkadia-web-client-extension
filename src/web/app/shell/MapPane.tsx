import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { DEFAULT_SLOT, useHostHeldAt, useHostSlot } from "@web/layout/movableHost.ts";
import type { MapBootstrap } from "@web/map/mapBootstrap.ts";
import { installMapLayoutOffsets } from "@web/platform/iosViewport.ts";
import { MapChrome } from "./MapChrome";
import { mapHost } from "./mapHosts";

/**
 * The map's default place (#iframe-container): where the body's data-map-position
 * puts it, holding the map whenever no layout panel does, with the chrome over it
 * and the download progress bar.
 */
export function MapPane({ mapLoad }: { mapLoad: MapBootstrap }) {
    const ref = useRef<HTMLDivElement>(null);
    useHostSlot(mapHost, ref, DEFAULT_SLOT);
    const holdsMap = useHostHeldAt(mapHost, DEFAULT_SLOT);
    const progress = useSyncExternalStore(mapLoad.subscribeProgress, mapLoad.getProgress);

    // The top-overlay map keeps clear of the iOS keyboard. Mounted once, for the page's life.
    useLayoutEffect(() => {
        installMapLayoutOffsets(ref.current, document.getElementById("main-container"));
    }, []);

    let barWidth = "0";
    let barText = "";
    if (progress.visible) {
        if (progress.percent === null) {
            // Indeterminate progress: version check, or download of unknown total size
            barWidth = "100%";
            barText = progress.loadedBytes !== undefined ? `${Math.floor(progress.loadedBytes / 1024)} KB` : "";
        } else {
            barWidth = `${progress.percent}%`;
            barText = `${Math.floor(progress.percent)}%`;
        }
    }

    return (
        <div id="iframe-container" ref={ref}>
            {holdsMap && <MapChrome />}
            <div id="map-progress-container" className="map-progress" style={{ display: progress.visible ? "block" : "none" }}>
                <div className="map-progress__track">
                    <div id="map-progress-bar" className="map-progress__bar" style={{ width: barWidth }}>{barText}</div>
                </div>
            </div>
        </div>
    );
}
