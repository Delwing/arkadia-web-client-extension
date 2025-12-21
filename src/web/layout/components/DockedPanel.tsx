import { ReactNode } from 'react';
import { PanelId, PANEL_CONFIGS } from '../types';
import { useDockablePanel } from '../hooks/useDockablePanel';

interface DockedPanelProps {
  panelId: PanelId;
  children: ReactNode;
  style?: React.CSSProperties;
  // Popup-specific props
  title?: string;
  onClose?: () => void;
  onPin?: () => void;
  isPinned?: boolean;
  headerActions?: ReactNode;
  isPopup?: boolean;
}

export function DockedPanel({
  panelId,
  children,
  style,
  title: titleProp,
  onClose,
  onPin,
  isPinned,
  headerActions,
  isPopup,
}: DockedPanelProps) {
  const { handleDragStart } = useDockablePanel({ panelId });
  const config = PANEL_CONFIGS[panelId];
  const title = titleProp ?? config?.title ?? panelId;
  const closable = isPopup || config?.closable !== false;

  const panelClassName = isPopup
    ? `docked-panel docked-panel--${panelId} docked-panel--popup`
    : `docked-panel docked-panel--${panelId}`;

  return (
    <div className={panelClassName} style={style}>
      <div className="docked-panel__header" onPointerDown={handleDragStart}>
        <span className="docked-panel__title">{title}</span>
        {(headerActions || onPin || (closable && onClose)) && (
          <div
            className="docked-panel__header-actions"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {headerActions}
            {onPin && (
              <button
                type="button"
                className={`docked-panel__pin-btn${isPinned ? ' docked-panel__pin-btn--active' : ''}`}
                onClick={onPin}
                title={isPinned ? 'Odepnij okno' : 'Przypnij okno'}
              />
            )}
            {closable && onClose && (
              <button
                type="button"
                className="docked-panel__close-btn"
                onClick={onClose}
                title="Zamknij"
              />
            )}
          </div>
        )}
      </div>
      <div className="docked-panel__content">{children}</div>
    </div>
  );
}
