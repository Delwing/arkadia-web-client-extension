import { useMemo, useRef } from 'react';
import type { DockSide, DragState, SplitNode, WindowRecord } from '../types';
import type { WindowManager } from '../WindowManager';
import { LayoutNodeView, NodeViewContext } from './LayoutNodeView';

interface DockAreaProps {
  side: DockSide;
  /** Structural tree root for this side (null = empty). */
  root: SplitNode | null;
  /** Live, visible, non-popped windows (any side) — used to resolve leaf ids. */
  windows: WindowRecord[];
  extent: number;
  dragState: DragState | null;
  manager: WindowManager;
  onSetExtent: (side: DockSide, n: number) => void;
  onDragStateChange: (s: DragState | null) => void;
  onTitlebarContextMenu?: (e: React.MouseEvent, windowId: string) => void;
}

export function DockArea({
  side,
  root,
  windows,
  extent,
  dragState,
  manager,
  onSetExtent,
  onDragStateChange,
  onTitlebarContextMenu,
}: DockAreaProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const horizontal = side === 'left' || side === 'right';

  const windowsById = useMemo(() => {
    const map: Record<string, WindowRecord> = {};
    for (const w of windows) map[w.id] = w;
    return map;
  }, [windows]);

  const ctx: NodeViewContext = useMemo(
    () => ({
      side,
      manager,
      windowsById,
      dragState,
      onDragStateChange,
      onTitlebarContextMenu,
    }),
    [side, manager, windowsById, dragState, onDragStateChange, onTitlebarContextMenu]
  );

  const handleEdgePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = areaRef.current;
    if (!el) return;
    const startPos = horizontal ? e.clientX : e.clientY;
    const startSize = horizontal ? el.offsetWidth : el.offsetHeight;
    const flip = side === 'right' || side === 'bottom' ? -1 : 1;
    // The dock-size vars live on #main-container (see LayoutContent) so both the
    // horizontal (#content-area) and vertical (#main-container) grids reflow.
    const gridHost =
      document.getElementById('main-container') ??
      document.getElementById('content-area');
    const cssVar = `--dock-${side}-size`;
    let lastSize = startSize;
    const onMove = (ev: PointerEvent) => {
      lastSize = Math.max(
        80,
        startSize + ((horizontal ? ev.clientX : ev.clientY) - startPos) * flip
      );
      // Drive the grid track via the CSS variable so the whole layout reflows
      // live during drag.
      gridHost?.style.setProperty(cssVar, `${lastSize}px`);
      el.style[horizontal ? 'width' : 'height'] = `${lastSize}px`;
    };
    const onUp = () => {
      onSetExtent(side, lastSize);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  const edgeSplitClass = `dock-edge-splitter dock-edge-splitter-${side}`;

  // A wholly-empty dock side has no leaves to host the inline split/slot ghost,
  // so drag-targeting it would show no cue at all. Render a fill preview instead
  // so an empty side reads as a valid drop target while dragging over it.
  const isEmptyTarget =
    dragState?.potentialDock === side && (!root || root.children.length === 0);

  return (
    <div
      ref={areaRef}
      className={`dock-area dock-area-${side} dock-zone dock-zone--${side}`}
      style={{ [horizontal ? 'width' : 'height']: extent }}
    >
      {root && (
        <LayoutNodeView
          node={root}
          ctx={ctx}
          style={{ flex: 1, minWidth: 0, minHeight: 0 }}
        />
      )}
      {isEmptyTarget && <div className="dock-drop-preview dock-drop-preview--empty" />}
      <div className={edgeSplitClass} onPointerDown={handleEdgePointerDown} />
    </div>
  );
}
