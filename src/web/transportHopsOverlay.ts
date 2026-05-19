import type {
    MapState,
    SceneOverlay,
    SceneOverlayContext,
    Shape,
    ViewportBounds,
} from "mudlet-map-renderer";

export interface TransportHopMarker {
    fromRoomId: number;
    toRoomId: number;
    transportName: string;
    label?: string;
    color: string;
}

export class TransportHopsOverlay implements SceneOverlay {
    private hops: TransportHopMarker[];
    private ctx?: SceneOverlayContext;

    constructor(hops: TransportHopMarker[] = []) {
        this.hops = hops;
    }

    setHops(hops: TransportHopMarker[]) {
        this.hops = hops;
        this.ctx?.invalidate();
    }

    attach(ctx: SceneOverlayContext): void {
        this.ctx = ctx;
    }

    detach(): void {
        this.ctx = undefined;
    }

    render(state: MapState, _bounds: ViewportBounds): Shape | Shape[] | void {
        if (this.hops.length === 0) return;
        const currentArea = state.currentArea;
        const currentZ = state.currentZIndex;
        const shapes: Shape[] = [];

        for (const hop of this.hops) {
            const fromRoom = state.mapReader.getRoom(hop.fromRoomId);
            const toRoom = state.mapReader.getRoom(hop.toRoomId);

            if (fromRoom && (currentArea === undefined || (fromRoom.area === currentArea && fromRoom.z === currentZ))) {
                this.pushMarker(shapes, fromRoom.x, fromRoom.y, hop.color, true, hop.label ?? hop.transportName);
            }
            if (toRoom && (currentArea === undefined || (toRoom.area === currentArea && toRoom.z === currentZ))) {
                const arriveLabel = hop.label ? `← ${hop.label}` : `← ${hop.transportName}`;
                this.pushMarker(shapes, toRoom.x, toRoom.y, hop.color, false, arriveLabel);
            }

            // Same-area, same-z hops: also draw an arrow line between endpoints.
            if (
                fromRoom && toRoom &&
                fromRoom.area === toRoom.area && fromRoom.z === toRoom.z &&
                (currentArea === undefined || (fromRoom.area === currentArea && fromRoom.z === currentZ))
            ) {
                shapes.push({
                    type: "line",
                    points: [fromRoom.x, fromRoom.y, toRoom.x, toRoom.y],
                    paint: { stroke: hop.color, strokeWidth: 0.12, dash: [0.2, 0.15], dashEnabled: true, alpha: 0.85 },
                    layer: "overlay",
                });
            }
        }

        return shapes;
    }

    private pushMarker(shapes: Shape[], x: number, y: number, color: string, boarding: boolean, label: string) {
        shapes.push({
            type: "circle",
            cx: x,
            cy: y,
            radius: 0.85,
            paint: { stroke: color, strokeWidth: 0.16, fill: boarding ? `${color}22` : "transparent" },
            layer: "overlay",
        });
        shapes.push({
            type: "circle",
            cx: x,
            cy: y,
            radius: 1.15,
            paint: { stroke: color, strokeWidth: 0.08, alpha: 0.6 },
            layer: "overlay",
        });
        shapes.push({
            type: "text",
            x,
            y: y - 1.55,
            text: boarding ? `→ ${label}` : label,
            fontSize: 0.5,
            fill: color,
            stroke: "rgba(0,0,0,0.85)",
            strokeWidth: 0.05,
            align: "center",
            verticalAlign: "bottom",
            layer: "top",
        });
    }
}
