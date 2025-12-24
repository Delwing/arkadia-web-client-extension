import { useCallback, useRef } from 'react';
import { DockPosition, DragState, PanelId, DockSlot, LayoutState } from '../types';
import { useLayoutManager } from '@web/layout';

interface UseDockablePanelOptions {
  panelId: PanelId;
}

interface DockZoneRects {
  left: { rect: DOMRect; hasContent: boolean } | null;
  top: { rect: DOMRect; hasContent: boolean } | null;
  right: { rect: DOMRect; hasContent: boolean } | null;
}

interface SlotDropInfo {
  slotId: string;
  slotRect: DOMRect;
  slotIndex: number;
  panels: Array<{ id: string; rect: DOMRect; index: number }>;
}

// Edge detection margin for empty docks (how close to edge to trigger dock detection)
const EMPTY_DOCK_EDGE_MARGIN = 60;

// Margin from panel edge to detect stacking vs new slot
const PANEL_EDGE_MARGIN = 0.25; // 25% from edge

function getDockZoneRects(contentArea: HTMLElement, layoutState: LayoutState): DockZoneRects {
  const contentRect = contentArea.getBoundingClientRect();
  const topDock = layoutState.docks.top;
  const leftDock = layoutState.docks.left;
  const rightDock = layoutState.docks.right;

  const topHeight = topDock.slots.length > 0 ? topDock.size : 0;

  // For empty docks, use smaller detection zone near the edge
  const topZoneHeight = topDock.slots.length > 0 ? topDock.size : EMPTY_DOCK_EDGE_MARGIN;
  const leftZoneWidth = leftDock.slots.length > 0 ? leftDock.size : EMPTY_DOCK_EDGE_MARGIN;
  const rightZoneWidth = rightDock.slots.length > 0 ? rightDock.size : EMPTY_DOCK_EDGE_MARGIN;

  return {
    top: {
      rect: new DOMRect(contentRect.left, contentRect.top, contentRect.width, topZoneHeight),
      hasContent: topDock.slots.length > 0,
    },
    left: {
      rect: new DOMRect(contentRect.left, contentRect.top + topHeight, leftZoneWidth, contentRect.height - topHeight),
      hasContent: leftDock.slots.length > 0,
    },
    right: {
      rect: new DOMRect(contentRect.right - rightZoneWidth, contentRect.top + topHeight, rightZoneWidth, contentRect.height - topHeight),
      hasContent: rightDock.slots.length > 0,
    },
  };
}

function isPointInRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function detectDockZone(
  mouseX: number,
  mouseY: number,
  dockZones: DockZoneRects
): DockPosition | null {
  // Use mouse position for dock zone detection
  // Priority: TOP > LEFT > RIGHT

  if (dockZones.top && isPointInRect(mouseX, mouseY, dockZones.top.rect)) {
    return 'TOP';
  }
  if (dockZones.left && isPointInRect(mouseX, mouseY, dockZones.left.rect)) {
    return 'LEFT';
  }
  if (dockZones.right && isPointInRect(mouseX, mouseY, dockZones.right.rect)) {
    return 'RIGHT';
  }

  return null;
}

/**
 * Get information about slots in a dock for drop detection
 */
function getSlotDropInfo(dock: DockPosition): SlotDropInfo[] {
  const dockElement = document.querySelector(`.dock-zone--${dock.toLowerCase()}`);
  if (!dockElement) return [];

  const slotElements = dockElement.querySelectorAll('.dock-zone__slot-wrapper');
  const slotsInfo: SlotDropInfo[] = [];

  slotElements.forEach((slotElement, slotIndex) => {
    const slotId = slotElement.getAttribute('data-slot-id');
    if (!slotId) return;

    const slotRect = slotElement.getBoundingClientRect();
    const panelElements = slotElement.querySelectorAll('.dock-zone__panel-wrapper:not(.dock-zone__panel-preview)');
    const panels: Array<{ id: string; rect: DOMRect; index: number }> = [];

    panelElements.forEach((panelElement, panelIndex) => {
      const dockedPanel = panelElement.querySelector('.docked-panel');
      if (dockedPanel) {
        const panelId = dockedPanel.getAttribute('data-panel-id');
        if (panelId) {
          panels.push({
            id: panelId,
            rect: panelElement.getBoundingClientRect(),
            index: panelIndex,
          });
        }
      }
    });

    slotsInfo.push({
      slotId,
      slotRect,
      slotIndex,
      panels,
    });
  });

  return slotsInfo;
}

interface DropTarget {
  dock: DockPosition;
  insertSlotIndex: number | null;
  insertIntoSlotId: string | null;
  insertPositionInSlot: number | null;
}

/**
 * Calculate where to drop based on mouse position.
 *
 * For TOP dock:
 * - Mouse at left/right edge of slot = new slot before/after
 * - Mouse in center of slot = stack into slot (insert panel above/below based on vertical position)
 *
 * For LEFT/RIGHT docks:
 * - Mouse at top/bottom edge of slot = new slot before/after
 * - Mouse in center of slot = stack into slot (insert panel left/right based on horizontal position)
 */
function calculateDropTarget(
  dock: DockPosition,
  mouseX: number,
  mouseY: number,
  dockZone: DOMRect,
  slots: DockSlot[],
  slotsInfo: SlotDropInfo[]
): DropTarget {
  const isTopDock = dock === 'TOP';
  const slotCount = slots.length;

  // If no slots, insert at position 0
  if (slotCount === 0 || slotsInfo.length === 0) {
    return {
      dock,
      insertSlotIndex: 0,
      insertIntoSlotId: null,
      insertPositionInSlot: null,
    };
  }

  // Find which slot we're hovering over
  for (const slotInfo of slotsInfo) {
    if (isPointInRect(mouseX, mouseY, slotInfo.slotRect)) {
      const { slotRect, slotId, slotIndex, panels } = slotInfo;

      // Calculate relative position within slot
      const relativeX = (mouseX - slotRect.left) / slotRect.width;
      const relativeY = (mouseY - slotRect.top) / slotRect.height;

      // For TOP dock: left/right edges create new slot, center stacks
      // For LEFT/RIGHT docks: top/bottom edges create new slot, center stacks
      if (isTopDock) {
        // Check if near left edge - create new slot before
        if (relativeX < PANEL_EDGE_MARGIN) {
          return {
            dock,
            insertSlotIndex: slotIndex,
            insertIntoSlotId: null,
            insertPositionInSlot: null,
          };
        }
        // Check if near right edge - create new slot after
        if (relativeX > 1 - PANEL_EDGE_MARGIN) {
          return {
            dock,
            insertSlotIndex: slotIndex + 1,
            insertIntoSlotId: null,
            insertPositionInSlot: null,
          };
        }
        // In center - stack into slot (position based on Y)
        const panelCount = panels.length;
        const insertPosition = Math.min(
          panelCount,
          Math.max(0, Math.floor(relativeY * (panelCount + 1)))
        );
        return {
          dock,
          insertSlotIndex: null,
          insertIntoSlotId: slotId,
          insertPositionInSlot: insertPosition,
        };
      } else {
        // LEFT/RIGHT docks
        // Check if near top edge - create new slot before
        if (relativeY < PANEL_EDGE_MARGIN) {
          return {
            dock,
            insertSlotIndex: slotIndex,
            insertIntoSlotId: null,
            insertPositionInSlot: null,
          };
        }
        // Check if near bottom edge - create new slot after
        if (relativeY > 1 - PANEL_EDGE_MARGIN) {
          return {
            dock,
            insertSlotIndex: slotIndex + 1,
            insertIntoSlotId: null,
            insertPositionInSlot: null,
          };
        }
        // In center - stack into slot (position based on X)
        const panelCount = panels.length;
        const insertPosition = Math.min(
          panelCount,
          Math.max(0, Math.floor(relativeX * (panelCount + 1)))
        );
        return {
          dock,
          insertSlotIndex: null,
          insertIntoSlotId: slotId,
          insertPositionInSlot: insertPosition,
        };
      }
    }
  }

  // Not over any slot - calculate based on gaps between slots
  if (isTopDock) {
    const ratio = (mouseX - dockZone.left) / dockZone.width;
    const insertIdx = Math.min(slotCount, Math.max(0, Math.floor(ratio * (slotCount + 1))));
    return {
      dock,
      insertSlotIndex: insertIdx,
      insertIntoSlotId: null,
      insertPositionInSlot: null,
    };
  } else {
    const ratio = (mouseY - dockZone.top) / dockZone.height;
    const insertIdx = Math.min(slotCount, Math.max(0, Math.floor(ratio * (slotCount + 1))));
    return {
      dock,
      insertSlotIndex: insertIdx,
      insertIntoSlotId: null,
      insertPositionInSlot: null,
    };
  }
}

export function useDockablePanel({ panelId }: UseDockablePanelOptions) {
  const {
    layoutState,
    movePanel,
    movePanelToSlot,
    undockPanel,
    updateFloatingPanel,
    updateDragState,
    findPanelDock,
    findFloatingPanel,
    findPanelSlot,
  } = useLayoutManager();

  const isDragging = useRef(false);
  const dockZonesRef = useRef<DockZoneRects | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelSizeRef = useRef({ width: 300, height: 200 });
  const layoutStateRef = useRef(layoutState);
  const currentDragState = useRef<DragState | null>(null);
  layoutStateRef.current = layoutState;

  const handleDragStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (isDragging.current) return;

      const sourceDock = findPanelDock(panelId);
      const floatingPanel = findFloatingPanel(panelId);
      const isFloating = floatingPanel !== null;

      if (!sourceDock && !isFloating) return;

      const contentArea = document.getElementById('content-area');
      if (!contentArea) return;

      isDragging.current = true;
      dockZonesRef.current = getDockZoneRects(contentArea, layoutStateRef.current);

      // Store panel size before undocking
      if (floatingPanel) {
        panelSizeRef.current = { width: floatingPanel.width, height: floatingPanel.height ?? 200 };
        dragOffset.current = {
          x: e.clientX - floatingPanel.x,
          y: e.clientY - floatingPanel.y,
        };
      } else if (sourceDock) {
        // Calculate size from dock using slots
        const dockKey = sourceDock.toLowerCase() as 'left' | 'top' | 'right';
        const dock = layoutStateRef.current.docks[dockKey];
        const panelSlot = findPanelSlot(panelId);
        const slot = panelSlot?.slot;
        const panel = slot?.panels.find((p) => p.id === panelId);
        const slotPercent = slot?.size ?? 100;
        const panelPercent = panel?.size ?? 100;

        if (sourceDock === 'TOP') {
          const contentWidth = contentArea.offsetWidth;
          panelSizeRef.current = {
            width: (contentWidth * slotPercent) / 100,
            height: (dock.size * panelPercent) / 100,
          };
        } else {
          const topHeight = layoutStateRef.current.docks.top.slots.length > 0
            ? layoutStateRef.current.docks.top.size : 0;
          const availableHeight = contentArea.offsetHeight - topHeight;
          panelSizeRef.current = {
            width: (dock.size * panelPercent) / 100,
            height: (availableHeight * slotPercent) / 100,
          };
        }
        dragOffset.current = { x: panelSizeRef.current.width / 2, y: 20 };
      }

      // Undock immediately
      if (sourceDock) {
        undockPanel(panelId, e.clientX, e.clientY);
      }

      currentDragState.current = {
        panelId,
        sourcePosition: sourceDock ?? 'floating',
        currentPosition: { x: e.clientX, y: e.clientY },
        potentialDock: null,
        insertIndex: null,
        insertIntoSlotId: null,
        insertPositionInSlot: null,
        willFloat: true,
      };

      updateDragState(currentDragState.current);

      const handleMove = (moveEvent: PointerEvent) => {
        if (!isDragging.current) return;

        const newX = Math.max(0, moveEvent.clientX - dragOffset.current.x);
        const newY = Math.max(0, moveEvent.clientY - dragOffset.current.y);

        updateFloatingPanel(panelId, { x: newX, y: newY });

        let dock: DockPosition | null = null;
        let dropTarget: DropTarget | null = null;

        // Use mouse position for dock zone detection
        if (!moveEvent.ctrlKey && dockZonesRef.current) {
          dock = detectDockZone(moveEvent.clientX, moveEvent.clientY, dockZonesRef.current);

          if (dock) {
            const dockKey = dock.toLowerCase() as 'left' | 'top' | 'right';
            const zoneInfo = dockZonesRef.current[dockKey];
            const slots = layoutStateRef.current.docks[dockKey].slots;
            const slotsInfo = getSlotDropInfo(dock);

            if (zoneInfo) {
              dropTarget = calculateDropTarget(
                dock,
                moveEvent.clientX,
                moveEvent.clientY,
                zoneInfo.rect,
                slots,
                slotsInfo
              );
            }
          }
        }

        currentDragState.current = {
          panelId,
          sourcePosition: currentDragState.current?.sourcePosition ?? 'floating',
          currentPosition: { x: moveEvent.clientX, y: moveEvent.clientY },
          potentialDock: dock,
          insertIndex: dropTarget?.insertSlotIndex ?? null,
          insertIntoSlotId: dropTarget?.insertIntoSlotId ?? null,
          insertPositionInSlot: dropTarget?.insertPositionInSlot ?? null,
          willFloat: !dock,
        };
        updateDragState(currentDragState.current);
      };

      const handleEnd = (endEvent: PointerEvent) => {
        if (!isDragging.current) return;

        const state = currentDragState.current;
        if (state?.potentialDock && !endEvent.ctrlKey) {
          if (state.insertIntoSlotId !== null) {
            // Stacking into existing slot
            movePanelToSlot(
              panelId,
              state.potentialDock,
              state.insertIntoSlotId,
              state.insertPositionInSlot ?? 0
            );
          } else {
            // Creating new slot
            movePanel(panelId, state.potentialDock, state.insertIndex ?? 0);
          }
        }

        isDragging.current = false;
        currentDragState.current = null;
        updateDragState(null);

        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', handleEnd);
      };

      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleEnd);
    },
    [panelId, movePanel, movePanelToSlot, undockPanel, updateFloatingPanel, updateDragState, findPanelDock, findFloatingPanel, findPanelSlot]
  );

  return { handleDragStart };
}
