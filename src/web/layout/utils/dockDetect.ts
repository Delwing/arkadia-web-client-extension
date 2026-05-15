import type { DockSide } from '../types';

const EMPTY_DOCK_ZONE = 80;

export interface DropInfo {
  slotIndex: number;
  stackTargetId?: string;
  splitTargetId?: string;
  splitBefore?: boolean;
}

export interface DetectionResult extends DropInfo {
  side: DockSide | null;
}

/**
 * 5-zone drop detection per slot (ported from mudix).
 *
 * For a horizontal dock area (top/bottom):
 *   ┌────────────────────────────────┐
 *   │        SPLIT ABOVE 25%         │
 *   ├────┬──────────────────────┬────┤
 *   │bef │      tab stack       │aft │  (middle 50% cross-axis)
 *   │20% │      center 60%      │20% │
 *   ├────┴──────────────────────┴────┤
 *   │        SPLIT BELOW 25%         │
 *   └────────────────────────────────┘
 *
 * Ghost-slot hysteresis: when the cursor is inside a ghost slot that appears
 * on a before/after drop, the ghost and the adjacent real panel are merged
 * into one bounding box for zone detection so the center/split zones stay
 * reachable without dragging across the ghost.
 */
export function detectDock(mx: number, my: number): DetectionResult {
  // ── Bottom dock is special: it lives below #input-area (outside the
  // #content-area grid). Trigger threshold is the top of #input-area — once
  // the cursor reaches the input bar level (or anywhere below it), bottom
  // activates. content-area's bottom is too high because multi-binds + the
  // footer sit between content-area and the input bar.
  const bottomDock = document.querySelector<HTMLElement>('.dock-area-bottom');
  const inputArea = document.getElementById('input-area');
  const contentAreaForBottom = document.getElementById('content-area');
  if (inputArea && contentAreaForBottom) {
    const cr = contentAreaForBottom.getBoundingClientRect();
    const ir = inputArea.getBoundingClientRect();
    if (mx >= cr.left && mx <= cr.right && my >= ir.top) {
      if (bottomDock) {
        const br = bottomDock.getBoundingClientRect();
        const inDock =
          mx >= br.left && mx <= br.right && my >= br.top && my <= br.bottom;
        const hasRealPanels = !!bottomDock.querySelector(
          '.dock-panel-slot:not(.dock-panel-slot--preview)'
        );
        if (inDock && hasRealPanels) {
          return { side: 'bottom', ...slotDropInfo(bottomDock, 'bottom', mx, my) };
        }
      }
      return { side: 'bottom', slotIndex: 0 };
    }
  }

  for (const side of ['left', 'right', 'top'] as DockSide[]) {
    const el = document.querySelector<HTMLElement>(`.dock-area-${side}`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (mx < r.left || mx > r.right || my < r.top || my > r.bottom) continue;

    // Empty dock area: use the same EMPTY_DOCK_ZONE that activates it so the
    // hover region is symmetric (no jumpy activation/deactivation).
    const hasRealPanels = !!el.querySelector(
      '.dock-panel-slot:not(.dock-panel-slot--preview)'
    );
    if (!hasRealPanels) {
      const inZone =
        side === 'left'
          ? mx - r.left < EMPTY_DOCK_ZONE
          : side === 'right'
          ? r.right - mx < EMPTY_DOCK_ZONE
          : my - r.top < EMPTY_DOCK_ZONE;
      if (!inZone) continue;
      return { side, slotIndex: 0 };
    }

    return { side, ...slotDropInfo(el, side, mx, my) };
  }

  // Fallback: when a dock side has no DockArea element rendered (because it
  // has no windows AND no active drag has registered there yet), use
  // #content-area's edges as the trigger zone. This is what bootstraps the
  // very first drag-into-empty-dock — once dragState fires, the empty
  // DockArea is rendered and subsequent detectDock calls find it directly.
  const vp = document.getElementById('content-area');
  if (vp) {
    const r = vp.getBoundingClientRect();
    if (mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom) {
      if (
        !document.querySelector('.dock-area-left') &&
        mx - r.left < EMPTY_DOCK_ZONE
      ) {
        return { side: 'left', slotIndex: 0 };
      }
      if (
        !document.querySelector('.dock-area-right') &&
        r.right - mx < EMPTY_DOCK_ZONE
      ) {
        return { side: 'right', slotIndex: 0 };
      }
      if (
        !document.querySelector('.dock-area-top') &&
        my - r.top < EMPTY_DOCK_ZONE
      ) {
        return { side: 'top', slotIndex: 0 };
      }
      // Bottom side is handled above the side-iteration block.
    }
  }
  return { side: null, slotIndex: 0 };
}

function zones(
  relX: number,
  relY: number,
  horizontal: boolean,
  targetId: string | undefined,
  slotIndex: number
): DropInfo | null {
  const crossRel = horizontal ? relY : relX;
  const primaryRel = horizontal ? relX : relY;
  // Primary-axis edges checked first — they span the full cross-axis, so
  // corner cells go to positional-insert rather than to cross-axis split.
  if (primaryRel < 0.2 || primaryRel > 0.8) return null;
  if (crossRel < 0.25) return { slotIndex, splitTargetId: targetId, splitBefore: true };
  if (crossRel > 0.75) return { slotIndex, splitTargetId: targetId, splitBefore: false };
  return { slotIndex, stackTargetId: targetId };
}

function slotDropInfo(
  dockEl: HTMLElement,
  side: DockSide,
  mx: number,
  my: number
): DropInfo {
  const realSlots = dockEl.querySelectorAll<HTMLElement>(
    '.dock-panel-slot:not(.dock-panel-slot--preview)'
  );
  const allSlots = Array.from(
    dockEl.querySelectorAll<HTMLElement>('.dock-panel-slot')
  );
  const horizontal = side === 'top' || side === 'bottom';

  // ── Ghost-slot hysteresis (outer positional-insert ghosts) ──────────────
  for (let j = 0; j < allSlots.length; j++) {
    if (!allSlots[j].classList.contains('dock-panel-slot--preview')) continue;
    // Inner split-preview ghosts live inside a real slot; handled later.
    if (allSlots[j].closest('.dock-panel-slot:not(.dock-panel-slot--preview)')) continue;
    const gr = allSlots[j].getBoundingClientRect();
    if (mx < gr.left || mx > gr.right || my < gr.top || my > gr.bottom) continue;

    let insertIdx = 0;
    for (let k = 0; k < j; k++) {
      if (!allSlots[k].classList.contains('dock-panel-slot--preview')) insertIdx++;
    }

    let adj: HTMLElement | null = null;
    for (let k = j + 1; k < allSlots.length; k++) {
      if (!allSlots[k].classList.contains('dock-panel-slot--preview')) {
        adj = allSlots[k];
        break;
      }
    }
    if (adj) {
      const ar = adj.getBoundingClientRect();
      const mL = horizontal ? Math.min(gr.left, ar.left) : gr.left;
      const mR = horizontal ? Math.max(gr.right, ar.right) : gr.right;
      const mT = horizontal ? gr.top : Math.min(gr.top, ar.top);
      const mB = horizontal ? gr.bottom : Math.max(gr.bottom, ar.bottom);
      const relX = (mx - mL) / ((mR - mL) || 1);
      const relY = (my - mT) / ((mB - mT) || 1);
      // Only zone-detect once cursor has crossed into the adjacent panel's
      // half to prevent oscillation between ghost-visible / ghost-gone states.
      const primaryRel = horizontal ? relX : relY;
      const ghostPrim = horizontal ? gr.right - gr.left : gr.bottom - gr.top;
      const mergedPrim = horizontal ? mR - mL : mB - mT;
      if (primaryRel >= ghostPrim / mergedPrim) {
        const hit = zones(
          relX,
          relY,
          horizontal,
          adj.getAttribute('data-dock-panel') ?? undefined,
          insertIdx
        );
        if (hit) return hit;
      }
    }
    return { slotIndex: insertIdx };
  }

  // ── Pass 1: real-slot zone detection ────────────────────────────────────
  for (let i = 0; i < realSlots.length; i++) {
    const r = realSlots[i].getBoundingClientRect();
    if (mx < r.left || mx > r.right || my < r.top || my > r.bottom) continue;

    // Inner split-group preview-ghost hysteresis.
    const innerGhosts = realSlots[i].querySelectorAll<HTMLElement>(
      '.split-group-slot--preview[data-split-target]'
    );
    for (const ghost of innerGhosts) {
      const gr = ghost.getBoundingClientRect();
      if (mx < gr.left || mx > gr.right || my < gr.top || my > gr.bottom) continue;

      const innerH = !horizontal;
      let adj: Element | null = ghost.nextElementSibling;
      while (adj && !adj.matches('[data-split-panel]')) adj = adj.nextElementSibling;
      if (adj) {
        const adjEl = adj as HTMLElement;
        const ar = adjEl.getBoundingClientRect();
        const mL = innerH ? Math.min(gr.left, ar.left) : gr.left;
        const mR = innerH ? Math.max(gr.right, ar.right) : gr.right;
        const mT = innerH ? gr.top : Math.min(gr.top, ar.top);
        const mB = innerH ? gr.bottom : Math.max(gr.bottom, ar.bottom);
        const relX = (mx - mL) / ((mR - mL) || 1);
        const relY = (my - mT) / ((mB - mT) || 1);
        const primaryRel = innerH ? relX : relY;
        const ghostPrim = innerH ? gr.right - gr.left : gr.bottom - gr.top;
        const mergedPrim = innerH ? mR - mL : mB - mT;
        if (primaryRel >= ghostPrim / mergedPrim) {
          const hit = zones(
            relX,
            relY,
            horizontal,
            adjEl.getAttribute('data-split-panel') ?? undefined,
            i
          );
          if (hit) return hit;
        }
      }
      return {
        slotIndex: i,
        splitTargetId: ghost.getAttribute('data-split-target') ?? undefined,
        splitBefore: ghost.getAttribute('data-split-before') === 'true',
      };
    }

    // Resolve zone detection to the specific split sub-panel under the
    // cursor, so stacking on the right panel of a split slot reports that
    // panel as the target.
    let zoneRect = r;
    let tid = realSlots[i].getAttribute('data-dock-panel') ?? undefined;
    let foundSub = false;
    const subPanels = Array.from(
      realSlots[i].querySelectorAll<HTMLElement>(
        '.split-group-slot[data-split-panel]'
      )
    );
    for (const sub of subPanels) {
      const sr = sub.getBoundingClientRect();
      if (mx >= sr.left && mx <= sr.right && my >= sr.top && my <= sr.bottom) {
        zoneRect = sr;
        tid = sub.getAttribute('data-split-panel') ?? tid;
        foundSub = true;
        break;
      }
    }
    // Cursor between sub-panels (over splitter) → split-between (don't fall
    // back to outer-slot stack which would target the first panel).
    if (!foundSub && subPanels.length > 1) {
      const innerHoriz = !horizontal;
      for (let k = 0; k < subPanels.length - 1; k++) {
        const aR = subPanels[k].getBoundingClientRect();
        const bR = subPanels[k + 1].getBoundingClientRect();
        const inGap = innerHoriz
          ? mx >= aR.right && mx <= bR.left
          : my >= aR.bottom && my <= bR.top;
        if (inGap) {
          return {
            slotIndex: i,
            splitTargetId:
              subPanels[k].getAttribute('data-split-panel') ?? undefined,
            splitBefore: false,
          };
        }
      }
    }

    const relX = (mx - zoneRect.left) / ((zoneRect.right - zoneRect.left) || 1);
    const relY = (my - zoneRect.top) / ((zoneRect.bottom - zoneRect.top) || 1);
    const hit = zones(relX, relY, horizontal, tid, i);
    if (hit) return hit;
    break; // primary-axis edge → fall through to midpoint pass
  }

  // ── Pass 2: midpoint before/after (ghost-stable) ────────────────────────
  const primary = horizontal ? mx : my;
  for (let i = 0; i < realSlots.length; i++) {
    const r = realSlots[i].getBoundingClientRect();
    const mid = horizontal ? (r.left + r.right) / 2 : (r.top + r.bottom) / 2;
    if (primary < mid) return { slotIndex: i };
  }
  return { slotIndex: realSlots.length };
}
