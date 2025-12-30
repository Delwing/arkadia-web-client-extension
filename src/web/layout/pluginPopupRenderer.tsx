/**
 * Plugin Popup Renderer - Renders plugin popups within the main React tree
 *
 * This ensures plugin popups have proper access to LayoutContext for docking support.
 * Instead of creating separate React roots (which breaks context inheritance),
 * plugin popups register their configs here and this component renders them.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { DockablePopupWrapper } from './components/DockablePopupWrapper';
import type { PluginPopupType } from './types';
import { getPopupLockedState } from './utils/layoutStorage';

export interface PluginPopupConfig {
  popupId: string;
  popupType: PluginPopupType;
  title: string;
  body: string | Node;
  isPinned: boolean;
  onClose: () => void;
  onPinnedChange: (pinned: boolean) => void;
  onLockedChange?: (locked: boolean) => void;
  onPanelRef?: (element: HTMLDivElement | null) => void;
}

// Registry of active plugin popups
const pluginPopupRegistry = new Map<string, PluginPopupConfig>();
const listeners = new Set<() => void>();

function notifyListeners(): void {
  listeners.forEach(listener => {
    try {
      listener();
    } catch (e) {
      console.error('[PluginPopupRenderer] Listener error:', e);
    }
  });
}

/**
 * Register a plugin popup to be rendered within the main React tree.
 */
export function registerPluginPopup(config: PluginPopupConfig): void {
  pluginPopupRegistry.set(config.popupId, config);
  notifyListeners();
}

/**
 * Unregister a plugin popup.
 */
export function unregisterPluginPopup(popupId: string): void {
  if (pluginPopupRegistry.delete(popupId)) {
    notifyListeners();
  }
}

/**
 * Update a plugin popup's config.
 */
export function updatePluginPopup(popupId: string, updates: Partial<PluginPopupConfig>): void {
  const existing = pluginPopupRegistry.get(popupId);
  if (existing) {
    pluginPopupRegistry.set(popupId, { ...existing, ...updates });
    notifyListeners();
  }
}

/**
 * Get all registered plugin popups.
 */
export function getPluginPopups(): PluginPopupConfig[] {
  return Array.from(pluginPopupRegistry.values());
}

/**
 * Subscribe to registry changes.
 */
export function subscribeToPluginPopups(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Compute viewport-aware initial width for plugin popups
function getInitialPopupWidth(): number {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 800;
  // Use 50% of viewport width, clamped between 350 and 700
  return Math.min(700, Math.max(350, Math.floor(viewportWidth * 0.5)));
}

/**
 * Individual plugin popup component that wraps DockablePopupWrapper.
 */
function PluginPopupItem({ config }: { config: PluginPopupConfig }) {
  const [title, setTitle] = useState(config.title);
  const [body, setBody] = useState<string | Node>(config.body);
  const [isPinned, setIsPinned] = useState(config.isPinned);
  const [isLocked, setIsLocked] = useState(() => getPopupLockedState(config.popupId));
  const onPanelRefCalled = useRef(false);
  // Compute initial width once on mount
  const [initialWidth] = useState(getInitialPopupWidth);

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
      minWidth={300}
      minHeight={150}
      initialWidth={initialWidth}
      className="plugin-window"
      bodyClassName="plugin-window-body"
    >
      <div ref={setContainerRef}>
        {typeof body === 'string' ? (
          <div dangerouslySetInnerHTML={{ __html: body }} />
        ) : (
          <BodyNodeRenderer node={body} />
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
 */
export function PluginPopupRenderer() {
  const [popups, setPopups] = useState<PluginPopupConfig[]>(() => getPluginPopups());

  useEffect(() => {
    return subscribeToPluginPopups(() => {
      setPopups(getPluginPopups());
    });
  }, []);

  return (
    <>
      {popups.map(config => (
        <PluginPopupItem key={config.popupId} config={config} />
      ))}
    </>
  );
}
