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
