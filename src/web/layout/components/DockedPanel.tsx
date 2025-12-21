import { ReactNode } from 'react';
import { PanelId, PANEL_CONFIGS } from '../types';
import { useDockablePanel } from '../hooks/useDockablePanel';

interface DockedPanelProps {
  panelId: PanelId;
  children: ReactNode;
  style?: React.CSSProperties;
}

export function DockedPanel({ panelId, children, style }: DockedPanelProps) {
  const { handleDragStart } = useDockablePanel({ panelId });
  const config = PANEL_CONFIGS[panelId];
  const title = config?.title ?? panelId;

  return (
    <div className={`docked-panel docked-panel--${panelId}`} style={style}>
      <div className="docked-panel__header" onPointerDown={handleDragStart}>
        <span className="docked-panel__title">{title}</span>
      </div>
      <div className="docked-panel__content">{children}</div>
    </div>
  );
}
