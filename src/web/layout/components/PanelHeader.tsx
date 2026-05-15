import { ReactNode, useEffect, useState } from 'react';
import { PANEL_CONFIGS, WindowRecord } from '../types';
import { getPopup, RegisteredPopup, subscribeToRegistry } from '../popupRegistry';
import { useLayoutManager } from '../hooks/useLayoutManager';
import { MapHeaderMenu } from './MapHeaderMenu';
import { ObjectListHeaderActions } from './ObjectListHeaderActions';

/** Combined chrome state for a window — built from the popupRegistry, the
 *  built-in panel state, and the window record itself. */
export interface PanelChrome {
  title: string;
  isLocked: boolean;
  isPinned?: boolean;
  isPopup: boolean;
  closable: boolean;
  headerActions?: ReactNode;
  /** Popup-specific class applied to the outer shell wrapping this panel. */
  panelClassName?: string;
  onClose?: () => void;
  onPin?: () => void;
  onLock?: () => void;
  onReset?: () => void;
}

/** Subscribe to the popupRegistry for a single popup id. */
function usePopupInfo(panelId: string): RegisteredPopup | null {
  const [popup, setPopup] = useState<RegisteredPopup | null>(
    () => getPopup(panelId) ?? null
  );
  useEffect(() => {
    const sync = () => setPopup(getPopup(panelId) ?? null);
    sync();
    return subscribeToRegistry(sync);
  }, [panelId]);
  return popup;
}

export function usePanelChrome(window: WindowRecord): PanelChrome {
  const { getBuiltInPanelState, updateBuiltInPanelState } = useLayoutManager();
  const popup = usePopupInfo(window.id);
  const isBuiltIn = window.id === 'map' || window.id === 'objectList';
  const builtInState = isBuiltIn ? getBuiltInPanelState(window.id) : undefined;

  const config = PANEL_CONFIGS[window.id];
  const title =
    builtInState?.title ??
    popup?.config.title ??
    config?.title ??
    window.title ??
    window.id;

  const isPopup = popup != null;
  const isLocked = isPopup
    ? popup.isLocked
    : builtInState?.isLocked ?? false;

  const closable = isPopup || config?.closable !== false;

  const headerActions: ReactNode = isPopup
    ? popup.headerActions
    : window.id === 'map'
    ? <MapHeaderMenu />
    : window.id === 'objectList'
    ? <ObjectListHeaderActions />
    : undefined;

  return {
    title,
    isLocked,
    isPinned: popup?.isPinned,
    isPopup,
    closable,
    headerActions,
    panelClassName: popup?.panelClassName,
    onClose: popup?.onClose,
    onPin: popup ? () => popup.setIsPinned(!popup.isPinned) : undefined,
    onLock: popup
      ? () => popup.setIsLocked(!popup.isLocked)
      : isBuiltIn
      ? () => updateBuiltInPanelState(window.id, { isLocked: !builtInState?.isLocked })
      : undefined,
    onReset: popup?.onReset,
  };
}

interface PanelHeaderProps {
  chrome: PanelChrome;
  variant: 'docked' | 'floating';
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

/** Shared header chrome used by both DockedPanel and FloatingPanel. */
export function PanelHeader({ chrome, variant, onPointerDown, onContextMenu }: PanelHeaderProps) {
  const isDocked = variant === 'docked';
  const headerClass = isDocked
    ? `managed-panel__header docked-panel__header docked-panel-titlebar${chrome.isLocked ? ' docked-panel__header--locked' : ''}`
    : `managed-panel__header floating-panel__header script-window-titlebar${chrome.isLocked ? ' floating-panel__header--locked' : ''}`;

  const titleClass = isDocked
    ? 'managed-panel__title docked-panel__title docked-panel-title'
    : 'managed-panel__title floating-panel__title script-window-title window-header__title plugin-window-title';

  const actionsClass = isDocked
    ? 'managed-panel__header-actions docked-panel__header-actions'
    : 'managed-panel__header-actions floating-panel__header-actions';

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (chrome.isLocked) return;
    onPointerDown(e);
  };

  return (
    <div
      className={headerClass}
      onPointerDown={handlePointerDown}
      onContextMenu={onContextMenu}
    >
      <span className={titleClass}>{chrome.title}</span>
      {(chrome.headerActions ||
        chrome.onReset ||
        chrome.onLock ||
        chrome.onPin ||
        (chrome.closable && chrome.onClose)) && (
        <div className={actionsClass} onPointerDown={e => e.stopPropagation()}>
          {chrome.headerActions}
          {chrome.onReset && (
            <button
              type="button"
              className="panel-button panel-button--reset"
              onClick={chrome.onReset}
              title="Przywroc domyslna pozycje i rozmiar"
            />
          )}
          {chrome.onLock && (
            <button
              type="button"
              className={`panel-button panel-button--lock${chrome.isLocked ? ' is-active' : ''}`}
              onClick={chrome.onLock}
              title={chrome.isLocked ? 'Odblokuj okno' : 'Zablokuj okno'}
            />
          )}
          {chrome.onPin && (
            <button
              type="button"
              className={`panel-button panel-button--pin${chrome.isPinned ? ' is-active' : ''}`}
              onClick={chrome.onPin}
              title={chrome.isPinned ? 'Odepnij okno' : 'Przypnij okno'}
            />
          )}
          {chrome.closable && chrome.onClose && (
            <button
              type="button"
              className="panel-button panel-button--close"
              onClick={chrome.onClose}
              title="Zamknij"
            />
          )}
        </div>
      )}
    </div>
  );
}
