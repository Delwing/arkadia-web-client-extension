import { useEffect, useRef } from 'react';
import { LayoutProvider } from './LayoutContext';
import { LayoutContent } from './LayoutContent';
import { setPopupPortalContainer } from './popupPortal';
import { PluginPopupRenderer } from './pluginPopupRenderer';
import ClockPopup from '../ClockPopup';
import ContractsPopup from '../ContractsPopup';
import FishingPopup from '../FishingPopup';
import LetterComposer from '../LetterComposer';
import HerbManager from '../herbs/HerbManager';
import HerbTextWindow from '../herbs/HerbTextWindow';
import KnowledgeReport from '../KnowledgeReport';
import KnowledgeDetailsReport from '../KnowledgeDetailsReport';
import ChatPopup from '../ChatPopup';
import CombatPopup from '../CombatPopup';
import PostepyPopup from '../PostepyPopup';
import ZabiciPopup from '../ZabiciPopup';
import SkrotyPopup from '../SkrotyPopup';
import PeopleBrowser from '../PeopleBrowser/PeopleBrowser';
import ObjectListDemoPopup from '../ObjectListDemoPopup';
import WalkerPopup from '../WalkerPopup';
import PocztaPopup from '../PocztaPopup';
import LetterViewPopup from '../LetterViewPopup';

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
      {/* Popup components - rendered inside LayoutProvider for docking support */}
      <ClockPopup />
      <ContractsPopup />
      <FishingPopup />
      <LetterComposer />
      <HerbManager />
      <HerbTextWindow />
      <KnowledgeReport />
      <KnowledgeDetailsReport />
      <ChatPopup />
      <CombatPopup />
      <PostepyPopup />
      <ZabiciPopup />
      <SkrotyPopup />
      <PeopleBrowser />
      <ObjectListDemoPopup />
      <WalkerPopup />
      <PocztaPopup />
      <LetterViewPopup />
      {/* Plugin popups - rendered inside LayoutProvider for docking support */}
      <PluginPopupRenderer />
      {/* Portal container for plugin popups (legacy fallback) */}
      <PopupPortalContainer />
    </LayoutProvider>
  );
}
