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
  /** Renderers showing this overlay through {@link mirror}. */
  private readonly mirrors = new Set<SceneOverlayContext>();

  constructor(
    private readonly label: string,
    private readonly definition: MapOverlayDefinition,
  ) {}

  invalidate(): void {
    this.ctx?.invalidate();
    this.mirrors.forEach((ctx) => ctx.invalidate());
  }

  /**
   * The same overlay for another renderer (the static map window). A scene
   * overlay keeps one context and `detach()` does not say which renderer let
   * go, so a second renderer gets its own thin copy: same drawing, its own
   * position/area events, and redrawn by the plugin's `invalidate()` too.
   */
  mirror(): SceneOverlay {
    let ctx: SceneOverlayContext | undefined;
    const onChange = () => ctx?.invalidate();
    return {
      render: (state: MapState) => this.render(state),
      attach: (next: SceneOverlayContext) => {
        ctx = next;
        this.mirrors.add(next);
        next.state.events.on("position", onChange);
        next.state.events.on("area", onChange);
      },
      detach: () => {
        if (!ctx) return;
        this.mirrors.delete(ctx);
        ctx.state.events.off("position", onChange);
        ctx.state.events.off("area", onChange);
        ctx = undefined;
      },
    };
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
      settings: state.settings,
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
