import {
  BuiltInPanelState,
  DEFAULT_DOCK_EXTENTS,
  DEFAULT_LAYOUT,
  DockSide,
  generateSplitGroupId,
  LayoutState,
  LegacyDockState,
  LegacyDockSlot,
  LegacyLayoutState,
  PANEL_CONFIGS,
  PopupPanelDockState,
  WindowRecord,
} from '../types';
import eventBus from '@modules/core/eventBus';
import { globalStorage } from '@modules/core/storage';

// ─── Migration ────────────────────────────────────────────────────────────

/** True when the stored object already uses the new flat-windows shape. */
export function isNewLayoutShape(obj: unknown): obj is Partial<LayoutState> {
  return (
    obj != null &&
    typeof obj === 'object' &&
    'windows' in (obj as Record<string, unknown>) &&
    typeof (obj as { windows?: unknown }).windows === 'object'
  );
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

  return {
    enabled: !!legacy.enabled,
    enabledPanels: {
      objectList: legacy.enabledPanels?.objectList ?? true,
    },
    windows,
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

// ─── Loading / saving ─────────────────────────────────────────────────────

export function loadLayoutState(): LayoutState {
  try {
    const stored = globalStorage.get('layoutManagerState');
    if (!stored) return cloneDefault();

    if (isNewLayoutShape(stored)) {
      const state: LayoutState = {
        enabled: !!stored.enabled,
        enabledPanels: {
          objectList: stored.enabledPanels?.objectList ?? true,
        },
        windows: { ...stored.windows },
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

function cloneDefault(): LayoutState {
  return {
    ...DEFAULT_LAYOUT,
    windows: Object.fromEntries(
      Object.entries(DEFAULT_LAYOUT.windows).map(([k, v]) => [k, { ...v }])
    ),
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

export function saveLayoutStateDebounced(state: LayoutState, delay = 300): void {
  if (saveTimeout !== null) clearTimeout(saveTimeout);
  saveTimeout = window.setTimeout(() => {
    saveLayoutState(state);
    saveTimeout = null;
  }, delay);
}

export function resetLayoutState(): LayoutState {
  const resetState: LayoutState = { ...cloneDefault(), enabled: true };
  saveLayoutState(resetState);
  return resetState;
}

// ─── Cache for popup helpers (called frequently during init) ──────────────

let cachedLayoutState: LayoutState | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 100;

export function invalidateLayoutCache(): void {
  cachedLayoutState = null;
  cacheTimestamp = 0;
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

// ─── Popup helpers used by popup components on mount ──────────────────────

/**
 * Returns true if this popup should auto-open on page load — either it was
 * pinned, or it was last seen docked, or it currently appears as a docked
 * WindowRecord in the persisted layout.
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
      if (s?.persistOpen || s?.isDocked) {
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
