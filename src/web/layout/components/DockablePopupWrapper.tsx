import { ReactNode, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDockablePopup } from '../hooks/useDockablePopup';
import { PopupType } from '../types';
import { refreshPopupContent } from '../popupRegistry';
import { windowManager } from '../WindowManager';

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
  /** Counter that triggers reset when incremented. */
  resetCounter?: number;
  children: ReactNode;
  headerActions?: ReactNode;
  minWidth?: number;
  minHeight?: number;
  initialWidth?: number;
  initialHeight?: number;
  className?: string;
  bodyClassName?: string;
  /** If true, popup will not be managed by the layout manager. */
  disableLayoutManagement?: boolean;
}

/**
 * DockablePopupWrapper — single source of truth for rendering a popup's
 * content into the WindowManager's portal target. The shell that displays
 * the popup (DockedPanel, TabContent, or FloatingPanel) attaches the portal
 * target div into its content slot. React content rendered here therefore
 * survives dock/undock/tab/split transitions without unmounting.
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
  // Hold children in a ref so the popup-registry render fn always returns
  // fresh content without re-registering.
  const childrenRef = useRef(children);
  childrenRef.current = children;
  const renderContent = useCallback(() => childrenRef.current, []);

  // Re-notify content subscribers when children change, in case a downstream
  // consumer re-reads via popupRegistry.
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (!isOpen) {
      firstRenderRef.current = true;
      return;
    }
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    refreshPopupContent(popupId);
  });

  useDockablePopup({
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
    panelClassName: className,
    bodyClassName,
    disableLayoutManagement,
    resetCounter,
  });

  if (!isOpen) return null;
  if (disableLayoutManagement) {
    // Legacy fallback — render inline. Used only when the consumer explicitly
    // opts out of layout management.
    return (
      <div className={`window-container plugin-window-container`}>
        <div className={`floating-window plugin-window ${className}`.trim()}>
          <div className={`window-body plugin-window-body ${bodyClassName}`}>
            {children}
          </div>
        </div>
      </div>
    );
  }

  // The popup-specific className is applied to the OUTER shell (DockedPanel /
  // FloatingPanel / tab content) via usePanelChrome, so per-popup CSS and
  // e2e selectors that target ".contracts-window" / ".loot-popup" find the
  // whole popup (header + body) rather than just the body.
  return createPortal(
    <div className={`dockable-popup-body ${bodyClassName}`.trim()}>
      {children}
    </div>,
    windowManager.getOrCreatePortalTarget(popupId)
  );
}

export default DockablePopupWrapper;
