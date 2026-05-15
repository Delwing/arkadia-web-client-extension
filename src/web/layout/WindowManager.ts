import {
  DEFAULT_DOCK_EXTENTS,
  DockSide,
  generateSplitGroupId,
  generateTabGroupId,
  LayoutState,
  PopupPanelDockState,
  positionOf,
  sideOf,
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
  dockExtents: Record<DockSide, number>;
}

const DEFAULT_FLOATING_SIZE = { w: 360, h: 280 };

/**
 * Owns the canonical window state plus the portal-target divs that move
 * physically between dock slots and the floating layer when a window is
 * docked / undocked / tabbed / split. Components consult the snapshot via
 * subscribe(), but read portal targets directly through
 * getOrCreatePortalTarget(id) — those divs are mounted/unmounted by the
 * shells (DockedPanel, TabContent, FloatingPanel) without ever destroying
 * the React subtree rendered inside them.
 */
export class WindowManager {
  /** Live window state — keyed by panel id. Order does not matter. */
  private readonly windows = new Map<string, WindowRecord>();

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
  /** Slot ordering counter — used when adding new dock slots. */
  private nextDockOrder = 0;
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
      dockExtents: { ...this.dockExtents },
    };
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

  // ── Persistence ──────────────────────────────────────────────────────────

  loadState(state: LayoutState): void {
    this.enabled = state.enabled;
    this.enabledPanels = { ...state.enabledPanels };
    this.builtInPanelState = { ...state.builtInPanels };
    this.popupDockState = new Map(Object.entries(state.popupPanels ?? {}));
    Object.assign(this.dockExtents, state.dockExtents);

    // Preload windows as hints; live windows are activated by open() calls.
    // Hints are NEVER visible — visibility is owned by the live windows map.
    // The render filter (visible:true) is what gates whether a window is shown.
    this.windowHints = new Map(
      Object.entries(state.windows ?? {}).map(([id, w]) => [
        id,
        { ...w, visible: false },
      ])
    );
    this.windows.clear();

    this.recomputeDockOrderCounter();
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

    // If no hint provided dock placement but popup state remembers one, restore.
    if (!hint && popupHint?.isDocked && popupHint.dockPosition) {
      base.docked = sideOf(popupHint.dockPosition);
      base.dockOrder = popupHint.dockOrder ?? this.nextDockOrder++;
      base.dockFlex = base.dockFlex ?? 1;
    }

    // Honor explicit options when no hint.
    if (!hint && opts.docked) {
      base.docked = opts.docked;
      base.dockOrder = opts.dockOrder ?? this.nextDockOrder++;
      base.dockFlex = base.dockFlex ?? 1;
    }

    if (!hint && popupHint?.floatingState && !base.docked) {
      base.x = popupHint.floatingState.x;
      base.y = popupHint.floatingState.y;
      base.width = popupHint.floatingState.width;
      base.height = popupHint.floatingState.height;
    }

    this.windows.set(id, base);
    this.notify();
  }

  close(id: string): void {
    const w = this.windows.get(id);
    if (!w) return;
    // Preserve last-known geometry as a hint.
    this.windowHints.set(id, { ...w, visible: false });
    this.windows.delete(id);

    // Sync popupPanels dock state for popups so shouldPopupAutoOpen reflects truth.
    if (id.startsWith('popup:')) {
      const state = this.popupDockState.get(id) ?? { isDocked: false };
      if (w.docked) {
        state.isDocked = true;
        state.dockPosition = positionOf(w.docked);
        state.dockOrder = w.dockOrder;
      } else {
        state.isDocked = false;
        state.floatingState = {
          x: w.x,
          y: w.y,
          width: w.width,
          height: w.height ?? state.floatingState?.height ?? 0,
        };
      }
      this.popupDockState.set(id, state);
    }

    this.notify();
  }

  has(id: string): boolean {
    return this.windows.has(id);
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (w as any)[k] = patch[k];
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

  // ── Docking ──────────────────────────────────────────────────────────────

  /** Dock a window to `side` at `slotIndex` as a single-slot panel. */
  dock(id: string, side: DockSide, slotIndex: number): void {
    const w = this.windows.get(id);
    if (!w) return;
    // Remove from any current tab/split group.
    this.detachFromGroups(w);
    // Shift other panels at this side to make room.
    this.makeRoomAtDockOrder(side, slotIndex);
    w.docked = side;
    w.dockOrder = slotIndex;
    w.dockFlex = w.dockFlex ?? 1;
    this.normalizeDockOrders(side);
    this.syncPopupDockState(w);
    this.notify();
  }

  /** Add `id` as a tab into the slot occupied by `targetId`. */
  tabIntoGroup(id: string, targetId: string): void {
    const w = this.windows.get(id);
    const t = this.windows.get(targetId);
    if (!w || !t || !t.docked) return;
    this.detachFromGroups(w);

    // If target already has a dockGroup, join it. Otherwise create one.
    let groupId = t.dockGroup;
    if (!groupId) {
      groupId = generateTabGroupId();
      t.dockGroup = groupId;
      t.tabOrder = 0;
      t.isActiveTab = true;
    }
    const groupMembers = this.windowsInDockGroup(groupId);
    w.docked = t.docked;
    w.dockOrder = t.dockOrder;
    w.dockFlex = t.dockFlex ?? 1;
    // Inherit split-group placement from the target so the new tab lands in
    // the target's split cell rather than being rendered as its own dock slot
    // at the same dockOrder (which would visually duplicate the slot).
    w.splitGroup = t.splitGroup;
    w.splitOrder = t.splitOrder;
    w.splitFlex = t.splitFlex;
    w.dockGroup = groupId;
    w.tabOrder = groupMembers.length;
    w.isActiveTab = true;
    // Promote the new tab to active; demote others in the group.
    for (const m of groupMembers) m.isActiveTab = false;
    w.isActiveTab = true;
    this.syncPopupDockState(w);
    this.notify();
  }

  /** Join a split group (cross-axis) anchored on `targetId`. */
  splitIntoGroup(id: string, targetId: string, before: boolean): void {
    const w = this.windows.get(id);
    const t = this.windows.get(targetId);
    if (!w || !t || !t.docked) return;
    this.detachFromGroups(w);

    let groupId = t.splitGroup;
    if (!groupId) {
      // Bootstrap a new split group. If the target is part of a tab group,
      // ALL tab members join the new split at the same splitOrder so the
      // tab group is split as a single unit (otherwise the un-joined tab
      // siblings would be rendered as a phantom second slot at the same
      // dockOrder).
      groupId = generateSplitGroupId();
      const tabMembers = t.dockGroup
        ? this.windowsInDockGroup(t.dockGroup)
        : [t];
      for (const m of tabMembers) {
        m.splitGroup = groupId;
        m.splitOrder = 0;
        m.splitFlex = 1;
      }
    }

    // Group existing members into cells keyed by splitOrder. A cell is one
    // visual column/row in the split — tab-group members at the same
    // splitOrder form a single cell.
    const members = this.windowsInSplitGroup(groupId);
    const cellsByOrder = new Map<number, WindowRecord[]>();
    for (const m of members) {
      const order = m.splitOrder ?? 0;
      if (!cellsByOrder.has(order)) cellsByOrder.set(order, []);
      cellsByOrder.get(order)!.push(m);
    }
    const sortedOrders = Array.from(cellsByOrder.keys()).sort((a, b) => a - b);
    const cells: WindowRecord[][] = sortedOrders.map(o => cellsByOrder.get(o)!);

    const targetIdx = cells.findIndex(cell => cell.some(m => m.id === t.id));
    const insertIdx = before ? targetIdx : targetIdx + 1;

    // Stamp the new window with split membership before splicing it in.
    w.docked = t.docked;
    w.dockOrder = t.dockOrder;
    w.dockFlex = t.dockFlex ?? 1;
    w.splitGroup = groupId;
    w.splitFlex = 1;

    cells.splice(insertIdx, 0, [w]);

    // Re-assign contiguous splitOrders 0..N-1 by cell index.
    cells.forEach((cell, idx) => {
      for (const m of cell) m.splitOrder = idx;
    });

    this.syncPopupDockState(w);
    this.notify();
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
    if (!w || !w.docked) return;

    this.detachFromGroups(w);
    w.docked = undefined;
    w.dockOrder = undefined;
    w.dockFlex = undefined;
    w.dockGroup = undefined;
    w.tabOrder = undefined;
    w.isActiveTab = undefined;
    w.splitGroup = undefined;
    w.splitOrder = undefined;
    w.splitFlex = undefined;

    if (typeof visualW === 'number') w.width = Math.max(150, visualW);
    if (typeof visualH === 'number') w.height = Math.max(80, visualH);
    if (typeof screenX === 'number') w.x = screenX;
    if (typeof screenY === 'number') w.y = screenY;
    w.zIndex = ++this.nextZ;

    this.syncPopupDockState(w);
    this.notify();
  }

  setActiveTab(id: string): void {
    const w = this.windows.get(id);
    if (!w?.dockGroup) return;
    const members = this.windowsInDockGroup(w.dockGroup);
    let changed = false;
    for (const m of members) {
      const next = m.id === id;
      if (m.isActiveTab !== next) {
        m.isActiveTab = next;
        changed = true;
      }
    }
    if (changed) this.notify();
  }

  setSlotFlex(slotKey: string, flex: number): void {
    // slotKey is either a window id (single slot), a dockGroup, or a splitGroup.
    // Adjust dockFlex on all matching windows.
    let changed = false;
    for (const w of this.windows.values()) {
      if (
        w.id === slotKey ||
        w.dockGroup === slotKey ||
        w.splitGroup === slotKey
      ) {
        if (w.dockFlex !== flex) {
          w.dockFlex = flex;
          changed = true;
        }
      }
    }
    if (changed) this.notify();
  }

  setSplitFlex(splitMemberId: string, flex: number): void {
    // splitMemberId may be a window id directly, OR a tab-group member id
    // (in which case all members of that tab-group share splitFlex).
    const w = this.windows.get(splitMemberId);
    if (!w) return;
    let changed = false;
    if (w.dockGroup) {
      for (const m of this.windowsInDockGroup(w.dockGroup)) {
        if (m.splitFlex !== flex) {
          m.splitFlex = flex;
          changed = true;
        }
      }
    } else {
      if (w.splitFlex !== flex) {
        w.splitFlex = flex;
        changed = true;
      }
    }
    if (changed) this.notify();
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

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Find which side a panel is docked to (or null). */
  findPanelDock(id: string): DockSide | null {
    return this.windows.get(id)?.docked ?? null;
  }

  findFloatingPanel(id: string): WindowRecord | null {
    const w = this.windows.get(id);
    return w && !w.docked ? w : null;
  }

  /** Find the logical slot grouping for a panel. Returns the dock side and a
   *  pseudo-slot id (window id for single, dockGroup for tabs, splitGroup
   *  for splits). */
  findPanelSlot(
    id: string
  ): { dock: DockSide; slotId: string } | null {
    const w = this.windows.get(id);
    if (!w?.docked) return null;
    const slotId = w.splitGroup ?? w.dockGroup ?? w.id;
    return { dock: w.docked, slotId };
  }

  private windowsInDockGroup(groupId: string): WindowRecord[] {
    const out: WindowRecord[] = [];
    for (const w of this.windows.values()) {
      if (w.dockGroup === groupId) out.push(w);
    }
    return out;
  }

  private windowsInSplitGroup(groupId: string): WindowRecord[] {
    const out: WindowRecord[] = [];
    for (const w of this.windows.values()) {
      if (w.splitGroup === groupId) out.push(w);
    }
    return out;
  }

  /** When removing a window from a group, clean up its membership and any
   *  resulting one-member group. */
  private detachFromGroups(w: WindowRecord): void {
    if (w.dockGroup) {
      const others = this.windowsInDockGroup(w.dockGroup).filter(m => m.id !== w.id);
      if (others.length === 1) {
        // Tab group collapses — clear groupings on the remaining member.
        const m = others[0];
        m.dockGroup = undefined;
        m.tabOrder = undefined;
        m.isActiveTab = undefined;
      } else if (others.length > 1) {
        // Re-pack tabOrder + ensure one tab stays active.
        others.sort((a, b) => (a.tabOrder ?? 0) - (b.tabOrder ?? 0));
        let activeFound = false;
        others.forEach((m, i) => {
          m.tabOrder = i;
          if (m.isActiveTab) activeFound = true;
        });
        if (!activeFound) others[0].isActiveTab = true;
      }
    }

    if (w.splitGroup) {
      const others = this.windowsInSplitGroup(w.splitGroup).filter(m => m.id !== w.id);
      if (others.length > 0) {
        // Group remaining members into cells keyed by splitOrder — tab-group
        // members at the same splitOrder share a cell and must stay paired.
        const cellsByOrder = new Map<number, WindowRecord[]>();
        for (const m of others) {
          const order = m.splitOrder ?? 0;
          if (!cellsByOrder.has(order)) cellsByOrder.set(order, []);
          cellsByOrder.get(order)!.push(m);
        }
        const sortedOrders = Array.from(cellsByOrder.keys()).sort((a, b) => a - b);

        if (sortedOrders.length <= 1) {
          // Only one cell left — the split group is no longer needed. Strip
          // split fields off the remaining members (a tab group survives
          // intact as a non-split slot).
          for (const m of others) {
            m.splitGroup = undefined;
            m.splitOrder = undefined;
            m.splitFlex = undefined;
          }
        } else {
          // Multiple cells: re-pack splitOrders contiguously by cell index
          // so cells stay grouped (members sharing a cell keep the same
          // splitOrder).
          sortedOrders.forEach((order, idx) => {
            for (const m of cellsByOrder.get(order)!) m.splitOrder = idx;
          });
        }
      }
    }

    w.dockGroup = undefined;
    w.tabOrder = undefined;
    w.isActiveTab = undefined;
    w.splitGroup = undefined;
    w.splitOrder = undefined;
    w.splitFlex = undefined;
  }

  private makeRoomAtDockOrder(side: DockSide, slotIndex: number): void {
    // Shift existing slot heads (singles, tab-group-actives, split-group-firsts) at or
    // after the insertion point by +1.
    const taken = new Set<string>();
    for (const w of this.windows.values()) {
      if (w.docked !== side) continue;
      if ((w.dockOrder ?? 0) >= slotIndex) {
        // Increment the slot order for this *slot* once (not per member).
        const key = w.splitGroup ?? w.dockGroup ?? w.id;
        if (taken.has(key)) continue;
        taken.add(key);
      }
    }
    for (const w of this.windows.values()) {
      if (w.docked !== side) continue;
      if ((w.dockOrder ?? 0) >= slotIndex) {
        w.dockOrder = (w.dockOrder ?? 0) + 1;
      }
    }
  }

  private normalizeDockOrders(side: DockSide): void {
    // Group windows by slot key (splitGroup || dockGroup || id) and renumber
    // them densely starting at 0, preserving relative order. All members of a
    // slot must share the same dockOrder.
    const slots = new Map<string, WindowRecord[]>();
    for (const w of this.windows.values()) {
      if (w.docked !== side) continue;
      const key = w.splitGroup ?? w.dockGroup ?? w.id;
      const arr = slots.get(key) ?? [];
      arr.push(w);
      slots.set(key, arr);
    }
    const entries = Array.from(slots.entries()).sort(
      (a, b) => (a[1][0].dockOrder ?? 0) - (b[1][0].dockOrder ?? 0)
    );
    entries.forEach(([, members], i) => {
      for (const m of members) m.dockOrder = i;
    });
    this.nextDockOrder = Math.max(this.nextDockOrder, entries.length);
  }

  private recomputeDockOrderCounter(): void {
    let max = 0;
    for (const w of this.windows.values()) {
      if (w.docked && (w.dockOrder ?? 0) >= max) max = (w.dockOrder ?? 0) + 1;
    }
    this.nextDockOrder = max;
  }

  private syncPopupDockState(w: WindowRecord): void {
    if (!w.id.startsWith('popup:')) return;
    const state = this.popupDockState.get(w.id) ?? { isDocked: false };
    if (w.docked) {
      state.isDocked = true;
      state.dockPosition = positionOf(w.docked);
      state.dockOrder = w.dockOrder;
    } else {
      state.isDocked = false;
      state.floatingState = {
        x: w.x,
        y: w.y,
        width: w.width,
        height: w.height ?? state.floatingState?.height ?? 0,
      };
      state.userModifiedPosition = true;
    }
    this.popupDockState.set(w.id, state);
  }
}

// Singleton: one WindowManager for the whole app.
export const windowManager = new WindowManager();
