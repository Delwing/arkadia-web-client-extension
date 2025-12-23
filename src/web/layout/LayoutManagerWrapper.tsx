import { LayoutProvider } from './LayoutContext';
import { LayoutContent } from './LayoutContent';
import ClockPopup from '../ClockPopup';
import ContractsPopup from '../ContractsPopup';
import LetterComposer from '../LetterComposer';
import HerbManager from '../herbs/HerbManager';
import KnowledgeReport from '../KnowledgeReport';
import KnowledgeDetailsReport from '../KnowledgeDetailsReport';
import ChatPopup from '../ChatPopup';
import CombatPopup from '../CombatPopup';

interface LayoutManagerWrapperProps {
  mapElement: HTMLElement | null;
  objectListElement: HTMLElement | null;
  onLayoutModeChange?: (enabled: boolean) => void;
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
      <LetterComposer />
      <HerbManager />
      <KnowledgeReport />
      <KnowledgeDetailsReport />
      <ChatPopup />
      <CombatPopup />
    </LayoutProvider>
  );
}
