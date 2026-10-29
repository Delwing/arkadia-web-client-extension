import { useEffect, useRef } from 'react';
import type { MovableHost } from './movableHost';
import { LayoutProvider } from './LayoutContext';
import { LayoutContent } from './LayoutContent';
import { setPopupPortalContainer } from './popupPortal';
import { PluginPopupRenderer } from './pluginPopupRenderer';
import { POPUP_CATALOG } from '../popups/popupCatalog';
// Non-catalog popups: they don't use the shared popupRegistry/DockablePopupWrapper
// (own chrome, portal to body) or are multi-instance — mounted directly here.
import LetterComposer from '../LetterComposer';
import StaticMapPopupManager from '../StaticMapPopup';
import TransportDebugPopup from '../TransportDebugPopup';

interface LayoutManagerWrapperProps {
  /** The map's drawing surface (#map), shown by the map panel while it is open. */
  mapHost: MovableHost | null;
  /** Kondycje (#objects-list), shown by its panel while it is open. */
  objectListHost: MovableHost | null;
  /** The non-team objects window (#objects-list-others). */
  objectListOthersHost?: MovableHost | null;
  onLayoutModeChange?: (enabled: boolean) => void;
}

/**
 * Portal container for plugin popups - mounted inside LayoutProvider
 * so plugin popups can access LayoutContext for docking support.
 */
function PopupPortalContainer() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      setPopupPortalContainer(containerRef.current);
    }
    return () => {
      setPopupPortalContainer(null);
    };
  }, []);

  return <div ref={containerRef} id="plugin-popup-portal" />;
}

export function LayoutManagerWrapper({
  mapHost,
  objectListHost,
  objectListOthersHost,
  onLayoutModeChange,
}: LayoutManagerWrapperProps) {
  return (
    <LayoutProvider onLayoutModeChange={onLayoutModeChange}>
      <LayoutContent
        mapHost={mapHost}
        objectListHost={objectListHost}
        objectListOthersHost={objectListOthersHost}
      />
      {/* The standard dockable popups (POPUP_CATALOG). */}
      {POPUP_CATALOG.map(({ id, Component }) => (
        <Component key={id} />
      ))}
      {/* Non-catalog popups (own chrome / multi-instance) */}
      <LetterComposer />
      <TransportDebugPopup />
      <StaticMapPopupManager />
      {/* Plugin popups - rendered inside LayoutProvider for docking support */}
      <PluginPopupRenderer />
      {/* Portal container for plugin popups (legacy fallback) */}
      <PopupPortalContainer />
    </LayoutProvider>
  );
}
