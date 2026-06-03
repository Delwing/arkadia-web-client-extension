import type { DockSide, SplitDir } from '../types';

const EMPTY_DOCK_ZONE = 80;

export interface DropInfo {
  slotIndex: number;
  stackTargetId?: string;
  splitTargetId?: string;
  splitBefore?: boolean;
  splitDir?: SplitDir;
  /** Drop into an empty placeholder leaf with this node id. */
  fillLeafId?: string;
}

export interface DetectionResult extends DropInfo {
  side: DockSide | null;
}

const inside = (el: Element, mx: number, my: number): boolean => {
  const r = el.getBoundingClientRect();
  return mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom;
};

/**
 * Deepest-leaf-first drop detection for the recursive dock tree.
 *
 * For the leaf under the cursor, a 5-zone test (oriented by the leaf's parent
 * split direction) decides the drop:
 *   - center 60%  -> stack as a tab
 *   - cross-axis edges -> split perpendicular to the parent (wrap the leaf)
 *   - primary-axis edges -> insert along the parent axis (sibling), or, when the
 *     leaf is a direct child of the side's root, a positional slot insert.
 */
export function detectDock(mx: number, my: number): DetectionResult {
  // ── Bottom dock special-case (lives below #input-area). ──
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
        const hasRealPanels = !!bottomDock.querySelector('[data-leaf-id]');
        if (inDock && hasRealPanels) {
          return { side: 'bottom', ...slotDropInfo(bottomDock, mx, my) };
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

    const hasRealPanels = !!el.querySelector('[data-leaf-id]');
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

    return { side, ...slotDropInfo(el, mx, my) };
  }

  // Fallback: bootstrap the first drag into an as-yet-unrendered empty dock.
  const vp = document.getElementById('content-area');
  if (vp) {
    const r = vp.getBoundingClientRect();
    if (mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom) {
      if (!document.querySelector('.dock-area-left') && mx - r.left < EMPTY_DOCK_ZONE) {
        return { side: 'left', slotIndex: 0 };
      }
      if (!document.querySelector('.dock-area-right') && r.right - mx < EMPTY_DOCK_ZONE) {
        return { side: 'right', slotIndex: 0 };
      }
      if (!document.querySelector('.dock-area-top') && my - r.top < EMPTY_DOCK_ZONE) {
        return { side: 'top', slotIndex: 0 };
      }
    }
  }
  return { side: null, slotIndex: 0 };
}

function slotDropInfo(dockEl: HTMLElement, mx: number, my: number): DropInfo {
  // Find the (non-overlapping) leaf whose rect contains the cursor. Rect-based
  // hit-testing keeps detection stable: the drop preview is a non-reflowing
  // overlay, so leaf geometry never shifts under the cursor mid-drag.
  const leaves = Array.from(dockEl.querySelectorAll<HTMLElement>('[data-leaf-id]'));
  let leafEl: HTMLElement | undefined;
  for (const el of leaves) {
    if (inside(el, mx, my)) {
      leafEl = el;
      break;
    }
  }
  if (!leafEl) return { slotIndex: 0 };

  // Empty placeholder leaf — whole cell fills.
  const target = leafEl.getAttribute('data-leaf-target') || undefined;
  if (!target) {
    return { slotIndex: 0, fillLeafId: leafEl.getAttribute('data-leaf-id') ?? undefined };
  }

  return edgeZones(leafEl, target, mx, my);
}

/**
 * Edge-direction zones: the nearest edge decides the split direction (drop on
 * the left edge -> new pane on the left, etc.), the central region stacks as a
 * tab. Direction-from-edge is predictable and independent of how the tree is
 * nested, and WindowManager.splitIntoGroup turns a same-axis split into a
 * sibling insert automatically.
 */
function edgeZones(leafEl: HTMLElement, target: string, mx: number, my: number): DropInfo {
  const r = leafEl.getBoundingClientRect();
  const relX = (mx - r.left) / (r.width || 1);
  const relY = (my - r.top) / (r.height || 1);
  const left = relX;
  const right = 1 - relX;
  const top = relY;
  const bottom = 1 - relY;
  const nearest = Math.min(left, right, top, bottom);

  // Central ~40% box stacks as a tab.
  if (nearest >= 0.3) return { slotIndex: 0, stackTargetId: target };

  if (nearest === left) {
    return { slotIndex: 0, splitTargetId: target, splitBefore: true, splitDir: 'row' };
  }
  if (nearest === right) {
    return { slotIndex: 0, splitTargetId: target, splitBefore: false, splitDir: 'row' };
  }
  if (nearest === top) {
    return { slotIndex: 0, splitTargetId: target, splitBefore: true, splitDir: 'col' };
  }
  return { slotIndex: 0, splitTargetId: target, splitBefore: false, splitDir: 'col' };
}
