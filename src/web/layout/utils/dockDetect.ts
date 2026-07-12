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
  // When the UI is locked, no drag ever docks or splits: floating windows stay
  // floating (they still move/resize), and the docked layout can't be mutated.
  if (document.body.classList.contains('layout-locked')) {
    return { side: null, slotIndex: 0 };
  }

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
  // Empty left/right sides live along the edges of the shell: in vertical
  // ("rails span everything") mode that's the full-height #main-container; in the
  // default horizontal mode it's #content-area. Top stays against #content-area.
  const vertical = document.body.classList.contains('layout-rails-vertical');
  const railHost = document.getElementById(vertical ? 'main-container' : 'content-area');
  if (railHost) {
    const r = railHost.getBoundingClientRect();
    if (my >= r.top && my <= r.bottom) {
      if (
        !document.querySelector('.dock-area-left') &&
        mx >= r.left &&
        mx - r.left < EMPTY_DOCK_ZONE
      ) {
        return { side: 'left', slotIndex: 0 };
      }
      if (
        !document.querySelector('.dock-area-right') &&
        mx <= r.right &&
        r.right - mx < EMPTY_DOCK_ZONE
      ) {
        return { side: 'right', slotIndex: 0 };
      }
    }
  }
  const vp = document.getElementById('content-area');
  if (vp) {
    const r = vp.getBoundingClientRect();
    if (
      mx >= r.left &&
      mx <= r.right &&
      my >= r.top &&
      my <= r.bottom &&
      !document.querySelector('.dock-area-top') &&
      my - r.top < EMPTY_DOCK_ZONE
    ) {
      return { side: 'top', slotIndex: 0 };
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

// Edge band thickness (fraction of the leaf). The left/right bands span the
// full height and are tested first, so corners belong to the horizontal split
// rather than flipping between two directions — this is what keeps aiming
// predictable (the standard VS Code / dock-manager "frame" model).
const EDGE = 0.25;

/**
 * "Frame" drop zones: a left/right band -> horizontal split, a top/bottom band
 * (excluding the corners, which the left/right bands already claimed) ->
 * vertical split, the central region -> tab stack. Direction-from-edge is
 * predictable regardless of nesting, and WindowManager.splitIntoGroup turns a
 * same-axis split into a sibling insert automatically.
 */
function edgeZones(leafEl: HTMLElement, target: string, mx: number, my: number): DropInfo {
  const r = leafEl.getBoundingClientRect();
  const relX = (mx - r.left) / (r.width || 1);
  const relY = (my - r.top) / (r.height || 1);

  if (relX < EDGE) {
    return { slotIndex: 0, splitTargetId: target, splitBefore: true, splitDir: 'row' };
  }
  if (relX > 1 - EDGE) {
    return { slotIndex: 0, splitTargetId: target, splitBefore: false, splitDir: 'row' };
  }
  if (relY < EDGE) {
    return { slotIndex: 0, splitTargetId: target, splitBefore: true, splitDir: 'col' };
  }
  if (relY > 1 - EDGE) {
    return { slotIndex: 0, splitTargetId: target, splitBefore: false, splitDir: 'col' };
  }
  return { slotIndex: 0, stackTargetId: target };
}
