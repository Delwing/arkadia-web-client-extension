import { temporaryMultibinds } from "@client/scripts/temporaryMultibinds";
import type { PluginApiContext } from "./context";

/**
 * Function Bind API - Manage keyboard bindings
 */
export interface BindApi {
  /**
   * Set a function bind - binds a command or callback to a key
   * When the configured key is pressed, either the command will be sent
   * or the callback will be executed.
   *
   * @param printable - Command string to execute (or null to just use callback)
   * @param callback - Optional callback function to execute instead of sending command
   * @param clearAfterUse - If true, clear the bind after it's used once
   *
   * @example
   * ```typescript
   * // Bind a command to the function key
   * api.bind.set("attack goblin");
   *
   * // Bind a callback function
   * api.bind.set(null, () => {
   *   api.output.print("Custom action triggered!", "system");
   * });
   *
   * // Bind with auto-clear after use
   * api.bind.set("use potion", undefined, true);
   * ```
   */
  set(printable: string | null, callback?: () => void, clearAfterUse?: boolean): void;

  /**
   * Clear the current function bind
   *
   * @example
   * ```typescript
   * api.bind.clear();
   * ```
   */
  clear(): void;

  /**
   * Get the command currently set on the function bind
   * Returns null when nothing is bound (or the bind was set with a callback only).
   * Lets a plugin skip re-setting (and re-printing) a bind that is already in place.
   *
   * @returns The bound command, or null
   *
   * @example
   * ```typescript
   * if (api.bind.get() !== "otul sie plaszczem") {
   *   api.bind.set("otul sie plaszczem");
   * }
   * ```
   */
  get(): string | null;

  /**
   * Get the current bind label (key combination)
   * Returns the configured key combination like "CTRL+]" or "ALT+SHIFT+K"
   *
   * @returns Label string representing the key combination
   *
   * @example
   * ```typescript
   * const label = api.bind.getLabel();
   * api.output.print(`Function bind key: ${label}`, "system");
   * ```
   */
  getLabel(): string;
}

/**
 * Options for api.multibinds.addTemporary()
 */
export interface TemporaryMultibindOptions {
  /** Command sent when the multibind key is pressed (or the bar entry clicked) */
  action: string;
  /** Optional name shown on the bar instead of the action */
  label?: string;
  /** Only show the bind when the current room id equals this. Omit to show it in every room. */
  roomId?: number;
  /** Highlight the bar entry (visible border) */
  highlight?: boolean;
}

/**
 * Fields that can be changed on a temporary multibind
 */
export interface TemporaryMultibindUpdateOptions {
  action?: string;
  label?: string;
  highlight?: boolean;
}

/**
 * Handle returned by api.multibinds.addTemporary()
 */
export interface TemporaryMultibindHandle {
  /** Change the action, label and/or highlight; the bar refreshes */
  update(patch: TemporaryMultibindUpdateOptions): void;
  /** Remove the bind; the bar refreshes. Safe to call more than once. */
  remove(): void;
}

/**
 * Multibinds API - put temporary commands on the multibind bar (ALT+1..4 by default; players can add slots)
 */
export interface MultibindsApi {
  /**
   * Add a temporary multibind.
   *
   * Temporary binds live in memory only - they are never saved, never synced and
   * never change the per-room binds created with `/mbind`. They are removed
   * automatically when the plugin is unloaded.
   *
   * Slots are assigned on every bar refresh, in the order the binds were added:
   * - a saved bind in the current room with the same action is reused (and gets
   *   the highlight) instead of taking a new slot; the same goes for an earlier
   *   temporary bind with the same action,
   * - otherwise the lowest free slot of the player's slots (1..4 by default) is taken; when all slots are used the
   *   bind is not shown and its key does nothing.
   *
   * @example
   * ```typescript
   * const handle = api.multibinds.addTemporary({
   *   action: "otworz skrzynie",
   *   label: "Skrzynia",
   *   roomId: 12345,
   *   highlight: true,
   * });
   * handle.update({ action: "wez wszystko ze skrzyni", label: "Lup" });
   * handle.remove();
   * ```
   */
  addTemporary(opts: TemporaryMultibindOptions): TemporaryMultibindHandle;
}

export function createBindApi(ctx: PluginApiContext): BindApi {
  return {
    set: (printable, callback, clearAfterUse) => {
      ctx.client.FunctionalBind.set(printable, callback, clearAfterUse);
    },

    clear: () => {
      ctx.client.FunctionalBind.clear();
    },

    get: () => {
      return ctx.client.FunctionalBind.getCategory('default')?.getPrintable() ?? null;
    },

    getLabel: () => {
      return ctx.client.FunctionalBind.getLabel();
    }
  };
}

export function createMultibindsApi(ctx: PluginApiContext): MultibindsApi {
  const temporaryMultibindHandles = new Set<TemporaryMultibindHandle>();
  ctx.onCleanup(() => {
    for (const handle of Array.from(temporaryMultibindHandles)) handle.remove();
  });
  return {
    addTemporary: (opts) => {
      const inner = temporaryMultibinds.add({
        action: opts?.action ?? '',
        label: opts?.label,
        roomId: opts?.roomId,
        highlight: opts?.highlight,
      });
      const handle: TemporaryMultibindHandle = {
        update: (patch) => inner.update(patch),
        remove: () => {
          temporaryMultibindHandles.delete(handle);
          inner.remove();
        },
      };
      temporaryMultibindHandles.add(handle);
      return handle;
    }
  };
}
