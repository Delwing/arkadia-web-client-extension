import { registerWalkMode, unregisterWalkMode, type WalkMode } from "@modules/core/walkModeRegistry";
import type { PluginApiContext } from "./context";

/**
 * Walk modes API - walk a step your own way when the player holds a modifier
 * with a direction key.
 *
 * A walk mode rides on the direction keys (numpad by default, or wherever the
 * player moved them). The player picks its modifier in Klawisze, next to the
 * built-in "Przemknij", so Alt+numpad can sneak while Ctrl+numpad runs your
 * mode. It does not change the move mode the ` key cycles.
 */
export interface WalkModesApi {
  /**
   * Register a walk mode. `onMove` gets the step: a short direction (`n`, `ne`,
   * `u`) or, for the special-exit key, that exit's command. Send it however you
   * like - `api.command.send` still applies the current ` move mode.
   *
   * The id keys the player's chosen modifier, so keep it stable across
   * versions, and make it yours (`mc.walk`) - built-in ids are refused.
   *
   * @example
   * ```typescript
   * api.walkModes.register('mc.walk', {
   *   label: 'MC: chodzenie',
   *   defaultModifiers: { ctrl: true },
   *   onMove: (direction) => api.command.send(pickExit(direction), true),
   * });
   * ```
   */
  register(id: string, options: WalkModeOptions): WalkModeHandle;
}

export interface WalkModeOptions {
  /** Name in Klawisze. */
  label: string;
  /** Modifier used until the player picks one. Without it the mode starts unassigned. */
  defaultModifiers?: { ctrl?: boolean; alt?: boolean; shift?: boolean };
  onMove(direction: string): void;
}

export interface WalkModeHandle {
  remove(): void;
}

export function createWalkModesApi(ctx: PluginApiContext): WalkModesApi {
  const walkModeRecords = new Map<string, Omit<WalkMode, "source" | "prefix">>();
  ctx.onCleanup(() => {
    for (const id of Array.from(walkModeRecords.keys())) unregisterWalkMode(id);
    walkModeRecords.clear();
  });
  // Klawisze lists walk modes by plugin name
  ctx.onRename((name) => {
    for (const mode of walkModeRecords.values()) registerWalkMode({ ...mode, pluginName: name });
  });
  return {
    register: (id, options) => {
      // Not prefixed with the plugin id: that is its URL, and the stored modifier must outlive a new one.
      const record = {
        id,
        label: options.label,
        defaultModifiers: options.defaultModifiers,
        onMove: (direction: string) => {
          try {
            options.onMove(direction);
          } catch (e) {
            console.error(`[PluginApi] Walk mode "${id}" failed:`, e);
          }
        },
      };
      if (!registerWalkMode({ ...record, pluginName: ctx.pluginName ?? undefined })) {
        console.warn(`[PluginApi] Walk mode id "${id}" is taken by a built-in mode`);
        return { remove: () => {} };
      }
      walkModeRecords.set(id, record);
      return {
        remove: () => {
          if (walkModeRecords.get(id) !== record) return;
          walkModeRecords.delete(id);
          unregisterWalkMode(id);
        }
      };
    }
  };
}
