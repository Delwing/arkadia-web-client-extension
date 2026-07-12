import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { DockArea } from './components/DockArea';
import { FloatingWindowLayer } from './components/FloatingWindowLayer';
import { PopoutWindowLayer } from './components/PopoutWindowLayer';
import { SplitContextMenu } from './components/SplitContextMenu';
import { MapPanel } from './panels/MapPanel';
import { ObjectListPanel } from './panels/ObjectListPanel';
import { useLayoutManager } from './hooks/useLayoutManager';
import type { DockSide } from './types';

interface LayoutContentProps {
  mapElement: HTMLElement | null;
  objectListElement: HTMLElement | null;
  /** Override the built-in objectList panel's title (default "Kondycje"). */
  objectListTitle?: string;
  /** Custom content for the objectList panel; when set, the legacy
   *  #objects-list DOM relocation is bypassed. */
  renderObjectList?: () => React.ReactNode;
}

export function LayoutContent({
  mapElement,
  objectListElement,
  objectListTitle,
  renderObjectList,
}: LayoutContentProps) {
  const {
    manager,
    layoutState,
    loadVersion,
    dragState,
    isLayoutMode,
    updateDragState,
    railsVertical,
    uiLocked,
    toggleUiLocked,
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
      manager.open('objectList', { title: objectListTitle ?? 'Kondycje' });
    } else if (manager.has('objectList')) {
      manager.close('objectList');
    }
    // loadVersion in deps so Restore Default / device-sync import re-opens
    // built-ins after the manager's live-windows map is cleared by loadState.
  }, [isLayoutMode, layoutState.enabledPanels.objectList, manager, loadVersion, objectListTitle]);

  // Apply CSS variables that size the dock grid tracks. They live on
  // #main-container (falling back to #content-area) so BOTH grids can read them:
  // the horizontal-priority grid on #content-area (top/left/right) inherits them,
  // while the vertical-priority "rails span everything" grid on #main-container
  // (left/right rails + top/bottom/input rows) reads them directly.
  // Critical: a drag-target side must size its track even when it has no windows
  // yet — otherwise the empty DockArea renders at 0px and dockDetect's
  // bounding-rect test rejects it as out-of-bounds.
  useEffect(() => {
    const host =
      document.getElementById('main-container') ??
      document.getElementById('content-area');
    if (!host) return;
    const sides: DockSide[] = ['left', 'top', 'right', 'bottom'];
    if (!isLayoutMode) {
      for (const side of sides) host.style.removeProperty(`--dock-${side}-size`);
      return;
    }
    const sideHasContent = (side: DockSide) => {
      const root = layoutState.dockTrees[side];
      return !!root && root.children.length > 0;
    };
    const sideIsDragTarget = (side: DockSide) =>
      dragState?.potentialDock === side;
    const sizeFor = (side: DockSide) =>
      sideHasContent(side) || sideIsDragTarget(side)
        ? `${layoutState.dockExtents[side]}px`
        : '0px';
    for (const side of sides) {
      host.style.setProperty(`--dock-${side}-size`, sizeFor(side));
    }
  }, [layoutState, isLayoutMode, dragState]);

  const setExtent = useCallback(
    (side: DockSide, n: number) => manager.setDockExtent(side, n),
    [manager]
  );

  // Right-click on a docked panel titlebar → split menu.
  const [splitMenu, setSplitMenu] = useState<{
    x: number;
    y: number;
    windowId: string;
  } | null>(null);
  const handleTitlebarContextMenu = useCallback(
    (e: React.MouseEvent, windowId: string) => {
      if (!windowId) return;
      // Always open — when locked the menu offers only unlock (splits hidden),
      // so the lock can be toggled back off from the same place.
      e.preventDefault();
      setSplitMenu({ x: e.clientX, y: e.clientY, windowId });
    },
    []
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
    const root = layoutState.dockTrees[side];
    if (root && root.children.length > 0) return true;
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
            root={layoutState.dockTrees.top}
            windows={visibleWindows}
            extent={layoutState.dockExtents.top}
            dragState={dragState}
            manager={manager}
            onSetExtent={setExtent}
            onDragStateChange={updateDragState}
            onTitlebarContextMenu={handleTitlebarContextMenu}
          />
        )}
        {showSide('left') && (
          <SideDockPortal side="left" vertical={railsVertical}>
            <DockArea
              side="left"
              root={layoutState.dockTrees.left}
              windows={visibleWindows}
              extent={layoutState.dockExtents.left}
              dragState={dragState}
              manager={manager}
              onSetExtent={setExtent}
              onDragStateChange={updateDragState}
              onTitlebarContextMenu={handleTitlebarContextMenu}
            />
          </SideDockPortal>
        )}
        {showSide('right') && (
          <SideDockPortal side="right" vertical={railsVertical}>
            <DockArea
              side="right"
              root={layoutState.dockTrees.right}
              windows={visibleWindows}
              extent={layoutState.dockExtents.right}
              dragState={dragState}
              manager={manager}
              onSetExtent={setExtent}
              onDragStateChange={updateDragState}
              onTitlebarContextMenu={handleTitlebarContextMenu}
            />
          </SideDockPortal>
        )}
      </div>

      {/* Bottom dock lives below #input-area, outside #content-area's grid. */}
      {showSide('bottom') && (
        <BottomDockPortal>
          <DockArea
            side="bottom"
            root={layoutState.dockTrees.bottom}
            windows={visibleWindows}
            extent={layoutState.dockExtents.bottom}
            dragState={dragState}
            manager={manager}
            onSetExtent={setExtent}
            onDragStateChange={updateDragState}
            onTitlebarContextMenu={handleTitlebarContextMenu}
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
      {manager.has('objectList') && (renderObjectList || objectListElement) && (
        <BuiltInPortal id="objectList" manager={manager}>
          {renderObjectList
            ? renderObjectList()
            : <ObjectListPanel objectListElement={objectListElement} />}
        </BuiltInPortal>
      )}

      <FloatingWindowLayer
        windows={visibleWindows}
        manager={manager}
        onDragStateChange={updateDragState}
      />

      <PopoutWindowLayer windows={poppedWindows} manager={manager} />

      {splitMenu && (
        <SplitContextMenu
          x={splitMenu.x}
          y={splitMenu.y}
          locked={uiLocked}
          onToggleLock={toggleUiLocked}
          onClose={() => setSplitMenu(null)}
          onSplit={(dir, before) => {
            manager.splitWithPlaceholder(splitMenu.windowId, dir, before);
            setSplitMenu(null);
          }}
        />
      )}
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

/** In "rails span everything" (vertical) mode the left/right DockAreas must
 *  escape #content-area and become tracks of the #main-container grid so they
 *  span the full height past the input + bottom dock. When a host div is present
 *  (only the forge shell provides one), portal into it; otherwise — and in the
 *  default horizontal mode — render inline so #content-area's grid places it. */
function SideDockPortal({
  side,
  vertical,
  children,
}: {
  side: 'left' | 'right';
  vertical: boolean;
  children: React.ReactNode;
}) {
  const host = vertical
    ? document.getElementById(`layout-${side}-dock-host`)
    : null;
  if (!host) return <>{children}</>;
  return createPortal(<>{children}</>, host);
}
