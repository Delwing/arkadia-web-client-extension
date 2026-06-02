import { useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { DockArea } from './components/DockArea';
import { FloatingWindowLayer } from './components/FloatingWindowLayer';
import { PopoutWindowLayer } from './components/PopoutWindowLayer';
import { MapPanel } from './panels/MapPanel';
import { ObjectListPanel } from './panels/ObjectListPanel';
import { useLayoutManager } from './hooks/useLayoutManager';
import type { DockSide } from './types';

interface LayoutContentProps {
  mapElement: HTMLElement | null;
  objectListElement: HTMLElement | null;
}

export function LayoutContent({ mapElement, objectListElement }: LayoutContentProps) {
  const {
    manager,
    layoutState,
    loadVersion,
    dragState,
    isLayoutMode,
    updateDragState,
  } = useLayoutManager();

  // Open built-in panel records as needed (managed by enabledPanels flag).
  // Built-ins must NOT be open in WindowManager when layout mode is off, because
  // the map/objects-list DOM elements need to stay in their legacy containers.
  useEffect(() => {
    if (!isLayoutMode) {
      if (manager.has('map')) manager.close('map');
      if (manager.has('objectList')) manager.close('objectList');
      return;
    }
    manager.open('map', { title: 'Mapa' });
    if (layoutState.enabledPanels.objectList) {
      manager.open('objectList', { title: 'Kondycje' });
    } else if (manager.has('objectList')) {
      manager.close('objectList');
    }
    // loadVersion in deps so Restore Default / device-sync import re-opens
    // built-ins after the manager's live-windows map is cleared by loadState.
  }, [isLayoutMode, layoutState.enabledPanels.objectList, manager, loadVersion]);

  // Apply CSS variables to #content-area for the grid to work.
  // Critical: a drag-target side must size the grid column even when it has
  // no windows yet — otherwise the empty DockArea renders at 0 width and
  // dockDetect's bounding-rect test rejects it as out-of-bounds.
  // Bottom dock is NOT part of the grid (it's portaled below #input-area).
  useEffect(() => {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;
    if (!isLayoutMode) {
      contentArea.style.removeProperty('--dock-left-size');
      contentArea.style.removeProperty('--dock-top-size');
      contentArea.style.removeProperty('--dock-right-size');
      return;
    }
    const sideHasContent = (side: DockSide) =>
      Object.values(layoutState.windows).some(
        w => w.docked === side && w.visible && !w.poppedOut
      );
    const sideIsDragTarget = (side: DockSide) =>
      dragState?.potentialDock === side;
    const sizeFor = (side: DockSide) =>
      sideHasContent(side) || sideIsDragTarget(side)
        ? `${layoutState.dockExtents[side]}px`
        : '0px';
    contentArea.style.setProperty('--dock-left-size', sizeFor('left'));
    contentArea.style.setProperty('--dock-top-size', sizeFor('top'));
    contentArea.style.setProperty('--dock-right-size', sizeFor('right'));
  }, [layoutState, isLayoutMode, dragState]);

  const setExtent = useCallback(
    (side: DockSide, n: number) => manager.setDockExtent(side, n),
    [manager]
  );

  // Windows shown in the in-app dock / floating shells. Popped-out windows are
  // excluded here — they live in their own browser window via PopoutWindowLayer.
  const visibleWindows = useMemo(
    () => Object.values(layoutState.windows).filter(w => w.visible && !w.poppedOut),
    [layoutState.windows]
  );

  const poppedWindows = useMemo(
    () => Object.values(layoutState.windows).filter(w => w.visible && w.poppedOut),
    [layoutState.windows]
  );

  // Compute which dock areas to render (only sides with content OR active drag target).
  const showSide = (side: DockSide): boolean => {
    if (visibleWindows.some(w => w.docked === side)) return true;
    if (dragState?.potentialDock === side) return true;
    return false;
  };

  if (!isLayoutMode) {
    // Floating-only mode: render the floating layer for any open popups.
    // Map/objectList stay in their legacy DOM containers (#iframe-container,
    // #objects-list) — they're not opened in the WindowManager.
    return (
      <>
        <FloatingWindowLayer
          windows={visibleWindows}
          manager={manager}
          onDragStateChange={updateDragState}
          disableDocking
        />
        <PopoutWindowLayer windows={poppedWindows} manager={manager} />
      </>
    );
  }

  return (
    <>
      {/* Dock areas — each gets grid-area: left/top/right/bottom via CSS so they
          land in the correct slot of #content-area's grid template. */}
      <div className="layout-manager">
        {showSide('top') && (
          <DockArea
            side="top"
            windows={visibleWindows}
            extent={layoutState.dockExtents.top}
            dragState={dragState}
            manager={manager}
            onSetExtent={setExtent}
            onDragStateChange={updateDragState}
          />
        )}
        {showSide('left') && (
          <DockArea
            side="left"
            windows={visibleWindows}
            extent={layoutState.dockExtents.left}
            dragState={dragState}
            manager={manager}
            onSetExtent={setExtent}
            onDragStateChange={updateDragState}
          />
        )}
        {showSide('right') && (
          <DockArea
            side="right"
            windows={visibleWindows}
            extent={layoutState.dockExtents.right}
            dragState={dragState}
            manager={manager}
            onSetExtent={setExtent}
            onDragStateChange={updateDragState}
          />
        )}
      </div>

      {/* Bottom dock lives below #input-area, outside #content-area's grid. */}
      {showSide('bottom') && (
        <BottomDockPortal>
          <DockArea
            side="bottom"
            windows={visibleWindows}
            extent={layoutState.dockExtents.bottom}
            dragState={dragState}
            manager={manager}
            onSetExtent={setExtent}
            onDragStateChange={updateDragState}
          />
        </BottomDockPortal>
      )}

      {/* Content pool — each built-in panel renders into its portal target
          via the BuiltInPortal helper. The portal target is then attached to
          whichever shell currently owns it. Popups portal themselves through
          DockablePopupWrapper. */}
      {mapElement && manager.has('map') && (
        <BuiltInPortal id="map" manager={manager}>
          <MapPanel mapElement={mapElement} />
        </BuiltInPortal>
      )}
      {objectListElement && manager.has('objectList') && (
        <BuiltInPortal id="objectList" manager={manager}>
          <ObjectListPanel objectListElement={objectListElement} />
        </BuiltInPortal>
      )}

      <FloatingWindowLayer
        windows={visibleWindows}
        manager={manager}
        onDragStateChange={updateDragState}
      />

      <PopoutWindowLayer windows={poppedWindows} manager={manager} />
    </>
  );
}

/** Renders a built-in panel's React content into its persistent portal-target
 *  div. The div is moved around by shells but the React subtree never unmounts. */
function BuiltInPortal({
  id,
  manager,
  children,
}: {
  id: string;
  manager: ReturnType<typeof useLayoutManager>['manager'];
  children: React.ReactNode;
}) {
  return createPortal(<>{children}</>, manager.getOrCreatePortalTarget(id));
}

/** Portals the bottom DockArea into #layout-bottom-dock-host so it sits below
 *  #input-area in DOM order (and therefore below it visually inside the
 *  column-flex #main-container). */
function BottomDockPortal({ children }: { children: React.ReactNode }) {
  const host = document.getElementById('layout-bottom-dock-host');
  if (!host) return null;
  return createPortal(<>{children}</>, host);
}
