import type {
    MapState,
    SceneOverlay,
    SceneOverlayContext,
    Shape,
    ViewportBounds,
} from "mudlet-map-renderer";

const COLOR = "#c0504d";
const RADIUS = 0.32;

/**
 * Marks rooms recorded as impassable to a carriage with a small barred circle.
 *
 * Kept deliberately quiet - no label, no animation, and smaller than the other markers. There can
 * be hundreds of these once a region has been surveyed, and unlike a lost teammate or a parked
 * wagon they are reference material rather than something to react to.
 */
export class CarriageBlocksOverlay implements SceneOverlay {
    private roomIds: Set<number>;
    private ctx?: SceneOverlayContext;

    constructor(roomIds: Iterable<number> = []) {
        this.roomIds = new Set(roomIds);
    }

    setRoomIds(roomIds: Iterable<number>) {
        this.roomIds = new Set(roomIds);
        this.ctx?.invalidate();
    }

    attach(ctx: SceneOverlayContext): void {
        this.ctx = ctx;
    }

    detach(): void {
        this.ctx = undefined;
    }

    render(state: MapState, _bounds: ViewportBounds): Shape | Shape[] | void {
        if (this.roomIds.size === 0) return;
        const currentArea = state.currentArea;
        const currentZ = state.currentZIndex;
        const shapes: Shape[] = [];

        for (const id of this.roomIds) {
            const room = state.mapReader.getRoom(id);
            if (!room) continue;
            if (currentArea !== undefined && (room.area !== currentArea || room.z !== currentZ)) continue;

            shapes.push({
                type: "circle",
                cx: room.x,
                cy: room.y,
                radius: RADIUS,
                paint: { stroke: COLOR, strokeWidth: 0.09, alpha: 0.85 },
                layer: "overlay",
            });
            // The bar across it, at the angle a "no entry" sign uses.
            const offset = RADIUS * Math.SQRT1_2;
            shapes.push({
                type: "line",
                points: [room.x - offset, room.y + offset, room.x + offset, room.y - offset],
                paint: { stroke: COLOR, strokeWidth: 0.09, alpha: 0.85 },
                layer: "overlay",
            });
        }

        return shapes;
    }
}
