import { globalStorage } from "@modules/core/storage";
import {
  hasPluginKeyAction,
  normalizeBindKey,
  pluginKeyBindOf,
  registerPluginKeyAction,
  unregisterPluginKeyAction,
  type PluginKeyAction,
} from "@modules/core/pluginKeyRegistry";
import type { PluginApiContext } from "./context";

/** A key combination for {@link KeysApi.register} */
export interface PluginKeyBind {
  /**
   * The key: a letter or digit ("h", "4"), or a KeyboardEvent.code for other
   * keys ("F6", "Backquote", "Numpad5"). Letters and digits match the physical
   * key, so Alt+J also works on layouts where Alt changes the character.
   */
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
}

/** A key action for {@link KeysApi.register} */
export interface PluginKeyActionOptions {
  /**
   * Stable id; the player's key is stored under it, so keep it the same across
   * versions. Prefix it with the plugin's name: "jubiler.appraise".
   */
  id: string;
  /** What the action does, as shown in Klawisze: "Wyceń kamienie" */
  label: string;
  /** The key suggested until the player picks one; leave out for no key */
  defaultKey?: PluginKeyBind;
  /** Runs when the action's key is pressed; the key's default action is prevented */
  onPress: (event: KeyboardEvent) => void;
}

/** Handle for a registered key action, see {@link KeysApi.register} */
export interface PluginKeyHandle {
  /** The key the action listens on now (the player's choice or the default), or null */
  getKey(): PluginKeyBind | null;
  remove(): void;
}

/**
 * Keys API - plugin key actions, listed and rebindable in Klawisze
 */
export interface KeysApi {
  /**
   * Register an action the player can trigger with a key. It is listed in
   * Klawisze under "Pluginy", where the player can move it to another key or
   * switch it off; that choice is stored in their keymap. Until then the
   * action listens on `defaultKey`. Removed when the plugin unloads.
   *
   * @returns null when another plugin already registered this id
   *
   * @example
   * ```typescript
   * api.keys.register({
   *   id: 'jubiler.appraise',
   *   label: 'Wyceń kamienie',
   *   defaultKey: { key: 'j', alt: true },
   *   onPress: () => appraise(),
   * });
   * ```
   */
  register(action: PluginKeyActionOptions): PluginKeyHandle | null;
}

export function createKeysApi(ctx: PluginApiContext): KeysApi {
  const keyActions = new Map<string, PluginKeyAction>();
  ctx.onCleanup(() => {
    for (const id of Array.from(keyActions.keys())) unregisterPluginKeyAction(id);
    keyActions.clear();
  });
  // Klawisze lists key actions by plugin name
  ctx.onRename((name) => {
    for (const [id, action] of keyActions) {
      const named = { ...action, pluginName: name };
      keyActions.set(id, named);
      registerPluginKeyAction(named);
    }
  });
  return {
    register: (options) => {
      const { id } = options;
      // Not prefixed with the plugin id: that is its URL, and the player's key must outlive a new one.
      if (hasPluginKeyAction(id) && !keyActions.has(id)) {
        console.warn(`[PluginApi] Key action id "${id}" is taken by another plugin`);
        return null;
      }
      const action: PluginKeyAction = {
        id,
        label: options.label,
        pluginName: ctx.pluginName ?? undefined,
        defaultBind: options.defaultKey ? { ...options.defaultKey, key: normalizeBindKey(options.defaultKey.key) } : undefined,
        onPress: options.onPress,
      };
      registerPluginKeyAction(action);
      keyActions.set(id, action);
      return {
        getKey: () => {
          const bind = pluginKeyBindOf(globalStorage.get('binds'), action);
          return bind ? { key: bind.key, ctrl: !!bind.ctrl, alt: !!bind.alt, shift: !!bind.shift } : null;
        },
        remove: () => {
          if (keyActions.get(id) !== action) return;
          keyActions.delete(id);
          unregisterPluginKeyAction(id);
        },
      };
    },
  };
}
