import { characterStorage, globalStorage } from "@modules/core/storage";
import type { PluginApiContext } from "./context";

/**
 * A plugin's own key-value store. Values are JSON and stay in this browser,
 * namespaced by plugin id. Keep it small (settings, lists); use IndexedDB for
 * large or growing data.
 */
export interface PluginKeyValueStore {
  /** Read a value, or `defaultValue` when there is none */
  get<T>(key: string, defaultValue: T): T;
  get<T = unknown>(key: string): T | undefined;
  /** Store a JSON-serialisable value */
  set<T>(key: string, value: T): void;
  /** Remove a value */
  remove(key: string): void;
  /** All keys this plugin has stored here */
  keys(): string[];
  /**
   * Listen for changes to one key, including the character switching
   * (for the character store).
   * @returns Function that removes the listener
   */
  onChange<T = unknown>(key: string, listener: (value: T | undefined) => void): () => void;
}

/** Plugin storage, see {@link PluginKeyValueStore} */
export interface StorageApi {
  /** Values kept per character; reads follow the active character */
  character: PluginKeyValueStore;
  /** Values shared by all characters in this browser */
  global: PluginKeyValueStore;
}

/** The active character */
export interface CharacterApi {
  /** Name of the active character, or null before one has logged in */
  getName(): string | null;
  /**
   * Listen for the active character changing
   * @returns Function that removes the listener
   */
  onChange(listener: (name: string | null) => void): () => void;
}

export function createStorageApi(ctx: PluginApiContext): StorageApi {
  return {
    character: createKeyValueStore(
      ctx,
      () => characterStorage.get('plugin_data'),
      (data) => characterStorage.set('plugin_data', data),
      (listener) => characterStorage.onChange('plugin_data', listener),
    ),
    global: createKeyValueStore(
      ctx,
      () => globalStorage.get('plugin_global_data'),
      (data) => globalStorage.set('plugin_global_data', data),
      (listener) => globalStorage.onChange('plugin_global_data', listener),
    ),
  };
}

// Every plugin's values live in one storage key, under the plugin's state key.
function createKeyValueStore(
  ctx: PluginApiContext,
  read: () => Record<string, Record<string, unknown>> | undefined,
  write: (data: Record<string, Record<string, unknown>>) => void,
  subscribe: (listener: (data: Record<string, Record<string, unknown>> | undefined) => void) => () => void,
): PluginKeyValueStore {
  const own = (): Record<string, unknown> => read()?.[ctx.stateKey] ?? {};
  const update = (change: (values: Record<string, unknown>) => void) => {
    const data = { ...(read() ?? {}) };
    const values = { ...(data[ctx.stateKey] ?? {}) };
    change(values);
    data[ctx.stateKey] = values;
    write(data);
  };
  const get = (key: string, defaultValue?: unknown) => {
    const values = own();
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : defaultValue;
  };
  return {
    get: get as PluginKeyValueStore['get'],
    set: (key, value) => update(values => { values[key] = value; }),
    remove: (key) => update(values => { delete values[key]; }),
    keys: () => Object.keys(own()),
    onChange: (key, listener) => {
      let last = JSON.stringify(get(key));
      const unsubscribe = subscribe((data) => {
        const value = data?.[ctx.stateKey]?.[key];
        const serialized = JSON.stringify(value);
        if (serialized === last) return;
        last = serialized;
        listener(value as never);
      });
      ctx.track(unsubscribe);
      return unsubscribe;
    },
  };
}

export function createCharacterApi(ctx: PluginApiContext): CharacterApi {
  return {
    getName: () => characterStorage.getCharacter(),
    onChange: (listener) => {
      const unsubscribe = characterStorage.onCharacterChange(listener);
      ctx.track(unsubscribe);
      return unsubscribe;
    },
  };
}
