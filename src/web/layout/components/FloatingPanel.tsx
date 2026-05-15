import { useLayoutEffect, useRef } from 'react';
import type { DragState, WindowRecord } from '../types';
import type { WindowManager } from '../WindowManager';
import { PanelHeader, usePanelChrome } from './PanelHeader';
import { startFloatingDrag } from '../utils/dragHandlers';

interface FloatingPanelProps {
  window: WindowRecord;
  manager: WindowManager;
  onDragStateChange: (s: DragState | null) => void;
  onTitlebarContextMenu?: (e: React.MouseEvent) => void;
  /** When true, dragging never docks (used when layout manager is disabled). */
  disableDocking?: boolean;
}

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const ALL_DIRECTIONS: ResizeDirection[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

export function FloatingPanel({
  window: w,
  manager,
  onDragStateChange,
  onTitlebarContextMenu,
  disableDocking = false,
}: FloatingPanelProps) {
  const windowRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const chrome = usePanelChrome(w);

  useLayoutEffect(() => {
    const slot = contentRef.current;
    const target = manager.getPortalTarget(w.id);
    if (!slot || !target) return;
    slot.appendChild(target);
    return () => {
      if (target.parentNode === slot) slot.removeChild(target);
    };
  }, [manager, w.id]);

  const handleTitlebarPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as Element).closest('.panel-button, .script-window-btn')) return;
    if (chrome.isLocked) return;
    e.preventDefault();
    manager.bringToFront(w.id);
    if (!windowRef.current) return;
    if (disableDocking) {
      // Simple drag — no dock detection.
      const startOffsetX = e.clientX - windowRef.current.offsetLeft;
      const startOffsetY = e.clientY - windowRef.current.offsetTop;
      let lastX = windowRef.current.offsetLeft;
      let lastY = windowRef.current.offsetTop;
      const el = windowRef.current;
      const onMove = (ev: PointerEvent) => {
        lastX = ev.clientX - startOffsetX;
        lastY = ev.clientY - startOffsetY;
        el.style.left = `${lastX}px`;
        el.style.top = `${lastY}px`;
      };
      const onUp = () => {
        manager.setPosition(w.id, lastX, lastY);
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      return;
    }
    startFloatingDrag({
      id: w.id,
      manager,
      windowEl: windowRef.current,
      clickClientX: e.clientX,
      clickClientY: e.clientY,
      onDragStateChange,
      ctrlForcesFloat: true,
    });
  };

  const makeResizeHandler =
    (dir: ResizeDirection) => (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      if (chrome.isLocked) return;
      e.preventDefault();
      e.stopPropagation();
      manager.bringToFront(w.id);
      const el = windowRef.current;
      if (!el) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = el.offsetWidth;
      const startH = el.offsetHeight;
      const startLeft = el.offsetLeft;
      const startTop = el.offsetTop;
      let lastW = startW;
      let lastH = startH;
      let lastLeft = startLeft;
      let lastTop = startTop;

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (dir.includes('e')) lastW = Math.max(150, startW + dx);
        if (dir.includes('w')) {
          const nw = Math.max(150, startW - dx);
          lastLeft = startLeft + startW - nw;
          lastW = nw;
        }
        if (dir.includes('s')) lastH = Math.max(80, startH + dy);
        if (dir.includes('n')) {
          const nh = Math.max(80, startH - dy);
          lastTop = startTop + startH - nh;
          lastH = nh;
        }
        el.style.width = `${lastW}px`;
        el.style.height = `${lastH}px`;
        el.style.left = `${lastLeft}px`;
        el.style.top = `${lastTop}px`;
      };
      const onUp = () => {
        manager.setSize(w.id, lastW, lastH);
        if (dir.includes('w') || dir.includes('n')) {
          manager.setPosition(w.id, lastLeft, lastTop);
        }
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    };

  const panelClass = [
    'managed-panel',
    'floating-panel',
    `floating-panel--${w.id}`,
    'script-window',
    chrome.isPopup ? 'floating-panel--popup' : '',
    chrome.isLocked ? 'managed-panel--locked floating-panel--locked' : '',
    w.height === undefined ? 'floating-panel--auto-height' : '',
    chrome.panelClassName ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={windowRef}
      className={panelClass}
      data-window-id={w.id}
      data-panel-id={w.id}
      style={{
        left: w.x,
        top: w.y,
        width: w.width,
        ...(w.height !== undefined && { height: w.height }),
        zIndex: w.zIndex,
        display: w.visible ? 'flex' : 'none',
      }}
      onPointerDown={() => manager.bringToFront(w.id)}
    >
      <PanelHeader
        chrome={chrome}
        variant="floating"
        onPointerDown={handleTitlebarPointerDown}
        onContextMenu={onTitlebarContextMenu}
      />
      <div
        className="managed-panel__content floating-panel__content script-window-content"
        ref={contentRef}
      />
      {!chrome.isLocked &&
        ALL_DIRECTIONS.map(dir => (
          <div
            key={dir}
            className={`floating-panel__edge floating-panel__edge--${dir} script-window-resize-${dir}`}
            onPointerDown={makeResizeHandler(dir)}
          />
        ))}
    </div>
  );
}
