import type { SceneOverlay } from "mudlet-map-renderer";

/**
 * Scene overlays registered from outside the map UI (plugins). The map
 * (`EmbeddedMap`) mirrors this registry onto its renderer, and re-attaches
 * every entry whenever the renderer is rebuilt, so overlays survive map
 * reloads and may be registered before the map exists.
 */
type Listener = (change: { type: "add" | "remove"; id: string; overlay: SceneOverlay }) => void;

const overlays = new Map<string, SceneOverlay>();
const listeners = new Set<Listener>();

export function registerMapOverlay(id: string, overlay: SceneOverlay): void {
  const previous = overlays.get(id);
  if (previous) {
    unregisterMapOverlay(id);
  }
  overlays.set(id, overlay);
  listeners.forEach((listener) => listener({ type: "add", id, overlay }));
}

export function unregisterMapOverlay(id: string): void {
  const overlay = overlays.get(id);
  if (!overlay) {
    return;
  }
  overlays.delete(id);
  listeners.forEach((listener) => listener({ type: "remove", id, overlay }));
}

export function getMapOverlays(): ReadonlyMap<string, SceneOverlay> {
  return overlays;
}

/**
 * The overlay to hand a second renderer (the static map window). An overlay
 * attaches to one renderer at a time, so ones that can copy themselves do;
 * any other is shared for drawing only, without its event subscriptions.
 */
export function mirrorMapOverlay(overlay: SceneOverlay): SceneOverlay {
  const mirror = (overlay as { mirror?: () => SceneOverlay }).mirror;
  if (typeof mirror === "function") {
    return mirror.call(overlay);
  }
  return { sceneSpace: overlay.sceneSpace, render: (state, bounds) => overlay.render(state, bounds) };
}

export function onMapOverlaysChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
