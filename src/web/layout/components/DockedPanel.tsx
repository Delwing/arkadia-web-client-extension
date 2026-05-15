import { useLayoutEffect, useRef } from 'react';
import type { DragState, WindowRecord } from '../types';
import type { WindowManager } from '../WindowManager';
import { PanelHeader, usePanelChrome } from './PanelHeader';
import { startUndockableDrag } from '../utils/dragHandlers';

interface DockedPanelProps {
  window: WindowRecord;
  manager: WindowManager;
  onDragStateChange: (s: DragState | null) => void;
  onTitlebarContextMenu?: (e: React.MouseEvent) => void;
}

export function DockedPanel({
  window,
  manager,
  onDragStateChange,
  onTitlebarContextMenu,
}: DockedPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const chrome = usePanelChrome(window);

  // Attach the window's persistent portal-target div into our content slot.
  useLayoutEffect(() => {
    const slot = contentRef.current;
    const target = manager.getPortalTarget(window.id);
    if (!slot || !target) return;
    slot.appendChild(target);
    return () => {
      if (target.parentNode === slot) slot.removeChild(target);
    };
  }, [manager, window.id]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as Element).closest('.panel-button, .script-window-btn')) return;
    if (chrome.isLocked) return;
    e.preventDefault();
    startUndockableDrag({
      id: window.id,
      manager,
      sourceEl: panelRef.current,
      clickClientX: e.clientX,
      clickClientY: e.clientY,
      onDragStateChange,
      ctrlForcesFloat: true,
    });
  };

  const panelClass = [
    'managed-panel',
    'docked-panel',
    `docked-panel--${window.id}`,
    chrome.isPopup ? 'docked-panel--popup' : '',
    chrome.isLocked ? 'managed-panel--locked docked-panel--locked' : '',
    chrome.panelClassName ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={panelRef}
      className={panelClass}
      data-panel-id={window.id}
      style={{ flex: 1, minHeight: 0, minWidth: 0 }}
    >
      <PanelHeader
        chrome={chrome}
        variant="docked"
        onPointerDown={handlePointerDown}
        onContextMenu={onTitlebarContextMenu}
      />
      <div
        className="managed-panel__content docked-panel__content docked-panel-content"
        ref={contentRef}
      />
    </div>
  );
}
