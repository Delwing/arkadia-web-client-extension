import { describe, expect, it } from 'vitest';
import { WindowManager } from '@web/layout/WindowManager';
import { migrateFlatWindowsToTrees } from '@web/layout/utils/layoutStorage';
import type { LeafNode, SplitNode, WindowRecord } from '@web/layout/types';

function rightRoot(m: WindowManager): SplitNode | null {
  return m.serialize().dockTrees.right;
}

/** Flatten leaf window-id arrays in document order for easy assertions. */
function leafIds(node: SplitNode | LeafNode | null): string[][] {
  if (!node) return [];
  if (node.kind === 'leaf') return [node.windowIds];
  return node.children.flatMap(leafIds);
}

function openDocked(m: WindowManager, id: string): void {
  m.open(id, { docked: 'right', title: id });
}
function openFloating(m: WindowManager, id: string): void {
  m.open(id, { title: id });
}

describe('WindowManager tree operations', () => {
  it('docks windows as top-level slots on the side root (primary axis = col)', () => {
    const m = new WindowManager();
    openDocked(m, 'a');
    openDocked(m, 'b');
    const root = rightRoot(m)!;
    expect(root.kind).toBe('split');
    expect(root.dir).toBe('col');
    expect(leafIds(root)).toEqual([['a'], ['b']]);
    expect(m.get('a')?.docked).toBe('right');
  });

  it('splitIntoGroup with same direction as parent inserts a sibling slot', () => {
    const m = new WindowManager();
    openDocked(m, 'a');
    openDocked(m, 'b');
    openFloating(m, 'c');
    // Root is 'col'; splitting 'col' after 'a' => sibling at root level.
    m.splitIntoGroup('c', 'a', false, 'col');
    const root = rightRoot(m)!;
    expect(root.children.every(ch => ch.kind === 'leaf')).toBe(true);
    expect(leafIds(root)).toEqual([['a'], ['c'], ['b']]);
  });

  it('splitIntoGroup perpendicular to parent wraps the target leaf in a new split', () => {
    const m = new WindowManager();
    openDocked(m, 'a');
    openDocked(m, 'b');
    openFloating(m, 'c');
    // Root is 'col'; splitting 'row' wraps 'a' into a row split [a, c].
    m.splitIntoGroup('c', 'a', false, 'row');
    const root = rightRoot(m)!;
    expect(root.children[0].kind).toBe('split');
    const wrap = root.children[0] as SplitNode;
    expect(wrap.dir).toBe('row');
    expect(leafIds(wrap)).toEqual([['a'], ['c']]);
    expect(root.children[1]).toMatchObject({ kind: 'leaf', windowIds: ['b'] });
  });

  it('tabIntoGroup stacks a window into the target leaf', () => {
    const m = new WindowManager();
    openDocked(m, 'a');
    openFloating(m, 'b');
    m.tabIntoGroup('b', 'a');
    const root = rightRoot(m)!;
    const leaf = root.children[0] as LeafNode;
    expect(leaf.windowIds).toEqual(['a', 'b']);
    expect(leaf.activeId).toBe('b');
  });

  it('undock collapses a 2-cell split back into a plain slot', () => {
    const m = new WindowManager();
    openDocked(m, 'a');
    openDocked(m, 'b');
    openFloating(m, 'c');
    m.splitIntoGroup('c', 'a', false, 'row'); // wrap -> row[a,c]
    expect((rightRoot(m)!.children[0] as SplitNode).kind).toBe('split');
    m.undock('c');
    // The row split has one child left -> collapses back to leaf 'a'.
    const root = rightRoot(m)!;
    expect(leafIds(root)).toEqual([['a'], ['b']]);
    expect(root.children[0].kind).toBe('leaf');
    expect(m.get('c')?.docked).toBeUndefined();
  });

  it('keeps an intentional placeholder leaf but prunes an emptied one', () => {
    const m = new WindowManager();
    openDocked(m, 'a');
    m.splitWithPlaceholder('a', 'row', false);
    let root = rightRoot(m)!;
    const wrap = root.children[0] as SplitNode;
    expect(wrap.children.length).toBe(2);
    const placeholder = wrap.children[1] as LeafNode;
    expect(placeholder.placeholder).toBe(true);
    expect(placeholder.windowIds).toEqual([]);

    // Filling the placeholder turns it into a real leaf.
    openFloating(m, 'd');
    m.fillPlaceholder(placeholder.id, 'd');
    root = rightRoot(m)!;
    expect(leafIds(root)).toEqual([['a'], ['d']]);
    expect((rightRoot(m)!.children[0] as SplitNode).children[1]).toMatchObject({
      windowIds: ['d'],
    });
  });

  it('removeNode deletes a placeholder and normalizes away the wrapper', () => {
    const m = new WindowManager();
    openDocked(m, 'a');
    m.splitWithPlaceholder('a', 'row', false);
    const wrap = rightRoot(m)!.children[0] as SplitNode;
    const placeholderId = wrap.children[1].id;
    m.removeNode('right', placeholderId);
    const root = rightRoot(m)!;
    expect(leafIds(root)).toEqual([['a']]);
    expect(root.children[0].kind).toBe('leaf');
  });

  it('closing the last window on a side nulls out the root', () => {
    const m = new WindowManager();
    openDocked(m, 'a');
    m.close('a');
    expect(rightRoot(m)).toBeNull();
  });
});

describe('migrateFlatWindowsToTrees', () => {
  const base = (over: Partial<WindowRecord>): WindowRecord => ({
    id: over.id!,
    title: over.id!,
    visible: true,
    x: 0,
    y: 0,
    width: 200,
    zIndex: 1,
    docked: 'right',
    ...over,
  });

  it('reproduces single / tab / split slots from flat fields', () => {
    const windows: Record<string, WindowRecord> = {
      single: base({ id: 'single', dockOrder: 0, dockFlex: 1 }),
      tabA: base({ id: 'tabA', dockOrder: 1, dockGroup: 'g1', tabOrder: 0, isActiveTab: true }),
      tabB: base({ id: 'tabB', dockOrder: 1, dockGroup: 'g1', tabOrder: 1 }),
      splitL: base({ id: 'splitL', dockOrder: 2, splitGroup: 's1', splitOrder: 0, splitFlex: 1 }),
      splitR: base({ id: 'splitR', dockOrder: 2, splitGroup: 's1', splitOrder: 1, splitFlex: 1 }),
    };
    const trees = migrateFlatWindowsToTrees(windows);
    const root = trees.right!;
    expect(root.kind).toBe('split');
    expect(root.dir).toBe('col');
    expect(root.children.length).toBe(3);

    // Slot 0: single leaf.
    expect(root.children[0]).toMatchObject({ kind: 'leaf', windowIds: ['single'] });
    // Slot 1: tab group leaf.
    expect(root.children[1]).toMatchObject({
      kind: 'leaf',
      windowIds: ['tabA', 'tabB'],
      activeId: 'tabA',
    });
    // Slot 2: cross-axis (row) split of two single leaves.
    const split = root.children[2] as SplitNode;
    expect(split.kind).toBe('split');
    expect(split.dir).toBe('row');
    expect(split.children.map(c => (c as LeafNode).windowIds)).toEqual([['splitL'], ['splitR']]);
  });

  it('returns null for sides with no docked windows', () => {
    const trees = migrateFlatWindowsToTrees({});
    expect(trees.left).toBeNull();
    expect(trees.right).toBeNull();
  });
});
