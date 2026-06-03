import { flushSync } from 'react-dom';
import { DockSide, DragState } from '../types';
import type { WindowManager } from '../WindowManager';
import { detectDock } from './dockDetect';

const DRAG_THRESHOLD = 5;

export interface UndockableDragOptions {
  id: string;
  manager: WindowManager;
  /** Element used to capture initial visual size + position (the docked panel
   *  outer element or tab-group element). */
  sourceEl: HTMLElement | null;
  /** Pointer offset within the source element (when starting from a titlebar
   *  inside the source). If omitted, calculated from the source rect. */
  clickClientX: number;
  clickClientY: number;
  onDragStateChange: (s: DragState | null) => void;
  /** Called right before docking; receives the manager-applied side + slot. */
  ctrlForcesFloat?: boolean;
}

/**
 * Pointer-move/up handler used when starting a drag from a docked surface
 * (DockedPanel titlebar, TabItem tab). Undocks the panel immediately on
 * threshold-crossing — after that, the floating shell takes over for the
 * remainder of the drag, performing dock detection on each move.
 */
export function startUndockableDrag(opts: UndockableDragOptions): void {
  const { id, manager, sourceEl, clickClientX, clickClientY, onDragStateChange, ctrlForcesFloat } = opts;

  const sourceRect = sourceEl?.getBoundingClientRect();
  const offsetX = sourceRect ? clickClientX - sourceRect.left : 50;
  const offsetY = sourceRect ? clickClientY - sourceRect.top : 14;

  let hasDragged = false;
  let floatingEl: HTMLElement | null = null;
  let lastX = 0;
  let lastY = 0;
  let lastClientX = clickClientX;
  let lastClientY = clickClientY;
  let potentialDock: DockSide | null = null;
  let potentialSlot = 0;
  let potentialStackTarget: string | undefined;
  let potentialSplitTarget: string | undefined;
  let potentialSplitBefore: boolean | undefined;
  let potentialSplitDir: DragState['splitDir'];
  let potentialFillLeaf: string | undefined;

  const updateDockState = (shiftHeld: boolean, clientX: number, clientY: number) => {
    if (!hasDragged || !floatingEl) return;
    const { side, slotIndex, stackTargetId, splitTargetId, splitBefore, splitDir, fillLeafId } =
      shiftHeld
        ? { side: null as DockSide | null, slotIndex: 0, stackTargetId: undefined, splitTargetId: undefined, splitBefore: undefined, splitDir: undefined, fillLeafId: undefined }
        : detectDock(clientX, clientY);

    if (
      side !== potentialDock ||
      slotIndex !== potentialSlot ||
      stackTargetId !== potentialStackTarget ||
      splitTargetId !== potentialSplitTarget ||
      splitBefore !== potentialSplitBefore ||
      splitDir !== potentialSplitDir ||
      fillLeafId !== potentialFillLeaf
    ) {
      potentialDock = side;
      potentialSlot = slotIndex;
      potentialStackTarget = stackTargetId;
      potentialSplitTarget = splitTargetId;
      potentialSplitBefore = splitBefore;
      potentialSplitDir = splitDir;
      potentialFillLeaf = fillLeafId;
      manager.setPosition(id, lastX, lastY);
      onDragStateChange(
        side
          ? {
              panelId: id,
              potentialDock: side,
              insertSlotIndex: slotIndex,
              stackTargetId,
              splitTargetId,
              splitBefore,
              splitDir,
              fillLeafId,
            }
          : null
      );
    }
  };

  const onMove = (ev: PointerEvent) => {
    lastClientX = ev.clientX;
    lastClientY = ev.clientY;

    if (!hasDragged) {
      if (Math.hypot(ev.clientX - clickClientX, ev.clientY - clickClientY) <= DRAG_THRESHOLD) {
        return;
      }
      hasDragged = true;

      const visualW = sourceEl?.offsetWidth;
      const visualH = sourceEl?.offsetHeight;
      const rect = sourceEl?.getBoundingClientRect();

      flushSync(() => {
        manager.undock(id, visualW, visualH, rect?.left, rect?.top);
      });

      floatingEl = document.querySelector<HTMLElement>(`[data-window-id="${id}"]`);
      if (floatingEl) {
        lastX = floatingEl.offsetLeft;
        lastY = floatingEl.offsetTop;
      }
      return;
    }

    if (!floatingEl) return;
    lastX = ev.clientX - offsetX;
    lastY = ev.clientY - offsetY;
    floatingEl.style.left = `${lastX}px`;
    floatingEl.style.top = `${lastY}px`;

    const shiftOrCtrl = ev.shiftKey || (ctrlForcesFloat && ev.ctrlKey);
    updateDockState(shiftOrCtrl, ev.clientX, ev.clientY);
  };

  const onKeyChange = (ev: KeyboardEvent) => {
    if (ev.key === 'Shift' || (ctrlForcesFloat && ev.key === 'Control')) {
      const held =
        ev.type === 'keydown' && (ev.key === 'Shift' || (ctrlForcesFloat && ev.key === 'Control'));
      updateDockState(held, lastClientX, lastClientY);
    }
  };

  const onUp = () => {
    onDragStateChange(null);
    if (hasDragged) {
      if (potentialDock !== null) {
        if (potentialFillLeaf) {
          manager.fillPlaceholder(potentialFillLeaf, id);
        } else if (potentialStackTarget) {
          manager.tabIntoGroup(id, potentialStackTarget);
        } else if (potentialSplitTarget) {
          manager.splitIntoGroup(
            id,
            potentialSplitTarget,
            potentialSplitBefore ?? false,
            potentialSplitDir
          );
        } else {
          manager.dock(id, potentialDock, potentialSlot);
        }
      } else if (floatingEl) {
        manager.setPosition(id, lastX, lastY);
      }
    }
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('keydown', onKeyChange);
    document.removeEventListener('keyup', onKeyChange);
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('keydown', onKeyChange);
  document.addEventListener('keyup', onKeyChange);
}

export interface FloatingDragOptions {
  id: string;
  manager: WindowManager;
  windowEl: HTMLElement;
  clickClientX: number;
  clickClientY: number;
  onDragStateChange: (s: DragState | null) => void;
  ctrlForcesFloat?: boolean;
}

/**
 * Drag handler for a floating window's titlebar. Updates position via DOM
 * during move (for 60fps) and commits to the manager on release. Detects
 * dock zones the same way as undockable drags.
 */
export function startFloatingDrag(opts: FloatingDragOptions): void {
  const { id, manager, windowEl, clickClientX, clickClientY, onDragStateChange, ctrlForcesFloat } = opts;

  const startOffsetX = clickClientX - windowEl.offsetLeft;
  const startOffsetY = clickClientY - windowEl.offsetTop;
  let lastX = windowEl.offsetLeft;
  let lastY = windowEl.offsetTop;
  let lastClientX = clickClientX;
  let lastClientY = clickClientY;
  let potentialDock: DockSide | null = null;
  let potentialSlot = 0;
  let potentialStackTarget: string | undefined;
  let potentialSplitTarget: string | undefined;
  let potentialSplitBefore: boolean | undefined;
  let potentialSplitDir: DragState['splitDir'];
  let potentialFillLeaf: string | undefined;

  const updateDockState = (shiftHeld: boolean, clientX: number, clientY: number) => {
    const { side, slotIndex, stackTargetId, splitTargetId, splitBefore, splitDir, fillLeafId } =
      shiftHeld
        ? { side: null as DockSide | null, slotIndex: 0, stackTargetId: undefined, splitTargetId: undefined, splitBefore: undefined, splitDir: undefined, fillLeafId: undefined }
        : detectDock(clientX, clientY);

    if (
      side !== potentialDock ||
      slotIndex !== potentialSlot ||
      stackTargetId !== potentialStackTarget ||
      splitTargetId !== potentialSplitTarget ||
      splitBefore !== potentialSplitBefore ||
      splitDir !== potentialSplitDir ||
      fillLeafId !== potentialFillLeaf
    ) {
      potentialDock = side;
      potentialSlot = slotIndex;
      potentialStackTarget = stackTargetId;
      potentialSplitTarget = splitTargetId;
      potentialSplitBefore = splitBefore;
      potentialSplitDir = splitDir;
      potentialFillLeaf = fillLeafId;
      manager.setPosition(id, lastX, lastY);
      onDragStateChange(
        side
          ? {
              panelId: id,
              potentialDock: side,
              insertSlotIndex: slotIndex,
              stackTargetId,
              splitTargetId,
              splitBefore,
              splitDir,
              fillLeafId,
            }
          : null
      );
    }
  };

  const onMove = (ev: PointerEvent) => {
    lastClientX = ev.clientX;
    lastClientY = ev.clientY;
    lastX = ev.clientX - startOffsetX;
    lastY = ev.clientY - startOffsetY;
    windowEl.style.left = `${lastX}px`;
    windowEl.style.top = `${lastY}px`;
    const shiftOrCtrl = ev.shiftKey || (ctrlForcesFloat && ev.ctrlKey);
    updateDockState(shiftOrCtrl, ev.clientX, ev.clientY);
  };

  const onKeyChange = (ev: KeyboardEvent) => {
    if (ev.key === 'Shift' || (ctrlForcesFloat && ev.key === 'Control')) {
      const held =
        ev.type === 'keydown' && (ev.key === 'Shift' || (ctrlForcesFloat && ev.key === 'Control'));
      updateDockState(held, lastClientX, lastClientY);
    }
  };

  const onUp = () => {
    onDragStateChange(null);
    if (potentialDock !== null) {
      if (potentialFillLeaf) {
        manager.fillPlaceholder(potentialFillLeaf, id);
      } else if (potentialStackTarget) {
        manager.tabIntoGroup(id, potentialStackTarget);
      } else if (potentialSplitTarget) {
        manager.splitIntoGroup(
          id,
          potentialSplitTarget,
          potentialSplitBefore ?? false,
          potentialSplitDir
        );
      } else {
        manager.dock(id, potentialDock, potentialSlot);
      }
    } else {
      manager.setPosition(id, lastX, lastY);
    }
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('keydown', onKeyChange);
    document.removeEventListener('keyup', onKeyChange);
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('keydown', onKeyChange);
  document.addEventListener('keyup', onKeyChange);
}
