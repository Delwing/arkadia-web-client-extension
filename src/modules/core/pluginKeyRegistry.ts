import type { Bind, BindSettings } from "./keymapTypes";

/**
 * Plugin key actions: something a plugin does on a key press, listed in
 * Klawisze next to the client's own binds.
 *
 * The plugin only suggests a key. The player can move it or switch it off in
 * Klawisze; that choice is stored per keymap in `BindSettings.pluginKeys`,
 * keyed by the action id, so it syncs with the keymap and survives the plugin
 * being reloaded from another address.
 */
export interface PluginKeyAction {
  /** Stable id chosen by the plugin ("zielarz.searchHere"); the player's key is stored under it. */
  id: string;
  label: string;
  /** Whose action it is, for the Klawisze list. */
  pluginName?: string;
  /** Used until the player picks a key of their own. */
  defaultBind?: Bind;
  onPress: (event: KeyboardEvent) => void;
}

const actions = new Map<string, PluginKeyAction>();
const listeners = new Set<() => void>();
let snapshot: PluginKeyAction[] = [];

function emit(): void {
  snapshot = [...actions.values()];
  for (const listener of listeners) listener();
}

/** Add an action, or replace one with the same id. */
export function registerPluginKeyAction(action: PluginKeyAction): void {
  actions.set(action.id, action);
  emit();
}

export function hasPluginKeyAction(id: string): boolean {
  return actions.has(id);
}

export function unregisterPluginKeyAction(id: string): void {
  if (actions.delete(id)) emit();
}

/** Every registered action, in registration order. Stable until the next change. */
export function getPluginKeyActions(): PluginKeyAction[] {
  return snapshot;
}

export function subscribePluginKeyActions(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True when the player picked a key for this action (or switched it off). */
export function isPluginKeyOverridden(binds: Pick<BindSettings, "pluginKeys"> | undefined, id: string): boolean {
  return !!binds?.pluginKeys && Object.prototype.hasOwnProperty.call(binds.pluginKeys, id);
}

/** The key the action listens on: the player's choice, else its default. Null when it has none. */
export function pluginKeyBindOf(binds: Pick<BindSettings, "pluginKeys"> | undefined, action: Pick<PluginKeyAction, "id" | "defaultBind">): Bind | null {
  const bind = isPluginKeyOverridden(binds, action.id) ? binds!.pluginKeys![action.id] : action.defaultBind;
  return bind?.key ? bind : null;
}

// Matching on the code keeps Alt+letter working on layouts where Alt changes ev.key.
export function normalizeBindKey(key: string): string {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  return key;
}
