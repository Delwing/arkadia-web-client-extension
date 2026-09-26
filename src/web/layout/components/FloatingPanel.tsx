import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isMobileLikeViewport } from '@shared/dom/pointerEnvironment.ts';
import { clampFloatingTop } from '../types';
import type { DragState, WindowRecord } from '../types';
import type { WindowManager } from '../WindowManager';
import { PanelHeader, usePanelChrome } from './PanelHeader';
import { startFloatingDrag } from '../utils/dragHandlers';
import { FIT_MARGIN, fitToViewport, readViewport } from '../utils/fitToViewport';

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

/** Tracks the screen size. The page opts into interactive-widget=resizes-content,
 *  so a phone's on-screen keyboard shrinks it too. */
function useViewport() {
  const [viewport, setViewport] = useState(readViewport);
  useEffect(() => {
    const update = () => {
      const next = readViewport();
      setViewport(prev =>
        prev.width === next.width && prev.height === next.height ? prev : next
      );
    };
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return viewport;
}

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
  const viewport = useViewport();
  // On a phone the whole window is kept on screen, so its titlebar (drag
  // handle and close button) can always be reached.
  const keepOnScreen = isMobileLikeViewport();
  const autoHeight = w.height === undefined;
  const [measuredHeight, setMeasuredHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const el = windowRef.current;
    if (!el || !keepOnScreen || !autoHeight) return;
    const measure = () => setMeasuredHeight(el.offsetHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [keepOnScreen, autoHeight]);

  const fitted = fitToViewport(
    { x: w.x, y: w.y, width: w.width, height: w.height },
    viewport,
    { keepOnScreen, measuredHeight }
  );

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
        lastY = clampFloatingTop(ev.clientY - startOffsetY);
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
          // Cap growth at the viewport top, so dragging the north edge upwards
          // can never push the titlebar out of reach.
          const nh = Math.max(80, Math.min(startTop + startH, startH - dy));
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
        left: fitted.x,
        top: fitted.y,
        width: fitted.width,
        ...(fitted.height !== undefined && { height: fitted.height }),
        ...(keepOnScreen && { maxHeight: viewport.height - 2 * FIT_MARGIN }),
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
