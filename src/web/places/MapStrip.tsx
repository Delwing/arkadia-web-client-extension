import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { MapRenderer } from "mudlet-map-renderer";
import { getEmbeddedMap, subscribeEmbeddedMap } from "@web/embedRegistry.ts";
import type { EmbeddedMap } from "@web/embed.ts";

const HIGHLIGHT = "#6da7da";

/**
 * A small live map around one room: its area and level drawn by the same
 * renderer as the map window, the room ringed. The room sits in the middle of
 * the part left visible above `coverRef` (the title bar laid over the strip's
 * bottom), not in the middle of the whole strip. Renders nothing until the map
 * data has loaded, or when the room is not on the map.
 */
export function MapStrip({ roomId, coverRef }: { roomId: number; coverRef?: RefObject<HTMLElement | null> }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<MapRenderer | null>(null);
    // Read synchronously: starting from null would render no strip for a frame
    // and the title bar laid over it would jump up and back on every switch.
    const [embedded, setEmbedded] = useState<EmbeddedMap | null>(() => getEmbeddedMap());
    const room = embedded?.reader?.getRoom(roomId);

    useEffect(() => subscribeEmbeddedMap(setEmbedded), []);

    /** Centre the room, then lift it into the uncovered part of the strip. */
    const frame = useCallback(() => {
        const renderer = rendererRef.current;
        const container = containerRef.current;
        if (!renderer || !container || container.clientHeight === 0) return;
        renderer.centerOn(roomId, true);
        const camera = renderer.camera;
        const cover = coverRef?.current;
        if (!cover) return;
        const stripTop = container.getBoundingClientRect().top;
        const coverTop = cover.getBoundingClientRect().top - stripTop;
        const target = Math.max(0, coverTop) / 2;
        const scale = camera.getScale();
        const centreX = (camera.width / 2 - camera.position.x) / scale;
        const centreY = (camera.height / 2 - camera.position.y) / scale;
        camera.panToMapPoint(centreX, centreY + (camera.height / 2 - target) / scale);
    }, [roomId, coverRef]);

    // One renderer for the strip's lifetime; later rooms just redraw it.
    useEffect(() => {
        const container = containerRef.current;
        if (!embedded?.reader || !container || !room) return;
        const renderer = new MapRenderer(embedded.reader, embedded.settings, container);
        if (embedded.isExplorationMode?.() && embedded.explorationLens) {
            renderer.setLens(embedded.explorationLens);
        }
        renderer.centerOnResize = false;
        renderer.setZoom(0.24);
        rendererRef.current = renderer;
        return () => {
            rendererRef.current = null;
            renderer.destroy();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [embedded, !!room]);

    useEffect(() => {
        const renderer = rendererRef.current;
        if (!renderer || !room || !embedded) return;
        renderer.drawArea(room.area, room.z);
        const here = embedded.currentRoom ? embedded.reader.getRoom(embedded.currentRoom) : null;
        if (here && here.area === room.area && here.z === room.z) {
            renderer.setPosition(here.id, false);
        } else {
            renderer.clearPosition();
        }
        renderer.clearHighlights();
        renderer.renderHighlight(roomId, HIGHLIGHT);
        frame();
    }, [roomId, room, embedded, frame]);

    // The strip is often laid out after it mounts (the window opening), and
    // the title bar can wrap: re-frame whenever either changes size.
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const observer = new ResizeObserver(() => frame());
        observer.observe(container);
        if (coverRef?.current) observer.observe(coverRef.current);
        return () => observer.disconnect();
    }, [frame, coverRef, !!room]);

    if (!room) return null;
    return <div ref={containerRef} className="places-map" />;
}
