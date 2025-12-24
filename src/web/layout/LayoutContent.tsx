import { useCallback, useEffect, useMemo, useState } from 'react';
import { DockZone } from './components/DockZone';
import { DockDropIndicator } from './components/DockDropIndicator';
import { FloatingPanel } from './components/FloatingPanel';
import { MapPanel } from './panels/MapPanel';
import { ObjectListPanel } from './panels/ObjectListPanel';
import { useLayoutManager } from './hooks/useLayoutManager';
import { PanelId } from './types';
import { getRegisteredPopups, subscribeToRegistry, RegisteredPopup } from './popupRegistry';

interface LayoutContentProps {
  mapElement: HTMLElement | null;
  objectListElement: HTMLElement | null;
}

export function LayoutContent({ mapElement, objectListElement }: LayoutContentProps) {
  const { layoutState, isLayoutMode, dragState } = useLayoutManager();
  const [registeredPopups, setRegisteredPopups] = useState<RegisteredPopup[]>(() => getRegisteredPopups());

  // Subscribe to popup registry changes
  useEffect(() => {
    return subscribeToRegistry(() => {
      setRegisteredPopups(getRegisteredPopups());
    });
  }, []);

  // Create a map of popup ID to popup for quick lookup
  const popupMap = useMemo(() => {
    const map = new Map<string, RegisteredPopup>();
    for (const popup of registeredPopups) {
      map.set(popup.id, popup);
    }
    return map;
  }, [registeredPopups]);

  // Check if a panel is enabled for layout management
  const isPanelEnabled = useCallback(
    (panelId: PanelId) => {
      // Map is always enabled when layout manager is on
      if (panelId === 'map') return true;
      if (panelId === 'objectList') return layoutState.enabledPanels.objectList;
      // Popup panels are only enabled if they're registered
      if (panelId.startsWith('popup:')) {
        return popupMap.has(panelId);
      }
      return true; // Future non-popup panels default to enabled
    },
    [layoutState.enabledPanels, popupMap]
  );

  const renderPanel = useCallback(
    (panelId: string) => {
      switch (panelId) {
        case 'map':
          return <MapPanel mapElement={mapElement} />;
        case 'objectList':
          return <ObjectListPanel objectListElement={objectListElement} />;
        default:
          // Check if this is a popup panel
          const popup = popupMap.get(panelId);
          if (popup) {
            const bodyClass = popup.config.bodyClassName;
            return bodyClass ? (
              <div className={bodyClass}>{popup.renderContent()}</div>
            ) : (
              popup.renderContent()
            );
          }
          return <div>Unknown panel: {panelId}</div>;
      }
    },
    [mapElement, objectListElement, popupMap]
  );

  // Get popup info for a panel (used by DockZone to pass popup-specific props)
  const getPopupInfo = useCallback(
    (panelId: string) => {
      return popupMap.get(panelId) || null;
    },
    [popupMap]
  );

  // Filter floating panels to only show enabled ones
  const enabledFloatingPanels = useMemo(
    () => layoutState.floatingPanels.filter((p) => isPanelEnabled(p.id)),
    [layoutState.floatingPanels, isPanelEnabled]
  );

  // Apply CSS variables to #content-area for the grid to work
  useEffect(() => {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    if (isLayoutMode) {
      const { docks } = layoutState;
      // Filter slots by enabled panels
      const leftHasEnabled = docks.left.slots.some((slot) =>
        slot.panels.some((p) => isPanelEnabled(p.id))
      );
      const topHasEnabled = docks.top.slots.some((slot) =>
        slot.panels.some((p) => isPanelEnabled(p.id))
      );
      const rightHasEnabled = docks.right.slots.some((slot) =>
        slot.panels.some((p) => isPanelEnabled(p.id))
      );

      contentArea.style.setProperty(
        '--dock-left-size',
        leftHasEnabled ? `${docks.left.size}px` : '0px'
      );
      contentArea.style.setProperty(
        '--dock-top-size',
        topHasEnabled ? `${docks.top.size}px` : '0px'
      );
      contentArea.style.setProperty(
        '--dock-right-size',
        rightHasEnabled ? `${docks.right.size}px` : '0px'
      );
    } else {
      contentArea.style.removeProperty('--dock-left-size');
      contentArea.style.removeProperty('--dock-top-size');
      contentArea.style.removeProperty('--dock-right-size');
    }
  }, [layoutState, isLayoutMode, isPanelEnabled]);

  if (!isLayoutMode) {
    return null;
  }

  return (
    <div className="layout-manager">
      <DockZone position="TOP" renderPanel={renderPanel} isPanelEnabled={isPanelEnabled} getPopupInfo={getPopupInfo} />
      <DockZone position="LEFT" renderPanel={renderPanel} isPanelEnabled={isPanelEnabled} getPopupInfo={getPopupInfo} />
      <div className="dock-zone dock-zone--main" id="layout-main-content" />
      <DockZone position="RIGHT" renderPanel={renderPanel} isPanelEnabled={isPanelEnabled} getPopupInfo={getPopupInfo} />
      {/* Floating panels */}
      {enabledFloatingPanels.map((panel) => (
        <FloatingPanel key={panel.id} panel={panel}>
          {renderPanel(panel.id)}
        </FloatingPanel>
      ))}
      {dragState && <DockDropIndicator />}
    </div>
  );
}
