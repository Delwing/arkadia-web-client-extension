import type Client from "@client/Client";

/**
 * What every API domain's factory gets from the plugin it serves: the client,
 * the plugin's identity, and hooks to undo its registrations when it unloads.
 * Each domain keeps its own registrations and registers its own cleanup.
 */
export interface PluginApiContext {
  readonly client: Client;
  /** The plugin's id (its URL, or its stored id). */
  readonly pluginId: string;
  /** What the plugin's saved state is kept under: its `stableId`, else its id. */
  readonly stateKey: string;
  /** The name the plugin reported from init(); undefined until then. */
  readonly pluginName: string | undefined;
  /** The plugin's name, or its id while the name is not known yet. */
  readonly displayName: string;
  /** Run `fn` when the plugin unloads. */
  onCleanup(fn: () => void): void;
  /** Run `fn` when the plugin's name becomes known (after init returns). */
  onRename(fn: (name: string) => void): void;
  /** Unsubscribe `unsubscribe` when the plugin unloads; returns it unchanged. */
  track(unsubscribe: () => void): () => void;
  generateId(prefix: string): string;
}

export interface PluginApiLifecycle {
  readonly context: PluginApiContext;
  setName(name: string): void;
  cleanup(): void;
}

export function createPluginApiContext(client: Client, pluginId: string, stateKey: string): PluginApiLifecycle {
  let name: string | undefined;
  let unsubscribers: (() => void)[] = [];
  const cleanups: (() => void)[] = [];
  const renames: ((name: string) => void)[] = [];

  const context: PluginApiContext = {
    client,
    pluginId,
    stateKey,
    get pluginName() {
      return name;
    },
    get displayName() {
      return name || pluginId;
    },
    onCleanup: (fn) => {
      cleanups.push(fn);
    },
    onRename: (fn) => {
      renames.push(fn);
    },
    track: (unsubscribe) => {
      unsubscribers.push(unsubscribe);
      return unsubscribe;
    },
    generateId: (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`,
  };

  return {
    context,
    setName: (value) => {
      name = value;
      for (const fn of renames) fn(value);
    },
    cleanup: () => {
      for (const fn of cleanups) fn();
      for (const unsubscribe of unsubscribers) unsubscribe();
      unsubscribers = [];
    },
  };
}
