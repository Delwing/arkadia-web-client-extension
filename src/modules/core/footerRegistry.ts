import type { ReactNode } from "react";
import { globalStorage } from "./storage";

/**
 * Common footer-item registry — the single, UI-agnostic source of footer items,
 * shared by every UI.
 *
 * Built-in chips register here with `source: "builtin"`; plugins register via
 * the stable `api.ui.registerFooterComponent` (see pluginFooterRegistry). This
 * layer also applies the user's footer configuration (`uiSettings.footerComponents`
 * — which built-ins to show and in what order) BEFORE handing items to any UI,
 * so visibility/ordering live in one place and no UI has to re-implement them: a
 * host just renders `getFooterItems()`.
 *
 * Deliberately UI-free (no DOM, no React runtime — only the `ReactNode` type):
 * an item carries either a `render()` that returns React content (built-ins) or a
 * raw `node` the UI adopts (plugin content). The React glue lives in @web-ui/footer.
 */
export interface FooterItem {
  /** Stable unique id; re-registering the same id replaces the item. */
  id: string;
  /** Fallback sort key when the user config doesn't order this item. */
  order: number;
  /**
   * Every item obeys `uiSettings.footerComponents` once the config mentions it:
   * hidden when the config says so, ordered by the config. An item the config
   * has never heard of keeps its own `order`, which is how a plugin component
   * stays where it asked to be until somebody moves it in the settings panel.
   */
  source?: "builtin" | "plugin";
  /**
   * Human-readable name for the footer settings panel. Built-in chips are named
   * there and leave this empty; plugin components carry their plugin's name,
   * because `plugin:towarzysz-a1b2:towarzysz` is not something to show anyone.
   */
  label?: string;
  /** Left out until the config switches it on (a diagnostic chip nobody asked for). */
  hiddenByDefault?: boolean;
  /** React content (built-in chips). Mutually exclusive with `node`. */
  render?: () => ReactNode;
  /** Raw DOM content the host adopts (plugin components). */
  node?: HTMLElement;
}

/**
 * Where a configured item's order lands: in a band above "start" (0) and below
 * "end" (1000), so an item the config has never heard of - a plugin component
 * nobody has moved yet - still sits before or after the configured ones as it
 * asked.
 *
 * The whole footer is laid out in this one space, built-ins and plugin items
 * alike, so a plugin component can be dragged past a built-in chip.
 */
export const CONFIG_ORDER_BASE = 100;

const items = new Map<string, FooterItem>();
const listeners = new Set<() => void>();

// Cached sorted snapshots so a React store's getSnapshot is referentially stable
// between mutations (a fresh array each call would loop-render). Two of them:
// what the footer renders, and everything registered - the settings panel lists
// the hidden ones too, or there would be no way to switch one back on.
let snapshot: FooterItem[] = [];
let allSnapshot: FooterItem[] = [];

/** The user's per-id footer config from uiSettings: visibility + order. */
function readConfig(): Map<string, { visible: boolean; order: number }> {
  const settings = globalStorage.get("uiSettings") as
    | { footerComponents?: Array<{ id: string; visible?: boolean; order?: number }> }
    | null;
  const list = Array.isArray(settings?.footerComponents) ? settings!.footerComponents! : [];
  const map = new Map<string, { visible: boolean; order: number }>();
  list.forEach((c, i) => map.set(c.id, {
    visible: c.visible !== false,
    order: typeof c.order === "number" ? c.order : i,
  }));
  return map;
}

function recompute(): void {
  const config = readConfig();
  const byOrder = (a: FooterItem, b: FooterItem) => a.order - b.order;
  const all: FooterItem[] = [];
  const visible: FooterItem[] = [];
  for (const item of items.values()) {
    const cfg = config.get(item.id);
    const placed = cfg ? { ...item, order: CONFIG_ORDER_BASE + cfg.order } : item;
    all.push(placed);
    if (cfg ? !cfg.visible : item.hiddenByDefault) continue; // switched off, or never switched on
    visible.push(placed);
  }
  snapshot = visible.sort(byOrder);
  allSnapshot = all.sort(byOrder);
}

function emit(): void {
  recompute();
  for (const listener of listeners) listener();
}

// Re-apply when the footer config changes (toggle/reorder in settings, sync).
globalStorage.onChange("uiSettings", () => emit());

/** Add or replace a footer item. */
export function registerFooterItem(item: FooterItem): void {
  items.set(item.id, item);
  emit();
}

/** Remove a footer item by id (no-op if absent). */
export function unregisterFooterItem(id: string): void {
  if (items.delete(id)) emit();
}

/**
 * Current items, already filtered/ordered by the user's footer config and sorted
 * by `order`. Stable reference until the next change.
 */
export function getFooterItems(): FooterItem[] {
  return snapshot;
}

/**
 * Every registered item, ordered the same way but with the switched-off ones
 * kept in. For the footer settings panel, which has to list what it is offering
 * to switch back on. Stable reference until the next change.
 */
export function getAllFooterItems(): FooterItem[] {
  return allSnapshot;
}

/** Subscribe to registry changes; returns an unsubscribe function. */
export function subscribeFooterItems(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
