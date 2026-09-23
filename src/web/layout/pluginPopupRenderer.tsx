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
import eventBus from '@modules/core/eventBus';
import { windowManager } from './WindowManager';
import {
  POPUP_MIN_HEIGHT,
  POPUP_MIN_WIDTH,
  centeredPopupOffset,
  getInitialPopupSize,
  measurePopupContent,
} from './utils/popupSize';

// Frames to wait for the floating shell to mount before giving up on a fit.
const FIT_FRAME_LIMIT = 60;

/**
 * Individual plugin popup component that wraps DockablePopupWrapper.
 */
function PluginPopupItem({ config }: { config: PluginPopupConfig }) {
  const [title, setTitle] = useState(config.title);
  const [body, setBody] = useState<string | Node | React.ReactNode>(config.body);
  const [headerActions, setHeaderActions] = useState<Node | React.ReactNode>(config.headerActions);
  const [isPinned, setIsPinned] = useState(config.isPinned);
  const [isLocked, setIsLocked] = useState(() => getPopupLockedState(config.popupId));
  const [resetCounter, setResetCounter] = useState(0);
  const onPanelRefCalled = useRef(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  // Compute initial dimensions once on mount
  const [initialSize] = useState(() => getInitialPopupSize(config));
  const fitsContent = initialSize.fitWidth || initialSize.fitHeight;
  // Fit to content only where the popup takes its starting size: a fresh
  // open (read before the wrapper's effect opens the window) or a reset.
  const [fitOnOpen] = useState(() => fitsContent && !windowManager.hasStoredGeometry(config.popupId));
  const fitPendingRef = useRef(fitOnOpen);

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
    setHeaderActions(config.headerActions);
    setIsPinned(config.isPinned);
  }, [config.title, config.body, config.headerActions, config.isPinned]);

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
    fitPendingRef.current = fitsContent;
    setResetCounter((c) => c + 1);
  }, [fitsContent]);

  // Size a 'content' popup to its content once the floating shell is up (the
  // window manager renders it a frame or more after the open).
  useEffect(() => {
    if (!fitPendingRef.current || body === undefined) return;
    const popupId = config.popupId;
    let frame = 0;
    let frames = 0;
    const fit = () => {
      const panel = contentRef.current?.closest<HTMLElement>('.floating-panel');
      if (!panel) {
        if (++frames < FIT_FRAME_LIMIT) frame = requestAnimationFrame(fit);
        return;
      }
      fitPendingRef.current = false;
      const w = windowManager.get(popupId);
      if (!w || w.docked || w.poppedOut) return;
      const measured = measurePopupContent(panel, initialSize.fitWidth, POPUP_MIN_WIDTH);
      const height = Math.min(initialSize.height ?? measured.height, window.innerHeight);
      windowManager.patch(popupId, {
        x: centeredPopupOffset(measured.width, 'width'),
        y: centeredPopupOffset(height, 'height'),
        width: measured.width,
      });
    };
    frame = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(frame);
  }, [body, resetCounter, config.popupId, initialSize]);

  // Report panel ref to parent using callback ref - only call once when first mounted
  const setContainerRef = useCallback((el: HTMLDivElement | null) => {
    contentRef.current = el;
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
      minWidth={POPUP_MIN_WIDTH}
      minHeight={POPUP_MIN_HEIGHT}
      initialWidth={initialSize.width}
      initialHeight={initialSize.height}
      className="plugin-window"
      bodyClassName="plugin-window-body"
      headerActions={headerActions instanceof Node ? <NodeRenderer node={headerActions} /> : headerActions}
    >
      <div ref={setContainerRef} className="plugin-popup-content">
        {typeof body === 'string' ? (
          <div className="plugin-popup-content__body" dangerouslySetInnerHTML={{ __html: body }} />
        ) : body instanceof Node ? (
          <NodeRenderer node={body} />
        ) : (
          <div className="plugin-popup-content__body">{body}</div>
        )}
      </div>
    </DockablePopupWrapper>
  );
}

/**
 * Renders a DOM Node as React content.
 */
function NodeRenderer({ node }: { node: Node }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && node instanceof Node) {
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(node);
    }
  }, [node]);

  return <div ref={containerRef} className="plugin-popup-content__body" />;
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
    const checkForAutoOpen = (forceRecheck = false) => {
      const allPopups = getPluginPopups();

      for (const popup of allPopups) {
        // Skip if we've already checked this popup (unless force rechecking)
        if (!forceRecheck && checkedPopupsRef.current.has(popup.popupId)) continue;
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
    const unsubscribeRegistry = subscribeToPluginPopups(() => {
      checkForAutoOpen();
    });

    // Listen for layout state imports (settings import from file/cloud/device)
    const unsubscribeLayout = eventBus.on('layoutManagerStateChanged', (data) => {
      if (data && typeof data === 'object' && 'type' in data && data.type === 'import') {
        // Re-check all popups since layout state was replaced by import
        checkForAutoOpen(true);
      }
    });

    return () => {
      unsubscribeRegistry();
      unsubscribeLayout();
    };
  }, []);

  return (
    <>
      {openPopups.map(config => (
        <PluginPopupItem key={config.popupId} config={config} />
      ))}
    </>
  );
}
