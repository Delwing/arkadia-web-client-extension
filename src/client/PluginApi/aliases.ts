import type { PluginApiContext } from "./context";

/**
 * Alias definition for command aliases
 */
export interface PluginAlias {
  id: string;
  pattern: RegExp;
  callback: (matches?: RegExpMatchArray) => boolean;
}

/**
 * Aliases API - Manage command aliases
 */
export interface AliasesApi {
  /**
   * Register a command alias
   * @param pattern - Regex pattern to match user input
   * @param callback - Function to execute when pattern matches
   * @returns Alias ID for later removal
   */
  register(
    pattern: RegExp,
    callback: (matches?: RegExpMatchArray) => boolean
  ): string;

  /**
   * Remove a command alias by ID
   * @param id - Alias ID returned from register
   */
  remove(id: string): void;
}

export function createAliasesApi(ctx: PluginApiContext): AliasesApi {
  const aliasMap = new Map<string, PluginAlias>();
  const api: AliasesApi = {
    register: (pattern, callback) => {
      const id = Math.random().toString(36).slice(2);
      const alias: PluginAlias = { id, pattern, callback };

      aliasMap.set(id, alias);
      ctx.client.aliases.push({ pattern, callback });

      return id;
    },

    remove: (id) => {
      const alias = aliasMap.get(id);
      if (!alias) return;

      // Remove from client aliases array
      const index = ctx.client.aliases.findIndex(
        a => a.pattern === alias.pattern && a.callback === alias.callback
      );
      if (index !== -1) {
        ctx.client.aliases.splice(index, 1);
      }

      aliasMap.delete(id);
    }
  };
  ctx.onCleanup(() => {
    for (const id of Array.from(aliasMap.keys())) api.remove(id);
  });
  return api;
}
