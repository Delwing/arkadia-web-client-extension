import { useEffect, useMemo } from 'react';
import { useLayoutManager } from '../hooks/useLayoutManager';
import { PANEL_CONFIGS } from '../types';

export function DockDropIndicator() {
  const { dragState, layoutState } = useLayoutManager();

  // Add body class when dragging
  useEffect(() => {
    if (dragState) {
      document.body.classList.add('layout-dragging');
    } else {
      document.body.classList.remove('layout-dragging');
    }
    return () => {
      document.body.classList.remove('layout-dragging');
    };
  }, [dragState]);

  // Only show overlay preview for EMPTY dock zones
  // Populated docks show inline preview via DockZone component
  const emptyDockPreview = useMemo(() => {
    if (!dragState?.potentialDock || dragState.insertIndex === null) return null;

    const dock = dragState.potentialDock;
    const dockKey = dock.toLowerCase() as 'left' | 'top' | 'right';
    const dockState = layoutState.docks[dockKey];

    // Only show overlay if dock is empty
    if (dockState.panels.length > 0) return null;

    const contentArea = document.getElementById('content-area');
    if (!contentArea) return null;

    const rect = contentArea.getBoundingClientRect();
    const topOffset = layoutState.docks.top.panels.length > 0 ? layoutState.docks.top.size : 0;
    const dockSize = dockState.size || 200;
    const config = PANEL_CONFIGS[dragState.panelId];

    let style: React.CSSProperties;

    if (dock === 'TOP') {
      style = {
        position: 'fixed',
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: dockSize,
      };
    } else if (dock === 'LEFT') {
      style = {
        position: 'fixed',
        left: rect.left,
        top: rect.top + topOffset,
        width: dockSize,
        height: rect.height - topOffset,
      };
    } else {
      style = {
        position: 'fixed',
        left: rect.right - dockSize,
        top: rect.top + topOffset,
        width: dockSize,
        height: rect.height - topOffset,
      };
    }

    return {
      title: config?.title ?? dragState.panelId,
      style,
    };
  }, [dragState, layoutState]);

  if (!emptyDockPreview) return null;

  return (
    <div className="dock-preview-container">
      <div className="dock-panel-preview-overlay" style={emptyDockPreview.style}>
        <span className="dock-panel-preview-overlay__title">{emptyDockPreview.title}</span>
      </div>
    </div>
  );
}
