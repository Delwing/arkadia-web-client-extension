import {
  BuiltInPanelState,
  crossDir,
  DEFAULT_DOCK_EXTENTS,
  DEFAULT_LAYOUT,
  DockSide,
  generateNodeId,
  generateSplitGroupId,
  LayoutState,
  LeafNode,
  LegacyDockState,
  LegacyDockSlot,
  LegacyLayoutState,
  PANEL_CONFIGS,
  PopupPanelDockState,
  primaryDir,
  SplitNode,
  WindowRecord,
} from '../types';
import eventBus from '@modules/core/eventBus';
import { globalStorage } from '@modules/core/storage';
import { windowManager } from '../WindowManager';

// ─── Migration ────────────────────────────────────────────────────────────

/** True when the stored object uses the windows-keyed shape (v1 flat fields or
 *  v2 with dockTrees). */
export function isNewLayoutShape(obj: unknown): obj is Partial<LayoutState> {
  return (
    obj != null &&
    typeof obj === 'object' &&
    'windows' in (obj as Record<string, unknown>) &&
    typeof (obj as { windows?: unknown }).windows === 'object'
  );
}

/** True when the stored object already carries dockTrees (v2 — tree shape). */
function hasDockTrees(obj: unknown): boolean {
  return (
    obj != null &&
    typeof obj === 'object' &&
    'dockTrees' in (obj as Record<string, unknown>) &&
    (obj as { dockTrees?: unknown }).dockTrees != null
  );
}

const STRUCTURAL_FIELDS: Array<keyof WindowRecord> = [
  'dockOrder',
  'dockFlex',
  'dockGroup',
  'tabOrder',
  'isActiveTab',
  'splitGroup',
  'splitOrder',
  'splitFlex',
];

/** Strip the deprecated flat structural fields off records after their info has
 *  been folded into dockTrees. */
function stripStructuralFields(windows: Record<string, WindowRecord>): void {
  for (const w of Object.values(windows)) {
    for (const f of STRUCTURAL_FIELDS) delete w[f];
  }
}

function makeLeafNode(ids: string[]): LeafNode {
  return {
    kind: 'leaf',
    id: generateNodeId(),
    windowIds: [...ids],
    activeId: ids[0] ?? '',
  };
}

/** A "cell" is one or more windows sharing a split slot. >1 (or a dockGroup) =
 *  tab group leaf; otherwise a single-window leaf. */
function leafFromCell(cell: WindowRecord[]): LeafNode {
  if (cell.length > 1 || cell[0].dockGroup) {
    const sorted = [...cell].sort((a, b) => (a.tabOrder ?? 0) - (b.tabOrder ?? 0));
    const active = sorted.find(p => p.isActiveTab) ?? sorted[0];
    return {
      kind: 'leaf',
      id: generateNodeId(),
      windowIds: sorted.map(p => p.id),
      activeId: active.id,
    };
  }
  return makeLeafNode([cell[0].id]);
}

/** Build a single side's tree from flat WindowRecord structural fields,
 *  reproducing the legacy DockArea.slots + SplitGroupPanel grouping so migrated
 *  layouts render identically. */
function buildSideTree(
  side: DockSide,
  windows: Record<string, WindowRecord>
): SplitNode | null {
  const docked = Object.values(windows)
    .filter(w => w.docked === side)
    .sort((a, b) => (a.dockOrder ?? 0) - (b.dockOrder ?? 0));
  if (docked.length === 0) return null;

  const root: SplitNode = {
    kind: 'split',
    id: generateNodeId(),
    dir: primaryDir(side),
    children: [],
    sizes: [],
  };
  const seen = new Set<string>();

  for (const w of docked) {
    if (w.splitGroup) {
      if (seen.has(w.splitGroup)) continue;
      seen.add(w.splitGroup);
      const members = docked.filter(p => p.splitGroup === w.splitGroup);
      const cellsByOrder = new Map<number, WindowRecord[]>();
      for (const m of members) {
        const o = m.splitOrder ?? 0;
        const arr = cellsByOrder.get(o) ?? [];
        arr.push(m);
        cellsByOrder.set(o, arr);
      }
      const orders = Array.from(cellsByOrder.keys()).sort((a, b) => a - b);
      const splitNode: SplitNode = {
        kind: 'split',
        id: generateNodeId(),
        dir: crossDir(side),
        children: [],
        sizes: [],
      };
      for (const o of orders) {
        const cell = cellsByOrder.get(o)!;
        splitNode.children.push(leafFromCell(cell));
        splitNode.sizes.push(cell[0].splitFlex ?? 1);
      }
      root.children.push(splitNode);
      root.sizes.push(w.dockFlex ?? 1);
    } else if (w.dockGroup) {
      if (seen.has(w.dockGroup)) continue;
      seen.add(w.dockGroup);
      const members = docked.filter(p => p.dockGroup === w.dockGroup);
      root.children.push(leafFromCell(members));
      root.sizes.push(w.dockFlex ?? 1);
    } else {
      if (seen.has(w.id)) continue;
      seen.add(w.id);
      root.children.push(makeLeafNode([w.id]));
      root.sizes.push(w.dockFlex ?? 1);
    }
  }

  return root.children.length ? root : null;
}

/** Build dockTrees for all four sides from flat structural fields. */
export function migrateFlatWindowsToTrees(
  windows: Record<string, WindowRecord>
): Record<DockSide, SplitNode | null> {
  return {
    left: buildSideTree('left', windows),
    right: buildSideTree('right', windows),
    top: buildSideTree('top', windows),
    bottom: buildSideTree('bottom', windows),
  };
}

function cloneDefaultTrees(): Record<DockSide, SplitNode | null> {
  return JSON.parse(JSON.stringify(DEFAULT_LAYOUT.dockTrees));
}

function migrateSide(
  side: DockSide,
  dock: LegacyDockState | undefined,
  windows: Record<string, WindowRecord>,
  baseZ: { z: number }
): number {
  if (!dock) return DEFAULT_DOCK_EXTENTS[side];

  // Legacy-legacy: flat `panels` array, no slots — treat each as a single slot.
  const slots: LegacyDockSlot[] =
    dock.slots ??
    (dock.panels?.map((p, i) => ({
      id: `legacy-${side}-${i}-${p.id}`,
      panels: [{ ...p, size: 100 }],
      size: 100,
    })) ??
      []);

  slots.forEach((slot, slotIdx) => {
    const slotPanels = slot.panels ?? [];
    const multi = slotPanels.length > 1;
    const splitGroupId = multi
      ? slot.id || generateSplitGroupId()
      : undefined;

    slotPanels.forEach((p, j) => {
      const panelConfig = PANEL_CONFIGS[p.id];
      const w: WindowRecord = {
        id: p.id,
        title: panelConfig?.title ?? p.id,
        visible: true,
        x: 0,
        y: 0,
        width: panelConfig?.minWidth ?? 320,
        height: panelConfig?.minHeight ?? 240,
        zIndex: ++baseZ.z,
        docked: side,
        dockOrder: slotIdx,
        dockFlex: (slot.size ?? 100) / 100,
      };
      if (multi) {
        w.splitGroup = splitGroupId;
        w.splitOrder = j;
        w.splitFlex = (p.size ?? 100) / 100;
      }
      windows[p.id] = w;
    });
  });

  return typeof dock.size === 'number'
    ? dock.size
    : DEFAULT_DOCK_EXTENTS[side];
}

export function migrateLayoutState(legacy: LegacyLayoutState): LayoutState {
  const windows: Record<string, WindowRecord> = {};
  const baseZ = { z: 10 };

  const dockExtents: Record<DockSide, number> = {
    left: migrateSide('left', legacy.docks?.left, windows, baseZ),
    right: migrateSide('right', legacy.docks?.right, windows, baseZ),
    top: migrateSide('top', legacy.docks?.top, windows, baseZ),
    bottom: migrateSide('bottom', legacy.docks?.bottom, windows, baseZ),
  };

  // Floating panels — only emit if not already in `windows` (a panel can't be
  // simultaneously docked and floating).
  for (const f of legacy.floatingPanels ?? []) {
    if (windows[f.id]) continue;
    const panelConfig = PANEL_CONFIGS[f.id];
    windows[f.id] = {
      id: f.id,
      title: panelConfig?.title ?? f.id,
      visible: true,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      zIndex: ++baseZ.z,
    };
  }

  // Ensure built-ins always have a record (so they can be opened/closed without
  // creating defaults each time).
  for (const id of ['map', 'objectList'] as const) {
    if (!windows[id]) {
      windows[id] = { ...DEFAULT_LAYOUT.windows[id] };
    }
  }

  // Fold the flat structural fields into per-side trees, then strip them.
  const dockTrees = migrateFlatWindowsToTrees(windows);
  stripStructuralFields(windows);

  return {
    enabled: !!legacy.enabled,
    spanningDocks: 'topBottom',
    uiLocked: false,
    enabledPanels: {
      objectList: legacy.enabledPanels?.objectList ?? true,
    },
    windows,
    dockTrees,
    dockExtents,
    popupPanels: legacy.popupPanels ?? {},
    builtInPanels: legacy.builtInPanels ?? {},
  };
}

function ensureBuiltIns(state: LayoutState): LayoutState {
  for (const id of ['map', 'objectList'] as const) {
    if (!state.windows[id]) {
      state.windows[id] = { ...DEFAULT_LAYOUT.windows[id] };
    }
  }
  return state;
}

// ─── UI capability: shell-forced layout fields ────────────────────────────
// Some shells (forge-ui) ARE the dock grid: their chrome only works with layout
// mode on, the built-in objectList slot enabled and the rail-span arrangement.
// The stock UI treats all three as user choices, and both UIs share the same
// persisted `layoutManagerState` — so a shell must never write its own
// requirements into storage (merely opening forge would otherwise flip the
// stock UI's "Menedzer Okien" on). Instead it declares them as process-local
// overrides: loadLayoutState() reports them as set, while saveLayoutState()
// writes the persisted (user-chosen) value back for those fields.
export type LayoutOverrides = Partial<
  Pick<LayoutState, 'enabled' | 'spanningDocks' | 'enabledPanels'>
>;

let layoutOverrides: LayoutOverrides = {};

export function setLayoutOverrides(overrides: LayoutOverrides): void {
  layoutOverrides = { ...overrides };
  resetLayoutCache();
}

export function getLayoutOverrides(): LayoutOverrides {
  return { ...layoutOverrides };
}

/** True when this shell forces layout mode on (the user cannot turn it off). */
export function isLayoutModeForced(): boolean {
  return layoutOverrides.enabled === true;
}

function hasLayoutOverrides(): boolean {
  return Object.keys(layoutOverrides).length > 0;
}

/** Overlay the shell's forced fields onto a persisted snapshot. */
function applyLayoutOverrides(state: LayoutState): LayoutState {
  if (!hasLayoutOverrides()) return state;
  const o = layoutOverrides;
  return {
    ...state,
    ...(o.enabled !== undefined ? { enabled: o.enabled } : {}),
    ...(o.spanningDocks !== undefined ? { spanningDocks: o.spanningDocks } : {}),
    ...(o.enabledPanels !== undefined
      ? { enabledPanels: { ...state.enabledPanels, ...o.enabledPanels } }
      : {}),
  };
}

/** Restore the persisted value for every forced field, so this shell's own
 *  requirements never leak into the shared key. */
function stripLayoutOverrides(state: LayoutState): LayoutState {
  if (!hasLayoutOverrides()) return state;
  const o = layoutOverrides;
  const persisted = loadPersistedLayoutState();
  return {
    ...state,
    ...(o.enabled !== undefined ? { enabled: persisted.enabled } : {}),
    ...(o.spanningDocks !== undefined ? { spanningDocks: persisted.spanningDocks } : {}),
    ...(o.enabledPanels !== undefined ? { enabledPanels: persisted.enabledPanels } : {}),
  };
}

// ─── Loading / saving ─────────────────────────────────────────────────────

/** The layout exactly as persisted, with no shell overrides applied. Use this
 *  when the state is about to leave this shell (settings export / device sync);
 *  everything else wants loadLayoutState(). */
export function loadPersistedLayoutState(): LayoutState {
  try {
    const stored = globalStorage.get('layoutManagerState');
    if (!stored) return cloneDefault();

    if (isNewLayoutShape(stored)) {
      const windows: Record<string, WindowRecord> = { ...stored.windows };
      let dockTrees: Record<DockSide, SplitNode | null>;
      if (hasDockTrees(stored) && stored.dockTrees) {
        // v2: trees already stored.
        dockTrees = stored.dockTrees;
      } else {
        // v1: derive trees from the flat structural fields, then strip them.
        dockTrees = migrateFlatWindowsToTrees(windows);
        stripStructuralFields(windows);
      }
      const state: LayoutState = {
        enabled: !!stored.enabled,
        spanningDocks: stored.spanningDocks === 'leftRight' ? 'leftRight' : 'topBottom',
        uiLocked: !!stored.uiLocked,
        enabledPanels: {
          objectList: stored.enabledPanels?.objectList ?? true,
        },
        windows,
        dockTrees,
        dockExtents: { ...DEFAULT_DOCK_EXTENTS, ...stored.dockExtents },
        popupPanels: stored.popupPanels ?? {},
        builtInPanels: stored.builtInPanels ?? {},
      };
      return ensureBuiltIns(state);
    }

    // Legacy: migrate.
    return ensureBuiltIns(migrateLayoutState(stored as LegacyLayoutState));
  } catch (e) {
    console.error('Failed to load layout state:', e);
    return cloneDefault();
  }
}

export function loadLayoutState(): LayoutState {
  return applyLayoutOverrides(loadPersistedLayoutState());
}

function cloneDefault(): LayoutState {
  return {
    ...DEFAULT_LAYOUT,
    windows: Object.fromEntries(
      Object.entries(DEFAULT_LAYOUT.windows).map(([k, v]) => [k, { ...v }])
    ),
    dockTrees: cloneDefaultTrees(),
    dockExtents: { ...DEFAULT_LAYOUT.dockExtents },
    popupPanels: {},
    builtInPanels: {},
  };
}

export function saveLayoutState(state: LayoutState): void {
  try {
    globalStorage.set('layoutManagerState', stripLayoutOverrides(state));
  } catch (e) {
    console.error('Failed to save layout state:', e);
  }
}

let saveTimeout: number | null = null;

export function saveLayoutStateDebounced(state: LayoutState, delay = 300): void {
  if (saveTimeout !== null) clearTimeout(saveTimeout);
  saveTimeout = window.setTimeout(() => {
    saveLayoutState(state);
    saveTimeout = null;
  }, delay);
}

export function resetLayoutState(): LayoutState {
  // Forced fields survive the reset (a shell that needs them still needs them);
  // saveLayoutState() keeps them out of the shared key as usual.
  const resetState = applyLayoutOverrides({ ...cloneDefault(), enabled: true });
  saveLayoutState(resetState);
  return resetState;
}

// ─── Cache for popup helpers (called frequently during init) ──────────────

let cachedLayoutState: LayoutState | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 100;

/** Drop the cached layout snapshot without notifying listeners. */
export function resetLayoutCache(): void {
  cachedLayoutState = null;
  cacheTimestamp = 0;
}

export function invalidateLayoutCache(): void {
  resetLayoutCache();
  eventBus.emit('layoutManagerStateChanged');
}

function getCachedLayoutState(): LayoutState {
  const now = Date.now();
  if (!cachedLayoutState || now - cacheTimestamp > CACHE_TTL) {
    cachedLayoutState = loadLayoutState();
    cacheTimestamp = now;
  }
  return cachedLayoutState;
}

// ─── UI capability: does the active UI render dock slots? ─────────────────
// The stock UI has a layout manager with dockable slots; alternate UIs
// (forge-ui) render popups only as plain floating windows and have no docking.
// Because both UIs share the same persisted `layoutManagerState`, a popup
// docked in the stock UI would otherwise auto-open in forge-ui too. When
// docking is unsupported, only pinned (persistOpen) popups auto-open — a
// merely-docked popup does not. Defaults to true (stock UI); forge-ui flips it
// off at boot via setDockingSupported(false).
let dockingSupported = true;

export function setDockingSupported(supported: boolean): void {
  dockingSupported = supported;
}

export function isDockingSupported(): boolean {
  return dockingSupported;
}

// ─── UI capability: can this shell render "left/right rails span everything"? ──
// The vertical span mode needs the shell to provide #layout-left/right-dock-host
// elements (children of #main-container) to portal the rails into. Only the
// forge shell does; the stock shell never opts in, so the shared `spanningDocks`
// flag is a no-op there even though it lives in the shared persisted state.
let railSpanSupported = false;

export function setRailSpanSupported(supported: boolean): void {
  railSpanSupported = supported;
}

export function isRailSpanSupported(): boolean {
  return railSpanSupported;
}

// ─── Popup helpers used by popup components on mount ──────────────────────

/**
 * Returns true if this popup should auto-open on page load — either it was
 * pinned, or (only when the active UI supports docking) it was last seen
 * docked, or it currently appears as a docked WindowRecord in the persisted
 * layout.
 */
export function shouldPopupAutoOpen(popupId: string): boolean {
  try {
    const stored = getCachedLayoutState();
    if (!stored.enabled) return false;

    const popupState = stored.popupPanels[popupId];
    if (popupState?.persistOpen) return true;

    // Docking is a stock-UI concept. In a UI with no dock slots (forge-ui),
    // a merely-docked popup must NOT auto-open — otherwise every popup docked
    // in the stock UI pops open here as a floating window.
    if (!dockingSupported) return false;
    if (popupState?.isDocked) return true;

    const w = stored.windows[popupId];
    if (w?.docked) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function getPopupLockedState(popupId: string): boolean {
  try {
    return getCachedLayoutState().popupPanels[popupId]?.isLocked ?? false;
  } catch {
    return false;
  }
}

export function getPopupPinnedState(popupId: string): boolean {
  try {
    return getCachedLayoutState().popupPanels[popupId]?.persistOpen ?? false;
  } catch {
    return false;
  }
}

export function getPopupSetting<T>(popupId: string, key: string, defaultValue: T): T {
  try {
    const settings = getCachedLayoutState().popupPanels[popupId]?.settings;
    if (settings && key in settings) return settings[key] as T;
  } catch {
    /* ignore */
  }
  return defaultValue;
}

export function setPopupSetting<T>(popupId: string, key: string, value: T): void {
  try {
    cachedLayoutState = null;
    const state = loadLayoutState();
    if (!state.popupPanels[popupId]) {
      state.popupPanels[popupId] = { isDocked: false };
    }
    if (!state.popupPanels[popupId].settings) {
      state.popupPanels[popupId].settings = {};
    }
    state.popupPanels[popupId].settings![key] = value;
    saveLayoutState(state);
    // Keep the live WindowManager copy in sync so its next serialize() doesn't
    // clobber this write with the stale snapshot it loaded at startup.
    windowManager.syncPopupSetting(popupId, key, value);
  } catch (e) {
    console.error('Failed to save popup setting:', e);
  }
}

export function savePopupFloatingState(
  popupId: string,
  updates: {
    isLocked?: boolean;
    floatingState?: { x: number; y: number; width: number; height?: number };
  }
): void {
  try {
    cachedLayoutState = null;
    const state = loadLayoutState();
    if (!state.popupPanels[popupId]) {
      state.popupPanels[popupId] = { isDocked: false };
    }
    if (updates.isLocked !== undefined) {
      state.popupPanels[popupId].isLocked = updates.isLocked;
    }
    if (updates.floatingState !== undefined) {
      state.popupPanels[popupId].floatingState = updates.floatingState;
    }
    saveLayoutState(state);
  } catch (e) {
    console.error('Failed to save popup floating state:', e);
  }
}

export function getPopupFloatingState(
  popupId: string
): { x: number; y: number; width: number; height?: number } | undefined {
  try {
    return getCachedLayoutState().popupPanels[popupId]?.floatingState;
  } catch {
    return undefined;
  }
}

export function getPinnedPopupsByPrefix(prefix: string): string[] {
  try {
    const stored = getCachedLayoutState();
    if (!stored.enabled) return [];
    const result: string[] = [];
    for (const id of Object.keys(stored.popupPanels)) {
      if (!id.startsWith(prefix)) continue;
      const s = stored.popupPanels[id];
      if (s?.persistOpen) {
        result.push(id);
        continue;
      }
      // Docked-only popups auto-open just in dock-capable UIs (see
      // shouldPopupAutoOpen); forge-ui restores only pinned ones.
      if (!dockingSupported) continue;
      if (s?.isDocked) {
        result.push(id);
        continue;
      }
      const w = stored.windows[id];
      if (w?.docked) result.push(id);
    }
    return result;
  } catch {
    return [];
  }
}

// ─── Built-in panel helpers (map, objectList) ─────────────────────────────

export function getBuiltInPanelSetting<T>(
  panelId: string,
  key: string,
  defaultValue: T
): T {
  try {
    const settings = getCachedLayoutState().builtInPanels[panelId]?.settings;
    if (settings && key in settings) return settings[key] as T;
  } catch {
    /* ignore */
  }
  return defaultValue;
}

export function setBuiltInPanelSetting<T>(
  panelId: string,
  key: string,
  value: T
): void {
  try {
    cachedLayoutState = null;
    const state = loadLayoutState();
    if (!state.builtInPanels[panelId]) state.builtInPanels[panelId] = {};
    if (!state.builtInPanels[panelId].settings) {
      state.builtInPanels[panelId].settings = {};
    }
    state.builtInPanels[panelId].settings![key] = value;
    saveLayoutState(state);
    // Keep the live WindowManager copy in sync so its next serialize() doesn't
    // clobber this write with the stale snapshot it loaded at startup.
    windowManager.syncBuiltInPanelSetting(panelId, key, value);
  } catch (e) {
    console.error('Failed to save built-in panel setting:', e);
  }
}

// Re-exports for compat
export type {
  LayoutState,
  WindowRecord,
  PopupPanelDockState,
  BuiltInPanelState,
};
