/**
 * The phone's own map: the same map data the client downloads (cached in this
 * browser after the first time), drawn by its own renderer. The PC only sends
 * the room id, so nothing about the PC's map is shared or touched.
 *
 * Imported lazily, when the map is first opened: the renderer and the data are
 * the heaviest thing the phone page loads.
 */

import { MapReader, MapRenderer, createSettings } from "mudlet-map-renderer";
import { loadColors, loadMapData } from "@web/mapDataLoader.ts";

/** The PC map's own starting zoom: a wide view of the rooms around the player. */
const PHONE_ZOOM = 0.30;

export interface PhoneMap {
    show(roomId: number | null): void;
    destroy(): void;
}

/** Parsed once per page: building the reader is the slow part after the download. */
let readerPromise: Promise<MapReader> | null = null;

function loadReader(): Promise<MapReader> {
    readerPromise ??= Promise.all([loadMapData(), loadColors()])
        .then(([mapData, colors]) => new MapReader(mapData, colors));
    readerPromise.catch(() => { readerPromise = null; });
    return readerPromise;
}

export async function createPhoneMap(container: HTMLDivElement): Promise<PhoneMap> {
    const reader = await loadReader();
    const settings = createSettings();
    settings.areaName = false;
    // The panel lies over the output; its own tint is the background.
    settings.backgroundColor = 'transparent';
    const renderer = new MapRenderer(reader, settings, container);
    // A phone strip is small: show the rooms around the player, not just theirs. Pinch still zooms.
    renderer.setZoom(PHONE_ZOOM);

    let area: string | null = null;
    let current: number | null = null;

    const show = (roomId: number | null) => {
        current = roomId;
        if (!roomId) return;
        const room = reader.getRoom(roomId);
        if (!room) return;
        const key = `${room.area}:${room.z}`;
        if (key !== area) {
            renderer.drawArea(room.area, room.z);
            area = key;
        }
        // Jump, not glide: on a phone the animation only lags behind the walk.
        renderer.setPosition(roomId, false);
        renderer.updatePositionMarker(roomId);
        renderer.centerOn(roomId, true);
    };

    // The panel can be laid out after the renderer measured it; centre again once it has a size.
    const resize = new ResizeObserver(() => {
        if (current) renderer.centerOn(current, true);
    });
    resize.observe(container);

    return {
        show,
        destroy() {
            resize.disconnect();
            renderer.destroy();
        },
    };
}
