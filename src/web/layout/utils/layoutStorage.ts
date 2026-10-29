import {
  BuiltInPanelState,
  clampFloatingTop,
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

/** Heal geometry saved before floating drags clamped the top edge: a negative
 *  `y` parks the titlebar -- the only drag handle -- above the viewport, where
 *  the user can never grab it again. */
function clampWindowTops(state: LayoutState): LayoutState {
  for (const w of Object.values(state.windows)) {
    if (typeof w.y === 'number') w.y = clampFloatingTop(w.y);
  }
  for (const p of Object.values(state.popupPanels)) {
    const f = p.floatingState;
    if (f && typeof f.y === 'number') f.y = clampFloatingTop(f.y);
  }
  return state;
}

function ensureBuiltIns(state: LayoutState): LayoutState {
  for (const id of ['map', 'objectList'] as const) {
    if (!state.windows[id]) {
      state.windows[id] = { ...DEFAULT_LAYOUT.windows[id] };
    }
  }
  return state;
}

// ─── Loading / saving ─────────────────────────────────────────────────────

/** The layout as persisted (what settings export and device sync carry). */
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
      return clampWindowTops(ensureBuiltIns(state));
    }

    // Legacy: migrate.
    return clampWindowTops(ensureBuiltIns(migrateLayoutState(stored as LegacyLayoutState)));
  } catch (e) {
    console.error('Failed to load layout state:', e);
    return cloneDefault();
  }
}

export function loadLayoutState(): LayoutState {
  return loadPersistedLayoutState();
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
    globalStorage.set('layoutManagerState', state);
  } catch (e) {
    console.error('Failed to save layout state:', e);
  }
}

let saveTimeout: number | null = null;
let pendingState: (() => LayoutState) | null = null;

/**
 * Persist the layout once changes stop arriving.
 *
 * Takes a getter and calls it when the timer fires, rather than accepting an
 * already-serialized snapshot. A snapshot would freeze the layout as it looked
 * when the save was *scheduled*, and anything written synchronously during the
 * delay would be erased when that stale copy landed 300ms later.
 *
 * That is not hypothetical: `setBuiltInPanelSetting` and `setPopupSetting`
 * write straight to storage and then patch the live WindowManager copy so the
 * next serialize() keeps the value. A snapshot taken before the patch cannot
 * see it -- those helpers replace the panel's state object, so the old
 * reference the snapshot holds is never touched -- and they deliberately skip
 * notify(), so the queued timer is never rescheduled either. Toggling a panel
 * setting within 300ms of any other layout change therefore lost it silently.
 */
export function saveLayoutStateDebounced(getState: () => LayoutState, delay = 300): void {
  pendingState = getState;
  if (saveTimeout !== null) clearTimeout(saveTimeout);
  saveTimeout = window.setTimeout(() => {
    const get = pendingState;
    saveTimeout = null;
    pendingState = null;
    if (get) saveLayoutState(get());
  }, delay);
}

export function resetLayoutState(): LayoutState {
  const resetState = { ...cloneDefault(), enabled: true };
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

// ─── Can the page render "left/right rails span everything"? ──────────────
// The vertical span mode needs #layout-left/right-dock-host (children of
// #main-container) to portal the rails into. The shell renders them and opts in
// at start-up (main.ts); until then, and in tests, `spanningDocks` is a no-op.
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
 * pinned, or it was last seen docked, or it currently appears as a docked WindowRecord in the persisted
 * layout.
 */
export function shouldPopupAutoOpen(popupId: string): boolean {
  try {
    const stored = getCachedLayoutState();
    if (!stored.enabled) return false;

    const popupState = stored.popupPanels[popupId];
    if (popupState?.persistOpen) return true;

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

// ─── Setting change listeners ─────────────────────────────────────────────

/**
 * Same-page change notification for popup and built-in panel settings. Two
 * readers of one setting (a window's own content and its settings cog) must
 * see each other's writes at once; `layoutManagerStateChanged` only covers a
 * wholesale layout replacement, not a single key.
 */
type SettingScope = 'popup' | 'builtIn';
type SettingListener = (value: unknown) => void;

const settingListeners = new Map<string, Set<SettingListener>>();

function settingListenerKey(scope: SettingScope, id: string, key: string): string {
  return `${scope}\u0000${id}\u0000${key}`;
}

export function subscribeToPanelSetting(
  scope: SettingScope,
  id: string,
  key: string,
  listener: SettingListener,
): () => void {
  const k = settingListenerKey(scope, id, key);
  let set = settingListeners.get(k);
  if (!set) {
    set = new Set();
    settingListeners.set(k, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) settingListeners.delete(k);
  };
}

function notifyPanelSetting(scope: SettingScope, id: string, key: string, value: unknown): void {
  settingListeners.get(settingListenerKey(scope, id, key))?.forEach(listener => {
    try {
      listener(value);
    } catch (e) {
      console.error('Panel setting listener error:', e);
    }
  });
}

// ─── Settings changed in another tab ──────────────────────────────────────

/**
 * Another tab or window of the client saved the layout. Each tab keeps its own
 * copy in the WindowManager and writes all of it on every save, so without
 * this the next save here would put this tab's old window settings back over
 * whatever was just changed there - and the other tab would do the same to
 * ours. Only the windows' settings are taken over: where windows sit stays
 * per tab. A setting the other tab does not have is left alone.
 */
export function adoptSettingsFromOtherTab(raw: string | null): void {
  if (!raw) return;
  let stored: Partial<LayoutState>;
  try {
    stored = JSON.parse(raw) as Partial<LayoutState>;
  } catch {
    return;
  }
  resetLayoutCache();

  const live = windowManager.serialize();
  const scopes: [SettingScope, Record<string, { settings?: Record<string, unknown> }> | undefined,
    Record<string, { settings?: Record<string, unknown> }>, (id: string, key: string, value: unknown) => void][] = [
    ['popup', stored.popupPanels, live.popupPanels, (id, key, value) => windowManager.syncPopupSetting(id, key, value)],
    ['builtIn', stored.builtInPanels, live.builtInPanels, (id, key, value) => windowManager.syncBuiltInPanelSetting(id, key, value)],
  ];
  for (const [scope, theirs, ours, sync] of scopes) {
    for (const [id, panel] of Object.entries(theirs ?? {})) {
      const mine = ours[id]?.settings ?? {};
      for (const [key, value] of Object.entries(panel?.settings ?? {})) {
        if (key in mine && JSON.stringify(mine[key]) === JSON.stringify(value)) continue;
        sync(id, key, value);
        notifyPanelSetting(scope, id, key, value);
      }
    }
  }
}

if (typeof window !== 'undefined') {
  // Fires only for writes from other tabs, never for this tab's own saves.
  window.addEventListener('storage', (event) => {
    if (event.key === 'layoutManagerState') adoptSettingsFromOtherTab(event.newValue);
  });
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
  notifyPanelSetting('popup', popupId, key, value);
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

/**
 * Wipe the persisted "reopen me on load" traces of a popup the user closed:
 * the popupPanels dock flags and the window geometry hint, whose preserved
 * `docked` field would otherwise make shouldPopupAutoOpen true next load.
 * Must run AFTER windowManager.close(), which re-derives those flags from the
 * window it is closing.
 */
export function clearClosedPopupState(popupId: string): void {
  windowManager.updatePopupDockState(popupId, {
    persistOpen: false,
    isDocked: false,
  });
  windowManager.purgeWindowHint(popupId);
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
  notifyPanelSetting('builtIn', panelId, key, value);
}

// Re-exports for compat
export type {
  LayoutState,
  WindowRecord,
  PopupPanelDockState,
  BuiltInPanelState,
};
