import type {
    MapState,
    SceneOverlay,
    SceneOverlayContext,
    Shape,
    ViewportBounds,
} from "mudlet-map-renderer";

interface PulseOverlayOptions {
    roomIds?: Iterable<number>;
    fillColor?: string;
    radius?: number;
    stroke?: string;
    strokeWidth?: number;
    pulseColor?: string;
    pulseMaxScale?: number;
    pulsePeriodMs?: number;
}

const DEFAULTS = {
    fillColor: "rgba(255, 59, 59, 0.25)",
    radius: 0.7,
    stroke: "#ff3b3b",
    strokeWidth: 0.06,
    pulseColor: "255, 59, 59",
    pulseMaxScale: 1.5,
    pulsePeriodMs: 1400,
};

export class PulseOverlay implements SceneOverlay {
    private roomIds: Set<number>;
    private opts: Required<Omit<PulseOverlayOptions, "roomIds">>;
    private ctx?: SceneOverlayContext;
    private rafId?: number;
    private startTime = 0;

    constructor(options: PulseOverlayOptions = {}) {
        this.roomIds = new Set(options.roomIds ?? []);
        this.opts = {
            fillColor: options.fillColor ?? DEFAULTS.fillColor,
            radius: options.radius ?? DEFAULTS.radius,
            stroke: options.stroke ?? DEFAULTS.stroke,
            strokeWidth: options.strokeWidth ?? DEFAULTS.strokeWidth,
            pulseColor: options.pulseColor ?? DEFAULTS.pulseColor,
            pulseMaxScale: options.pulseMaxScale ?? DEFAULTS.pulseMaxScale,
            pulsePeriodMs: options.pulsePeriodMs ?? DEFAULTS.pulsePeriodMs,
        };
    }

    setRoomIds(roomIds: Iterable<number>) {
        this.roomIds = new Set(roomIds);
        this.ctx?.invalidate();
    }

    hasRooms() {
        return this.roomIds.size > 0;
    }

    attach(ctx: SceneOverlayContext): void {
        this.ctx = ctx;
        this.startTime = performance.now();
        const tick = () => {
            this.ctx?.invalidate();
            this.rafId = requestAnimationFrame(tick);
        };
        this.rafId = requestAnimationFrame(tick);
    }

    detach(): void {
        if (this.rafId !== undefined) {
            cancelAnimationFrame(this.rafId);
            this.rafId = undefined;
        }
        this.ctx = undefined;
    }

    render(state: MapState, _bounds: ViewportBounds): Shape | Shape[] | void {
        if (this.roomIds.size === 0) return;

        const { fillColor, radius, stroke, strokeWidth, pulseColor, pulseMaxScale, pulsePeriodMs } = this.opts;

        const phase = this.rafId !== undefined ? ((performance.now() - this.startTime) % pulsePeriodMs) / pulsePeriodMs : 0;
        const pulseScale = 1 + (pulseMaxScale - 1) * phase;
        const pulseAlpha = (1 - phase) * 0.55;

        const currentArea = state.currentArea;
        const currentZ = state.currentZIndex;

        const shapes: Shape[] = [];

        for (const id of this.roomIds) {
            const room = state.mapReader.getRoom(id);
            if (!room) continue;
            if (currentArea !== undefined && (room.area !== currentArea || room.z !== currentZ)) continue;

            if (pulseAlpha > 0.01) {
                shapes.push({
                    type: "circle",
                    cx: room.x,
                    cy: room.y,
                    radius: radius * pulseScale,
                    paint: {
                        stroke: `rgba(${pulseColor}, ${pulseAlpha.toFixed(3)})`,
                        strokeWidth: strokeWidth * 1.2,
                    },
                    layer: "overlay",
                });
            }

            shapes.push({
                type: "circle",
                cx: room.x,
                cy: room.y,
                radius,
                paint: {
                    fill: fillColor,
                    stroke,
                    strokeWidth,
                },
                layer: "overlay",
            });
        }

        return shapes;
    }
}
