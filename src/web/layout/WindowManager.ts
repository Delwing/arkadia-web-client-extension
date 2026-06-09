import {
  crossDir,
  DEFAULT_DOCK_EXTENTS,
  DockSide,
  generateNodeId,
  LayoutNode,
  LayoutState,
  LeafNode,
  PopupPanelDockState,
  positionOf,
  primaryDir,
  SplitDir,
  SplitNode,
  WindowRecord,
} from './types';

export interface WindowOpenOptions {
  title?: string;
  /** Initial floating position/size if no persisted hint exists. */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** When true and no hint exists, open docked on this side instead of floating. */
  docked?: DockSide;
  dockOrder?: number;
  /** When true, ignore any persisted hint and use the supplied options. */
  ignoreHint?: boolean;
  /** Popup metadata used by the shell components. */
  isPinned?: boolean;
  isLocked?: boolean;
}

export type WindowsChangeFn = (snapshot: WindowManagerSnapshot) => void;

export interface WindowManagerSnapshot {
  windows: WindowRecord[];
  dockTrees: Record<DockSide, SplitNode | null>;
  dockExtents: Record<DockSide, number>;
}

const DEFAULT_FLOATING_SIZE = { w: 360, h: 280 };
const SIDES: DockSide[] = ['left', 'right', 'top', 'bottom'];

const emptyTrees = (): Record<DockSide, SplitNode | null> => ({
  left: null,
  right: null,
  top: null,
  bottom: null,
});

function cloneTree(node: LayoutNode | null): LayoutNode | null {
  if (!node) return null;
  if (node.kind === 'leaf') {
    return {
      kind: 'leaf',
      id: node.id,
      windowIds: [...node.windowIds],
      activeId: node.activeId,
      ...(node.placeholder ? { placeholder: true as const } : {}),
    };
  }
  return {
    kind: 'split',
    id: node.id,
    dir: node.dir,
    children: node.children.map(c => cloneTree(c)!) as LayoutNode[],
    sizes: [...node.sizes],
  };
}

/**
 * Owns the canonical window state plus the portal-target divs that move
 * physically between dock slots and the floating layer when a window is
 * docked / undocked / tabbed / split. Components consult the snapshot via
 * subscribe(), but read portal targets directly through
 * getOrCreatePortalTarget(id) — those divs are mounted/unmounted by the
 * shells (DockedPanel, TabContent, FloatingPanel) without ever destroying
 * the React subtree rendered inside them.
 *
 * Dock structure (slot order, splits, tab groups) lives in `dockTrees` — a
 * recursive per-side tree of SplitNode/LeafNode. `WindowRecord.docked` is a
 * cache of which side's tree holds a window, written only by syncDockedFlags().
 */
export class WindowManager {
  /** Live window state — keyed by panel id. Order does not matter. */
  private readonly windows = new Map<string, WindowRecord>();

  /** Structural layout tree per dock side. */
  private dockTrees: Record<DockSide, SplitNode | null> = emptyTrees();

  /** Last-known geometry for closed popups (the "hint" channel). */
  private windowHints = new Map<string, WindowRecord>();

  /** Persistent portal divs (display:contents) that move between shells. */
  private readonly portalTargets = new Map<string, HTMLDivElement>();

  /** Per-side extents (px). */
  private readonly dockExtents: Record<DockSide, number> = {
    ...DEFAULT_DOCK_EXTENTS,
  };

  /** Closed popups' persisted dock state (mirrored from LayoutState.popupPanels). */
  private popupDockState = new Map<string, PopupPanelDockState>();

  /** Built-in panel state (locks, dynamic titles, settings). */
  private builtInPanelState: LayoutState['builtInPanels'] = {};

  /** Whether the layout manager is in "managed" mode. */
  private enabled = false;
  private enabledPanels: LayoutState['enabledPanels'] = { objectList: true };

  /** Z-index counter for bringToFront. */
  private nextZ = 100;
  /** Increments on every loadState — used by hooks that need to re-register
   *  themselves after an external state replacement (e.g. Restore Default,
   *  device sync import). Exposed via getLoadVersion(). */
  private loadVersion = 0;

  private readonly listeners = new Set<WindowsChangeFn>();

  // ── Subscription ─────────────────────────────────────────────────────────

  subscribe(listener: WindowsChangeFn): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): WindowManagerSnapshot {
    return {
      windows: Array.from(this.windows.values()),
      dockTrees: this.cloneTrees(),
      dockExtents: { ...this.dockExtents },
    };
  }

  private cloneTrees(): Record<DockSide, SplitNode | null> {
    const out = emptyTrees();
    for (const side of SIDES) out[side] = cloneTree(this.dockTrees[side]) as SplitNode | null;
    return out;
  }

  private notify(): void {
    const snap = this.getSnapshot();
    for (const fn of this.listeners) {
      try {
        fn(snap);
      } catch (e) {
        console.error('[WindowManager] listener error', e);
      }
    }
  }

  /** Normalize every side, re-sync docked-flag cache, then notify listeners. */
  private commit(): void {
    for (const side of SIDES) this.normalize(side);
    this.syncDockedFlags();
    this.notify();
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  loadState(state: LayoutState): void {
    this.enabled = state.enabled;
    this.enabledPanels = { ...state.enabledPanels };
    this.builtInPanelState = { ...state.builtInPanels };
    this.popupDockState = new Map(Object.entries(state.popupPanels ?? {}));
    Object.assign(this.dockExtents, state.dockExtents);

    // Load the structural trees (deep-cloned so the manager owns them).
    this.dockTrees = emptyTrees();
    if (state.dockTrees) {
      for (const side of SIDES) {
        this.dockTrees[side] = cloneTree(state.dockTrees[side] ?? null) as SplitNode | null;
      }
    }

    // Preload windows as hints; live windows are activated by open() calls.
    // Hints are NEVER visible — visibility is owned by the live windows map.
    // The render filter (visible:true) is what gates whether a window is shown.
    // Heal previously-corrupted state: any non-docked height below the resize
    // minimum is treated as auto-height so the popup can render at all.
    this.windowHints = new Map(
      Object.entries(state.windows ?? {}).map(([id, w]) => {
        // poppedOut is a live-only state: a separate browser window can't
        // survive a reload, so always restore the panel into its prior
        // floating / docked location.
        const healed: WindowRecord = { ...w, visible: false, poppedOut: false };
        if (
          !healed.docked &&
          healed.height !== undefined &&
          healed.height < 80
        ) {
          healed.height = undefined;
        }
        return [id, healed];
      })
    );
    this.windows.clear();

    this.loadVersion++;
    this.notify();
  }

  /** Increments on every loadState. Hooks that hold a manager.open registration
   *  (popups, built-in hosts) re-issue their open() when this changes so they
   *  reappear in the live windows map after an external state replacement. */
  getLoadVersion(): number {
    return this.loadVersion;
  }

  serialize(): LayoutState {
    // Merge live windows back over the hints so the persisted record stays
    // current for open windows (and hint-only entries survive intact).
    const windowsObj: Record<string, WindowRecord> = {};
    for (const [id, w] of this.windowHints) windowsObj[id] = { ...w };
    for (const [id, w] of this.windows) windowsObj[id] = { ...w };

    const popupPanels: Record<string, PopupPanelDockState> = {};
    for (const [id, s] of this.popupDockState) popupPanels[id] = { ...s };

    return {
      enabled: this.enabled,
      enabledPanels: { ...this.enabledPanels },
      windows: windowsObj,
      dockTrees: this.cloneTrees(),
      dockExtents: { ...this.dockExtents },
      popupPanels,
      builtInPanels: { ...this.builtInPanelState },
    };
  }

  // ── Layout mode flags ────────────────────────────────────────────────────

  isEnabled(): boolean {
    return this.enabled;
  }
  setEnabled(v: boolean): void {
    if (this.enabled === v) return;
    this.enabled = v;
    this.notify();
  }

  getEnabledPanels(): LayoutState['enabledPanels'] {
    return { ...this.enabledPanels };
  }
  setEnabledPanels(p: Partial<LayoutState['enabledPanels']>): void {
    let changed = false;
    for (const k of Object.keys(p) as Array<keyof typeof p>) {
      if (this.enabledPanels[k] !== p[k]) {
        this.enabledPanels[k] = p[k]!;
        changed = true;
      }
    }
    if (changed) this.notify();
  }

  // ── Portal targets ───────────────────────────────────────────────────────

  getOrCreatePortalTarget(id: string): HTMLDivElement {
    let div = this.portalTargets.get(id);
    if (!div) {
      div = document.createElement('div');
      div.style.display = 'contents';
      this.portalTargets.set(id, div);
    }
    return div;
  }

  getPortalTarget(id: string): HTMLDivElement | undefined {
    return this.portalTargets.get(id);
  }

  destroyPortalTarget(id: string): void {
    const div = this.portalTargets.get(id);
    if (div?.parentNode) div.parentNode.removeChild(div);
    this.portalTargets.delete(id);
  }

  // ── Window lifecycle ─────────────────────────────────────────────────────

  /**
   * Activate a window. If a hint exists for this id, restore its geometry;
   * otherwise create from options. Idempotent: calling open() twice updates
   * the record.
   */
  open(id: string, opts: WindowOpenOptions = {}): void {
    const existing = this.windows.get(id);
    if (existing) {
      // Update mutable fields without disturbing geometry/docking.
      let dirty = false;
      if (opts.title !== undefined && existing.title !== opts.title) {
        existing.title = opts.title;
        dirty = true;
      }
      if (opts.isPinned !== undefined && existing.isPinned !== opts.isPinned) {
        existing.isPinned = opts.isPinned;
        dirty = true;
      }
      if (opts.isLocked !== undefined && existing.isLocked !== opts.isLocked) {
        existing.isLocked = opts.isLocked;
        dirty = true;
      }
      if (!existing.visible) {
        existing.visible = true;
        dirty = true;
      }
      if (dirty) this.notify();
      return;
    }

    const hint = !opts.ignoreHint ? this.windowHints.get(id) : undefined;
    const popupHint = this.popupDockState.get(id);

    const base: WindowRecord = hint
      ? { ...hint, visible: true }
      : {
          id,
          title: opts.title ?? id,
          visible: true,
          x: opts.x ?? 100,
          y: opts.y ?? 100,
          width: opts.width ?? DEFAULT_FLOATING_SIZE.w,
          height: opts.height,
          zIndex: ++this.nextZ,
        };

    // Refresh title / locks every open even if a hint existed.
    if (opts.title !== undefined) base.title = opts.title;
    if (opts.isPinned !== undefined) base.isPinned = opts.isPinned;
    if (opts.isLocked !== undefined) base.isLocked = opts.isLocked;

    // Does a structural tree leaf already reference this id? (persisted layout)
    const placedSide = this.findWindowSide(id);

    // Decide a desired dock side when the tree doesn't already place this id.
    let desiredSide: DockSide | undefined = placedSide ?? undefined;
    if (!placedSide) {
      if (!hint && popupHint?.isDocked && popupHint.dockPosition) {
        desiredSide = sideOfPosition(popupHint.dockPosition);
      } else if (!hint && opts.docked) {
        desiredSide = opts.docked;
      } else if (hint?.docked) {
        desiredSide = hint.docked;
      }
    }

    // Honor floating geometry from popup hint when not docked.
    if (!hint && !desiredSide && popupHint?.floatingState) {
      base.x = popupHint.floatingState.x;
      base.y = popupHint.floatingState.y;
      base.width = popupHint.floatingState.width;
      const ph = popupHint.floatingState.height;
      base.height = ph !== undefined && ph >= 80 ? ph : undefined;
    }

    this.windows.set(id, base);

    // Insert a top-level slot if the tree doesn't already place this window.
    if (!placedSide && desiredSide) {
      this.insertTopLevelLeaf(desiredSide, id);
    }

    this.commit();
  }

  close(id: string): void {
    const w = this.windows.get(id);
    if (!w) return;
    // Preserve last-known geometry as a hint. poppedOut is a live-only state —
    // never carry it into the hint, or reopening would immediately re-detach.
    this.windowHints.set(id, { ...w, visible: false, poppedOut: false });
    this.windows.delete(id);

    // Remove from the structural tree (a closed window has no slot).
    this.removeWindowFromAllTrees(id);

    // Sync popupPanels dock state for popups so shouldPopupAutoOpen reflects truth.
    if (id.startsWith('popup:')) {
      const state = this.popupDockState.get(id) ?? { isDocked: false };
      if (w.docked) {
        state.isDocked = true;
        state.dockPosition = positionOf(w.docked);
      } else {
        state.isDocked = false;
        // Auto-height popups (w.height === undefined) must NOT be persisted as
        // height: 0 — when re-opened that 0 becomes an explicit height and the
        // window renders collapsed. Preserve any prior height, else omit so the
        // popup falls back to auto-height on next open.
        const prevH = state.floatingState?.height;
        const nextH =
          w.height !== undefined
            ? w.height
            : prevH !== undefined && prevH >= 80
            ? prevH
            : undefined;
        state.floatingState = {
          x: w.x,
          y: w.y,
          width: w.width,
          height: nextH,
        };
      }
      this.popupDockState.set(id, state);
    }

    this.commit();
  }

  has(id: string): boolean {
    return this.windows.has(id);
  }

  /** Remove a window's last-known geometry hint entirely. Called when a popup
   *  is closed and not pinned, so `shouldPopupAutoOpen` doesn't see its
   *  previous dock placement on next page load. */
  purgeWindowHint(id: string): void {
    if (this.windowHints.delete(id)) {
      this.notify();
    }
  }

  get(id: string): WindowRecord | undefined {
    return this.windows.get(id);
  }

  /** Update a few fields on a live window without firing a snapshot if
   *  nothing changed. Returns true when the window was updated. */
  patch(id: string, patch: Partial<WindowRecord>): boolean {
    const w = this.windows.get(id);
    if (!w) return false;
    let dirty = false;
    for (const k of Object.keys(patch) as Array<keyof WindowRecord>) {
      if (w[k] !== patch[k]) {
        (w as unknown as Record<string, unknown>)[k] = patch[k];
        dirty = true;
      }
    }
    if (dirty) this.notify();
    return dirty;
  }

  setTitle(id: string, title: string): void {
    this.patch(id, { title });
  }

  setPinned(id: string, isPinned: boolean): void {
    this.patch(id, { isPinned });
  }

  setLocked(id: string, isLocked: boolean): void {
    this.patch(id, { isLocked });
  }

  setVisible(id: string, visible: boolean): void {
    this.patch(id, { visible });
  }

  /** Detach the window into a separate browser window (true) or restore it to
   *  its prior dock / floating location (false). The window keeps its tree leaf
   *  membership while popped out, so flipping the flag back re-renders it where
   *  it was. */
  setPoppedOut(id: string, poppedOut: boolean): void {
    const w = this.windows.get(id);
    if (!w || !!w.poppedOut === poppedOut) return;
    w.poppedOut = poppedOut;
    // Raise on restore so it lands on top of any panels opened meanwhile.
    if (!poppedOut) w.zIndex = ++this.nextZ;
    this.notify();
  }

  // ── Geometry (floating) ──────────────────────────────────────────────────

  setPosition(id: string, x: number, y: number): void {
    this.patch(id, { x, y });
  }

  setSize(id: string, width: number, height: number): void {
    this.patch(id, { width, height });
  }

  bringToFront(id: string): void {
    this.patch(id, { zIndex: ++this.nextZ });
  }

  // ── Docking (tree operations) ──────────────────────────────────────────────

  /** Dock a window to `side` at `slotIndex` as a single-window top-level slot. */
  dock(id: string, side: DockSide, slotIndex: number): void {
    const w = this.windows.get(id);
    if (!w) return;
    this.removeWindowFromAllTrees(id);
    const root = this.ensureRoot(side);
    const at = Math.max(0, Math.min(slotIndex, root.children.length));
    root.children.splice(at, 0, makeLeaf([id]));
    root.sizes.splice(at, 0, avg(root.sizes));
    this.commit();
    this.afterPlacement(id);
  }

  /** Add `id` as a tab into the leaf occupied by `targetId`. */
  tabIntoGroup(id: string, targetId: string): void {
    const w = this.windows.get(id);
    if (!w) return;
    const side = this.findWindowSide(targetId);
    if (!side) return;
    this.removeWindowFromAllTrees(id);
    const found = this.findLeafByWindow(side, targetId);
    if (!found) return;
    found.leaf.windowIds.push(id);
    found.leaf.activeId = id;
    this.commit();
    this.afterPlacement(id);
  }

  /** Join/create a split anchored on `targetId`. `dir` is the desired split
   *  axis: same as the target's parent split => sibling insert; perpendicular
   *  => wrap the target leaf in a new split node. */
  splitIntoGroup(
    id: string,
    targetId: string,
    before: boolean,
    dir?: SplitDir
  ): void {
    const w = this.windows.get(id);
    if (!w) return;
    const side = this.findWindowSide(targetId);
    if (!side) return;
    this.removeWindowFromAllTrees(id);
    this.insertBesideWindow(side, targetId, makeLeaf([id]), before, dir);
    this.commit();
    this.afterPlacement(id);
  }

  /** Insert an empty placeholder cell beside the leaf holding `id`. */
  splitWithPlaceholder(id: string, dir: SplitDir, before: boolean): void {
    const side = this.findWindowSide(id);
    if (!side) return;
    const placeholder: LeafNode = {
      kind: 'leaf',
      id: generateNodeId(),
      windowIds: [],
      activeId: '',
      placeholder: true,
    };
    this.insertBesideWindow(side, id, placeholder, before, dir);
    this.commit();
  }

  /** Drop a window into an empty placeholder leaf, turning it into a real leaf. */
  fillPlaceholder(leafId: string, windowId: string): void {
    const w = this.windows.get(windowId);
    if (!w) return;
    let target: LeafNode | undefined;
    for (const side of SIDES) {
      const f = this.findNode(side, leafId);
      if (f && f.node.kind === 'leaf') {
        target = f.node;
        break;
      }
    }
    if (!target) return;
    this.removeWindowFromAllTrees(windowId);
    target.windowIds = [windowId];
    target.activeId = windowId;
    delete target.placeholder;
    this.commit();
    this.afterPlacement(windowId);
  }

  /** Remove a node (placeholder leaf or split) from its side's tree. */
  removeNode(side: DockSide, nodeId: string): void {
    const f = this.findNode(side, nodeId);
    if (!f) return;
    if (!f.parent) {
      this.dockTrees[side] = null;
    } else {
      f.parent.children.splice(f.index, 1);
      f.parent.sizes.splice(f.index, 1);
    }
    this.commit();
  }

  /** Remove from any dock placement; convert to floating. */
  undock(
    id: string,
    visualW?: number,
    visualH?: number,
    screenX?: number,
    screenY?: number
  ): void {
    const w = this.windows.get(id);
    if (!w) return;
    const side = this.findWindowSide(id);
    if (!side) return;

    this.removeWindowFromAllTrees(id);

    if (typeof visualW === 'number') w.width = Math.max(150, visualW);
    if (typeof visualH === 'number') w.height = Math.max(80, visualH);
    if (typeof screenX === 'number') w.x = screenX;
    if (typeof screenY === 'number') w.y = screenY;
    w.zIndex = ++this.nextZ;

    this.commit();
    this.afterPlacement(id);
  }

  setActiveTab(id: string): void {
    const side = this.findWindowSide(id);
    if (!side) return;
    const found = this.findLeafByWindow(side, id);
    if (!found || found.leaf.activeId === id) return;
    found.leaf.activeId = id;
    this.notify();
  }

  /** Resize two adjacent children of a split node. */
  setNodeFlex(
    side: DockSide,
    parentNodeId: string,
    childIndex: number,
    flexA: number,
    flexB: number
  ): void {
    const f = this.findNode(side, parentNodeId);
    if (!f || f.node.kind !== 'split') return;
    const node = f.node;
    if (childIndex < 0 || childIndex + 1 >= node.sizes.length) return;
    node.sizes[childIndex] = flexA;
    node.sizes[childIndex + 1] = flexB;
    this.notify();
  }

  setDockExtent(side: DockSide, n: number): void {
    if (this.dockExtents[side] === n) return;
    this.dockExtents[side] = Math.max(80, n);
    this.notify();
  }

  getDockExtent(side: DockSide): number {
    return this.dockExtents[side];
  }

  // ── Popup dock state mirror ──────────────────────────────────────────────

  getPopupDockState(id: string): PopupPanelDockState | undefined {
    return this.popupDockState.get(id);
  }

  updatePopupDockState(id: string, patch: Partial<PopupPanelDockState>): void {
    const cur = this.popupDockState.get(id) ?? { isDocked: false };
    this.popupDockState.set(id, { ...cur, ...patch });
    this.notify();
  }

  // ── Built-in panel state ─────────────────────────────────────────────────

  getBuiltInPanelState(id: string) {
    return this.builtInPanelState[id];
  }

  updateBuiltInPanelState(id: string, patch: Partial<LayoutState['builtInPanels'][string]>): void {
    const cur = this.builtInPanelState[id] ?? {};
    this.builtInPanelState[id] = { ...cur, ...patch };
    this.notify();
  }

  /**
   * Mirror a single built-in panel setting that was just written straight to
   * storage (via setBuiltInPanelSetting) into the live in-memory copy. Without
   * this, the next serialize() would overwrite the freshly-persisted value with
   * the stale snapshot loaded at startup. No notify(): storage already holds the
   * value, so there is nothing new to persist or re-render.
   */
  syncBuiltInPanelSetting(id: string, key: string, value: unknown): void {
    const cur = this.builtInPanelState[id] ?? {};
    this.builtInPanelState[id] = {
      ...cur,
      settings: { ...(cur.settings ?? {}), [key]: value },
    };
  }

  // ── Lookups ────────────────────────────────────────────────────────────────

  /** Find which side a panel is docked to (or null). */
  findPanelDock(id: string): DockSide | null {
    return this.windows.get(id)?.docked ?? this.findWindowSide(id) ?? null;
  }

  findFloatingPanel(id: string): WindowRecord | null {
    const w = this.windows.get(id);
    return w && !this.findWindowSide(id) ? w : null;
  }

  // ── Tree helpers ───────────────────────────────────────────────────────────

  private ensureRoot(side: DockSide): SplitNode {
    let root = this.dockTrees[side];
    if (!root) {
      root = {
        kind: 'split',
        id: generateNodeId(),
        dir: primaryDir(side),
        children: [],
        sizes: [],
      };
      this.dockTrees[side] = root;
    }
    return root;
  }

  private insertTopLevelLeaf(side: DockSide, id: string): void {
    const root = this.ensureRoot(side);
    root.children.push(makeLeaf([id]));
    root.sizes.push(avg(root.sizes));
  }

  /** Insert `newLeaf` beside the leaf holding `targetId`. desiredDir defaults
   *  to the cross-axis of the side. Same dir as the parent => sibling insert;
   *  perpendicular => wrap the target leaf in a new split node. */
  private insertBesideWindow(
    side: DockSide,
    targetId: string,
    newLeaf: LeafNode,
    before: boolean,
    desiredDir?: SplitDir
  ): void {
    const found = this.findLeafByWindow(side, targetId);
    if (!found) return;
    const { leaf, parent, index } = found;
    const dir = desiredDir ?? crossDir(side);
    // parent is always defined: the root is always a SplitNode.
    if (!parent) return;
    if (parent.dir === dir) {
      const at = before ? index : index + 1;
      parent.children.splice(at, 0, newLeaf);
      parent.sizes.splice(at, 0, avg(parent.sizes));
    } else {
      const wrap: SplitNode = {
        kind: 'split',
        id: generateNodeId(),
        dir,
        children: before ? [newLeaf, leaf] : [leaf, newLeaf],
        sizes: [1, 1],
      };
      parent.children[index] = wrap;
      // wrap inherits the leaf's former size slot (parent.sizes[index]).
    }
  }

  private findWindowSide(id: string): DockSide | null {
    for (const side of SIDES) {
      if (this.findLeafByWindow(side, id)) return side;
    }
    return null;
  }

  private findLeafByWindow(
    side: DockSide,
    windowId: string
  ): { leaf: LeafNode; parent: SplitNode | null; index: number } | null {
    const root = this.dockTrees[side];
    if (!root) return null;
    let result: { leaf: LeafNode; parent: SplitNode | null; index: number } | null = null;
    const walk = (node: LayoutNode, parent: SplitNode | null, index: number) => {
      if (result) return;
      if (node.kind === 'leaf') {
        if (node.windowIds.includes(windowId)) result = { leaf: node, parent, index };
        return;
      }
      node.children.forEach((c, i) => walk(c, node, i));
    };
    walk(root, null, -1);
    return result;
  }

  private findNode(
    side: DockSide,
    nodeId: string
  ): { node: LayoutNode; parent: SplitNode | null; index: number } | null {
    const root = this.dockTrees[side];
    if (!root) return null;
    let result: { node: LayoutNode; parent: SplitNode | null; index: number } | null = null;
    const walk = (node: LayoutNode, parent: SplitNode | null, index: number) => {
      if (result) return;
      if (node.id === nodeId) {
        result = { node, parent, index };
        return;
      }
      if (node.kind === 'split') node.children.forEach((c, i) => walk(c, node, i));
    };
    walk(root, null, -1);
    return result;
  }

  /** Detach a window id from every tree leaf; prune leaves that become empty
   *  (unless they're intentional placeholders). Does not normalize. */
  private removeWindowFromAllTrees(id: string): void {
    for (const side of SIDES) {
      const found = this.findLeafByWindow(side, id);
      if (!found) continue;
      const { leaf } = found;
      leaf.windowIds = leaf.windowIds.filter(w => w !== id);
      if (leaf.activeId === id) {
        leaf.activeId = leaf.windowIds[leaf.windowIds.length - 1] ?? '';
      }
      // normalize() prunes the now-empty leaf.
    }
  }

  /** Rebuild the `docked` cache on every live window from current trees. The
   *  ONLY method allowed to write WindowRecord.docked. */
  private syncDockedFlags(): void {
    const placement = new Map<string, DockSide>();
    for (const side of SIDES) {
      const root = this.dockTrees[side];
      if (!root) continue;
      forEachLeaf(root, leaf => {
        for (const wid of leaf.windowIds) placement.set(wid, side);
      });
    }
    for (const w of this.windows.values()) {
      const side = placement.get(w.id);
      if (w.docked !== side) w.docked = side;
    }
  }

  /** Normalize a side's tree in place: prune empty non-placeholder leaves,
   *  merge nested same-dir splits, collapse single-child splits (except the
   *  root), null out an empty root. */
  private normalize(side: DockSide): void {
    const root = this.dockTrees[side];
    if (!root) return;
    const norm = normalizeNode(root, true);
    this.dockTrees[side] = norm && norm.kind === 'split' ? norm : null;
  }

  /** Sync popup dock state after a placement change (popups only). */
  private afterPlacement(id: string): void {
    if (!id.startsWith('popup:')) return;
    const w = this.windows.get(id);
    if (w) this.syncPopupDockState(w);
  }

  private syncPopupDockState(w: WindowRecord): void {
    if (!w.id.startsWith('popup:')) return;
    const state = this.popupDockState.get(w.id) ?? { isDocked: false };
    if (w.docked) {
      state.isDocked = true;
      state.dockPosition = positionOf(w.docked);
    } else {
      state.isDocked = false;
      const prevH = state.floatingState?.height;
      const nextH =
        w.height !== undefined
          ? w.height
          : prevH !== undefined && prevH >= 80
          ? prevH
          : undefined;
      state.floatingState = {
        x: w.x,
        y: w.y,
        width: w.width,
        height: nextH,
      };
      state.userModifiedPosition = true;
    }
    this.popupDockState.set(w.id, state);
  }
}

// ── Module helpers ───────────────────────────────────────────────────────────

function makeLeaf(windowIds: string[]): LeafNode {
  return {
    kind: 'leaf',
    id: generateNodeId(),
    windowIds: [...windowIds],
    activeId: windowIds[0] ?? '',
  };
}

function avg(sizes: number[]): number {
  if (sizes.length === 0) return 1;
  return sizes.reduce((a, b) => a + b, 0) / sizes.length || 1;
}

function forEachLeaf(node: LayoutNode, cb: (leaf: LeafNode) => void): void {
  if (node.kind === 'leaf') {
    cb(node);
    return;
  }
  for (const c of node.children) forEachLeaf(c, cb);
}

/** Pure normalization. Returns the normalized node, or null when it collapses
 *  away entirely. The root is never collapsed to a leaf (isRoot keeps it a
 *  SplitNode) so `dock()` always has a root to insert into. */
function normalizeNode(node: LayoutNode, isRoot: boolean): LayoutNode | null {
  if (node.kind === 'leaf') {
    if (node.windowIds.length === 0 && !node.placeholder) return null;
    return node;
  }

  const children: LayoutNode[] = [];
  const sizes: number[] = [];
  node.children.forEach((child, i) => {
    const n = normalizeNode(child, false);
    if (n === null) return;
    if (n.kind === 'split' && n.dir === node.dir) {
      // Merge a same-dir child split: splice its grandchildren in, scaling
      // their sizes so the merged block keeps the child's former proportion.
      const share = node.sizes[i] ?? 1;
      const tot = n.sizes.reduce((a, b) => a + b, 0) || 1;
      n.children.forEach((gc, j) => {
        children.push(gc);
        sizes.push(share * ((n.sizes[j] ?? 1) / tot));
      });
    } else {
      children.push(n);
      sizes.push(node.sizes[i] ?? 1);
    }
  });

  if (children.length === 0) return null;
  if (children.length === 1 && !isRoot) return children[0];
  return { kind: 'split', id: node.id, dir: node.dir, children, sizes };
}

// positionOf is imported; small local inverse for popupHint.dockPosition.
function sideOfPosition(p: string): DockSide {
  return p.toLowerCase() as DockSide;
}

// Singleton: one WindowManager for the whole app.
export const windowManager = new WindowManager();
