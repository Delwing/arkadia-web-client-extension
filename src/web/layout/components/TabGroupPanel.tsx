import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, Ellipsis } from 'lucide-react';
import type { DockSide, DragState, WindowRecord } from '../types';
import type { WindowManager } from '../WindowManager';
import { startUndockableDrag } from '../utils/dragHandlers';
import { PanelSettingsButton, usePanelChrome, type PanelChrome } from './PanelHeader';
import { useWindowBackground } from '../hooks/useWindowAppearance';
import { usePopover } from '../hooks/usePopover';
import { MenuCheckItem, MenuItem } from './HeaderMenu';
import { observeHeader, runMeasures, type HeaderMeasure } from '../utils/headerMeasure';

interface TabGroupPanelProps {
  side: DockSide;
  panels: WindowRecord[];
  activeId: string;
  manager: WindowManager;
  onDragStateChange: (s: DragState | null) => void;
  onTitlebarContextMenu?: (e: React.MouseEvent) => void;
}

export function TabGroupPanel({
  side,
  panels,
  activeId,
  manager,
  onDragStateChange,
  onTitlebarContextMenu,
}: TabGroupPanelProps) {
  const sorted = [...panels].sort(
    (a, b) => (a.tabOrder ?? 0) - (b.tabOrder ?? 0)
  );
  const activePanel = sorted.find(p => p.id === activeId) ?? sorted[0];
  const showBar = sorted.length > 1;
  const barRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const layout = useTabBarLayout(barRef, tabsRef);

  // Keep the active tab in view when the strip scrolls.
  useLayoutEffect(() => {
    const tabs = tabsRef.current;
    const tab = tabs?.querySelector<HTMLElement>('.tab-group-tab--active');
    if (!tabs || !tab) return;
    if (tab.offsetLeft < tabs.scrollLeft) {
      tabs.scrollLeft = tab.offsetLeft;
    } else if (tab.offsetLeft + tab.offsetWidth > tabs.scrollLeft + tabs.clientWidth) {
      tabs.scrollLeft = tab.offsetLeft + tab.offsetWidth - tabs.clientWidth;
    }
  }, [activeId, layout.overflow]);

  // A plain mouse wheel scrolls the tab strip sideways.
  useEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs) return;
    const onWheel = (e: WheelEvent) => {
      if (tabs.scrollWidth <= tabs.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      tabs.scrollLeft += e.deltaY;
    };
    tabs.addEventListener('wheel', onWheel, { passive: false });
    return () => tabs.removeEventListener('wheel', onWheel);
  }, [showBar]);

  const barClass = [
    'tab-group-tabbar managed-panel__header',
    layout.compact && 'tab-group-tabbar--compact',
    layout.stacked && 'tab-group-tabbar--stacked',
  ].filter(Boolean).join(' ');

  return (
    <div className={`tab-group-panel tab-group-panel--${side} managed-panel`}>
      {showBar && (
        <div ref={barRef} className={barClass} onContextMenu={onTitlebarContextMenu}>
          <div className="tab-group-tabs" ref={tabsRef}>
            {sorted.map(p => (
              <TabItem
                key={p.id}
                panel={p}
                isActive={p.id === activeId}
                manager={manager}
                onDragStateChange={onDragStateChange}
              />
            ))}
          </div>
          {layout.overflow && (
            <TabListMenu panels={sorted} activeId={activeId} manager={manager} />
          )}
          {activePanel && <ActiveTabActions panel={activePanel} />}
        </div>
      )}
      <TabContent id={activeId} manager={manager} />
    </div>
  );
}

/** Room the ⋯ button takes when the window buttons fold into it. */
const MORE_BUTTON_WIDTH = 22;

const MEASURING_CLASS = 'tab-group-tabbar--measuring';
const LAYOUT_CLASSES = ['tab-group-tabbar--compact', 'tab-group-tabbar--stacked'];

interface TabBarLayout {
  /** Pin, lock, reset and popout fold into the ⋯ menu. */
  compact: boolean;
  /** The active popup's own actions take a row of their own under the tabs. */
  stacked: boolean;
  /** Some tab title is cut short: the ▾ list of every tab shows. */
  overflow: boolean;
}

const ONE_ROW: TabBarLayout = { compact: false, stacked: false, overflow: false };

/**
 * Which way the bar gives way, read off its live layout and then its natural
 * widths on one row (the layout classes off for a moment, put back before
 * anything paints). Yields between reads and writes, so every bar resized in
 * a frame shares the same two layouts.
 */
function* measureTabBar(bar: HTMLElement, tabs: HTMLElement, apply: (next: TabBarLayout) => void): HeaderMeasure {
  const width = bar.clientWidth;
  // The strip's room without ▾, so the button showing up never squeezes the
  // tabs into keeping it, nor its going frees them.
  const toggle = bar.querySelector<HTMLElement>('.tab-group-overflow');
  const room = tabs.clientWidth + (toggle?.offsetWidth ?? 0);
  yield;

  const removed = LAYOUT_CLASSES.filter(c => bar.classList.contains(c));
  bar.classList.remove(...removed);
  bar.classList.add(MEASURING_CLASS);
  yield;

  const custom = bar.querySelector<HTMLElement>('.tab-group-custom-actions');
  const full = bar.querySelector<HTMLElement>('.tab-group-window-buttons__full');
  const titles = Array.from(bar.querySelectorAll<HTMLElement>('.tab-group-tab-title'));
  const oneRow = bar.scrollWidth;
  const tabsWidth = tabs.scrollWidth;
  // A title longer than the tab's own cap, cut short however wide the bar.
  const titleCapped = titles.some(t => t.scrollWidth > t.clientWidth + 1);
  const customWidth = custom?.getBoundingClientRect().width ?? 0;
  const fullWidth = full?.getBoundingClientRect().width ?? 0;
  yield;

  bar.classList.remove(MEASURING_CLASS);
  bar.classList.add(...removed);

  const next: TabBarLayout = { ...ONE_ROW };
  // Every tab at its full width: the actions give way before the titles do.
  const folded = fullWidth > 0 ? oneRow - fullWidth + MORE_BUTTON_WIDTH : oneRow;
  if (oneRow > width) {
    if (folded <= width || customWidth === 0) {
      next.compact = fullWidth > 0;
    } else {
      next.stacked = true;
      next.compact = fullWidth > 0 && oneRow - customWidth > width;
    }
  }
  next.overflow = titleCapped || tabsWidth > room + 1;
  apply(next);
}

/**
 * How the tab bar gives way as it narrows: first the window buttons fold into
 * ⋯, then the popup's own actions move to a second row, then the tabs shrink
 * and a ▾ list of every tab appears. It goes back as soon as there is room.
 */
function useTabBarLayout(
  barRef: React.RefObject<HTMLDivElement | null>,
  tabsRef: React.RefObject<HTMLDivElement | null>
): TabBarLayout {
  const [layout, setLayout] = useState<TabBarLayout>(ONE_ROW);
  const layoutRef = useRef(layout);

  const apply = (next: TabBarLayout) => {
    const prev = layoutRef.current;
    if (prev.compact !== next.compact || prev.stacked !== next.stacked || prev.overflow !== next.overflow) {
      layoutRef.current = next;
      setLayout(next);
    }
  };

  const measureRef = useRef<() => HeaderMeasure>(null!);
  measureRef.current = function* () {
    const bar = barRef.current;
    const tabs = tabsRef.current;
    if (bar && tabs) {
      yield* measureTabBar(bar, tabs, apply);
    } else {
      apply(ONE_ROW);
    }
  };

  // Tabs, titles and actions change without resizing anything observed, so
  // measure again after every render too.
  useLayoutEffect(() => runMeasures([measureRef.current()]));

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    return observeHeader([bar, ...Array.from(bar.children)], () => measureRef.current(), bar);
  });

  return layout;
}

interface TabItemProps {
  panel: WindowRecord;
  isActive: boolean;
  manager: WindowManager;
  onDragStateChange: (s: DragState | null) => void;
}

function TabItem({ panel, isActive, manager, onDragStateChange }: TabItemProps) {
  const chrome = usePanelChrome(panel);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as Element).closest('.panel-button, .script-window-btn')) return;
    e.preventDefault();
    manager.setActiveTab(panel.id);

    const groupEl = (e.currentTarget as HTMLElement).closest<HTMLElement>(
      '.tab-group-panel'
    );

    startUndockableDrag({
      id: panel.id,
      manager,
      sourceEl: groupEl,
      clickClientX: e.clientX,
      clickClientY: e.clientY,
      onDragStateChange,
      ctrlForcesFloat: true,
    });
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (chrome.onClose) {
      chrome.onClose();
    } else {
      manager.close(panel.id);
    }
  };

  return (
    <div
      className={`tab-group-tab${isActive ? ' tab-group-tab--active' : ''}${
        chrome.isLocked ? ' tab-group-tab--locked' : ''
      }${chrome.closable ? ' tab-group-tab--closable' : ''}`}
      title={chrome.title}
      onPointerDown={handlePointerDown}
    >
      <span className="tab-group-tab-title">{chrome.title}</span>
      {chrome.closable && (
        <button
          className="panel-button panel-button--close panel-button--sm"
          title="Zamknij"
          onClick={handleClose}
        />
      )}
    </div>
  );
}

/** The ▾ list of every tab, shown once they no longer fit the strip. */
function TabListMenu({ panels, activeId, manager }: {
  panels: WindowRecord[];
  activeId: string;
  manager: WindowManager;
}) {
  const menu = usePopover({ width: 200 });
  return (
    <div className="popup-menu-anchor tab-group-overflow" ref={menu.rootRef} onPointerDown={e => e.stopPropagation()}>
      <button
        ref={menu.anchorRef}
        type="button"
        className={`tab-group-overflow__toggle${menu.open ? ' is-active' : ''}`}
        onClick={menu.toggle}
        title="Wszystkie karty"
      >
        <ChevronDown size={14} strokeWidth={2} />
      </button>
      {menu.style && (
        <div className="popup-popover popup-menu" style={menu.style}>
          {panels.map(p => (
            <TabListItem
              key={p.id}
              panel={p}
              active={p.id === activeId}
              onSelect={() => { menu.close(); manager.setActiveTab(p.id); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TabListItem({ panel, active, onSelect }: { panel: WindowRecord; active: boolean; onSelect: () => void }) {
  const chrome = usePanelChrome(panel);
  return <MenuItem active={active} onClick={onSelect}>{chrome.title}</MenuItem>;
}

/** The active tab's own actions, then its window buttons, at the right end of
 *  the tab bar. A compact bar folds pin/lock/reset/popout into ⋯; both sets are
 *  rendered so the bar can measure the full one while showing the other. */
function ActiveTabActions({ panel }: { panel: WindowRecord }) {
  const chrome = usePanelChrome(panel);
  const hasWindowButtons = !!(chrome.onPin || chrome.onLock || chrome.onReset || chrome.onPopout);
  if (!chrome.headerActions && !chrome.settingsWindowId && !hasWindowButtons) {
    return null;
  }
  return (
    <>
      {chrome.headerActions && (
        <div className="tab-group-custom-actions" onPointerDown={e => e.stopPropagation()}>
          {chrome.headerActions}
        </div>
      )}
      <div
        className="tab-group-window-buttons managed-panel__header-actions"
        onPointerDown={e => e.stopPropagation()}
      >
        <PanelSettingsButton chrome={chrome} small />
        {hasWindowButtons && (
          <>
            <div className="tab-group-window-buttons__full">
              {chrome.onPin && (
                <button
                  type="button"
                  className={`panel-button panel-button--pin panel-button--sm${chrome.isPinned ? ' is-active' : ''}`}
                  onClick={chrome.onPin}
                  title={chrome.isPinned ? 'Odepnij okno' : 'Przypnij okno'}
                />
              )}
              {chrome.onLock && (
                <button
                  type="button"
                  className={`panel-button panel-button--lock panel-button--sm${chrome.isLocked ? ' is-active' : ''}`}
                  onClick={chrome.onLock}
                  title={chrome.isLocked ? 'Odblokuj okno' : 'Zablokuj okno'}
                />
              )}
              {chrome.onReset && (
                <button
                  type="button"
                  className="panel-button panel-button--reset panel-button--sm"
                  onClick={chrome.onReset}
                  title="Przywróć domyślną pozycję i rozmiar"
                />
              )}
              {chrome.onPopout && (
                <button
                  type="button"
                  className="panel-button panel-button--popout panel-button--sm"
                  onClick={chrome.onPopout}
                  title="Otwórz w osobnym oknie"
                />
              )}
            </div>
            <WindowButtonsMenu chrome={chrome} />
          </>
        )}
      </div>
    </>
  );
}

/** Pin, lock, reset and popout as one ⋯ menu, for a narrow tab bar. */
function WindowButtonsMenu({ chrome }: { chrome: PanelChrome }) {
  const menu = usePopover({ width: 220 });
  const run = (action?: () => void) => () => { menu.close(); action?.(); };
  return (
    <div className="popup-menu-anchor tab-group-window-buttons__more" ref={menu.rootRef}>
      <button
        ref={menu.anchorRef}
        type="button"
        className={`panel-button panel-button--sm panel-button--more${menu.open ? ' is-active' : ''}`}
        onClick={menu.toggle}
        title="Więcej"
      >
        <Ellipsis size={14} strokeWidth={2} />
      </button>
      {menu.style && (
        <div className="popup-popover popup-menu" style={menu.style}>
          {chrome.onPin && (
            <MenuCheckItem checked={!!chrome.isPinned} onClick={run(chrome.onPin)}>Przypnij okno</MenuCheckItem>
          )}
          {chrome.onLock && (
            <MenuCheckItem checked={chrome.isLocked} onClick={run(chrome.onLock)}>Zablokuj okno</MenuCheckItem>
          )}
          {chrome.onReset && (
            <MenuItem onClick={run(chrome.onReset)}>Przywróć domyślną pozycję i rozmiar</MenuItem>
          )}
          {chrome.onPopout && (
            <MenuItem onClick={run(chrome.onPopout)}>Otwórz w osobnym oknie</MenuItem>
          )}
        </div>
      )}
    </div>
  );
}

interface TabContentProps {
  id: string;
  manager: WindowManager;
}

function TabContent({ id, manager }: TabContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const background = useWindowBackground(id);

  useLayoutEffect(() => {
    const slot = contentRef.current;
    const target = manager.getPortalTarget(id);
    if (!slot || !target) return;
    slot.appendChild(target);
    return () => {
      if (target.parentNode === slot) slot.removeChild(target);
    };
  }, [manager, id]);

  return (
    <div
      className="docked-panel-content managed-panel__content"
      ref={contentRef}
      {...background}
    />
  );
}
