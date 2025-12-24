import { Fragment, ReactNode, useCallback, useMemo, useRef } from 'react';
import { DockPosition, DockSlot, PANEL_CONFIGS, PanelId } from '../types';
import { useLayoutManager } from '@web/layout';
import { PanelResizeHandle, ResizeHandle, SlotResizeHandle } from './ResizeHandle';
import { DockedPanel } from './DockedPanel';
import type { RegisteredPopup } from '../popupRegistry';
import { MapHeaderMenu } from './MapHeaderMenu';

interface DockZoneProps {
  position: DockPosition;
  renderPanel: (panelId: string) => ReactNode;
  isPanelEnabled: (panelId: PanelId) => boolean;
  getPopupInfo?: (panelId: string) => RegisteredPopup | null;
}

export function DockZone({ position, renderPanel, isPanelEnabled, getPopupInfo }: DockZoneProps) {
  const {
    layoutState,
    resizeDock,
    resizeSlot,
    resizePanelInSlot,
    dragState,
    getBuiltInPanelState,
    updateBuiltInPanelState,
  } = useLayoutManager();
  const dockKey = position.toLowerCase() as 'left' | 'top' | 'right';
  const dock = layoutState.docks[dockKey];
  const containerRef = useRef<HTMLDivElement>(null);
  const dockSizeRef = useRef(dock.size);
  dockSizeRef.current = dock.size;

  // For TOP dock: slots are horizontal (side by side), panels within stack vertically
  // For LEFT/RIGHT docks: slots are vertical (stacked), panels within are side by side
  const isTopDock = position === 'TOP';

  // Check if we're showing a drop preview in this dock
  // Either insertIndex (new slot) or insertIntoSlotId (stacking) must be set
  const isDropTarget = dragState?.potentialDock === position &&
    (dragState.insertIndex !== null || dragState.insertIntoSlotId !== null);
  const insertSlotIndex = isDropTarget ? dragState.insertIndex : null;
  const insertIntoSlotId = isDropTarget ? dragState.insertIntoSlotId : null;
  const insertPositionInSlot = isDropTarget ? dragState.insertPositionInSlot : null;
  const previewPanelId = isDropTarget ? dragState.panelId : null;

  const handleDockResize = useCallback(
    (delta: number) => {
      const newSize = dockSizeRef.current + delta;
      dockSizeRef.current = newSize;
      resizeDock(position, newSize);
    },
    [position, resizeDock]
  );

  // Use refs to track current slot sizes to avoid stale closure issues
  const slotSizesRef = useRef<Record<string, number>>({});
  dock.slots.forEach((s) => {
    slotSizesRef.current[s.id] = s.size;
  });

  const handleSlotResize = useCallback(
    (slotId: string, delta: number) => {
      if (!containerRef.current) return;

      const containerSize = isTopDock
        ? containerRef.current.offsetWidth
        : containerRef.current.offsetHeight;

      const deltaPercent = (delta / containerSize) * 100;
      const currentSize = slotSizesRef.current[slotId];
      if (currentSize !== undefined) {
        const newSize = currentSize + deltaPercent;
        slotSizesRef.current[slotId] = newSize;
        resizeSlot(slotId, newSize);
      }
    },
    [isTopDock, resizeSlot]
  );

  // Track panel sizes within slots
  const panelSizesRef = useRef<Record<string, number>>({});
  dock.slots.forEach((slot) => {
    slot.panels.forEach((p) => {
      panelSizesRef.current[p.id] = p.size;
    });
  });

  const handlePanelResize = useCallback(
    (panelId: string, slotElement: HTMLElement, delta: number) => {
      // For TOP dock: panels stack vertically, so we measure height
      // For LEFT/RIGHT docks: panels are side by side, so we measure width
      const containerSize = isTopDock
        ? slotElement.offsetHeight
        : slotElement.offsetWidth;

      const deltaPercent = (delta / containerSize) * 100;
      const currentSize = panelSizesRef.current[panelId];
      if (currentSize !== undefined) {
        const newSize = currentSize + deltaPercent;
        panelSizesRef.current[panelId] = newSize;
        resizePanelInSlot(panelId, newSize);
      }
    },
    [isTopDock, resizePanelInSlot]
  );

  // Filter slots to only show enabled panels
  const filteredSlots = useMemo(() => {
    return dock.slots
      .map((slot) => ({
        ...slot,
        panels: slot.panels.filter((p) => isPanelEnabled(p.id)).sort((a, b) => a.order - b.order),
      }))
      .filter((slot) => slot.panels.length > 0);
  }, [dock.slots, isPanelEnabled]);

  // Build the display list including preview placeholder
  const displaySlots = useMemo(() => {
    if (!isDropTarget || previewPanelId === null) {
      // No preview - normalize sizes so they sum to 100%
      if (filteredSlots.length === 0) return [];
      const totalSize = filteredSlots.reduce((sum, s) => sum + s.size, 0);
      const scale = totalSize > 0 ? 100 / totalSize : 1;
      return filteredSlots.map((s) => ({
        ...s,
        size: s.size * scale,
        isPreview: false,
        previewPanelPosition: null as number | null,
      }));
    }

    // Inserting into existing slot (stacking)
    if (insertIntoSlotId !== null) {
      // Normalize sizes first
      const totalSize = filteredSlots.reduce((sum, s) => sum + s.size, 0);
      const scale = totalSize > 0 ? 100 / totalSize : 1;

      return filteredSlots.map((slot) => {
        if (slot.id === insertIntoSlotId) {
          return {
            ...slot,
            size: slot.size * scale,
            isPreview: false,
            previewPanelPosition: insertPositionInSlot,
          };
        }
        return { ...slot, size: slot.size * scale, isPreview: false, previewPanelPosition: null };
      });
    }

    // Creating new slot
    if (insertSlotIndex !== null) {
      const totalSlots = filteredSlots.length + 1;
      const previewSize = 100 / totalSlots;
      const existingScale = (100 - previewSize) / 100;

      const slots: Array<DockSlot & { isPreview: boolean; previewPanelPosition: number | null }> = [];
      const totalSize = filteredSlots.reduce((sum, s) => sum + s.size, 0);
      const normalizeScale = totalSize > 0 ? 100 / totalSize : 1;

      filteredSlots.forEach((s, i) => {
        if (i === insertSlotIndex) {
          slots.push({
            id: `preview-${previewPanelId}`,
            panels: [{ id: previewPanelId, order: 0, size: 100 }],
            size: previewSize,
            isPreview: true,
            previewPanelPosition: null,
          });
        }
        slots.push({
          ...s,
          size: s.size * normalizeScale * existingScale,
          isPreview: false,
          previewPanelPosition: null,
        });
      });

      if (insertSlotIndex >= filteredSlots.length) {
        slots.push({
          id: `preview-${previewPanelId}`,
          panels: [{ id: previewPanelId, order: 0, size: 100 }],
          size: previewSize,
          isPreview: true,
          previewPanelPosition: null,
        });
      }

      return slots;
    }

    return filteredSlots.map((s) => ({ ...s, isPreview: false, previewPanelPosition: null }));
  }, [filteredSlots, isDropTarget, insertSlotIndex, insertIntoSlotId, insertPositionInSlot, previewPanelId]);

  // Show empty dock zone when it's a drop target
  if (filteredSlots.length === 0 && !isDropTarget) {
    return null;
  }

  const resizeHandlePosition =
    position === 'LEFT' ? 'right' : position === 'RIGHT' ? 'left' : 'bottom';
  const resizeOrientation = position === 'TOP' ? 'vertical' : 'horizontal';

  // Slot resize handle orientation: for TOP dock slots are side by side (horizontal resize)
  // For LEFT/RIGHT docks, slots are stacked (vertical resize)
  const slotResizeOrientation = isTopDock ? 'horizontal' : 'vertical';

  // Panel resize handle orientation: opposite of slot resize
  const panelResizeOrientation = isTopDock ? 'vertical' : 'horizontal';

  return (
    <div
      ref={containerRef}
      className={`dock-zone dock-zone--${position.toLowerCase()}`}
      style={{
        [position === 'TOP' ? 'height' : 'width']: `${dock.size}px`,
      }}
    >
      {displaySlots.map((slot, slotIndex) => {
        if (slot.isPreview) {
          // Render preview slot placeholder
          const config = PANEL_CONFIGS[slot.panels[0]?.id];
          const title = config?.title ?? slot.panels[0]?.id;
          return (
            <Fragment key={slot.id}>
              <div
                className="dock-zone__slot-wrapper dock-zone__slot-preview"
                style={{
                  [isTopDock ? 'width' : 'height']: `${slot.size}%`,
                }}
              >
                <div className="dock-panel-preview-inline">
                  <span className="dock-panel-preview-inline__title">{title}</span>
                </div>
              </div>
            </Fragment>
          );
        }

        // Render actual slot with panels
        return (
          <Fragment key={slot.id}>
            <div
              className="dock-zone__slot-wrapper"
              style={{
                [isTopDock ? 'width' : 'height']: `${slot.size}%`,
              }}
              data-slot-id={slot.id}
            >
              {slot.panels.map((panel, panelIndex) => {
                const popupInfo = getPopupInfo?.(panel.id);
                const isPopup = !!popupInfo;
                const isBuiltIn = panel.id === 'map' || panel.id === 'objectList';
                const builtInState = isBuiltIn ? getBuiltInPanelState(panel.id) : undefined;

                // Determine lock state and handler
                const isLocked = isPopup ? popupInfo?.isLocked : builtInState?.isLocked;
                const onLock = isPopup
                  ? () => popupInfo?.setIsLocked(!popupInfo.isLocked)
                  : isBuiltIn
                    ? () => updateBuiltInPanelState(panel.id, { isLocked: !builtInState?.isLocked })
                    : undefined;

                // Check if this is where preview panel should appear
                const showPreviewBefore = slot.previewPanelPosition === panelIndex && previewPanelId;
                const showPreviewAfter =
                  slot.previewPanelPosition === slot.panels.length &&
                  panelIndex === slot.panels.length - 1 &&
                  previewPanelId;

                // When showing preview, scale existing panel sizes to make room
                const hasPreview = slot.previewPanelPosition !== null;
                const previewPanelCount = hasPreview ? slot.panels.length + 1 : slot.panels.length;
                const scaledPanelSize = hasPreview
                  ? (panel.size * slot.panels.length) / previewPanelCount
                  : panel.size;
                const previewSize = 100 / previewPanelCount;

                return (
                  <div key={panel.id} style={{ display: 'contents' }}>
                    {showPreviewBefore && (
                      <div
                        className="dock-zone__panel-wrapper dock-zone__panel-preview"
                        style={{
                          [isTopDock ? 'height' : 'width']: `${previewSize}%`,
                        }}
                      >
                        <div className="dock-panel-preview-inline">
                          <span className="dock-panel-preview-inline__title">
                            {PANEL_CONFIGS[previewPanelId]?.title ?? previewPanelId}
                          </span>
                        </div>
                      </div>
                    )}
                    <div
                      className="dock-zone__panel-wrapper"
                      style={{
                        [isTopDock ? 'height' : 'width']: `${scaledPanelSize}%`,
                      }}
                    >
                      <DockedPanel
                        panelId={panel.id}
                        style={{ flex: 1 }}
                        title={popupInfo?.config.title}
                        onClose={popupInfo?.onClose}
                        onPin={popupInfo ? () => popupInfo.setIsPinned(!popupInfo.isPinned) : undefined}
                        isPinned={popupInfo?.isPinned}
                        onLock={onLock}
                        isLocked={isLocked}
                        onReset={popupInfo?.onReset}
                        headerActions={panel.id === 'map' ? <MapHeaderMenu /> : popupInfo?.headerActions}
                        isPopup={isPopup}
                      >
                        {renderPanel(panel.id)}
                      </DockedPanel>
                    </div>
                    {/* Panel resize handle between panels within a slot */}
                    {panelIndex < slot.panels.length - 1 && (
                      <PanelResizeHandle
                        orientation={panelResizeOrientation}
                        onResize={(delta) => {
                          const slotElement = containerRef.current?.querySelector(
                            `[data-slot-id="${slot.id}"]`
                          ) as HTMLElement | null;
                          if (slotElement) {
                            handlePanelResize(panel.id, slotElement, delta);
                          }
                        }}
                      />
                    )}
                    {showPreviewAfter && (
                      <div
                        className="dock-zone__panel-wrapper dock-zone__panel-preview"
                        style={{
                          [isTopDock ? 'height' : 'width']: `${100 / (slot.panels.length + 1)}%`,
                        }}
                      >
                        <div className="dock-panel-preview-inline">
                          <span className="dock-panel-preview-inline__title">
                            {PANEL_CONFIGS[previewPanelId]?.title ?? previewPanelId}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Slot resize handle between slots */}
            {slotIndex < displaySlots.length - 1 && !displaySlots[slotIndex + 1]?.isPreview && !slot.isPreview && (
              <SlotResizeHandle
                orientation={slotResizeOrientation}
                onResize={(delta) => handleSlotResize(slot.id, delta)}
              />
            )}
          </Fragment>
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
