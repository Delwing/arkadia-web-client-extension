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
   * "builtin" items obey `uiSettings.footerComponents` (hidden when the config
   * says so, ordered by the config). Anything else (plugins) is always shown,
   * ordered by its own `order`.
   */
  source?: "builtin" | "plugin";
  /** React content (built-in chips). Mutually exclusive with `node`. */
  render?: () => ReactNode;
  /** Raw DOM content the host adopts (plugin components). */
  node?: HTMLElement;
}

const items = new Map<string, FooterItem>();
const listeners = new Set<() => void>();

// Cached sorted snapshot so a React store's getSnapshot is referentially stable
// between mutations (a fresh array each call would loop-render).
let snapshot: FooterItem[] = [];

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
  const out: FooterItem[] = [];
  for (const item of items.values()) {
    if (item.source === "builtin") {
      const cfg = config.get(item.id);
      if (cfg && !cfg.visible) continue; // hidden by the user's footer config
      // Config order sits in a band above plugin "start" (0) and below "end"
      // (1000), so a plugin can still be placed before/after/among the built-ins.
      out.push({ ...item, order: cfg ? 100 + cfg.order : item.order });
    } else {
      out.push(item);
    }
  }
  snapshot = out.sort((a, b) => a.order - b.order);
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

/** Subscribe to registry changes; returns an unsubscribe function. */
export function subscribeFooterItems(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
