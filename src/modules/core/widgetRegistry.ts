import type { ReactNode } from "react";

/**
 * Widget types — what can be placed on screen as a widget (Zegar, Witalne, a
 * plugin's own…). UI-free like footerRegistry: a type carries either a
 * `render()` that returns React content (built-ins) or a raw `node` the UI
 * adopts (plugin content). Where each widget sits lives in widgetLayout.
 */

/** The corner of the output area a widget is pinned to. */
export type WidgetCorner = "tl" | "tr" | "bl" | "br";

/** One choice in a widget's right-click menu ("Obie", "Bez paska dnia"…). */
export interface WidgetChoice {
  value: string;
  label: string;
}

/**
 * A setting of one placed widget, offered as checkable rows in its right-click
 * menu under `label`. Stored per instance, so two clocks can differ.
 */
export interface WidgetOption {
  key: string;
  label: string;
  choices: WidgetChoice[];
  default: string;
}

export interface WidgetType {
  /** Stable unique id; re-registering the same id replaces the type. */
  id: string;
  /** Name in the "Dodaj widżet" list and the right-click menu's header. */
  label: string;
  /** Where a newly added one lands. Defaults to the top-right corner. */
  defaultCorner?: WidgetCorner;
  source?: "builtin" | "plugin";
  options?: WidgetOption[];
  /** React content (built-ins), given the instance's settings. Mutually exclusive with `node`. */
  render?: (settings: Record<string, string>) => ReactNode;
  /** Raw DOM content the host adopts (plugin widgets). */
  node?: HTMLElement;
}

const types = new Map<string, WidgetType>();
const listeners = new Set<() => void>();
let snapshot: WidgetType[] = [];

function publish(): void {
  snapshot = Array.from(types.values());
  listeners.forEach((listener) => listener());
}

export function registerWidgetType(type: WidgetType): void {
  types.set(type.id, type);
  publish();
}

export function unregisterWidgetType(id: string): void {
  if (types.delete(id)) publish();
}

export function getWidgetType(id: string): WidgetType | undefined {
  return types.get(id);
}

/** In registration order; a new array only when something changed (safe for useSyncExternalStore). */
export function getWidgetTypes(): WidgetType[] {
  return snapshot;
}

export function subscribeWidgetTypes(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** An instance's settings with each option's default filled in. */
export function resolveWidgetSettings(
  type: WidgetType | undefined,
  settings: Record<string, string> | undefined,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const option of type?.options ?? []) resolved[option.key] = option.default;
  return { ...resolved, ...settings };
}
