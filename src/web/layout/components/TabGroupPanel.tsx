import { useLayoutEffect, useRef } from 'react';
import type { DockSide, DragState, WindowRecord } from '../types';
import type { WindowManager } from '../WindowManager';
import { startUndockableDrag } from '../utils/dragHandlers';
import { usePanelChrome } from './PanelHeader';

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

  return (
    <div className={`tab-group-panel tab-group-panel--${side} managed-panel`}>
      {sorted.length > 1 && (
        <div
          className="tab-group-tabbar managed-panel__header"
          onContextMenu={onTitlebarContextMenu}
        >
          <div className="tab-group-tabs">
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
          {activePanel && (
            <ActiveTabActions panel={activePanel} />
          )}
        </div>
      )}
      <TabContent id={activeId} manager={manager} />
    </div>
  );
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
      }`}
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

/** Pin/lock/reset + headerActions for the currently active tab. Rendered at
 *  the right end of the tab bar. When the tabbar is too narrow to fit
 *  everything, the actions container shrinks and clips from the right —
 *  pin/lock/reset are ordered leftmost so they survive clipping; the (often
 *  larger) custom headerActions go last. */
function ActiveTabActions({ panel }: { panel: WindowRecord }) {
  const chrome = usePanelChrome(panel);
  if (!chrome.headerActions && !chrome.onReset && !chrome.onLock && !chrome.onPin) {
    return null;
  }
  return (
    <div
      className="tab-group-active-actions managed-panel__header-actions"
      onPointerDown={e => e.stopPropagation()}
    >
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
          title="Przywroc domyslna pozycje i rozmiar"
        />
      )}
      {chrome.headerActions}
    </div>
  );
}

interface TabContentProps {
  id: string;
  manager: WindowManager;
}

function TabContent({ id, manager }: TabContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);

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
    />
  );
}
