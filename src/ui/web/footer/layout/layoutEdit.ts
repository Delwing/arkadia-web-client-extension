import type { FooterBlockNode, FooterLayout, FooterNode } from "@shared/footerLayoutTypes";

/**
 * Editing a footer layout (the layout editor in the settings), as pure
 * functions over a path: `[band]` is a band, `[band, child, ...]` a node in it,
 * each further index a child of the group before it. Every edit returns a new
 * layout and leaves the one it was given alone.
 */
export type LayoutPath = readonly number[];

const clone = (layout: FooterLayout): FooterLayout => JSON.parse(JSON.stringify(layout)) as FooterLayout;

/** The children list a path's node sits in, and its index there; `null` for a band or a bad path. */
function slot(layout: FooterLayout, path: LayoutPath): { list: FooterNode[]; index: number } | null {
  if (path.length < 2) return null;
  let list = layout.bands[path[0]]?.children;
  for (let depth = 1; list && depth < path.length - 1; depth++) {
    const node = list[path[depth]];
    list = node && node.type !== "block" ? node.children : undefined;
  }
  const index = path[path.length - 1];
  return list && index >= 0 && index <= list.length ? { list, index } : null;
}

export function nodeAt(layout: FooterLayout, path: LayoutPath): FooterNode | undefined {
  const at = slot(layout, path);
  return at?.list[at.index];
}

/** The children of a band (`[band]`) or of a group. */
function childList(layout: FooterLayout, parent: LayoutPath): FooterNode[] | undefined {
  if (parent.length === 1) return layout.bands[parent[0]]?.children;
  const node = nodeAt(layout, parent);
  return node && node.type !== "block" ? node.children : undefined;
}

const parentOf = (path: LayoutPath): LayoutPath => path.slice(0, -1);
const startsWith = (path: LayoutPath, prefix: LayoutPath) => prefix.every((index, i) => path[i] === index);

export function updateNode(layout: FooterLayout, path: LayoutPath, update: (node: FooterNode) => FooterNode): FooterLayout {
  const next = clone(layout);
  const at = slot(next, path);
  if (!at || !at.list[at.index]) return layout;
  at.list[at.index] = update(at.list[at.index]);
  return next;
}

export function removeNode(layout: FooterLayout, path: LayoutPath): FooterLayout {
  const next = clone(layout);
  const at = slot(next, path);
  if (!at || !at.list[at.index]) return layout;
  at.list.splice(at.index, 1);
  return next;
}

export function insertNode(layout: FooterLayout, parent: LayoutPath, index: number, node: FooterNode): FooterLayout {
  const next = clone(layout);
  const list = childList(next, parent);
  if (!list) return layout;
  list.splice(Math.max(0, Math.min(list.length, index)), 0, node);
  return next;
}

/**
 * Moves a node into `parent` at `index` (an index among the parent's children
 * as they are before the move). Returns the node's new path, or `null` when the
 * move cannot be made - a group into itself or a bad path.
 */
export function moveNode(layout: FooterLayout, from: LayoutPath, parent: LayoutPath, index: number): { layout: FooterLayout; path: LayoutPath } | null {
  const node = nodeAt(layout, from);
  if (!node || startsWith(parent, from) || !childList(layout, parent)) return null;
  let target = [...parent];
  let at = index;
  // Taking the node out shifts what comes after it in its own list.
  const fromParent = parentOf(from);
  const fromIndex = from[from.length - 1];
  if (fromParent.length <= target.length && startsWith(target, fromParent) && target.length > fromParent.length && target[fromParent.length] > fromIndex) {
    target[fromParent.length] -= 1;
  }
  if (fromParent.length === target.length && startsWith(target, fromParent) && index > fromIndex) at -= 1;
  const without = removeNode(layout, from);
  const list = childList(without, target);
  if (!list) return null;
  at = Math.max(0, Math.min(list.length, at));
  return { layout: insertNode(without, target, at, node), path: [...target, at] };
}

export function removeBand(layout: FooterLayout, index: number): FooterLayout {
  const next = clone(layout);
  next.bands.splice(index, 1);
  return next;
}

/** Puts the node in a new row or column of its own, where it stood. */
export function wrapNode(layout: FooterLayout, path: LayoutPath, type: "row" | "column"): FooterLayout {
  return updateNode(layout, path, (node) => ({ type, children: [node] }));
}

/** Dissolves a group, its children taking its place. */
export function unwrapNode(layout: FooterLayout, path: LayoutPath): FooterLayout {
  const group = nodeAt(layout, path);
  if (!group || group.type === "block") return layout;
  const next = clone(layout);
  const at = slot(next, path)!;
  at.list.splice(at.index, 1, ...group.children);
  return next;
}

/** One line of the outline. */
export interface OutlineRow {
  key: string;
  path: LayoutPath;
  depth: number;
  node?: FooterNode;
}

/** The layout as the outline lists it: each band, then its nodes, depth first. */
export function outline(layout: FooterLayout): OutlineRow[] {
  const rows: OutlineRow[] = [];
  const visit = (node: FooterNode, path: number[], depth: number) => {
    rows.push({ key: path.join("."), path, depth, node });
    if (node.type !== "block") node.children.forEach((child, i) => visit(child, [...path, i], depth + 1));
  };
  layout.bands.forEach((band, b) => {
    rows.push({ key: String(b), path: [b], depth: 0 });
    band.children.forEach((child, i) => visit(child, [b, i], 1));
  });
  return rows;
}

const blocksOf = (layout: FooterLayout): FooterBlockNode[] => {
  const found: FooterBlockNode[] = [];
  const visit = (node: FooterNode) => (node.type === "block" ? found.push(node) : node.children.forEach(visit));
  layout.bands.forEach((band) => band.children.forEach(visit));
  return found;
};

/** What the layout lacks that a player would miss, for the editor to point out. */
export function layoutWarnings(layout: FooterLayout): string[] {
  const blocks = blocksOf(layout);
  const rest = blocks.filter((node) => node.block === "chips" && node.items === "rest").length;
  const warnings: string[] = [];
  if (rest === 0) warnings.push("Brak strefy „pozostałe plakietki” – nowe plakietki, także z pluginów, nie będą nigdzie widoczne.");
  if (rest > 1) warnings.push("Kilka stref „pozostałe plakietki” – każda pokaże te same plakietki.");
  if (!blocks.some((node) => node.block === "multibinds")) warnings.push("Brak paska multibindów.");
  if (!blocks.some((node) => node.block === "vitals")) warnings.push("Brak stanu postaci.");
  if (layout.bands.some((band) => band.children.length === 0)) warnings.push("Puste pasy zostaną pominięte przy zapisie.");
  return warnings;
}

/** Drops groups and bands a move left empty (one band always stays). */
export function pruneLayout(layout: FooterLayout): FooterLayout {
  const prune = (nodes: FooterNode[]): FooterNode[] =>
    nodes
      .map((node) => (node.type === "block" ? node : { ...node, children: prune(node.children) }))
      .filter((node) => node.type === "block" || node.children.length > 0);
  const bands = layout.bands.map((band) => ({ ...band, children: prune(band.children) })).filter((band) => band.children.length > 0);
  return { bands: bands.length > 0 ? bands : [{ children: [] }] };
}

/** Moves a node into a band of its own, made at `bandIndex` (counted before the move). */
export function moveToNewBand(layout: FooterLayout, from: LayoutPath, bandIndex: number): { layout: FooterLayout; path: LayoutPath } | null {
  const node = nodeAt(layout, from);
  if (!node) return null;
  const next = clone(removeNode(layout, from));
  const at = Math.max(0, Math.min(next.bands.length, bandIndex));
  next.bands.splice(at, 0, { children: [node] });
  return locate(next, node);
}

/** Moves a band to `index`, counted before the move. */
export function moveBandTo(layout: FooterLayout, from: number, index: number): FooterLayout {
  if (from < 0 || from >= layout.bands.length) return layout;
  const next = clone(layout);
  const [band] = next.bands.splice(from, 1);
  next.bands.splice(Math.max(0, Math.min(next.bands.length, index > from ? index - 1 : index)), 0, band);
  return next;
}

/** Puts a new block into a band of its own at `bandIndex`. */
export function insertBand(layout: FooterLayout, bandIndex: number, node: FooterNode): FooterLayout {
  const next = clone(layout);
  next.bands.splice(Math.max(0, Math.min(next.bands.length, bandIndex)), 0, { children: [node] });
  return next;
}

/**
 * A layout tidied after a move, with where the moved node ended up: pruning
 * can shift paths, so the node is found again by identity.
 */
export function settle(moved: { layout: FooterLayout; path: LayoutPath }): { layout: FooterLayout; path: LayoutPath } {
  const node = nodeAt(moved.layout, moved.path);
  const pruned = pruneLayout(moved.layout);
  return node ? locate(pruned, node) ?? { layout: pruned, path: moved.path } : { layout: pruned, path: moved.path };
}

/** Where a node (compared by content) sits in a layout. */
function locate(layout: FooterLayout, target: FooterNode): { layout: FooterLayout; path: LayoutPath } | null {
  const wanted = JSON.stringify(target);
  for (const row of outline(layout)) {
    if (row.node && JSON.stringify(row.node) === wanted) return { layout, path: row.path };
  }
  return null;
}
