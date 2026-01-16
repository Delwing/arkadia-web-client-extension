/**
 * Plugin Popup Renderer - Renders plugin popups within the main React tree
 *
 * This ensures plugin popups have proper access to LayoutContext for docking support.
 * Instead of creating separate React roots (which breaks context inheritance),
 * plugin popups register their configs here and this component renders them.
 *
 * Design: Registration is separate from opening. When a popup is registered,
 * this component checks shouldPopupAutoOpen to decide if it should be opened
 * automatically (for restoring docked/pinned popups on page reload).
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { DockablePopupWrapper } from './components/DockablePopupWrapper';
import { getPopupLockedState, shouldPopupAutoOpen } from './utils/layoutStorage';
import {
  getOpenPluginPopups,
  getPluginPopups,
  openPluginPopup,
  subscribeToPluginPopups,
  type PluginPopupConfig,
} from './pluginPopupRegistry';

// Compute viewport-aware initial width for plugin popups
function getInitialPopupWidth(): number {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 800;
  // Use 50% of viewport width, clamped between 350 and 700
  return Math.min(700, Math.max(350, Math.floor(viewportWidth * 0.5)));
}

// Compute viewport-aware initial height for plugin popups
function getInitialPopupHeight(): number {
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 600;
  // Use 40% of viewport height, clamped between 250 and 500
  return Math.min(500, Math.max(250, Math.floor(viewportHeight * 0.4)));
}

/**
 * Individual plugin popup component that wraps DockablePopupWrapper.
 */
function PluginPopupItem({ config }: { config: PluginPopupConfig }) {
  const [title, setTitle] = useState(config.title);
  const [body, setBody] = useState<string | Node | React.ReactNode>(config.body);
  const [isPinned, setIsPinned] = useState(config.isPinned);
  const [isLocked, setIsLocked] = useState(() => getPopupLockedState(config.popupId));
  const [resetCounter, setResetCounter] = useState(0);
  const onPanelRefCalled = useRef(false);
  // Compute initial dimensions once on mount
  const [initialWidth] = useState(getInitialPopupWidth);
  const [initialHeight] = useState(getInitialPopupHeight);

  // Store callbacks in refs to avoid stale closures and dependency issues
  const onCloseRef = useRef(config.onClose);
  const onPinnedChangeRef = useRef(config.onPinnedChange);
  const onLockedChangeRef = useRef(config.onLockedChange);
  const onPanelRefRef = useRef(config.onPanelRef);

  // Update refs when config changes
  useEffect(() => {
    onCloseRef.current = config.onClose;
    onPinnedChangeRef.current = config.onPinnedChange;
    onLockedChangeRef.current = config.onLockedChange;
    onPanelRefRef.current = config.onPanelRef;
  }, [config.onClose, config.onPinnedChange, config.onLockedChange, config.onPanelRef]);

  // Sync with config updates
  useEffect(() => {
    setTitle(config.title);
    setBody(config.body);
    setIsPinned(config.isPinned);
  }, [config.title, config.body, config.isPinned]);

  const handlePinnedChange = useCallback((pinned: boolean) => {
    setIsPinned(pinned);
    onPinnedChangeRef.current(pinned);
  }, []);

  const handleLockedChange = useCallback((locked: boolean) => {
    setIsLocked(locked);
    onLockedChangeRef.current?.(locked);
  }, []);

  const handleClose = useCallback(() => {
    onCloseRef.current();
  }, []);

  const handleReset = useCallback(() => {
    setResetCounter((c) => c + 1);
  }, []);

  // Report panel ref to parent using callback ref - only call once when first mounted
  const setContainerRef = useCallback((el: HTMLDivElement | null) => {
    if (el && !onPanelRefCalled.current) {
      onPanelRefCalled.current = true;
      onPanelRefRef.current?.(el);
    }
  }, []);

  return (
    <DockablePopupWrapper
      popupId={config.popupId}
      popupType={config.popupType}
      title={title}
      isOpen={true}
      isPinned={isPinned}
      isLocked={isLocked}
      onClose={handleClose}
      onPinnedChange={handlePinnedChange}
      onLockedChange={handleLockedChange}
      onReset={handleReset}
      resetCounter={resetCounter}
      minWidth={300}
      minHeight={150}
      initialWidth={initialWidth}
      initialHeight={initialHeight}
      className="plugin-window"
      bodyClassName="plugin-window-body"
    >
      <div ref={setContainerRef}>
        {typeof body === 'string' ? (
          <div dangerouslySetInnerHTML={{ __html: body }} />
        ) : body instanceof Node ? (
          <BodyNodeRenderer node={body} />
        ) : (
          body
        )}
      </div>
    </DockablePopupWrapper>
  );
}

/**
 * Renders a DOM Node as React content.
 */
function BodyNodeRenderer({ node }: { node: Node }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && node instanceof Node) {
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(node);
    }
  }, [node]);

  return <div ref={containerRef} />;
}

/**
 * Component that renders all registered plugin popups.
 * Must be placed inside LayoutProvider to have proper context access.
 *
 * This component also handles auto-opening popups that should be restored
 * (based on persisted docked/pinned state).
 */
export function PluginPopupRenderer() {
  const [openPopups, setOpenPopups] = useState<PluginPopupConfig[]>(() => getOpenPluginPopups());
  // Track which popups we've already checked for auto-open
  const checkedPopupsRef = useRef(new Set<string>());

  useEffect(() => {
    // Function to check newly registered popups for auto-open
    const checkForAutoOpen = () => {
      const allPopups = getPluginPopups();

      for (const popup of allPopups) {
        // Skip if we've already checked this popup
        if (checkedPopupsRef.current.has(popup.popupId)) continue;
        checkedPopupsRef.current.add(popup.popupId);

        // Check if this popup should be auto-opened (was docked/pinned)
        if (!popup.isOpen && shouldPopupAutoOpen(popup.popupId)) {
          // Auto-open the popup
          openPluginPopup(popup.popupId);
        }
      }

      // Update the list of open popups
      setOpenPopups(getOpenPluginPopups());
    };

    // Check on mount
    checkForAutoOpen();

    // Subscribe to registry changes
    return subscribeToPluginPopups(() => {
      checkForAutoOpen();
    });
  }, []);

  return (
    <>
      {openPopups.map(config => (
        <PluginPopupItem key={config.popupId} config={config} />
      ))}
    </>
  );
}
