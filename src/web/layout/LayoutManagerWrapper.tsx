import { useEffect, useRef } from 'react';
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
  mapElement: HTMLElement | null;
  objectListElement: HTMLElement | null;
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
  mapElement,
  objectListElement,
  onLayoutModeChange,
}: LayoutManagerWrapperProps) {
  return (
    <LayoutProvider onLayoutModeChange={onLayoutModeChange}>
      <LayoutContent
        mapElement={mapElement}
        objectListElement={objectListElement}
      />
      {/* Standard dockable popups — single source of truth shared with forge-ui */}
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
