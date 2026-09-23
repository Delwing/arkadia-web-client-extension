/**
 * Sections of the menu. "sesja" is the bar at its bottom (Pełny ekran, Rozłącz);
 * plugin entries land in "wtyczki".
 */
export type MainMenuGroup = "gra" | "ustawienia" | "narzedzia" | "wtyczki" | "sesja";

/**
 * The main "⋯" menu next to the command line, as data: the stock UI registers its
 * built-in entries (Ustawienia, Aliasy, Rozłącz…) and plugins add theirs through
 * `api.ui` (see pluginUiRegistry.ts). The footer renders whatever is here, sorted
 * by `order`, so nothing outside the menu component touches its DOM.
 *
 * UI-free: labels may be DOM nodes (a plugin's label), which the host renders.
 */
export interface MainMenuItem {
  /** Also the rendered button's id, which e2e specs and older code look up. */
  id: string;
  label: string | Node;
  /** A shorter caption for the phone's tiles; defaults to the label. */
  shortLabel?: string;
  /** Other words the menu filter finds the entry by (an old name, what it holds). */
  keywords?: string[];
  /** Defaults to "wtyczki". */
  group?: MainMenuGroup;
  /** A name the host maps to an icon ("zap", "map-pin"…); unknown or absent → a generic one. */
  icon?: string;
  onSelect: () => void;
  /** Order within the group. Built-ins sit at 10..910; plugin entries default to 1000. */
  order: number;
  disabled?: boolean;
  tone?: "danger";
  source: "builtin" | "plugin";
}

const items = new Map<string, MainMenuItem>();
const listeners = new Set<() => void>();
let snapshot: MainMenuItem[] = [];

function publish(): void {
  snapshot = Array.from(items.values()).sort((a, b) => a.order - b.order);
  listeners.forEach((listener) => listener());
}

export function registerMainMenuItem(item: MainMenuItem): void {
  items.set(item.id, item);
  publish();
}

export function updateMainMenuItem(id: string, changes: Partial<Omit<MainMenuItem, "id">>): void {
  const item = items.get(id);
  if (!item) return;
  items.set(id, { ...item, ...changes });
  publish();
}

export function unregisterMainMenuItem(id: string): void {
  if (items.delete(id)) publish();
}

/** Sorted by `order`; a new array only when something changed (safe for useSyncExternalStore). */
export function getMainMenuItems(): MainMenuItem[] {
  return snapshot;
}

export function subscribeMainMenu(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
