import { ReactNode, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { FloatingPanelState, PANEL_CONFIGS } from '../types';
import { useLayoutManager } from '@web/layout';
import { useDockablePanel } from '@web/layout';
import { getPopup } from '../popupRegistry';
import { MapHeaderMenu } from './MapHeaderMenu';
import { ObjectListHeaderActions } from './ObjectListHeaderActions';

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null;

interface FloatingPanelProps {
  panel: FloatingPanelState;
  children: ReactNode;
}

export function FloatingPanel({ panel, children }: FloatingPanelProps) {
  const { updateFloatingPanel, dragState, getBuiltInPanelState, updateBuiltInPanelState } = useLayoutManager();
  const { handleDragStart } = useDockablePanel({ panelId: panel.id });
  const config = PANEL_CONFIGS[panel.id];

  // Check if this is a popup panel or built-in panel
  const isPopup = panel.id.startsWith('popup:');
  const isBuiltIn = panel.id === 'map' || panel.id === 'objectList';
  const popupInfo = isPopup ? getPopup(panel.id) : null;
  const builtInState = isBuiltIn ? getBuiltInPanelState(panel.id) : undefined;

  // Get title - built-in panels can have dynamic title via builtInState
  const title = builtInState?.title ?? popupInfo?.config.title ?? config?.title ?? panel.id;
  const isLocked = isPopup ? (popupInfo?.isLocked ?? false) : (builtInState?.isLocked ?? false);

  const panelRef = useRef<HTMLDivElement>(null);
  const resizeDir = useRef<ResizeDirection>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const startBounds = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const isBeingDragged = dragState?.panelId === panel.id;
  const isCtrlHeld = isBeingDragged && dragState?.ctrlHeld;

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (!resizeDir.current) return;

      const dx = e.clientX - startPos.current.x;
      const dy = e.clientY - startPos.current.y;
      const minWidth = popupInfo?.config.minWidth ?? config?.minWidth ?? 150;
      const minHeight = popupInfo?.config.minHeight ?? config?.minHeight ?? 100;
      const dir = resizeDir.current;

      const updates: Partial<FloatingPanelState> = {};

      // Handle horizontal resizing
      if (dir.includes('e')) {
        updates.width = Math.max(minWidth, startBounds.current.width + dx);
      } else if (dir.includes('w')) {
        const newWidth = Math.max(minWidth, startBounds.current.width - dx);
        const widthDelta = startBounds.current.width - newWidth;
        updates.width = newWidth;
        updates.x = startBounds.current.x + widthDelta;
      }

      // Handle vertical resizing
      if (dir.includes('s')) {
        updates.height = Math.max(minHeight, startBounds.current.height + dy);
      } else if (dir.includes('n')) {
        const newHeight = Math.max(minHeight, startBounds.current.height - dy);
        const heightDelta = startBounds.current.height - newHeight;
        updates.height = newHeight;
        updates.y = startBounds.current.y + heightDelta;
      }

      if (Object.keys(updates).length > 0) {
        updateFloatingPanel(panel.id, updates);
      }
    };

    const handleEnd = () => {
      resizeDir.current = null;
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
    };
  }, [panel.id, updateFloatingPanel, config, popupInfo]);

  const handleResizeStart = useCallback(
    (direction: ResizeDirection) => (e: React.PointerEvent) => {
      // Don't allow resizing when locked
      if (isLocked) return;
      resizeDir.current = direction;
      startPos.current = { x: e.clientX, y: e.clientY };
      // For auto-height panels, capture the actual rendered height from the DOM
      const actualHeight = panel.height ?? panelRef.current?.getBoundingClientRect().height ?? 100;
      startBounds.current = { x: panel.x, y: panel.y, width: panel.width, height: actualHeight };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    },
    [panel.x, panel.y, panel.width, panel.height, isLocked]
  );

  // Wrap drag start to check for locked state
  const handleDragStartWrapper = useCallback(
    (e: React.PointerEvent) => {
      if (isLocked) return;
      handleDragStart(e);
    },
    [handleDragStart, isLocked]
  );

  const handleClose = useCallback(() => {
    popupInfo?.onClose();
  }, [popupInfo]);

  const handleTogglePin = useCallback(() => {
    popupInfo?.setIsPinned(!popupInfo.isPinned);
  }, [popupInfo]);

  const handleToggleLock = useCallback(() => {
    if (isPopup) {
      popupInfo?.setIsLocked(!popupInfo.isLocked);
    } else if (isBuiltIn) {
      updateBuiltInPanelState(panel.id, { isLocked: !builtInState?.isLocked });
    }
  }, [isPopup, isBuiltIn, popupInfo, builtInState, panel.id, updateBuiltInPanelState]);

  const handleReset = useCallback(() => {
    if (!popupInfo) return;

    // Reset to initial centered position and size
    const initialWidth = popupInfo.config.initialWidth ?? 500;
    const initialHeight = popupInfo.config.initialHeight;
    const initialY = initialHeight !== undefined
      ? Math.max(16, (window.innerHeight - initialHeight) / 2)
      : Math.max(16, window.innerHeight * 0.1);

    updateFloatingPanel(panel.id, {
      x: Math.max(16, (window.innerWidth - initialWidth) / 2),
      y: initialY,
      width: initialWidth,
      height: initialHeight,
    });

    // Also call the popup's onReset to notify the component
    popupInfo.onReset();
  }, [popupInfo, panel.id, updateFloatingPanel]);

  const isAutoHeight = panel.height === undefined;

  // Constrain auto-height panels to fit above the input area, centered vertically
  useLayoutEffect(() => {
    if (panel.height !== undefined || !panelRef.current) return;
    const inputArea = document.getElementById('input-area');
    const bottomLimit = inputArea ? inputArea.getBoundingClientRect().top : window.innerHeight;
    const margin = 50;
    const availableH = bottomLimit - 2 * margin;
    const actualH = panelRef.current.offsetHeight;

    if (actualH > availableH) {
      // Too tall: cap height and center
      updateFloatingPanel(panel.id, { height: availableH, y: margin });
    } else if (panel.y + actualH > bottomLimit - margin) {
      // Overflows bottom: center in available space
      updateFloatingPanel(panel.id, { y: Math.max(margin, (bottomLimit - actualH) / 2) });
    }
  });

  return (
    <div
      ref={panelRef}
      className={`managed-panel floating-panel floating-panel--${panel.id}${isBeingDragged ? ' floating-panel--dragging' : ''}${isPopup ? ' floating-panel--popup' : ''}${isAutoHeight ? ' floating-panel--auto-height' : ''}${isLocked ? ' managed-panel--locked floating-panel--locked' : ''}`}
      style={{
        left: panel.x,
        top: panel.y,
        width: panel.width,
        ...(panel.height !== undefined && { height: panel.height }),
      }}
    >
      <div
        className={`managed-panel__header floating-panel__header${isLocked ? ' floating-panel__header--locked' : ''}`}
        onPointerDown={handleDragStartWrapper}
      >
        <span className="managed-panel__title floating-panel__title">{title}</span>
        <span
          className={`floating-panel__drag-hint${isCtrlHeld ? ' floating-panel__drag-hint--active' : ''}${!isBeingDragged ? ' floating-panel__drag-hint--hidden' : ''}`}
        >
          {isCtrlHeld ? 'Docking disabled' : 'Ctrl = prevent dock'}
        </span>
        <div className="managed-panel__header-actions floating-panel__header-actions" onPointerDown={(e) => e.stopPropagation()}>
          {/* Popup-specific header actions */}
          {popupInfo?.headerActions}
          {isPopup && popupInfo && (
            <>
              <button
                type="button"
                className="panel-button panel-button--reset floating-panel__reset-button"
                onClick={handleReset}
                title="Przywroc domyslna pozycje i rozmiar"
              />
              <button
                type="button"
                className={`panel-button panel-button--lock floating-panel__lock-button${popupInfo.isLocked ? ' is-active floating-panel__lock-button--active' : ''}`}
                onClick={handleToggleLock}
                title={popupInfo.isLocked ? 'Odblokuj okno' : 'Zablokuj okno'}
              />
              <button
                type="button"
                className={`panel-button panel-button--pin floating-panel__pin-button${popupInfo.isPinned ? ' is-active floating-panel__pin-button--active' : ''}`}
                onClick={handleTogglePin}
                title={popupInfo.isPinned ? 'Odepnij okno' : 'Przypnij okno'}
              />
              <button
                type="button"
                className="panel-button panel-button--close floating-panel__close-button"
                onClick={handleClose}
                title="Zamknij"
              />
            </>
          )}
          {/* Built-in panel header actions */}
          {panel.id === 'map' && <MapHeaderMenu />}
          {panel.id === 'objectList' && <ObjectListHeaderActions />}
          {/* Built-in panel lock button */}
          {isBuiltIn && (
            <button
              type="button"
              className={`panel-button panel-button--lock floating-panel__lock-button${isLocked ? ' is-active floating-panel__lock-button--active' : ''}`}
              onClick={handleToggleLock}
              title={isLocked ? 'Odblokuj okno' : 'Zablokuj okno'}
            />
          )}
        </div>
      </div>
      <div className="managed-panel__content floating-panel__content">{children}</div>

      {/* Edge resize handles - hidden when locked */}
      {!isLocked && (
        <>
          <div className="floating-panel__edge floating-panel__edge--n" onPointerDown={handleResizeStart('n')} />
          <div className="floating-panel__edge floating-panel__edge--s" onPointerDown={handleResizeStart('s')} />
          <div className="floating-panel__edge floating-panel__edge--e" onPointerDown={handleResizeStart('e')} />
          <div className="floating-panel__edge floating-panel__edge--w" onPointerDown={handleResizeStart('w')} />

          {/* Corner resize handles */}
          <div className="floating-panel__corner floating-panel__corner--ne" onPointerDown={handleResizeStart('ne')} />
          <div className="floating-panel__corner floating-panel__corner--nw" onPointerDown={handleResizeStart('nw')} />
          <div className="floating-panel__corner floating-panel__corner--se" onPointerDown={handleResizeStart('se')} />
          <div className="floating-panel__corner floating-panel__corner--sw" onPointerDown={handleResizeStart('sw')} />
        </>
      )}
    </div>
  );
}
