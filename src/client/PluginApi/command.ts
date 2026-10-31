import type { CommandHookCallback } from "@client/Client";
import type { PluginApiContext } from "./context";

/**
 * Command API - Send commands to the server
 */
export interface CommandApi {
  /**
   * Send a command to the server
   * @param command - Command string to send
   * @param echo - Whether to echo the command in the output (default: true)
   * @param options - Additional command options
   *
   * @example
   * ```typescript
   * // Send a simple command
   * api.command.send("look");
   *
   * // Send a command without echoing it
   * api.command.send("attack goblin", false);
   *
   * // Send multiple commands in a sequence
   * await api.command.send("get sword");
   * await api.command.send("wield sword");
   * ```
   */
  send(command: string, echo?: boolean, options?: any): Promise<void>;

  /**
   * Add words to the command line tab-completion suggestions.
   * These suggestions appear alongside words extracted from the output buffer
   * when the user presses Tab in the command input.
   * Duplicate words are ignored.
   *
   * @param words - Words to add as tab-completion suggestions
   *
   * @example
   * ```typescript
   * api.command.addSuggestions("goblin", "dragon", "potezny");
   * ```
   */
  addSuggestions(...words: string[]): void;

  /**
   * Remove words previously added via {@link addSuggestions}.
   *
   * @param words - Words to remove from tab-completion suggestions
   *
   * @example
   * ```typescript
   * api.command.removeSuggestions("goblin");
   * ```
   */
  removeSuggestions(...words: string[]): void;
}

/**
 * Command Hooks API - Intercept and modify commands before processing
 */
export interface CommandHooksApi {
  /**
   * Register a command hook that can alter or suppress commands.
   * Hooks are called early in sendCommand, before any processing
   * (before Polish character stripping, map parsing, alias matching, etc).
   *
   * @param callback - Hook callback function that receives the command and can:
   *   - Return a modified command string to alter the command
   *   - Return null to suppress/cancel the command
   *   - Return undefined to keep the original command unchanged
   * @param priority - Hook priority (higher runs first, default: 0)
   * @returns Hook ID for later removal
   *
   * @example
   * ```typescript
   * // Modify a command
   * const hookId = api.commandHooks.register((command, echo, options) => {
   *   if (command === "atakuj") {
   *     return "atakuj ob_12345"; // Replace with specific target
   *   }
   *   return undefined; // Keep original for other commands
   * });
   *
   * // Suppress a command
   * api.commandHooks.register((command) => {
   *   if (command.startsWith("niebezpieczne")) {
   *     api.output.print("Command blocked!");
   *     return null; // Suppress the command
   *   }
   *   return undefined;
   * });
   *
   * // Later: remove the hook
   * api.commandHooks.unregister(hookId);
   * ```
   */
  register(callback: CommandHookCallback, priority?: number): string;

  /**
   * Unregister a previously registered command hook
   * @param hookId - Hook ID returned from register
   * @returns true if hook was found and removed
   */
  unregister(hookId: string): boolean;
}

export function createCommandApi(ctx: PluginApiContext): CommandApi {
  const commandLineSuggestions = new Set<string>();
  ctx.onCleanup(() => {
    for (const word of commandLineSuggestions) {
      const idx = ctx.client.commandLineSuggestions.indexOf(word);
      if (idx !== -1) ctx.client.commandLineSuggestions.splice(idx, 1);
    }
    commandLineSuggestions.clear();
  });
  return {
    send: async (command, echo, options) => {
      await ctx.client.sendCommand(command, echo, options);
    },

    addSuggestions: (...words: string[]) => {
      for (const word of words) {
        if (word && !commandLineSuggestions.has(word)) {
          commandLineSuggestions.add(word);
          ctx.client.commandLineSuggestions.push(word);
        }
      }
    },

    removeSuggestions: (...words: string[]) => {
      for (const word of words) {
        if (commandLineSuggestions.delete(word)) {
          const idx = ctx.client.commandLineSuggestions.indexOf(word);
          if (idx !== -1) {
            ctx.client.commandLineSuggestions.splice(idx, 1);
          }
        }
      }
    }
  };
}

export function createCommandHooksApi(ctx: PluginApiContext): CommandHooksApi {
  const commandHookIds = new Set<string>();
  ctx.onCleanup(() => {
    for (const id of Array.from(commandHookIds)) ctx.client.unregisterCommandHook(id);
    commandHookIds.clear();
  });
  return {
    register: (callback: CommandHookCallback, priority?: number): string => {
      const hookId = `plugin:${ctx.pluginId}:${ctx.generateId('hook')}`;
      ctx.client.registerCommandHook(hookId, callback, priority);
      commandHookIds.add(hookId);
      return hookId;
    },

    unregister: (hookId: string): boolean => {
      const removed = ctx.client.unregisterCommandHook(hookId);
      if (removed) {
        commandHookIds.delete(hookId);
      }
      return removed;
    }
  };
}
