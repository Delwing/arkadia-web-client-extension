import type {
    MapState,
    SceneOverlay,
    SceneOverlayContext,
    Shape,
    ViewportBounds,
} from "mudlet-map-renderer";

export interface ParkedCarriageMarker {
    roomId: number;
    /** Short label drawn under the wheel, e.g. "bryczka". */
    label: string;
}

const COLOR = "#d08c3c";
const RADIUS = 0.62;
/** Four spokes, drawn as two crossing lines rotated 45 degrees apart. */
const SPOKE_ANGLES = [0, Math.PI / 4];

/**
 * Marks rooms where a carriage was left behind with a small cart wheel and its type. Distinct on
 * purpose from the lost-teammate pulse (red, urgent, animated) - a parked wagon is not an alarm,
 * it just needs to be findable again.
 */
export class ParkedCarriagesOverlay implements SceneOverlay {
    private markers: ParkedCarriageMarker[];
    private ctx?: SceneOverlayContext;

    constructor(markers: ParkedCarriageMarker[] = []) {
        this.markers = markers;
    }

    setMarkers(markers: ParkedCarriageMarker[]) {
        this.markers = markers;
        this.ctx?.invalidate();
    }

    attach(ctx: SceneOverlayContext): void {
        this.ctx = ctx;
    }

    detach(): void {
        this.ctx = undefined;
    }

    render(state: MapState, _bounds: ViewportBounds): Shape | Shape[] | void {
        if (this.markers.length === 0) return;
        const currentArea = state.currentArea;
        const currentZ = state.currentZIndex;
        const shapes: Shape[] = [];

        for (const marker of this.markers) {
            const room = state.mapReader.getRoom(marker.roomId);
            if (!room) continue;
            if (currentArea !== undefined && (room.area !== currentArea || room.z !== currentZ)) continue;

            shapes.push({
                type: "circle",
                cx: room.x,
                cy: room.y,
                radius: RADIUS,
                paint: { fill: `${COLOR}33`, stroke: COLOR, strokeWidth: 0.12 },
                layer: "overlay",
            });
            shapes.push({
                type: "circle",
                cx: room.x,
                cy: room.y,
                radius: RADIUS * 0.28,
                paint: { fill: COLOR },
                layer: "overlay",
            });
            for (const angle of SPOKE_ANGLES) {
                const dx = Math.cos(angle) * RADIUS;
                const dy = Math.sin(angle) * RADIUS;
                shapes.push({
                    type: "line",
                    points: [room.x - dx, room.y - dy, room.x + dx, room.y + dy],
                    paint: { stroke: COLOR, strokeWidth: 0.07, alpha: 0.9 },
                    layer: "overlay",
                });
                shapes.push({
                    type: "line",
                    points: [room.x - dy, room.y + dx, room.x + dy, room.y - dx],
                    paint: { stroke: COLOR, strokeWidth: 0.07, alpha: 0.9 },
                    layer: "overlay",
                });
            }
            shapes.push({
                type: "text",
                x: room.x,
                y: room.y + RADIUS + 0.2,
                text: marker.label,
                fontSize: 0.45,
                fill: COLOR,
                stroke: "rgba(0,0,0,0.85)",
                strokeWidth: 0.05,
                align: "center",
                verticalAlign: "top",
                layer: "top",
            });
        }

        return shapes;
    }
}
