import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { PopupPanelConfig, PopupType } from '../types';
import { useLayoutManagerOptional } from './useLayoutManager';
import {
  registerPopup,
  unregisterPopup,
  updatePopup,
} from '../popupRegistry';
import { windowManager } from '../WindowManager';

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
  /** Class applied to the outer shell — used for popup-specific styling
   *  hooks like ".contracts-window". Distinct from bodyClassName which
   *  styles only the inner body. */
  panelClassName?: string;
  bodyClassName?: string;
  /** Increments when the user clicks the reset button — triggers geometry reset. */
  resetCounter?: number;
  /** If true, popup will not be managed by the layout manager. */
  disableLayoutManagement?: boolean;
}

export interface UseDockablePopupReturn {
  isLayoutMode: boolean;
  isManagedByLayout: boolean;
}

/**
 * Registers a popup with the popupRegistry and synchronizes its open/close
 * lifecycle with the WindowManager. Geometry handling, dock placement, and
 * drag/dock interactions all live in the WindowManager — this hook just
 * mirrors the popup's external state into both registries.
 */
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
  initialWidth,
  initialHeight,
  renderContent,
  headerActions,
  panelClassName,
  bodyClassName,
  resetCounter = 0,
  disableLayoutManagement = false,
}: UseDockablePopupOptions): UseDockablePopupReturn {
  const layoutContext = useLayoutManagerOptional();
  const isLayoutMode = layoutContext?.isLayoutMode ?? false;
  const isManagedByLayout =
    layoutContext !== null && !disableLayoutManagement;
  // Bumps when WindowManager.loadState fires (Restore Default, settings
  // import). Force the register effect to re-fire so manager.open is called
  // again — otherwise the popup is "open" in React but missing from the
  // freshly-reset live windows map.
  const loadVersion = layoutContext?.loadVersion ?? 0;

  // Refs to keep registry callbacks current without re-registering.
  const renderContentRef = useRef(renderContent);
  const headerActionsRef = useRef(headerActions);
  const onCloseRef = useRef(onClose);
  const onPinnedChangeRef = useRef(onPinnedChange);
  const onLockedChangeRef = useRef(onLockedChange);
  const onResetRef = useRef(onReset);
  const isPinnedRef = useRef(isPinned);
  const isLockedRef = useRef(isLocked);

  renderContentRef.current = renderContent;
  headerActionsRef.current = headerActions;
  onCloseRef.current = onClose;
  onPinnedChangeRef.current = onPinnedChange;
  onLockedChangeRef.current = onLockedChange;
  onResetRef.current = onReset;
  isPinnedRef.current = isPinned;
  isLockedRef.current = isLocked;

  // ── Register / unregister with popupRegistry + WindowManager ───────────
  useEffect(() => {
    if (!isOpen) {
      unregisterPopup(popupId);
      if (isManagedByLayout) windowManager.close(popupId);
      return;
    }

    const config: PopupPanelConfig = {
      id: popupId,
      title,
      closable: true,
      type: 'popup',
      popupType,
      initialWidth: initialWidth ?? 360,
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
      panelClassName,
    });

    if (isManagedByLayout) {
      // Compute a sensible centered initial position if no hint exists.
      const effectiveWidth = initialWidth ?? 360;
      const initialY =
        initialHeight !== undefined
          ? Math.max(16, (window.innerHeight - initialHeight) / 2)
          : Math.max(16, window.innerHeight * 0.1);
      windowManager.open(popupId, {
        title,
        x: Math.max(16, (window.innerWidth - effectiveWidth) / 2),
        y: initialY,
        width: effectiveWidth,
        height: initialHeight,
        isPinned: isPinnedRef.current,
        isLocked: isLockedRef.current,
      });
    }

    return () => {
      unregisterPopup(popupId);
      if (isManagedByLayout) windowManager.close(popupId);
    };
  }, [
    isOpen,
    isManagedByLayout,
    popupId,
    title,
    popupType,
    initialWidth,
    initialHeight,
    minWidth,
    minHeight,
    panelClassName,
    bodyClassName,
    loadVersion,
  ]);

  // ── Sync mutable fields ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    updatePopup(popupId, { isPinned });
    if (isManagedByLayout) windowManager.setPinned(popupId, isPinned);
  }, [isOpen, isManagedByLayout, popupId, isPinned]);

  useEffect(() => {
    if (!isOpen) return;
    updatePopup(popupId, { isLocked });
    if (isManagedByLayout) windowManager.setLocked(popupId, isLocked);
  }, [isOpen, isManagedByLayout, popupId, isLocked]);

  useEffect(() => {
    if (!isOpen) return;
    updatePopup(popupId, { headerActions });
  }, [isOpen, popupId, headerActions]);

  useEffect(() => {
    if (!isOpen) return;
    if (isManagedByLayout) windowManager.setTitle(popupId, title);
  }, [isOpen, isManagedByLayout, popupId, title]);

  // ── persistOpen tracking (so we can restore on reload) ──────────────────
  useEffect(() => {
    if (!isManagedByLayout || !isOpen) return;
    windowManager.updatePopupDockState(popupId, { persistOpen: isPinned });
  }, [isOpen, isPinned, isManagedByLayout, popupId]);

  useEffect(() => {
    if (!isManagedByLayout || !isOpen) return;
    windowManager.updatePopupDockState(popupId, { isLocked });
  }, [isOpen, isLocked, isManagedByLayout, popupId]);

  useEffect(() => {
    if (isOpen) return;
    if (isManagedByLayout && !isPinnedRef.current) {
      windowManager.updatePopupDockState(popupId, {
        persistOpen: false,
        isDocked: false,
      });
      // Purge the window hint too — otherwise its preserved `docked` field
      // makes shouldPopupAutoOpen return true on next page load and the
      // popup we just closed reappears.
      windowManager.purgeWindowHint(popupId);
    }
  }, [isOpen, isManagedByLayout, popupId]);

  // ── Reset geometry (size + position) when the user clicks the reset button ─
  const lastResetRef = useRef(resetCounter);
  useEffect(() => {
    if (!isOpen || !isManagedByLayout) return;
    if (resetCounter === lastResetRef.current) return;
    lastResetRef.current = resetCounter;

    const effectiveWidth = initialWidth ?? 360;
    const newX = Math.max(16, (window.innerWidth - effectiveWidth) / 2);
    const newY =
      initialHeight !== undefined
        ? Math.max(16, (window.innerHeight - initialHeight) / 2)
        : Math.max(16, window.innerHeight * 0.1);

    const w = windowManager.get(popupId);
    if (!w) return;

    if (w.docked) {
      windowManager.undock(popupId, effectiveWidth, initialHeight, newX, newY);
    } else {
      windowManager.patch(popupId, {
        x: newX,
        y: newY,
        width: effectiveWidth,
        height: initialHeight,
      });
    }
  }, [resetCounter, isOpen, isManagedByLayout, popupId, initialWidth, initialHeight]);

  // ── Outside click + Escape closes (layout mode on, floating popups only) ─
  useEffect(() => {
    if (!isOpen || !isManagedByLayout) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (isPinnedRef.current) return;
      const dockedIn = windowManager.findPanelDock(popupId);
      if (dockedIn) return;
      const target = event.target as Element | null;
      if (!target) return;
      const floatingPopup = target.closest('.floating-panel--popup');
      const dockedPopup = target.closest('.docked-panel--popup');
      const contextMenu = target.closest('#context-menu');
      // Overlays a popup portals to document.body (e.g. the oswajanie link
      // menu) opt out of the outside-click close via this attribute.
      const popupOverlay = target.closest('[data-popup-overlay]');
      if (floatingPopup || dockedPopup || contextMenu || popupOverlay) return;
      onCloseRef.current();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isPinnedRef.current) return;
      if (windowManager.findPanelDock(popupId)) return;
      event.preventDefault();
      onCloseRef.current();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isManagedByLayout, popupId]);

  return { isLayoutMode, isManagedByLayout };
}
