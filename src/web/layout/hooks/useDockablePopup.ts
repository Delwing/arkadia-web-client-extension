import { useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { FloatingPanelState, PopupPanelConfig, PopupType } from '../types';
import { useLayoutManagerOptional } from './useLayoutManager';
import { registerPopup, unregisterPopup, updatePopup } from '../popupRegistry';

interface UseDockablePopupOptions {
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
  minWidth?: number;
  minHeight?: number;
  initialWidth?: number;
  initialHeight?: number;
  renderContent: () => ReactNode;
  headerActions?: ReactNode;
  bodyClassName?: string;
  /** If true, popup will never be managed by layout manager */
  disableLayoutManagement?: boolean;
}

export interface UseDockablePopupReturn {
  isLayoutMode: boolean;
  isManagedByLayout: boolean;
}

export function useDockablePopup({
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
  minWidth = 300,
  minHeight = 200,
  initialWidth = 350,
  initialHeight,
  renderContent,
  headerActions,
  bodyClassName,
  disableLayoutManagement = false,
}: UseDockablePopupOptions): UseDockablePopupReturn {
  // Use optional context - may be null if not inside LayoutProvider
  const layoutContext = useLayoutManagerOptional();

  // Extract values from context or use defaults
  const isLayoutMode = layoutContext?.isLayoutMode ?? false;
  const getPopupDockState = layoutContext?.getPopupDockState;
  const updatePopupDockState = layoutContext?.updatePopupDockState;
  const addPopupFloating = layoutContext?.addPopupFloating;
  const removePopupFloating = layoutContext?.removePopupFloating;
  const removePopupFromDock = layoutContext?.removePopupFromDock;
  const findFloatingPanel = layoutContext?.findFloatingPanel;
  const findPanelDock = layoutContext?.findPanelDock;
  const dockPopup = layoutContext?.dockPopup;

  // Track if we've added to floating panels for this open session
  const addedToFloatingRef = useRef(false);
  const lastSavedFloatingRef = useRef<{ x: number; y: number; width: number; height: number | undefined } | null>(null);

  // Use refs to keep current values without triggering re-registration
  const renderContentRef = useRef(renderContent);
  const headerActionsRef = useRef(headerActions);
  const onCloseRef = useRef(onClose);
  const onPinnedChangeRef = useRef(onPinnedChange);
  const onLockedChangeRef = useRef(onLockedChange);
  const onResetRef = useRef(onReset);
  const isPinnedRef = useRef(isPinned);
  const isLockedRef = useRef(isLocked);

  // Update refs on each render
  renderContentRef.current = renderContent;
  headerActionsRef.current = headerActions;
  onCloseRef.current = onClose;
  onPinnedChangeRef.current = onPinnedChange;
  onLockedChangeRef.current = onLockedChange;
  onResetRef.current = onReset;
  isPinnedRef.current = isPinned;
  isLockedRef.current = isLocked;

  // In layout mode, popup is managed by FloatingPanel (unless disabled)
  const isManagedByLayout = isLayoutMode && layoutContext !== null && !disableLayoutManagement;

  // Register/unregister popup when open state changes
  useEffect(() => {
    if (!isOpen) {
      unregisterPopup(popupId);
      return;
    }

    const config: PopupPanelConfig = {
      id: popupId,
      title,
      closable: true,
      type: 'popup',
      popupType,
      initialWidth,
      initialHeight,
      minWidth,
      minHeight,
      bodyClassName,
    };

    registerPopup({
      id: popupId,
      config,
      renderContent: () => renderContentRef.current(),
      onClose: () => onCloseRef.current(),
      isPinned: isPinnedRef.current,
      setIsPinned: (pinned: boolean) => onPinnedChangeRef.current(pinned),
      isLocked: isLockedRef.current,
      setIsLocked: (locked: boolean) => onLockedChangeRef.current?.(locked),
      onReset: () => onResetRef.current?.(),
      headerActions: headerActionsRef.current,
    });

    return () => {
      unregisterPopup(popupId);
    };
  }, [isOpen, popupId, title, popupType, initialWidth, initialHeight, minWidth, minHeight, bodyClassName]);

  // Update isPinned in registry when it changes
  useEffect(() => {
    if (isOpen) {
      updatePopup(popupId, { isPinned });
    }
  }, [isOpen, popupId, isPinned]);

  // Update isLocked in registry when it changes
  useEffect(() => {
    if (isOpen) {
      updatePopup(popupId, { isLocked });
    }
  }, [isOpen, popupId, isLocked]);

  // Update headerActions in registry when it changes
  useEffect(() => {
    if (isOpen) {
      updatePopup(popupId, { headerActions });
    }
  }, [isOpen, popupId, headerActions]);

  // Update persistOpen when pinned state changes in layout mode
  useEffect(() => {
    if (!isManagedByLayout || !isOpen) return;

    // Persist pinned state for reload (both true and false)
    updatePopupDockState?.(popupId, { persistOpen: isPinned });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isPinned, isManagedByLayout, popupId]);

  // Persist isLocked state when it changes in layout mode
  useEffect(() => {
    if (!isManagedByLayout || !isOpen) return;

    updatePopupDockState?.(popupId, { isLocked });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isLocked, isManagedByLayout, popupId]);

  // Clear persistOpen and isDocked when popup closes while not pinned
  useEffect(() => {
    if (isOpen) return;

    // Popup is closing, check if it should persist
    if (isManagedByLayout && !isPinnedRef.current) {
      // Clear both persistOpen and isDocked so popup doesn't auto-reopen or auto-redock
      updatePopupDockState?.(popupId, { persistOpen: false, isDocked: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, popupId]);

  // Add to floating panels when popup opens in layout mode
  useEffect(() => {
    if (!isOpen || !isManagedByLayout || addedToFloatingRef.current) return;

    addedToFloatingRef.current = true;

    // Check if already docked - don't add to floating panels
    const dockedIn = findPanelDock?.(popupId);
    if (dockedIn) return;

    // Get saved state to check if popup should be restored to a dock
    const savedState = getPopupDockState?.(popupId);

    // If popup was previously docked, restore it to the dock
    // This handles the case where the popup was removed from docks during page reload cleanup
    // but should be restored because it was pinned/persisted
    if (savedState?.isDocked && savedState.dockPosition && dockPopup) {
      dockPopup(popupId, savedState.dockPosition, savedState.dockOrder ?? 0);
      return;
    }

    // Check if already in floating panels
    const existing = findFloatingPanel?.(popupId);
    if (existing) return;

    // Get saved floating state - only use if user has explicitly modified position/size
    const savedFloating = savedState?.userModifiedPosition ? savedState.floatingState : null;
    // Use a default width if not specified (for auto-sizing popups)
    const effectiveInitialWidth = initialWidth ?? 500;
    // For auto-height popups, position near top of screen
    const initialY = initialHeight !== undefined
      ? Math.max(16, (window.innerHeight - initialHeight) / 2)
      : Math.max(16, window.innerHeight * 0.1);
    const floatingState: FloatingPanelState = savedFloating
      ? {
          id: popupId,
          x: savedFloating.x,
          y: savedFloating.y,
          width: savedFloating.width,
          height: savedFloating.height,
        }
      : {
          id: popupId,
          x: Math.max(16, (window.innerWidth - effectiveInitialWidth) / 2),
          y: initialY,
          width: effectiveInitialWidth,
          height: initialHeight,
        };

    addPopupFloating?.(popupId, floatingState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isManagedByLayout, popupId]);

  // Helper function for cleanup (used both on isOpen=false and on unmount)
  const cleanupPopup = useCallback(() => {
    addedToFloatingRef.current = false;

    // Save current floating state before removing
    if (isManagedByLayout) {
      const current = findFloatingPanel?.(popupId);
      if (current) {
        updatePopupDockState?.(popupId, {
          floatingState: {
            x: current.x,
            y: current.y,
            width: current.width,
            height: current.height,
          },
        });
      }
      removePopupFloating?.(popupId);
      // Also remove from dock if it was docked
      removePopupFromDock?.(popupId);
    }
  }, [isManagedByLayout, findFloatingPanel, popupId, updatePopupDockState, removePopupFloating, removePopupFromDock]);

  // Remove from floating panels and docks when popup closes
  useEffect(() => {
    if (isOpen) return;
    cleanupPopup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, popupId]);

  // Cleanup on unmount (handles plugin popups that unmount while isOpen=true)
  useEffect(() => {
    return () => {
      // Only cleanup if we were managed by layout and still considered "open"
      // (i.e., component unmounting without isOpen becoming false)
      if (isManagedByLayout) {
        removePopupFloating?.(popupId);
        removePopupFromDock?.(popupId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popupId, isManagedByLayout]);

  // Save floating state periodically when position/size changes (for persistence)
  useEffect(() => {
    if (!isOpen || !isManagedByLayout) return;

    const saveInterval = setInterval(() => {
      const current = findFloatingPanel?.(popupId);
      if (!current) return;

      const last = lastSavedFloatingRef.current;
      if (last &&
          last.x === current.x &&
          last.y === current.y &&
          last.width === current.width &&
          last.height === current.height) {
        return;
      }

      lastSavedFloatingRef.current = { x: current.x, y: current.y, width: current.width, height: current.height };
      updatePopupDockState?.(popupId, {
        floatingState: {
          x: current.x,
          y: current.y,
          width: current.width,
          height: current.height,
        },
      });
    }, 1000);

    return () => clearInterval(saveInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isManagedByLayout, popupId]);

  // Handle outside click to close (when layout mode is ON and floating)
  useEffect(() => {
    if (!isOpen || !isManagedByLayout) return;

    const handlePointerDown = (event: PointerEvent) => {
      // Don't close if pinned
      if (isPinnedRef.current) return;

      // Check if popup is docked - docked popups shouldn't close on outside click
      // This check is inside the handler to handle dynamic dock state changes
      const dockedIn = findPanelDock?.(popupId);
      if (dockedIn) return;

      const target = event.target as Element | null;
      if (!target) return;

      // Check if click is inside any popup panel (floating or docked) or context menu
      const floatingPopup = target.closest('.floating-panel--popup');
      const dockedPopup = target.closest('.docked-panel--popup');
      const contextMenu = target.closest('#context-menu');
      if (floatingPopup || dockedPopup || contextMenu) return;

      // Click was outside all popup panels, close this popup
      onCloseRef.current();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen, isManagedByLayout, popupId, findPanelDock]);

  // Handle Escape key to close (when layout mode is ON and floating)
  useEffect(() => {
    if (!isOpen || !isManagedByLayout) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      // Don't close if pinned
      if (isPinnedRef.current) return;

      // Check if popup is docked - docked popups shouldn't close on Escape
      // This check is inside the handler to handle dynamic dock state changes
      const dockedIn = findPanelDock?.(popupId);
      if (dockedIn) return;

      event.preventDefault();
      onCloseRef.current();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isManagedByLayout, popupId, findPanelDock]);

  return {
    isLayoutMode,
    isManagedByLayout,
  };
}
