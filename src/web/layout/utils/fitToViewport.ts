/**
 * Render-time fit of a floating window to the screen.
 *
 * Stored geometry comes from desktop defaults (a 550px wide popup) or from a
 * session on a bigger screen, so on a phone the window can open wider than
 * the screen with its close button out of reach. The stored record is left
 * alone - only what is drawn is adjusted - so going back to a big screen
 * restores the window where it was.
 */

/** Gap kept between a fitted window and the screen edges. */
export const FIT_MARGIN = 8;

export interface Viewport {
  width: number;
  height: number;
}

export interface FloatingGeometry {
  x: number;
  y: number;
  width: number;
  /** Undefined = auto height. */
  height: number | undefined;
}

export interface FitOptions {
  /** Pull the whole window on screen, not just cap its size. */
  keepOnScreen: boolean;
  /** Rendered height, for auto-height windows. */
  measuredHeight?: number;
}

export function readViewport(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Size is always capped to the screen: a window bigger than the screen is
 * never useful. Position is pulled fully on screen only with `keepOnScreen`
 * (phones), so a desktop user can still park a window half off the edge.
 */
export function fitToViewport(
  geom: FloatingGeometry,
  viewport: Viewport,
  { keepOnScreen, measuredHeight }: FitOptions
): FloatingGeometry {
  const maxWidth = Math.max(0, viewport.width - 2 * FIT_MARGIN);
  const maxHeight = Math.max(0, viewport.height - 2 * FIT_MARGIN);
  const width = Math.min(geom.width, maxWidth);
  const height = geom.height === undefined ? undefined : Math.min(geom.height, maxHeight);
  if (!keepOnScreen) {
    return { x: geom.x, y: geom.y, width, height };
  }
  const drawnHeight = Math.min(height ?? measuredHeight ?? 0, maxHeight);
  return {
    x: clamp(geom.x, FIT_MARGIN, viewport.width - width - FIT_MARGIN),
    y: clamp(geom.y, FIT_MARGIN, viewport.height - drawnHeight - FIT_MARGIN),
    width,
    height,
  };
}
