import type { MapState, SceneOverlay, SceneOverlayContext, Shape } from "mudlet-map-renderer";
import type { MapOverlayDefinition, MapOverlayRenderState } from "./PluginApi";

/**
 * Wraps a plugin's {@link MapOverlayDefinition} as a renderer
 * {@link SceneOverlay}. Plugins get a small stable state object instead of the
 * renderer's MapState, and a throwing plugin never breaks the map render.
 * Redraws on player move and area change so position-relative overlays
 * need no bookkeeping of their own.
 */
export class PluginMapOverlay implements SceneOverlay {
  private ctx?: SceneOverlayContext;
  private readonly onChange = () => this.ctx?.invalidate();
  private reportedError = false;

  constructor(
    private readonly label: string,
    private readonly definition: MapOverlayDefinition,
  ) {}

  invalidate(): void {
    this.ctx?.invalidate();
  }

  attach(ctx: SceneOverlayContext): void {
    this.ctx = ctx;
    ctx.state.events.on("position", this.onChange);
    ctx.state.events.on("area", this.onChange);
  }

  detach(): void {
    this.ctx?.state.events.off("position", this.onChange);
    this.ctx?.state.events.off("area", this.onChange);
    this.ctx = undefined;
  }

  render(state: MapState): Shape | Shape[] | void {
    const view: MapOverlayRenderState = {
      currentRoomId: state.positionRoomId,
      areaId: state.currentArea,
      z: state.currentZIndex,
      lineWidth: state.settings.lineWidth,
      roomSize: state.settings.roomSize,
      getRoom: (roomId: number) => state.mapReader.getRoom(roomId) ?? undefined,
    };
    try {
      const shapes = this.definition.render(view);
      if (!shapes) return;
      const list = Array.isArray(shapes) ? shapes : [shapes];
      return list.map((shape) => ({ layer: "overlay", ...shape }) as Shape);
    } catch (error) {
      if (!this.reportedError) {
        this.reportedError = true;
        console.error(`[map overlay ${this.label}] render failed`, error);
      }
    }
  }
}
