import { useCallback, useEffect, useMemo } from 'react';
import { DockZone } from './components/DockZone';
import { DockDropIndicator } from './components/DockDropIndicator';
import { FloatingPanel } from './components/FloatingPanel';
import { MapPanel } from './panels/MapPanel';
import { ObjectListPanel } from './panels/ObjectListPanel';
import { useLayoutManager } from './hooks/useLayoutManager';
import { PanelId } from './types';

interface LayoutContentProps {
  mapElement: HTMLElement | null;
  objectListElement: HTMLElement | null;
}

export function LayoutContent({ mapElement, objectListElement }: LayoutContentProps) {
  const { layoutState, isLayoutMode, dragState } = useLayoutManager();

  // Check if a panel is enabled for layout management
  const isPanelEnabled = useCallback(
    (panelId: PanelId) => {
      // Map is always enabled when layout manager is on
      if (panelId === 'map') return true;
      if (panelId === 'objectList') return layoutState.enabledPanels.objectList;
      return true; // Future panels default to enabled
    },
    [layoutState.enabledPanels]
  );

  const renderPanel = useCallback(
    (panelId: string) => {
      switch (panelId) {
        case 'map':
          return <MapPanel mapElement={mapElement} />;
        case 'objectList':
          return <ObjectListPanel objectListElement={objectListElement} />;
        default:
          return <div>Unknown panel: {panelId}</div>;
      }
    },
    [mapElement, objectListElement]
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
      // Filter panels by enabled state
      const leftEnabled = docks.left.panels.filter((p) => isPanelEnabled(p.id));
      const topEnabled = docks.top.panels.filter((p) => isPanelEnabled(p.id));
      const rightEnabled = docks.right.panels.filter((p) => isPanelEnabled(p.id));

      contentArea.style.setProperty(
        '--dock-left-size',
        leftEnabled.length > 0 ? `${docks.left.size}px` : '0px'
      );
      contentArea.style.setProperty(
        '--dock-top-size',
        topEnabled.length > 0 ? `${docks.top.size}px` : '0px'
      );
      contentArea.style.setProperty(
        '--dock-right-size',
        rightEnabled.length > 0 ? `${docks.right.size}px` : '0px'
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
      <DockZone position="TOP" renderPanel={renderPanel} isPanelEnabled={isPanelEnabled} />
      <DockZone position="LEFT" renderPanel={renderPanel} isPanelEnabled={isPanelEnabled} />
      <div className="dock-zone dock-zone--main" id="layout-main-content" />
      <DockZone position="RIGHT" renderPanel={renderPanel} isPanelEnabled={isPanelEnabled} />
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
