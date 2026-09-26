import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PANEL_CONFIGS, WindowRecord } from '../types';
import { getObjectListChrome } from '../builtInChrome';
import { getPopup, RegisteredPopup, subscribeToRegistry } from '../popupRegistry';
import { useLayoutManager } from '../hooks/useLayoutManager';
import { useWindowAppearance } from '../hooks/useWindowAppearance';
import type { WindowSettingField } from '../windowSettings';
import { MAP_SETTINGS_FIELDS } from '../mapSettingsFields';
import { MapHeaderMenu } from './MapHeaderMenu';
import { ObjectListHeaderActions } from './ObjectListHeaderActions';
import { WindowSettingsMenu } from './WindowSettingsMenu';

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
  /** Detach the panel into a separate browser window. Popups only. */
  onPopout?: () => void;
  /** Id the settings cog reads and writes; undefined when the window has no cog. */
  settingsWindowId?: string;
  /** The window's own fields in its settings cog. */
  settingsFields?: WindowSettingField[];
  /** Whether the cog offers the shared font fields (not for the map). */
  settingsAppearance?: boolean;
}

/** Windows with a settings cog: every popup plus the built-in Kondycje and map. */
function hasSettingsCog(windowId: string, isPopup: boolean): boolean {
  return isPopup || windowId === 'objectList' || windowId === 'map';
}

/** The map is a canvas, not text — its cog has only its own fields. */
function hasAppearanceSettings(windowId: string): boolean {
  return windowId !== 'map';
}

/** The settings cog for a window, or null when it has none. */
export function PanelSettingsButton({ chrome, small }: { chrome: PanelChrome; small?: boolean }) {
  if (!chrome.settingsWindowId) return null;
  return (
    <WindowSettingsMenu
      windowId={chrome.settingsWindowId}
      title={chrome.title}
      fields={chrome.settingsFields}
      appearance={chrome.settingsAppearance}
      small={small}
    />
  );
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
  const { manager, getBuiltInPanelState, updateBuiltInPanelState } = useLayoutManager();
  const popup = usePopupInfo(window.id);
  const isBuiltIn = window.id === 'map' || window.id === 'objectList';
  const builtInState = isBuiltIn ? getBuiltInPanelState(window.id) : undefined;

  // Shell-level chrome override for the built-in objectList (forge-ui retitles it
  // "W poblizu" and drops the stock actions). Process-local, never persisted.
  const objectListChrome =
    window.id === 'objectList' ? getObjectListChrome() : undefined;

  const config = PANEL_CONFIGS[window.id];
  const title =
    objectListChrome?.title ??
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

  const withSettings = hasSettingsCog(window.id, isPopup);
  const withAppearance = withSettings && hasAppearanceSettings(window.id);
  useWindowAppearance(window.id, withAppearance);

  const headerActions: ReactNode = isPopup
    ? popup.headerActions
    : window.id === 'map'
    ? <MapHeaderMenu />
    : window.id === 'objectList'
    ? (objectListChrome?.hideStockActions ? undefined : <ObjectListHeaderActions />)
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
    // Popout is offered for popups and the built-in panels (map, object list).
    // All of them render through the WindowManager's relocatable portal target,
    // so they can be moved into a separate browser window the same way.
    onPopout:
      isPopup || isBuiltIn
        ? () => manager.setPoppedOut(window.id, true)
        : undefined,
    settingsWindowId: withSettings ? window.id : undefined,
    settingsFields: window.id === 'map' ? MAP_SETTINGS_FIELDS : popup?.settingsFields,
    settingsAppearance: withAppearance,
  };
}

/** Title width still kept readable before the header gives up on one row. */
const MIN_TITLE_WIDTH = 120;

/**
 * Whether the header needs two rows: the title and window buttons on top, the
 * popup's own header actions below. That happens when all of it can't share
 * one row without squeezing the title below {@link MIN_TITLE_WIDTH} - on a
 * phone, say. The one-row width is measured while on one row and remembered,
 * so the header goes back as soon as the window is wide enough again.
 */
function useStackedHeader(
  headerRef: React.RefObject<HTMLDivElement | null>,
  actionsRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean
): boolean {
  const [stacked, setStacked] = useState(false);
  const stackedRef = useRef(false);
  const oneRowWidthRef = useRef(0);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const checkRef = useRef(() => {});
  checkRef.current = () => {
    const header = headerRef.current;
    let next = false;
    if (header && enabledRef.current) {
      if (!stackedRef.current) {
        const title = header.querySelector<HTMLElement>('.managed-panel__title');
        const titleWidth = title?.clientWidth ?? 0;
        const titleWanted = Math.min(title?.scrollWidth ?? 0, MIN_TITLE_WIDTH);
        oneRowWidthRef.current =
          header.scrollWidth + Math.max(0, titleWanted - titleWidth);
      }
      next = header.clientWidth < oneRowWidthRef.current;
    }
    if (next !== stackedRef.current) {
      stackedRef.current = next;
      setStacked(next);
    }
  };

  // The title and actions change without resizing anything observed, so
  // measure again after every render too.
  useLayoutEffect(() => checkRef.current());

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => checkRef.current());
    observer.observe(header);
    if (actionsRef.current) observer.observe(actionsRef.current);
    return () => observer.disconnect();
  }, [headerRef, actionsRef, enabled]);

  return stacked;
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

  const headerRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const stacked = useStackedHeader(headerRef, actionsRef, !!chrome.headerActions);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (chrome.isLocked) return;
    onPointerDown(e);
  };

  return (
    <div
      ref={headerRef}
      className={`${headerClass}${stacked ? ' managed-panel__header--stacked' : ''}`}
      onPointerDown={handlePointerDown}
      onContextMenu={onContextMenu}
    >
      <span className={titleClass}>{chrome.title}</span>
      {(chrome.headerActions ||
        chrome.settingsWindowId ||
        chrome.onReset ||
        chrome.onLock ||
        chrome.onPin ||
        chrome.onPopout ||
        (chrome.closable && chrome.onClose)) && (
        <div className={actionsClass} ref={actionsRef} onPointerDown={e => e.stopPropagation()}>
          {chrome.headerActions && (
            <div className="managed-panel__custom-actions">{chrome.headerActions}</div>
          )}
          <div className="managed-panel__window-buttons">
            <PanelSettingsButton chrome={chrome} />
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
            {chrome.onPopout && (
              <button
                type="button"
                className="panel-button panel-button--popout"
                onClick={chrome.onPopout}
                title="Otworz w osobnym oknie"
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
        </div>
      )}
    </div>
  );
}
