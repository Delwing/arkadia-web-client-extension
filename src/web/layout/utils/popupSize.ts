/**
 * Starting sizes of plugin popups.
 *
 * A plugin gives a size per axis as a px number, any CSS length ('420px',
 * '30em', '40%', 'min(600px, 80vw)') or 'content'. Lengths are resolved to px
 * by the browser itself - a fixed-position probe, so percentages are of the
 * game window. 'content' is measured once the popup is on screen.
 */

export type PopupSizeValue = number | string;

export type PopupAxis = 'width' | 'height';

/** Gap kept between a popup and the edges of the game window. */
export const POPUP_SCREEN_MARGIN = 16;

/** Resize minimum of a plugin popup - starting sizes never go below it. */
export const POPUP_MIN_WIDTH = 300;
export const POPUP_MIN_HEIGHT = 150;

export const CONTENT_SIZE = 'content';

export interface InitialPopupSize {
  width: number;
  /** Undefined = auto height (sized by the content, capped to the screen). */
  height: number | undefined;
  fitWidth: boolean;
  fitHeight: boolean;
}

// Default: half the viewport width, clamped between 350 and 700
function defaultPopupWidth(): number {
  return Math.min(700, Math.max(350, Math.floor(window.innerWidth * 0.5)));
}

// Default: 40% of the viewport height, clamped between 250 and 500
function defaultPopupHeight(): number {
  return Math.min(500, Math.max(250, Math.floor(window.innerHeight * 0.4)));
}

function resolveAxis(value: PopupSizeValue | undefined, axis: PopupAxis, min: number) {
  const resolved = resolvePopupLength(value, axis);
  if (resolved === CONTENT_SIZE) return CONTENT_SIZE;
  return resolved === null ? null : clampPopupLength(resolved, axis, min);
}

/** A plugin's requested starting size, falling back to the defaults per axis. */
export function getInitialPopupSize(requested: {
  initialWidth?: PopupSizeValue;
  initialHeight?: PopupSizeValue;
}): InitialPopupSize {
  const width = resolveAxis(requested.initialWidth, 'width', POPUP_MIN_WIDTH);
  const height = resolveAxis(requested.initialHeight, 'height', POPUP_MIN_HEIGHT);
  return {
    width: typeof width === 'number' ? width : defaultPopupWidth(),
    height: height === CONTENT_SIZE ? undefined : height ?? defaultPopupHeight(),
    fitWidth: width === CONTENT_SIZE,
    fitHeight: height === CONTENT_SIZE,
  };
}

/**
 * Resolve a plugin size to px. Returns 'content' for the fit-to-content
 * keyword and null when nothing usable was given (missing, invalid CSS or a
 * non-positive result) so the caller falls back to its default.
 */
export function resolvePopupLength(
  value: PopupSizeValue | undefined,
  axis: PopupAxis
): number | typeof CONTENT_SIZE | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  const text = value.trim();
  if (text.toLowerCase() === CONTENT_SIZE) return CONTENT_SIZE;
  if (!text || typeof document === 'undefined' || !document.body) return null;

  const probe = document.createElement('div');
  probe.style.position = 'fixed';
  probe.style.left = '0';
  probe.style.top = '0';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style[axis] = text;
  // The browser drops a value it can't parse - nothing to measure then.
  if (!probe.style[axis]) return null;

  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect()[axis];
  probe.remove();
  return px > 0 ? px : null;
}

/** Keep a size on screen and no smaller than the resize minimum. */
export function clampPopupLength(px: number, axis: PopupAxis, min: number): number {
  const viewport = axis === 'width' ? window.innerWidth : window.innerHeight;
  const available = Math.max(0, viewport - 2 * POPUP_SCREEN_MARGIN);
  return Math.round(Math.max(Math.min(px, available), Math.min(min, available)));
}

/** Position that centres a popup of the given size along one axis. */
export function centeredPopupOffset(size: number, axis: PopupAxis): number {
  const viewport = axis === 'width' ? window.innerWidth : window.innerHeight;
  return Math.max(POPUP_SCREEN_MARGIN, Math.round((viewport - size) / 2));
}

/**
 * Natural size of a floating popup's content: the shell is laid out at
 * max-content width (capped to the screen) and auto height, measured, and put
 * back. Height is measured at the width the popup will end up with.
 */
export function measurePopupContent(
  panel: HTMLElement,
  fitWidth: boolean,
  minWidth: number
): { width: number; height: number } {
  const { width: prevWidth, height: prevHeight } = panel.style;
  let width = panel.getBoundingClientRect().width;
  if (fitWidth) {
    panel.style.width = 'max-content';
    width = clampPopupLength(Math.ceil(panel.getBoundingClientRect().width), 'width', minWidth);
  }
  panel.style.width = `${width}px`;
  panel.style.height = 'auto';
  const height = Math.ceil(panel.getBoundingClientRect().height);
  panel.style.width = prevWidth;
  panel.style.height = prevHeight;
  return { width, height };
}
