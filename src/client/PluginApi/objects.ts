import { type ObjectListEntryFilter, objectListFilters } from "@modules/core/objectListFilters";
import type { PluginApiContext } from "./context";

/**
 * Location object information
 */
export interface LocationObject {
  /** Object number */
  num: number;
  /** Object description/name */
  desc?: string;
  /** HP */
  hp?: number;
  /** Attack number or boolean indicating combat status */
  attack_num?: boolean | number;
  /** Whether avatar is targeting this object */
  avatar_target?: boolean;
  /** Whether this is an attack target */
  attack_target?: boolean;
  /** Whether this is a defense target */
  defense_target?: boolean;
  /** Shortcut key for this object (e.g., '@', 'A', '1') */
  shortcut?: string;
  /** Category: player, team member, enemy, or non-combat entity */
  __category?: 'player' | 'team' | 'rest' | 'rest-noncombat';
}

/**
 * Objects API - Access objects in current location
 */
export interface ObjectsApi {
  /**
   * Get all objects in current location
   * Returns objects organized by category (player, team, enemies, non-combat)
   * with shortcuts assigned for easy targeting
   *
   * @returns Array of location objects with shortcuts and categories
   *
   * @example
   * ```typescript
   * const objects = api.objects.getObjectsOnLocation();
   *
   * // Find player object
   * const player = objects.find(o => o.__category === 'player');
   *
   * // Find all enemies
   * const enemies = objects.filter(o => o.__category === 'rest');
   *
   * // Find object by shortcut
   * const target = objects.find(o => o.shortcut === '1');
   * if (target) {
   *   api.output.print(`Target: ${target.desc} (${target.num})`, "system");
   * }
   * ```
   */
  getObjectsOnLocation(): LocationObject[];
}

/**
 * Object List Filters API - Customize object list entry rendering
 *
 * Allows plugins to register filters that modify how objects are displayed
 * in the object list. Filters can change colors, add icons, modify text, etc.
 *
 * Types are available for import:
 * ```typescript
 * import type { ObjectListEntryFilter, EntryContext, FilterResult } from "@arkadia/plugin-types";
 * ```
 */
export interface ObjectListFiltersApi {
  /**
   * Register an object list entry filter
   *
   * Filters receive context about the object and can modify its appearance
   * by mutating the result parameter. Multiple filters can compose together.
   *
   * @param name - Unique identifier for this filter
   * @param filter - Filter function that modifies entry appearance
   * @param priority - Optional priority (higher = runs first, default: 0)
   *
   * @example
   * ```typescript
   * // Highlight dragons in red with icon
   * api.objectListFilters.register("dragons", (context, result) => {
   *   if (context.rawDescription.toLowerCase().includes("smok")) {
   *     result.style.descriptionColor = "#ff0000";
   *     result.style.prefix = (result.style.prefix || "") + "🐉 ";
   *   }
   * }, 10);
   *
   * // Warn about low HP enemies
   * api.objectListFilters.register("lowHp", (context, result) => {
   *   if (context.object.hp && context.object.maxhp) {
   *     const percent = context.object.hp / context.object.maxhp;
   *     if (percent < 0.2) {
   *       result.style.hpBarColor = "#ff0000";
   *       result.style.suffix = (result.style.suffix || "") + " ☠️";
   *     }
   *   }
   * }, 5);
   * ```
   */
  register(name: string, filter: ObjectListEntryFilter, priority?: number): void;

  /**
   * Unregister an object list entry filter
   *
   * @param name - Filter identifier to remove
   * @returns True if filter was found and removed
   *
   * @example
   * ```typescript
   * api.objectListFilters.unregister("dragons");
   * ```
   */
  unregister(name: string): boolean;

  /**
   * Get list of registered filter names
   *
   * @returns Array of filter names in priority order
   *
   * @example
   * ```typescript
   * const filters = api.objectListFilters.getFilterNames();
   * console.log("Active filters:", filters);
   * ```
   */
  getFilterNames(): string[];

  /**
   * Clear all registered filters
   *
   * @example
   * ```typescript
   * api.objectListFilters.clear();
   * ```
   */
  clear(): void;
}

export function createObjectsApi(ctx: PluginApiContext): ObjectsApi {
  return {
    getObjectsOnLocation: () => {
      return ctx.client.ObjectManager.getObjectsOnLocation();
    }
  };
}

export function createObjectListFiltersApi(): ObjectListFiltersApi {
  return {
    register: (name: string, filter: ObjectListEntryFilter, priority?: number) => {
      objectListFilters.register(name, filter, priority);
    },

    unregister: (name: string): boolean => {
      return objectListFilters.unregister(name);
    },

    getFilterNames: (): string[] => {
      return objectListFilters.getFilterNames();
    },

    clear: () => {
      objectListFilters.clear();
    }
  };
}
