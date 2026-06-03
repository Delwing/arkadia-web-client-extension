import { CSSProperties, Fragment, useRef } from 'react';
import type {
  DockSide,
  DragState,
  LayoutNode,
  LeafNode,
  SplitDir,
  SplitNode,
  WindowRecord,
} from '../types';
import type { WindowManager } from '../WindowManager';
import { DockedPanel } from './DockedPanel';
import { TabGroupPanel } from './TabGroupPanel';

export interface NodeViewContext {
  side: DockSide;
  manager: WindowManager;
  windowsById: Record<string, WindowRecord>;
  dragState: DragState | null;
  onDragStateChange: (s: DragState | null) => void;
  onTitlebarContextMenu?: (e: React.MouseEvent, windowId: string) => void;
}

interface LayoutNodeViewProps {
  node: LayoutNode;
  ctx: NodeViewContext;
  style?: CSSProperties;
}

/** Recursive renderer for a dock side's layout tree. Split nodes become flex
 *  containers with draggable splitters; leaves render through the existing
 *  DockedPanel / TabGroupPanel shells (so portal targets keep attaching). */
export function LayoutNodeView({ node, ctx, style }: LayoutNodeViewProps) {
  if (node.kind === 'leaf') {
    return <LeafView leaf={node} ctx={ctx} style={style} />;
  }
  return <SplitView node={node} ctx={ctx} style={style} />;
}

// ── Split node ───────────────────────────────────────────────────────────────

function SplitView({
  node,
  ctx,
  style,
}: {
  node: SplitNode;
  ctx: NodeViewContext;
  style?: CSSProperties;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const horizontal = node.dir === 'row';

  const handleSplitterDown =
    (aIdx: number) => (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const a = node.children[aIdx];
      const b = node.children[aIdx + 1];
      if (!a || !b) return;
      const aEl = containerRef.current?.querySelector<HTMLElement>(
        `:scope > [data-cell-id="${a.id}"]`
      );
      const bEl = containerRef.current?.querySelector<HTMLElement>(
        `:scope > [data-cell-id="${b.id}"]`
      );
      if (!aEl || !bEl) return;

      const startPos = horizontal ? e.clientX : e.clientY;
      const startA = horizontal ? aEl.offsetWidth : aEl.offsetHeight;
      const startB = horizontal ? bEl.offsetWidth : bEl.offsetHeight;
      const total = startA + startB;
      const totFlex = (node.sizes[aIdx] ?? 1) + (node.sizes[aIdx + 1] ?? 1);

      const ratioAt = (ev: PointerEvent) => {
        const delta = (horizontal ? ev.clientX : ev.clientY) - startPos;
        const newA = Math.max(40, Math.min(total - 40, startA + delta));
        return newA / total;
      };
      const onMove = (ev: PointerEvent) => {
        const ratio = ratioAt(ev);
        aEl.style.flex = `${totFlex * ratio}`;
        bEl.style.flex = `${totFlex * (1 - ratio)}`;
      };
      const onUp = (ev: PointerEvent) => {
        const ratio = ratioAt(ev);
        ctx.manager.setNodeFlex(
          ctx.side,
          node.id,
          aIdx,
          totFlex * ratio,
          totFlex * (1 - ratio)
        );
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    };

  const splitterClass = `layout-splitter layout-splitter--${horizontal ? 'v' : 'h'}`;

  return (
    <div
      ref={containerRef}
      className={`layout-split layout-split--${node.dir}`}
      data-split-node={node.id}
      data-split-dir={node.dir}
      data-cell-id={node.id}
      style={{
        display: 'flex',
        flexDirection: node.dir === 'row' ? 'row' : 'column',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        ...style,
      }}
    >
      {node.children.map((child, i) => (
        <Fragment key={child.id}>
          <LayoutNodeView
            node={child}
            ctx={ctx}
            style={{ flex: node.sizes[i] ?? 1, minWidth: 0, minHeight: 0 }}
          />
          {i < node.children.length - 1 && (
            <div className={splitterClass} onPointerDown={handleSplitterDown(i)} />
          )}
        </Fragment>
      ))}
    </div>
  );
}

// ── Leaf ─────────────────────────────────────────────────────────────────────

/** The "fake slot": a real ghost cell that opens up beside the panel, pushing
 *  its content aside to show where the dropped window would land. Lives INSIDE
 *  the leaf, so the leaf's measured rect (what drop detection reads) is
 *  unchanged — the preview reflows the content but never destabilizes aiming. */
function SplitPreviewWrap({
  dir,
  before,
  children,
}: {
  dir: SplitDir;
  before: boolean;
  children: React.ReactNode;
}) {
  const ghost = (
    <div className="layout-preview" style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
      <div className="dock-drop-preview" />
    </div>
  );
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: dir === 'row' ? 'row' : 'column',
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {before && ghost}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        {children}
      </div>
      {!before && ghost}
    </div>
  );
}

function LeafView({
  leaf,
  ctx,
  style,
}: {
  leaf: LeafNode;
  ctx: NodeViewContext;
  style?: CSSProperties;
}) {
  const { windowsById, dragState, manager, side, onDragStateChange, onTitlebarContextMenu } = ctx;

  // Only render windows that are live + visible + not popped out.
  const renderIds = leaf.windowIds.filter(id => windowsById[id]);
  const displayActive = renderIds.includes(leaf.activeId)
    ? leaf.activeId
    : renderIds[0] ?? '';

  const targetsThisSide = !!dragState && dragState.potentialDock === side;
  const matchesLeaf = (id?: string) =>
    !!id && (id === leaf.activeId || leaf.windowIds.includes(id));

  const isStackTarget =
    targetsThisSide && matchesLeaf(dragState!.stackTargetId);
  const isFillTarget =
    targetsThisSide && !!dragState!.fillLeafId && dragState!.fillLeafId === leaf.id;
  const isSplitTarget =
    targetsThisSide && matchesLeaf(dragState!.splitTargetId);

  const ctxMenu = onTitlebarContextMenu
    ? (e: React.MouseEvent) => onTitlebarContextMenu(e, displayActive)
    : undefined;

  let content: React.ReactNode;
  if (renderIds.length === 0) {
    content = (
      <PlaceholderCell
        leaf={leaf}
        side={side}
        manager={manager}
        highlighted={isStackTarget || isFillTarget}
      />
    );
  } else if (renderIds.length === 1) {
    content = (
      <DockedPanel
        window={windowsById[renderIds[0]]}
        manager={manager}
        onDragStateChange={onDragStateChange}
        onTitlebarContextMenu={ctxMenu}
      />
    );
  } else {
    content = (
      <TabGroupPanel
        side={side}
        panels={renderIds.map(id => windowsById[id])}
        activeId={displayActive}
        manager={manager}
        onDragStateChange={onDragStateChange}
        onTitlebarContextMenu={ctxMenu}
      />
    );
  }

  // Split target → open a real ghost cell beside the content. Stack target →
  // a whole-cell highlight (tab stacking doesn't create a new slot).
  const inner =
    isSplitTarget && dragState?.splitDir ? (
      <SplitPreviewWrap dir={dragState.splitDir} before={!!dragState.splitBefore}>
        {content}
      </SplitPreviewWrap>
    ) : (
      content
    );

  const leafClass = [
    'layout-leaf',
    leaf.placeholder ? 'layout-leaf--placeholder' : '',
    isStackTarget ? 'dock-panel-slot--stack-target' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={leafClass}
      data-leaf-id={leaf.id}
      data-leaf-target={displayActive}
      data-cell-id={leaf.id}
      style={{ ...style, position: 'relative', display: 'flex', minWidth: 0, minHeight: 0, overflow: 'hidden' }}
    >
      {inner}
    </div>
  );
}

function PlaceholderCell({
  leaf,
  side,
  manager,
  highlighted,
}: {
  leaf: LeafNode;
  side: DockSide;
  manager: WindowManager;
  highlighted: boolean;
}) {
  return (
    <div className={`layout-placeholder${highlighted ? ' layout-placeholder--target' : ''}`}>
      <span className="layout-placeholder__hint">Przeciagnij okno tutaj</span>
      {leaf.placeholder && (
        <button
          type="button"
          className="panel-button panel-button--close panel-button--sm layout-placeholder__close"
          title="Usun"
          onClick={() => manager.removeNode(side, leaf.id)}
        />
      )}
    </div>
  );
}
