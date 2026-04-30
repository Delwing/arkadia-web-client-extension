import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, ReactNode } from 'react';
import { useDockablePopup } from '../hooks/useDockablePopup';
import { PopupType } from '../types';
import { refreshPopupContent } from '../popupRegistry';
import { savePopupFloatingState, getPopupFloatingState } from '../utils/layoutStorage';

export interface DockablePopupWrapperProps {
  popupId: string;
  popupType: PopupType;
  title: string;
  isOpen: boolean;
  isPinned: boolean;
  isLocked?: boolean;
  onClose: () => void;
  onPinnedChange: (pinned: boolean) => void;
  onLockedChange?: (locked: boolean) => void;
  onReset?: () => void;
  /** Counter that triggers reset when incremented */
  resetCounter?: number;
  children: ReactNode;
  headerActions?: ReactNode;
  minWidth?: number;
  minHeight?: number;
  initialWidth?: number;
  initialHeight?: number;
  className?: string;
  bodyClassName?: string;
  /** If true, popup will never be managed by layout manager */
  disableLayoutManagement?: boolean;
}

interface Position {
  left: number;
  top: number;
}

interface Size {
  width: number;
  height?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * DockablePopupWrapper - Wraps popup content with floating popup behavior.
 *
 * When layout manager is ON: Returns null (FloatingPanel handles rendering)
 * When layout manager is OFF: Renders floating popup with all features
 */
export function DockablePopupWrapper({
  popupId,
  popupType,
  title,
  isOpen,
  isPinned,
  isLocked = false,
  onClose,
  onPinnedChange,
  onLockedChange,
  onReset,
  resetCounter = 0,
  children,
  headerActions,
  minWidth = 300,
  minHeight = 200,
  initialWidth,
  initialHeight,
  className = '',
  bodyClassName = '',
  disableLayoutManagement = false,
}: DockablePopupWrapperProps) {
  // Use ref to avoid re-registering popup on every children change
  const childrenRef = useRef(children);
  childrenRef.current = children;
  const renderContent = useCallback(() => childrenRef.current, []);

  // Track if this is the first render to avoid unnecessary refresh
  const isFirstRenderRef = useRef(true);

  const { isManagedByLayout } = useDockablePopup({
    popupId,
    popupType,
    title,
    isOpen,
    isPinned,
    isLocked,
    onClose,
    onPinnedChange,
    onLockedChange,
    onReset,
    minWidth,
    minHeight,
    initialWidth,
    initialHeight,
    renderContent,
    headerActions,
    bodyClassName,
    disableLayoutManagement,
  });

  // Notify this popup's content subscriber so its FloatingPanel re-renders with fresh content
  useLayoutEffect(() => {
    if (!isOpen || !isManagedByLayout) return;
    // Skip first render - the popup registration already triggers LayoutContent render
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    // Children changed, notify only this popup's FloatingPanel
    refreshPopupContent(popupId);
  });

  // Reset first render flag when popup closes
  useEffect(() => {
    if (!isOpen) {
      isFirstRenderRef.current = true;
    }
  }, [isOpen]);

  // State for non-layout-mode rendering
  const panelRef = useRef<HTMLDivElement>(null);
  // Initialize position/size from persisted state if available, or compute initial position
  const [position, setPosition] = useState<Position | null>(() => {
    const saved = getPopupFloatingState(popupId);
    if (saved) return { left: saved.x, top: saved.y };
    // For popups with initialWidth, compute centered position immediately to avoid CSS centering mode
    if (initialWidth !== undefined) {
      const margin = 32;
      const effectiveWidth = Math.min(initialWidth, window.innerWidth - margin);
      const left = Math.max(16, (window.innerWidth - effectiveWidth) / 2);
      const top = initialHeight !== undefined
        ? Math.max(16, (window.innerHeight - initialHeight) / 2)
        : Math.max(16, window.innerHeight * 0.1);
      return { left, top };
    }
    return null;
  });
  const [size, setSize] = useState<Size | null>(() => {
    const saved = getPopupFloatingState(popupId);
    if (saved) return { width: saved.width, height: saved.height };
    if (initialWidth !== undefined) return { width: initialWidth, height: initialHeight };
    return null;
  });
  const hasInitializedRef = useRef(false);
  const isDragging = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const resizeState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  // Track the last reset counter to detect resets
  const lastResetCounterRef = useRef(resetCounter);

  // Reset initialization flag when popup closes
  useEffect(() => {
    if (!isOpen) {
      hasInitializedRef.current = false;
    }
  }, [isOpen]);

  // Handle reset - restore initial position and size
  useEffect(() => {
    if (resetCounter === lastResetCounterRef.current) return;
    lastResetCounterRef.current = resetCounter;

    if (!isOpen || isManagedByLayout) return;

    // If no explicit initial size, reset to CSS-based sizing (centered)
    if (initialWidth === undefined) {
      setPosition(null);
      setSize(null);
      return;
    }

    // Clamp width to fit viewport on small screens
    const margin = 32;
    const effectiveWidth = Math.min(initialWidth, window.innerWidth - margin);

    // Restore to initial centered position
    const left = Math.max(16, (window.innerWidth - effectiveWidth) / 2);
    const top = initialHeight !== undefined
      ? Math.max(16, (window.innerHeight - initialHeight) / 2)
      : Math.max(16, window.innerHeight * 0.1);
    setPosition({ left, top });
    setSize({ width: effectiveWidth, height: initialHeight });
  }, [resetCounter, isOpen, isManagedByLayout, initialWidth, initialHeight]);

  // Initialize position when popup opens (non-layout mode)
  useEffect(() => {
    if (!isOpen || isManagedByLayout || hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    // If we already have position/size from storage, don't override
    if (position !== null && size !== null) {
      return;
    }

    // If no explicit initial size, let CSS handle sizing (centered via CSS transform)
    if (initialWidth === undefined) {
      // Position and size remain null, CSS handles centering
      return;
    }

    // Clamp width to fit viewport on small screens
    const margin = 32;
    const effectiveWidth = Math.min(initialWidth, window.innerWidth - margin);

    // Center horizontally, and vertically if height is known, otherwise position near top
    const left = Math.max(16, (window.innerWidth - effectiveWidth) / 2);
    const top = initialHeight !== undefined
      ? Math.max(16, (window.innerHeight - initialHeight) / 2)
      : Math.max(16, window.innerHeight * 0.1);
    setPosition({ left, top });
    setSize({ width: effectiveWidth, height: initialHeight });
  }, [isOpen, isManagedByLayout, initialWidth, initialHeight, position, size]);

  // Persist position/size changes to storage (non-layout mode only)
  useEffect(() => {
    if (!isOpen || isManagedByLayout) return;
    if (!position && !size) return;

    // Debounce to avoid excessive writes during drag/resize
    const timeout = setTimeout(() => {
      // Only persist if we have position and size with explicit height
      if (position && size && size.height !== undefined) {
        savePopupFloatingState(popupId, {
          floatingState: {
            x: position.left,
            y: position.top,
            width: size.width,
            height: size.height,
          },
        });
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [isOpen, isManagedByLayout, popupId, position, size]);

  // Persist isLocked changes to storage (non-layout mode only)
  useEffect(() => {
    if (!isOpen || isManagedByLayout) return;
    savePopupFloatingState(popupId, { isLocked });
  }, [isOpen, isManagedByLayout, popupId, isLocked]);

  // Handle Escape key to close (unless pinned)
  useEffect(() => {
    if (!isOpen || isManagedByLayout) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPinned) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, isManagedByLayout, isPinned, onClose]);

  // Handle outside click to close (unless pinned)
  useEffect(() => {
    if (!isOpen || isPinned || isManagedByLayout) return;

    const handlePointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener('pointerdown', handlePointerDownOutside);
    return () => window.removeEventListener('pointerdown', handlePointerDownOutside);
  }, [isOpen, isPinned, isManagedByLayout, onClose]);

  // Drag handler for header
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Don't allow dragging when locked
      if (isLocked) return;
      if (event.button !== 0) return;
      if (!panelRef.current) return;

      event.preventDefault();
      event.stopPropagation();

      if (isDragging.current) return;

      const rect = panelRef.current.getBoundingClientRect();
      isDragging.current = true;

      dragOffsetRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      setPosition((prev) => prev ?? { left: rect.left, top: rect.top });

      const handleMove = (moveEvent: PointerEvent) => {
        if (!isDragging.current) return;

        const margin = 16;
        const width = panelRef.current?.offsetWidth ?? 300;
        const height = panelRef.current?.offsetHeight ?? 200;
        const maxLeft = Math.max(margin, window.innerWidth - width - margin);
        const maxTop = Math.max(margin, window.innerHeight - height - margin);

        const nextLeft = clamp(moveEvent.clientX - dragOffsetRef.current.x, margin, maxLeft);
        const nextTop = clamp(moveEvent.clientY - dragOffsetRef.current.y, margin, maxTop);
        setPosition({ left: nextLeft, top: nextTop });
      };

      const handleEnd = () => {
        isDragging.current = false;
        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', handleEnd);
        document.removeEventListener('pointercancel', handleEnd);
      };

      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleEnd);
      document.addEventListener('pointercancel', handleEnd);
    },
    [isLocked]
  );

  // Resize handlers
  const handleResizePointerMove = useCallback(
    (event: PointerEvent) => {
      const resize = resizeState.current;
      if (!resize || event.pointerId !== resize.pointerId || !panelRef.current) return;

      const deltaX = event.clientX - resize.startX;
      const deltaY = event.clientY - resize.startY;

      const margin = 32;
      const effectiveMinWidth = Math.min(minWidth, window.innerWidth - margin);
      const effectiveMinHeight = Math.min(minHeight, window.innerHeight - margin);

      const newWidth = Math.max(effectiveMinWidth, resize.startWidth + deltaX);
      const newHeight = Math.max(effectiveMinHeight, resize.startHeight + deltaY);

      setSize({ width: newWidth, height: newHeight });
    },
    [minWidth, minHeight]
  );

  const endResizePointerDrag = useCallback(
    (event: PointerEvent) => {
      const resize = resizeState.current;
      if (!resize || event.pointerId !== resize.pointerId) return;

      resizeState.current = null;
      window.removeEventListener('pointermove', handleResizePointerMove);
      window.removeEventListener('pointerup', endResizePointerDrag);
      window.removeEventListener('pointercancel', endResizePointerDrag);
    },
    [handleResizePointerMove]
  );

  const handleResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Don't allow resizing when locked
      if (isLocked) return;
      if (event.button !== 0) return;
      if (!panelRef.current) return;

      const rect = panelRef.current.getBoundingClientRect();
      resizeState.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: rect.width,
        startHeight: rect.height,
      };

      setPosition((prev) => prev ?? { left: rect.left, top: rect.top });
      // For auto-height popups, capture the current rendered height when starting resize
      // Preserve the state width to avoid unexpected width changes
      setSize((prev) => {
        if (!prev) return { width: rect.width, height: rect.height };
        // If height was undefined (auto-height), capture the rendered height
        // Keep the state width to avoid shrinking due to CSS constraints
        return { width: prev.width, height: prev.height ?? rect.height };
      });

      window.addEventListener('pointermove', handleResizePointerMove);
      window.addEventListener('pointerup', endResizePointerDrag);
      window.addEventListener('pointercancel', endResizePointerDrag);
      event.preventDefault();
      event.stopPropagation();
    },
    [isLocked, endResizePointerDrag, handleResizePointerMove]
  );

  // Cleanup resize listeners
  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handleResizePointerMove);
      window.removeEventListener('pointerup', endResizePointerDrag);
      window.removeEventListener('pointercancel', endResizePointerDrag);
    };
  }, [endResizePointerDrag, handleResizePointerMove]);

  // Don't render anything if not open
  if (!isOpen) {
    return null;
  }

  // When layout manager is ON, FloatingPanel handles rendering
  if (isManagedByLayout) {
    return null;
  }

  // Render floating popup (layout manager OFF)
  const togglePinned = () => {
    onPinnedChange(!isPinned);
  };

  const toggleLocked = () => {
    onLockedChange?.(!isLocked);
  };

  const handleResetClick = () => {
    onReset?.();
  };

  const isAutoHeight = size?.height === undefined;
  const positionStyle: React.CSSProperties = {
    ...(position ? {
      position: 'fixed' as const,
      left: `${position.left}px`,
      top: `${position.top}px`,
    } : {}),
    ...(size ? {
      width: `${size.width}px`,
      ...(size.height !== undefined && { height: `${size.height}px` }),
    } : {}),
  };

  const positionClassName = position
    ? 'floating-window--floating plugin-window--floating'
    : 'floating-window--center plugin-window--center';

  return (
    <div className="window-container plugin-window-container">
      <div
        ref={panelRef}
        className={`floating-window plugin-window ${positionClassName}${isAutoHeight ? ' plugin-window--auto-height' : ''}${isLocked ? ' plugin-window--locked' : ''} ${className}`}
        style={positionStyle}
        tabIndex={-1}
      >
        <div className="floating-window__inner plugin-window-inner">
          <div
            className={`window-header plugin-window-header${isLocked ? ' window-header--locked plugin-window-header--locked' : ''}`}
            onPointerDown={handlePointerDown}
          >
            <h5 className="window-header__title plugin-window-title">{title}</h5>
            <div
              className="window-header__actions window-header-actions"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {headerActions}
              <button
                type="button"
                className="panel-button panel-button--reset window-reset-button"
                onClick={handleResetClick}
                title="Przywroc domyslna pozycje i rozmiar"
              />
              <button
                type="button"
                className={`panel-button panel-button--lock window-lock-button${isLocked ? ' is-active window-lock-button--active' : ''}`}
                onClick={toggleLocked}
                title={isLocked ? 'Odblokuj okno' : 'Zablokuj okno'}
              />
              <button
                type="button"
                className={`panel-button panel-button--pin window-pin-button${isPinned ? ' is-active window-pin-button--active' : ''}`}
                onClick={togglePinned}
                title={isPinned ? 'Odepnij okno' : 'Przypnij okno'}
              />
              <button type="button" className="panel-button panel-button--close btn-close" onClick={onClose} />
            </div>
          </div>
          <div className={`window-body plugin-window-body ${bodyClassName}`}>
            {children}
          </div>
          {!isLocked && (
            <div
              className="resize-handle plugin-window-resize-handle"
              onPointerDown={handleResizePointerDown}
              title="Drag to resize"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default DockablePopupWrapper;
