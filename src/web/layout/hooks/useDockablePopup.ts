import { useEffect, useRef } from 'react';
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
  onClose: () => void;
  onPinnedChange: (pinned: boolean) => void;
  minWidth?: number;
  minHeight?: number;
  initialWidth?: number;
  initialHeight?: number;
  renderContent: () => ReactNode;
  headerActions?: ReactNode;
  bodyClassName?: string;
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
  onClose,
  onPinnedChange,
  minWidth = 300,
  minHeight = 200,
  initialWidth = 350,
  initialHeight,
  renderContent,
  headerActions,
  bodyClassName,
}: UseDockablePopupOptions): UseDockablePopupReturn {
  // Use optional context - may be null if not inside LayoutProvider
  const layoutContext = useLayoutManagerOptional();

  // Extract values from context or use defaults
  const isLayoutMode = layoutContext?.isLayoutMode ?? false;
  const getPopupDockState = layoutContext?.getPopupDockState;
  const updatePopupDockState = layoutContext?.updatePopupDockState;
  const addPopupFloating = layoutContext?.addPopupFloating;
  const removePopupFloating = layoutContext?.removePopupFloating;
  const findFloatingPanel = layoutContext?.findFloatingPanel;
  const findPanelDock = layoutContext?.findPanelDock;

  // Track if we've added to floating panels for this open session
  const addedToFloatingRef = useRef(false);

  // Use refs to keep current values without triggering re-registration
  const renderContentRef = useRef(renderContent);
  const headerActionsRef = useRef(headerActions);
  const onCloseRef = useRef(onClose);
  const onPinnedChangeRef = useRef(onPinnedChange);
  const isPinnedRef = useRef(isPinned);

  // Update refs on each render
  renderContentRef.current = renderContent;
  headerActionsRef.current = headerActions;
  onCloseRef.current = onClose;
  onPinnedChangeRef.current = onPinnedChange;
  isPinnedRef.current = isPinned;

  // In layout mode, popup is managed by FloatingPanel
  const isManagedByLayout = isLayoutMode && layoutContext !== null;

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

  // Update headerActions in registry when it changes
  useEffect(() => {
    if (isOpen) {
      updatePopup(popupId, { headerActions });
    }
  }, [isOpen, popupId, headerActions]);

  // Update persistOpen when pinned state changes in layout mode
  useEffect(() => {
    if (!isManagedByLayout) return;

    if (isOpen && isPinned) {
      // Popup is pinned, persist it for reload
      updatePopupDockState?.(popupId, { persistOpen: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isPinned, isManagedByLayout, popupId]);

  // Clear persistOpen when popup closes while not pinned
  useEffect(() => {
    if (isOpen) return;

    // Popup is closing, check if it should persist
    if (isManagedByLayout && !isPinnedRef.current) {
      updatePopupDockState?.(popupId, { persistOpen: false });
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

    // Check if already in floating panels
    const existing = findFloatingPanel?.(popupId);
    if (existing) return;

    // Get saved floating state or calculate initial position
    const savedFloating = getPopupDockState?.(popupId)?.floatingState;
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
          x: Math.max(16, (window.innerWidth - initialWidth) / 2),
          y: initialY,
          width: initialWidth,
          height: initialHeight,
        };

    addPopupFloating?.(popupId, floatingState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isManagedByLayout, popupId]);

  // Remove from floating panels when popup closes
  useEffect(() => {
    if (isOpen) return;

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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, popupId]);

  // Save floating state periodically when position/size changes (for persistence)
  useEffect(() => {
    if (!isOpen || !isManagedByLayout) return;

    const saveInterval = setInterval(() => {
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
    }, 1000);

    return () => clearInterval(saveInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isManagedByLayout, popupId]);

  // Handle outside click to close (when layout mode is ON)
  useEffect(() => {
    if (!isOpen || !isManagedByLayout) return;

    const handlePointerDown = (event: PointerEvent) => {
      // Don't close if pinned
      if (isPinnedRef.current) return;

      const target = event.target as Element | null;
      if (!target) return;

      // Check if click is inside any floating-panel--popup
      const popupPanel = target.closest('.floating-panel--popup');
      if (popupPanel) return;

      // Click was outside all popup panels, close this popup
      onCloseRef.current();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen, isManagedByLayout]);

  // Handle Escape key to close (when layout mode is ON)
  useEffect(() => {
    if (!isOpen || !isManagedByLayout) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPinnedRef.current) {
        event.preventDefault();
        onCloseRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isManagedByLayout]);

  return {
    isLayoutMode,
    isManagedByLayout,
  };
}
