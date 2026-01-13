import { ReactNode, useCallback } from 'react';
import { PanelId, PANEL_CONFIGS } from '../types';
import { useDockablePanel } from '@web/layout';
import { useLayoutManager } from '@web/layout';

interface DockedPanelProps {
  panelId: PanelId;
  children: ReactNode;
  style?: React.CSSProperties;
  // Popup-specific props
  title?: string;
  onClose?: () => void;
  onPin?: () => void;
  isPinned?: boolean;
  onLock?: () => void;
  isLocked?: boolean;
  onReset?: () => void;
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
  onLock,
  isLocked,
  onReset,
  headerActions,
  isPopup,
}: DockedPanelProps) {
  const { handleDragStart } = useDockablePanel({ panelId });
  const { getBuiltInPanelState } = useLayoutManager();
  const config = PANEL_CONFIGS[panelId];
  const isBuiltIn = panelId === 'map' || panelId === 'objectList';
  const builtInState = isBuiltIn ? getBuiltInPanelState(panelId) : undefined;

  // Get title - built-in panels can have dynamic title via builtInState
  const title = builtInState?.title ?? titleProp ?? config?.title ?? panelId;
  const closable = isPopup || config?.closable !== false;

  // Wrap drag start to check for locked state
  const handleDragStartWrapper = useCallback(
    (e: React.PointerEvent) => {
      if (isLocked) return;
      handleDragStart(e);
    },
    [handleDragStart, isLocked]
  );

  const panelClassName = isPopup
    ? `managed-panel docked-panel docked-panel--${panelId} docked-panel--popup${isLocked ? ' managed-panel--locked docked-panel--locked' : ''}`
    : `managed-panel docked-panel docked-panel--${panelId}${isLocked ? ' managed-panel--locked docked-panel--locked' : ''}`;

  return (
    <div className={panelClassName} style={style} data-panel-id={panelId}>
      <div
        className={`managed-panel__header docked-panel__header${isLocked ? ' docked-panel__header--locked' : ''}`}
        onPointerDown={handleDragStartWrapper}
      >
        <span className="managed-panel__title docked-panel__title">{title}</span>
        {(headerActions || onReset || onLock || onPin || (closable && onClose)) && (
          <div
            className="managed-panel__header-actions docked-panel__header-actions"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {headerActions}
            {onReset && (
              <button
                type="button"
                className="panel-button panel-button--reset docked-panel__reset-btn"
                onClick={onReset}
                title="Przywroc domyslna pozycje i rozmiar"
              />
            )}
            {onLock && (
              <button
                type="button"
                className={`panel-button panel-button--lock docked-panel__lock-btn${isLocked ? ' is-active docked-panel__lock-btn--active' : ''}`}
                onClick={onLock}
                title={isLocked ? 'Odblokuj okno' : 'Zablokuj okno'}
              />
            )}
            {onPin && (
              <button
                type="button"
                className={`panel-button panel-button--pin docked-panel__pin-btn${isPinned ? ' is-active docked-panel__pin-btn--active' : ''}`}
                onClick={onPin}
                title={isPinned ? 'Odepnij okno' : 'Przypnij okno'}
              />
            )}
            {closable && onClose && (
              <button
                type="button"
                className="panel-button panel-button--close docked-panel__close-btn"
                onClick={onClose}
                title="Zamknij"
              />
            )}
          </div>
        )}
      </div>
      <div className="managed-panel__content docked-panel__content">{children}</div>
    </div>
  );
}
