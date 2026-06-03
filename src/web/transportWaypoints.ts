import type { Waypoint } from "mudlet-map-renderer";
import eventBus from "@modules/core/eventBus";
import { getTransportDefs, type TransportDef } from "@client/scripts/transports/definitions";
import type { TransportRoutePayload } from "@client/types/transport";

/** Default accent colour for transport-stop bubbles. */
export const TRANSPORT_STOP_COLOR = "#ffcc66";

/**
 * Build the route-popup payload for a transport definition (an off-board view —
 * no active stop, not on board). Mirrors the live tracker's label logic so the
 * popup reads identically whether opened from a click here or while travelling.
 */
function buildRoutePayload(def: TransportDef): TransportRoutePayload {
    // roomId -> display label, same precedence the tracker uses.
    const labels = new Map<number, string>();
    for (const s of def.stops) labels.set(s.destination, s.label || String(s.destination));
    for (const s of def.stops) if (!labels.has(s.start)) labels.set(s.start, String(s.start));

    const stops = def.stops.map(s => ({
        label: s.label || labels.get(s.destination) || String(s.destination),
        durationSeconds: typeof s.time === "number" && !Number.isNaN(s.time) ? s.time : null,
    }));
    const uniqueDests = new Set(def.stops.map(s => s.destination));
    return {
        transportName: def.name,
        originLabel: (def.stops[0] && labels.get(def.stops[0].start)) || "",
        stops,
        activeStopIndex: undefined,
        onBoard: false,
        loop: def.stops.length > 0 && uniqueDests.size === def.stops.length,
    };
}

/** Open the transport route popup showing the given route. */
export function showTransportRoute(def: TransportDef): void {
    eventBus.emit("transportRoute", buildRoutePayload(def));
    eventBus.emit("transport.popup.open");
}

/**
 * Build transport-stop waypoints from the shared transport definitions: one
 * {@link Waypoint} per route per stop room, labelled with the route name.
 * Clicking a bubble opens the transport route popup for that route. A room
 * served by several routes gets one bubble per route (the renderer's
 * {@link WaypointOverlay} keeps them from stacking). Room ids match the game
 * map, so each waypoint anchors to the dock room when that plane is shown.
 */
export function buildTransportWaypoints(color: string = TRANSPORT_STOP_COLOR): Waypoint[] {
    const out: Waypoint[] = [];
    for (const def of getTransportDefs()) {
        const rooms = new Set<number>();
        for (const s of def.stops) {
            if (s.start) rooms.add(s.start);
            if (s.destination) rooms.add(s.destination);
        }
        for (const roomId of rooms) {
            out.push({ roomId, label: def.name, color, onClick: () => showTransportRoute(def) });
        }
    }
    return out;
}
