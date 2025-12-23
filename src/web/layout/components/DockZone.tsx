import {ReactNode, useCallback, useMemo, useRef} from 'react';
import {DockPosition, PANEL_CONFIGS, PanelId} from '../types';
import {useLayoutManager} from '@web/layout';
import {PanelResizeHandle, ResizeHandle} from './ResizeHandle';
import {DockedPanel} from './DockedPanel';
import type {RegisteredPopup} from '../popupRegistry';
import {MapHeaderMenu} from './MapHeaderMenu';

interface DockZoneProps {
  position: DockPosition;
  renderPanel: (panelId: string) => ReactNode;
  isPanelEnabled: (panelId: PanelId) => boolean;
  getPopupInfo?: (panelId: string) => RegisteredPopup | null;
}

export function DockZone({ position, renderPanel, isPanelEnabled, getPopupInfo }: DockZoneProps) {
  const { layoutState, resizeDock, resizePanel, dragState, getBuiltInPanelState, updateBuiltInPanelState } = useLayoutManager();
  const dockKey = position.toLowerCase() as 'left' | 'top' | 'right';
  const dock = layoutState.docks[dockKey];
  const containerRef = useRef<HTMLDivElement>(null);
  const dockSizeRef = useRef(dock.size);
  dockSizeRef.current = dock.size;

  const isHorizontal = position === 'TOP';

  // Check if we're showing a drop preview in this dock
  const isDropTarget = dragState?.potentialDock === position && dragState.insertIndex !== null;
  const insertIndex = isDropTarget ? dragState.insertIndex : null;
  const previewPanelId = isDropTarget ? dragState.panelId : null;

  const handleDockResize = useCallback(
    (delta: number) => {
      const newSize = dockSizeRef.current + delta;
      dockSizeRef.current = newSize;
      resizeDock(position, newSize);
    },
    [position, resizeDock]
  );

  // Use refs to track current panel sizes to avoid stale closure issues
  const panelSizesRef = useRef<Record<string, number>>({});
  dock.panels.forEach((p) => {
    panelSizesRef.current[p.id] = p.size;
  });

  const handlePanelResize = useCallback(
    (panelId: string, delta: number) => {
      if (!containerRef.current) return;

      const containerSize = isHorizontal
        ? containerRef.current.offsetWidth
        : containerRef.current.offsetHeight;

      const deltaPercent = (delta / containerSize) * 100;
      const currentSize = panelSizesRef.current[panelId];
      if (currentSize !== undefined) {
        const newSize = currentSize + deltaPercent;
        panelSizesRef.current[panelId] = newSize;
        resizePanel(panelId, newSize);
      }
    },
    [isHorizontal, resizePanel]
  );

  const sortedPanels = useMemo(
    () => [...dock.panels].filter((p) => isPanelEnabled(p.id)).sort((a, b) => a.order - b.order),
    [dock.panels, isPanelEnabled]
  );

  // Build the display list including preview placeholder
  const displayItems = useMemo(() => {
    if (!isDropTarget || insertIndex === null || !previewPanelId) {
      // No preview - normalize sizes so they sum to 100%
      if (sortedPanels.length === 0) return [];
      const totalSize = sortedPanels.reduce((sum, p) => sum + p.size, 0);
      const scale = totalSize > 0 ? 100 / totalSize : 1;
      return sortedPanels.map((p) => ({
        id: p.id,
        size: p.size * scale,
        isPreview: false,
      }));
    }

    // Calculate sizes with preview included - shrink existing panels proportionally
    const totalPanels = sortedPanels.length + 1;
    const previewSize = 100 / totalPanels;
    const existingScale = (100 - previewSize) / 100;

    const items: Array<{ id: string; size: number; isPreview: boolean }> = [];
    const totalSize = sortedPanels.reduce((sum, p) => sum + p.size, 0);
    const normalizeScale = totalSize > 0 ? 100 / totalSize : 1;

    sortedPanels.forEach((p, i) => {
      if (i === insertIndex) {
        items.push({ id: previewPanelId, size: previewSize, isPreview: true });
      }
      items.push({ id: p.id, size: p.size * normalizeScale * existingScale, isPreview: false });
    });
    if (insertIndex >= sortedPanels.length) {
      items.push({ id: previewPanelId, size: previewSize, isPreview: true });
    }

    return items;
  }, [sortedPanels, isDropTarget, insertIndex, previewPanelId]);

  // Show empty dock zone when it's a drop target
  if (sortedPanels.length === 0 && !isDropTarget) {
    return null;
  }

  const resizeHandlePosition =
    position === 'LEFT' ? 'right' : position === 'RIGHT' ? 'left' : 'bottom';
  const resizeOrientation = position === 'TOP' ? 'vertical' : 'horizontal';

  return (
    <div
      ref={containerRef}
      className={`dock-zone dock-zone--${position.toLowerCase()}`}
      style={{
        [position === 'TOP' ? 'height' : 'width']: `${dock.size}px`,
      }}
    >
      {displayItems.map((item, index) => {
        if (item.isPreview) {
          // Render preview placeholder
          const config = PANEL_CONFIGS[item.id];
          const title = config?.title ?? item.id;
          return (
            <div
              key={`preview-${item.id}`}
              className="dock-zone__panel-wrapper dock-zone__panel-preview"
              style={{
                [isHorizontal ? 'width' : 'height']: `${item.size}%`,
              }}
            >
              <div className="dock-panel-preview-inline">
                <span className="dock-panel-preview-inline__title">{title}</span>
              </div>
            </div>
          );
        }

        // Render actual panel
        const popupInfo = getPopupInfo?.(item.id);
        const isPopup = !!popupInfo;
        const isBuiltIn = item.id === 'map' || item.id === 'objectList';
        const builtInState = isBuiltIn ? getBuiltInPanelState(item.id) : undefined;

        // Determine lock state and handler
        const isLocked = isPopup ? popupInfo?.isLocked : builtInState?.isLocked;
        const onLock = isPopup
          ? () => popupInfo?.setIsLocked(!popupInfo.isLocked)
          : isBuiltIn
            ? () => updateBuiltInPanelState(item.id, { isLocked: !builtInState?.isLocked })
            : undefined;

        return (
          <div
            key={item.id}
            className="dock-zone__panel-wrapper"
            style={{
              [isHorizontal ? 'width' : 'height']: `${item.size}%`,
            }}
          >
            <DockedPanel
              panelId={item.id}
              style={{ flex: 1 }}
              title={popupInfo?.config.title}
              onClose={popupInfo?.onClose}
              onPin={popupInfo ? () => popupInfo.setIsPinned(!popupInfo.isPinned) : undefined}
              isPinned={popupInfo?.isPinned}
              onLock={onLock}
              isLocked={isLocked}
              onReset={popupInfo?.onReset}
              headerActions={item.id === 'map' ? <MapHeaderMenu /> : popupInfo?.headerActions}
              isPopup={isPopup}
            >
              {renderPanel(item.id)}
            </DockedPanel>
            {index < displayItems.length - 1 && !displayItems[index + 1]?.isPreview && !item.isPreview && (
              <PanelResizeHandle
                orientation={isHorizontal ? 'horizontal' : 'vertical'}
                onResize={(delta) => handlePanelResize(item.id, delta)}
              />
            )}
          </div>
        );
      })}
      <ResizeHandle
        orientation={resizeOrientation}
        position={resizeHandlePosition}
        onResize={handleDockResize}
      />
    </div>
  );
}
