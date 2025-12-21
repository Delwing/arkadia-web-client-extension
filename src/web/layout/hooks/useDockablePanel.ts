import { useCallback, useRef } from 'react';
import { DockPosition, DragState, PanelId } from '../types';
import { useLayoutManager } from './useLayoutManager';

interface UseDockablePanelOptions {
  panelId: PanelId;
}

interface DockZoneRects {
  left: { rect: DOMRect; hasContent: boolean } | null;
  top: { rect: DOMRect; hasContent: boolean } | null;
  right: { rect: DOMRect; hasContent: boolean } | null;
}

// Edge detection margin for empty docks (how close to edge to trigger dock detection)
const EMPTY_DOCK_EDGE_MARGIN = 60;

function getDockZoneRects(contentArea: HTMLElement, layoutState: any): DockZoneRects {
  const contentRect = contentArea.getBoundingClientRect();
  const topDock = layoutState.docks.top;
  const leftDock = layoutState.docks.left;
  const rightDock = layoutState.docks.right;

  const topHeight = topDock.panels.length > 0 ? topDock.size : 0;

  // For empty docks, use smaller detection zone near the edge
  const topZoneHeight = topDock.panels.length > 0 ? topDock.size : EMPTY_DOCK_EDGE_MARGIN;
  const leftZoneWidth = leftDock.panels.length > 0 ? leftDock.size : EMPTY_DOCK_EDGE_MARGIN;
  const rightZoneWidth = rightDock.panels.length > 0 ? rightDock.size : EMPTY_DOCK_EDGE_MARGIN;

  return {
    top: {
      rect: new DOMRect(contentRect.left, contentRect.top, contentRect.width, topZoneHeight),
      hasContent: topDock.panels.length > 0,
    },
    left: {
      rect: new DOMRect(contentRect.left, contentRect.top + topHeight, leftZoneWidth, contentRect.height - topHeight),
      hasContent: leftDock.panels.length > 0,
    },
    right: {
      rect: new DOMRect(contentRect.right - rightZoneWidth, contentRect.top + topHeight, rightZoneWidth, contentRect.height - topHeight),
      hasContent: rightDock.panels.length > 0,
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

function calculateInsertIndex(
  dock: DockPosition,
  mouseX: number,
  mouseY: number,
  dockZone: DOMRect,
  panelCount: number
): number {
  if (panelCount === 0) return 0;

  if (dock === 'TOP') {
    // Horizontal: divide dock into panelCount+1 zones
    const ratio = (mouseX - dockZone.left) / dockZone.width;
    return Math.min(panelCount, Math.max(0, Math.floor(ratio * (panelCount + 1))));
  } else {
    // Vertical: divide dock into panelCount+1 zones
    const ratio = (mouseY - dockZone.top) / dockZone.height;
    return Math.min(panelCount, Math.max(0, Math.floor(ratio * (panelCount + 1))));
  }
}

export function useDockablePanel({ panelId }: UseDockablePanelOptions) {
  const {
    layoutState,
    movePanel,
    undockPanel,
    updateFloatingPanel,
    updateDragState,
    findPanelDock,
    findFloatingPanel,
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
        panelSizeRef.current = { width: floatingPanel.width, height: floatingPanel.height };
        dragOffset.current = {
          x: e.clientX - floatingPanel.x,
          y: e.clientY - floatingPanel.y,
        };
      } else if (sourceDock) {
        // Calculate size from dock
        const dockKey = sourceDock.toLowerCase() as 'left' | 'top' | 'right';
        const dock = layoutStateRef.current.docks[dockKey];
        const panel = dock.panels.find((p: any) => p.id === panelId);
        const panelPercent = panel?.size ?? 100;

        if (sourceDock === 'TOP') {
          const contentWidth = contentArea.offsetWidth;
          panelSizeRef.current = {
            width: (contentWidth * panelPercent) / 100,
            height: dock.size,
          };
        } else {
          const topHeight = layoutStateRef.current.docks.top.panels.length > 0
            ? layoutStateRef.current.docks.top.size : 0;
          const availableHeight = contentArea.offsetHeight - topHeight;
          panelSizeRef.current = {
            width: dock.size,
            height: (availableHeight * panelPercent) / 100,
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
        willFloat: true,
      };

      updateDragState(currentDragState.current);

      const handleMove = (moveEvent: PointerEvent) => {
        if (!isDragging.current) return;

        const newX = Math.max(0, moveEvent.clientX - dragOffset.current.x);
        const newY = Math.max(0, moveEvent.clientY - dragOffset.current.y);

        updateFloatingPanel(panelId, { x: newX, y: newY });

        let dock: DockPosition | null = null;
        let insertIdx: number | null = null;

        // Use mouse position for dock zone detection
        if (!moveEvent.ctrlKey && dockZonesRef.current) {
          dock = detectDockZone(moveEvent.clientX, moveEvent.clientY, dockZonesRef.current);

          if (dock) {
            const dockKey = dock.toLowerCase() as 'left' | 'top' | 'right';
            const zoneInfo = dockZonesRef.current[dockKey];
            const panelCount = layoutStateRef.current.docks[dockKey].panels.length;
            if (zoneInfo) {
              insertIdx = calculateInsertIndex(dock, moveEvent.clientX, moveEvent.clientY, zoneInfo.rect, panelCount);
            }
          }
        }

        currentDragState.current = {
          panelId,
          sourcePosition: currentDragState.current?.sourcePosition ?? 'floating',
          currentPosition: { x: moveEvent.clientX, y: moveEvent.clientY },
          potentialDock: dock,
          insertIndex: insertIdx,
          willFloat: !dock,
        };
        updateDragState(currentDragState.current);
      };

      const handleEnd = (endEvent: PointerEvent) => {
        if (!isDragging.current) return;

        const state = currentDragState.current;
        if (state?.potentialDock && !endEvent.ctrlKey) {
          movePanel(panelId, state.potentialDock, state.insertIndex ?? 0);
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
    [panelId, movePanel, undockPanel, updateFloatingPanel, updateDragState, findPanelDock, findFloatingPanel]
  );

  return { handleDragStart };
}
