import { MapRenderer } from "mudlet-map-renderer";
import { getEmbeddedMap } from "@web/embedRegistry.ts";
import type { EmbeddedMap } from "@web/embed.ts";

const HIGHLIGHT = "#6da7da";
const ZOOM = 0.3;

/**
 * Hover preview of one room: its area and level drawn by a private renderer
 * over the shared map reader (like MapStrip), the room ringed and centred.
 * One renderer is kept for the page's lifetime and only redrawn per hover;
 * it is rebuilt when the embedded map itself is replaced (map reload).
 */
let renderer: MapRenderer | null = null;
let rendererFor: EmbeddedMap | null = null;
let initialized = false;

function elements() {
    const root = document.getElementById("room-preview-tooltip");
    const title = root?.querySelector<HTMLElement>(".room-preview-tooltip__title");
    const map = root?.querySelector<HTMLDivElement>(".room-preview-tooltip__map");
    return root && title && map ? { root, title, map } : null;
}

function ensureRenderer(embedded: EmbeddedMap, container: HTMLDivElement): MapRenderer {
    if (renderer && rendererFor === embedded) return renderer;
    renderer?.destroy();
    renderer = new MapRenderer(embedded.reader, embedded.settings, container);
    renderer.centerOnResize = false;
    renderer.setZoom(ZOOM);
    rendererFor = embedded;
    return renderer;
}

export function hideRoomPreview(): void {
    elements()?.root.classList.remove("show");
}

export function showRoomPreview(roomId: number, x: number, y: number): void {
    const els = elements();
    const embedded = getEmbeddedMap();
    const room = embedded?.reader?.getRoom(roomId);
    if (!els || !embedded || !room) return;
    if (!initialized) {
        initialized = true;
        document.addEventListener("pointerdown", hideRoomPreview);
    }

    const areaName = embedded.reader.getArea?.(room.area)?.getAreaName?.();
    els.title.textContent = [room.name, areaName].filter(Boolean).join(" · ") || `#${roomId}`;

    // Laid out but invisible first: the renderer needs the box's real size.
    els.root.style.left = "0px";
    els.root.style.top = "0px";
    els.root.style.visibility = "hidden";
    els.root.classList.add("show");

    const r = ensureRenderer(embedded, els.map);
    r.camera.setSize(els.map.clientWidth, els.map.clientHeight);
    r.drawArea(room.area, room.z);
    const here = embedded.currentRoom ? embedded.reader.getRoom(embedded.currentRoom) : null;
    if (here && here.area === room.area && here.z === room.z) {
        r.setPosition(here.id, false);
    } else {
        r.clearPosition();
    }
    r.clearHighlights();
    r.renderHighlight(roomId, HIGHLIGHT);
    r.centerOn(roomId, true);

    const rect = els.root.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    let left = x + 12;
    let top = y + 16;
    if (left + rect.width > viewportWidth) left = Math.max(0, x - rect.width - 12);
    if (top + rect.height > viewportHeight) top = Math.max(0, y - rect.height - 8);
    els.root.style.left = `${left}px`;
    els.root.style.top = `${top}px`;
    els.root.style.visibility = "";
}
