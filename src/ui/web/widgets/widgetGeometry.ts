import type { WidgetCorner } from "@modules/core/widgetRegistry.ts";

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Anchor {
  corner: WidgetCorner;
  dx: number;
  dy: number;
}

function clamp(value: number, min: number, max: number): number {
  // A widget wider than the area sticks to the area's start rather than leaving it.
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

/** Where a widget of `size` pinned at `anchor` sits in `area`, kept inside it. */
export function widgetPosition(anchor: Anchor, area: Rect, size: Size): { left: number; top: number } {
  const right = anchor.corner[1] === "r";
  const bottom = anchor.corner[0] === "b";
  const left = right ? area.left + area.width - size.width - anchor.dx : area.left + anchor.dx;
  const top = bottom ? area.top + area.height - size.height - anchor.dy : area.top + anchor.dy;
  return {
    left: clamp(left, area.left, area.left + area.width - size.width),
    top: clamp(top, area.top, area.top + area.height - size.height),
  };
}

/** The anchor for a widget dropped at `left`/`top`: the corner its centre is nearest to. */
export function anchorAt(left: number, top: number, size: Size, area: Rect): Anchor {
  const right = left + size.width / 2 - area.left > area.width / 2;
  const bottom = top + size.height / 2 - area.top > area.height / 2;
  const dx = right ? area.left + area.width - (left + size.width) : left - area.left;
  const dy = bottom ? area.top + area.height - (top + size.height) : top - area.top;
  return {
    corner: `${bottom ? "b" : "t"}${right ? "r" : "l"}` as WidgetCorner,
    dx: Math.max(0, Math.round(dx)),
    dy: Math.max(0, Math.round(dy)),
  };
}
