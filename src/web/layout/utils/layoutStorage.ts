import { LayoutState, DEFAULT_LAYOUT } from '../types';

const LAYOUT_STORAGE_KEY = 'layoutManagerState';

export function loadLayoutState(): LayoutState {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      if (stored && typeof stored === 'object') {
        return {
          ...DEFAULT_LAYOUT,
          ...stored,
          enabledPanels: {
            ...DEFAULT_LAYOUT.enabledPanels,
            ...stored.enabledPanels,
          },
          docks: {
            left: { ...DEFAULT_LAYOUT.docks.left, ...stored.docks?.left },
            top: { ...DEFAULT_LAYOUT.docks.top, ...stored.docks?.top },
            right: { ...DEFAULT_LAYOUT.docks.right, ...stored.docks?.right },
          },
          // Ensure floatingPanels is always an array (for backwards compatibility)
          floatingPanels: Array.isArray(stored.floatingPanels)
            ? stored.floatingPanels
            : DEFAULT_LAYOUT.floatingPanels,
          // Ensure popupPanels is always an object (for backwards compatibility)
          popupPanels: stored.popupPanels && typeof stored.popupPanels === 'object'
            ? stored.popupPanels
            : DEFAULT_LAYOUT.popupPanels,
          // Ensure builtInPanels is always an object (for backwards compatibility)
          builtInPanels: stored.builtInPanels && typeof stored.builtInPanels === 'object'
            ? stored.builtInPanels
            : DEFAULT_LAYOUT.builtInPanels,
        };
      }
    }
  } catch (e) {
    console.error('Failed to load layout state:', e);
  }
  return { ...DEFAULT_LAYOUT };
}

export function saveLayoutState(state: LayoutState): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save layout state:', e);
  }
}

let saveTimeout: number | null = null;

export function saveLayoutStateDebounced(state: LayoutState, delay = 300): void {
  if (saveTimeout !== null) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = window.setTimeout(() => {
    saveLayoutState(state);
    saveTimeout = null;
  }, delay);
}

export function resetLayoutState(): LayoutState {
  const resetState = { ...DEFAULT_LAYOUT, enabled: true };
  saveLayoutState(resetState);
  return resetState;
}

// Cached parsed layout state for efficient repeated access during initialization
let cachedLayoutState: ReturnType<typeof loadLayoutState> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 100; // Cache valid for 100ms (covers component initialization)

function getCachedLayoutState(): ReturnType<typeof loadLayoutState> {
  const now = Date.now();
  if (!cachedLayoutState || now - cacheTimestamp > CACHE_TTL) {
    cachedLayoutState = loadLayoutState();
    cacheTimestamp = now;
  }
  return cachedLayoutState;
}

/**
 * Check if a popup should auto-open on page load.
 * This is used by popup components to restore their open state after reload.
 * Returns true if the popup was pinned OR docked.
 */
export function shouldPopupAutoOpen(popupId: string): boolean {
  try {
    const stored = getCachedLayoutState();
    if (!stored?.enabled) return false;

    // Check if popup was explicitly marked as persistOpen (pinned)
    if (stored?.popupPanels?.[popupId]?.persistOpen) {
      return true;
    }

    // Check if popup is docked in any dock zone
    const docks = stored?.docks;
    if (docks) {
      for (const dockKey of ['left', 'top', 'right'] as const) {
        const dock = docks[dockKey];
        if (dock?.panels?.some((p: { id: string }) => p.id === popupId)) {
          return true;
        }
      }
    }
  } catch {
    // Ignore errors
  }
  return false;
}

/**
 * Get the persisted lock state for a popup.
 * Returns the stored isLocked value, or false if not set.
 */
export function getPopupLockedState(popupId: string): boolean {
  try {
    const stored = getCachedLayoutState();
    return stored?.popupPanels?.[popupId]?.isLocked ?? false;
  } catch {
    // Ignore errors
  }
  return false;
}

/**
 * Get a specific setting value for a popup.
 * @param popupId The popup identifier
 * @param key The setting key
 * @param defaultValue Default value if setting is not found
 */
export function getPopupSetting<T>(popupId: string, key: string, defaultValue: T): T {
  try {
    const stored = getCachedLayoutState();
    const settings = stored?.popupPanels?.[popupId]?.settings;
    if (settings && key in settings) {
      return settings[key] as T;
    }
  } catch {
    // Ignore errors
  }
  return defaultValue;
}

/**
 * Set a specific setting value for a popup.
 * Saves immediately (not debounced) to avoid race conditions with LayoutContext.
 * @param popupId The popup identifier
 * @param key The setting key
 * @param value The value to store
 */
export function setPopupSetting<T>(popupId: string, key: string, value: T): void {
  try {
    // Clear cache to ensure we get the latest state
    cachedLayoutState = null;
    const state = loadLayoutState();
    if (!state.popupPanels[popupId]) {
      state.popupPanels[popupId] = { isDocked: false };
    }
    if (!state.popupPanels[popupId].settings) {
      state.popupPanels[popupId].settings = {};
    }
    state.popupPanels[popupId].settings![key] = value;
    // Save immediately to avoid race condition with LayoutContext's debounced save
    saveLayoutState(state);
    // Notify LayoutContext to sync its state
    window.dispatchEvent(new CustomEvent('layoutManagerStateChanged'));
  } catch (e) {
    console.error('Failed to save popup setting:', e);
  }
}

/**
 * Save popup floating state (position, size, isLocked) for non-layout mode.
 * This is used by popups when layout manager is disabled.
 */
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

/**
 * Get popup floating state (position, size) for non-layout mode.
 */
export function getPopupFloatingState(popupId: string): { x: number; y: number; width: number; height?: number } | undefined {
  try {
    const stored = getCachedLayoutState();
    return stored?.popupPanels?.[popupId]?.floatingState;
  } catch {
    // Ignore errors
  }
  return undefined;
}
