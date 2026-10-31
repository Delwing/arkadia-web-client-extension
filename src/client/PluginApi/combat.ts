import { type EnemyBindResolver, enemyBindResolvers } from "@client/scripts/enemyBindResolvers";
import { getCoverTracker } from "@client/scripts/coverTracker";
import type { PluginApiContext } from "./context";

/**
 * Team API - Access team information
 */
export interface TeamApi {
  /**
   * Get list of team member names
   * @returns Array of team member names
   *
   * @example
   * ```typescript
   * const members = api.team.getMembers();
   * api.output.print(`Team has ${members.length} members`, "system");
   * ```
   */
  getMembers(): string[];

  /**
   * Get the team leader's name
   * @returns Leader name or undefined if not in a team
   *
   * @example
   * ```typescript
   * const leader = api.team.getLeader();
   * if (leader) {
   *   api.output.print(`Team leader: ${leader}`, "system");
   * }
   * ```
   */
  getLeader(): string | undefined;

  /**
   * Get the team leader's object ID
   * @returns Leader object ID or undefined if not in a team
   */
  getLeaderId(): number | undefined;

  /**
   * Get the player's object number
   * @returns Player object number or undefined
   */
  getPlayerNum(): number | undefined;
}

/**
 * Attack Queue API - Manage attack queue
 */
export interface AttackQueueApi {
  /**
   * Add an enemy to the attack queue
   * @param id - Object ID of the enemy
   * @returns True if added successfully, false if already in queue
   *
   * @example
   * ```typescript
   * const added = api.attackQueue.add("12345");
   * if (added) {
   *   api.output.print("Enemy added to queue", "system");
   * }
   * ```
   */
  add(id: number): boolean;

  /**
   * Remove an enemy from the attack queue
   * @param id - Object ID of the enemy
   * @returns True if removed successfully, false if not found
   *
   * @example
   * ```typescript
   * api.attackQueue.remove("12345");
   * ```
   */
  remove(id: number): boolean;

  /**
   * Clear the entire attack queue
   *
   * @example
   * ```typescript
   * api.attackQueue.clear();
   * api.output.print("Attack queue cleared", "system");
   * ```
   */
  clear(): void;

  /**
   * Get the current attack queue
   * @returns Array of enemy object IDs in queue order
   *
   * @example
   * ```typescript
   * const queue = api.attackQueue.get();
   * api.output.print(`Queue has ${queue.length} enemies`, "system");
   * ```
   */
  get(): number[];
}

/**
 * Enemy Binds API - Customize which enemies get assigned to the bind slots (F1/F2/F3)
 *
 * The enemy binds feature scans objects on the current location, builds a candidate
 * list of those matching the built-in enemy check, and fills the bind slots in order.
 * Resolvers run as a pipeline on that candidate list (re-run on every object update),
 * letting plugins reorder targets and inject enemies the built-in check would miss.
 */
export interface EnemyBindsApi {
  /**
   * Register an enemy bind resolver
   *
   * Resolvers compose in priority order (higher runs first). Each receives the
   * current ordered candidate list and every object on the location, and returns
   * the candidate list to use going forward. The first three candidates map to the
   * F1/F2/F3 slots (subject to per-slot enable settings). Duplicate `num`s are
   * dropped automatically (first wins).
   *
   * @param name - Unique identifier (re-registering the same name replaces it)
   * @param resolver - Resolver function; return a new array, or nothing to leave the list unchanged
   * @param priority - Optional priority (higher = runs first, default: 0)
   *
   * @example
   * ```typescript
   * // Order targets by your own threat/affinity list (weakest known mobs first,
   * // unknown mobs last). Useful when you know a mob is easier than the others.
   * const AFFINITY_ORDER = ["szczur", "goblin", "wilk", "ork", "troll"];
   * const rank = (desc: string) => {
   *   const i = AFFINITY_ORDER.findIndex(name => desc.toLowerCase().includes(name));
   *   return i === -1 ? Infinity : i;
   * };
   * api.enemyBinds.register("affinity", (candidates) =>
   *   [...candidates].sort((a, b) => rank(a.desc) - rank(b.desc)));
   *
   * // Also bind a specific summoned mob the built-in check ignores
   * api.enemyBinds.register("bind-totems", (candidates, allObjects) => {
   *   const extra = allObjects
   *     .filter(o => o.desc?.toLowerCase().includes("totem"))
   *     .map(o => ({ num: o.num, desc: o.desc! }));
   *   return [...candidates, ...extra];
   * });
   * ```
   */
  register(name: string, resolver: EnemyBindResolver, priority?: number): void;

  /**
   * Unregister an enemy bind resolver
   *
   * @param name - Resolver identifier to remove
   * @returns True if a resolver was found and removed
   */
  unregister(name: string): boolean;

  /**
   * Get list of registered resolver names in priority order
   *
   * @returns Array of resolver names
   */
  getResolverNames(): string[];

  /**
   * Clear all registered resolvers
   */
  clear(): void;
}

/**
 * Combat API - Access combat-related settings and commands
 *
 * Provides access to combat settings like weapon draw commands.
 */
export interface CombatApi {
  /**
   * Draw all weapons using the configured draw weapon command
   *
   * Sends the appropriate command based on character settings
   * (e.g., "dobadz wszystkich broni", "wyciagnij wszystkich broni")
   *
   * @example
   * ```typescript
   * api.combat.drawWeapon();
   * ```
   */
  drawWeapon(): void;

  /**
   * Whether `coveredId` is covered (zaslona) against `attackerId` - attacks from
   * `attackerId` land on the coverer instead. Covers are inferred from game text
   * and GMCP; false when nothing is known.
   *
   * @example
   * ```typescript
   * const me = api.team.getPlayerNum();
   * if (me !== undefined && api.combat.isCoveredFor(targetId, me)) {
   *   // attacking targetId is wasted until the cover is broken
   * }
   * ```
   */
  isCoveredFor(coveredId: number, attackerId: number): boolean;

  /** Everyone `attackerId` currently cannot reach because of a cover */
  getCoveredForAttacker(attackerId: number): number[];
}

/**
 * Attack Controller API - Execute attacks with proper team coordination
 *
 * Provides methods to attack targets by their object ID, respecting
 * attack mode settings and team coordination (leader commands).
 */
export interface AttackControllerApi {
  /**
   * Attack a target by its object ID
   *
   * When attack mode is "AW" or "AWR" and user is team leader:
   * - "AW": Also marks target as team attack target
   * - "AWR": Marks target and orders team to attack
   *
   * @param id - Object ID of the target
   * @param command - Optional attack command override (uses character setting if not provided)
   *
   * @example
   * ```typescript
   * // Attack object with ID 123
   * api.attackController.attackById(123);
   *
   * // Attack with custom command
   * api.attackController.attackById(123, "kopnij");
   * ```
   */
  attackById(id: number, command?: string): void;

  /**
   * Support the team leader by attacking their target
   *
   * Sends the support command (default: "wesprzyj") and also
   * sends the command targeting the leader's object ID.
   *
   * @param command - Optional support command override (uses character setting if not provided)
   *
   * @example
   * ```typescript
   * // Support the leader
   * api.attackController.support();
   *
   * // Support with custom command
   * api.attackController.support("pomoz");
   * ```
   */
  support(command?: string): void;

  /**
   * Get the current attack command from character settings
   *
   * @returns The configured attack command (e.g., "zabij", "zaatakuj")
   *
   * @example
   * ```typescript
   * const cmd = api.attackController.getAttackCommand();
   * console.log(`Current attack command: ${cmd}`);
   * ```
   */
  getAttackCommand(): string;

  /**
   * Get the current support command from character settings
   *
   * @returns The configured support command (e.g., "wesprzyj")
   *
   * @example
   * ```typescript
   * const cmd = api.attackController.getSupportCommand();
   * console.log(`Current support command: ${cmd}`);
   * ```
   */
  getSupportCommand(): string;
}

export function createTeamApi(ctx: PluginApiContext): TeamApi {
  return {
    getMembers: () => {
      return ctx.client.TeamManager.getTeamMembers();
    },

    getLeader: () => {
      return ctx.client.TeamManager.getLeader();
    },

    getLeaderId: () => {
      return ctx.client.TeamManager.getLeaderId();
    },

    getPlayerNum: () => {
      return ctx.client.TeamManager.playerNum;
    }
  };
}

export function createAttackQueueApi(ctx: PluginApiContext): AttackQueueApi {
  return {
    add: (id) => {
      return ctx.client.TeamManager.addEnemyToQueue(id);
    },

    remove: (id) => {
      return ctx.client.TeamManager.removeEnemyFromQueue(id);
    },

    clear: () => {
      ctx.client.TeamManager.clearEnemyQueue();
    },

    get: () => {
      return ctx.client.TeamManager.getEnemyQueue();
    }
  };
}

export function createEnemyBindsApi(): EnemyBindsApi {
  return {
    register: (name: string, resolver: EnemyBindResolver, priority?: number) => {
      enemyBindResolvers.register(name, resolver, priority);
    },

    unregister: (name: string): boolean => {
      return enemyBindResolvers.unregister(name);
    },

    getResolverNames: (): string[] => {
      return enemyBindResolvers.getResolverNames();
    },

    clear: () => {
      enemyBindResolvers.clear();
    }
  };
}

export function createAttackControllerApi(ctx: PluginApiContext): AttackControllerApi {
  return {
    attackById: (id: number, command?: string): void => {
      ctx.client.AttackController.attackById(id, command);
    },

    support: (command?: string): void => {
      ctx.client.AttackController.support(command);
    },

    getAttackCommand: (): string => {
      return ctx.client.AttackController.getAttackCommand();
    },

    getSupportCommand: (): string => {
      return ctx.client.AttackController.getSupportCommand();
    }
  };
}

export function createCombatApi(ctx: PluginApiContext): CombatApi {
  return {
    drawWeapon: (): void => {
      ctx.client.drawWeapon();
    },

    isCoveredFor: (coveredId: number, attackerId: number): boolean => {
      return getCoverTracker()?.isCoveredFor(coveredId, attackerId) ?? false;
    },

    getCoveredForAttacker: (attackerId: number): number[] => {
      return getCoverTracker()?.getCoveredForAttacker(attackerId) ?? [];
    }
  };
}
