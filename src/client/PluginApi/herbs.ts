import { getHerbsData, herbFormForCount, inspectHerbBag, resolveHerbName } from "@client/scripts/herbBags";
import loadHerbs from "@client/scripts/herbsLoader";
import type { PluginApiContext } from "./context";

/**
 * Herb bag state - contains herbs and optional condition
 */
export interface HerbBagState {
  /** Map of herb ID to count */
  herbs: Record<string, number>;
  /** Bag condition (1-5, where 5 is best) */
  condition?: number;
}

/**
 * All herb bags state - map of bag number to bag state
 */
export type HerbBagsState = Record<number, HerbBagState>;

/**
 * Options for moving herbs between bags
 */
export interface HerbMoveOptions {
  /** Herb ID to move */
  herbId: string;
  /** Amount to move */
  amount: number;
  /** Source bag number */
  fromBag: number;
  /** Destination bag number */
  toBag: number;
}

/**
 * Herb grammatical forms (Polish declensions)
 */
export interface HerbForms {
  /** Nominative singular (mianownik) */
  mianownik: string;
  /** Genitive singular (dopelniacz) */
  dopelniacz: string;
  /** Accusative singular (biernik) */
  biernik: string;
  /** Nominative plural (mnoga mianownik) */
  mnoga_mianownik: string;
  /** Genitive plural (mnoga dopelniacz) */
  mnoga_dopelniacz: string;
  /** Accusative plural (mnoga biernik) */
  mnoga_biernik: string;
  /** Instrumental singular (narzednik) - used by "nabij fajke <herb>" */
  narzednik: string;
}

/**
 * Herb use/effect definition
 */
export interface HerbUse {
  /** Action command (e.g., "jedz", "pal") */
  action: string;
  /** Effect description */
  effect: string;
  /** If true, herb should not be bound when used */
  dont_bind?: boolean;
  /** If true, the herb can be smoked; such entries carry no real action/effect */
  smokable?: boolean;
}

/**
 * Complete herb database structure
 */
export interface HerbsData {
  /** Map of herb ID to grammatical forms */
  herb_id_to_odmiana: Record<string, HerbForms>;
  /** Database version number */
  version: number;
  /** Map of herb ID to array of uses/effects */
  herb_id_to_use: Record<string, HerbUse[]>;
}

/**
 * Herbs API - Access herb inventory in bags
 */
export interface HerbsApi {
  /**
   * Get current state of all herb bags
   * Returns a copy of the herb bags state with herb counts and conditions
   *
   * @returns Object mapping bag number to bag state
   *
   * @example
   * ```typescript
   * const bags = api.herbs.getBags();
   * console.log("Bag 1:", bags[1]?.herbs);
   *
   * // Count total herbs
   * const totals: Record<string, number> = {};
   * Object.values(bags).forEach(bag => {
   *   Object.entries(bag.herbs).forEach(([herb, count]) => {
   *     totals[herb] = (totals[herb] || 0) + count;
   *   });
   * });
   * ```
   */
  getBags(): HerbBagsState;

  /**
   * Replace the whole herb bag state, as if `/ziola_buduj` had just counted it.
   * Saved for the character and shown in the "Ziola" window right away; no
   * game commands are sent. Bags missing from `bags` are dropped.
   *
   * @example
   * ```typescript
   * // Keep the counted state as "magazyn" and bring it back later
   * const magazyn = api.herbs.getBags();
   * // ... /ziola_buduj counts another set ...
   * api.herbs.setBags(magazyn);
   * ```
   */
  setBags(bags: HerbBagsState): void;

  /**
   * Take herbs from bags
   * Removes herbs from inventory and executes appropriate game commands
   *
   * @param herbId - Herb identifier (e.g., "ziolo_many", "czosnek")
   * @param amount - Number of herbs to take
   * @param fromBag - Optional specific bag number to take from
   * @returns Promise resolving to number of herbs actually taken
   *
   * @example
   * ```typescript
   * // Take 3 herbs from any bag
   * const taken = await api.herbs.take("ziolo_many", 3);
   * console.log(`Took ${taken} ziolo_many`);
   *
   * // Take from specific bag
   * const taken = await api.herbs.take("czosnek", 1, 2);
   * ```
   */
  take(herbId: string, amount: number, fromBag?: number): Promise<number>;

  /**
   * Put herbs into a bag
   * Adds herbs to inventory and executes appropriate game commands
   *
   * @param herbId - Herb identifier
   * @param amount - Number of herbs to put
   * @param bag - Bag number to put herbs into
   * @returns Promise resolving to number of herbs actually put
   *
   * @example
   * ```typescript
   * // Put 5 herbs into bag 1
   * const put = await api.herbs.put("ziolo_many", 5, 1);
   * console.log(`Put ${put} ziolo_many into bag 1`);
   * ```
   */
  put(herbId: string, amount: number, bag: number): Promise<number>;

  /**
   * Move herbs between bags
   * Convenience method that takes from one bag and puts into another
   *
   * @param options - Move options with herbId, amount, fromBag, toBag
   * @returns Promise resolving when move is complete
   *
   * @example
   * ```typescript
   * // Move 3 herbs from bag 1 to bag 2
   * await api.herbs.move({
   *   herbId: "ziolo_many",
   *   amount: 3,
   *   fromBag: 1,
   *   toBag: 2
   * });
   * ```
   */
  move(options: HerbMoveOptions): Promise<void>;

  /**
   * Get the herb database containing herb forms and uses
   * Returns data about herb conjugations (forms) and effects
   *
   * @returns Promise resolving to herb database or null if unavailable
   *
   * @example
   * ```typescript
   * const data = await api.herbs.getData();
   * if (data) {
   *   // Get herb forms for "ziolo_many"
   *   const forms = data.herb_id_to_odmiana["ziolo_many"];
   *   console.log("Nominative:", forms.mianownik);
   *   console.log("Genitive:", forms.dopelniacz);
   *
   *   // Get herb uses
   *   const uses = data.herb_id_to_use["ziolo_many"];
   *   uses?.forEach(use => {
   *     console.log(`Action: ${use.action}, Effect: ${use.effect}`);
   *   });
   * }
   * ```
   */
  getData(): Promise<HerbsData | null>;

  /**
   * Herb id for a description as the game prints it, in any case form, with or
   * without a count: "zolty jasny kwiat", "dwa zolte jasne kwiaty". Null when it
   * is not a herb.
   *
   * @example
   * ```typescript
   * api.triggers.register(/^Dostajesz (.*) od /, (line, m) => {
   *   api.herbs.resolve(m[1]).then(id => id && received.push(id));
   *   return line;
   * });
   * ```
   */
  resolve(text: string): Promise<string | null>;

  /**
   * The herb's form that follows a count in a command: `form("deliona", 1)` gives
   * the accusative, 2-4 the plural accusative, 5+ the plural genitive. Unknown
   * herbs return the id unchanged.
   *
   * @example
   * ```typescript
   * api.command.send(`wez 5 ${await api.herbs.form("deliona", 5)} z 2. swojego woreczka`);
   * ```
   */
  form(herbId: string, count: number): Promise<string>;

  /**
   * Look into one herb bag and read what is in it. `target` is the rest of the
   * `zajrzyj do` command: "swojego woreczka", "2. swojego woreczka",
   * "swojego zamknietego woreczka". The bag must be at hand, not inside a container.
   * Resolves with null when there is no such bag or no listing within the
   * timeout (5 s by default); rejects with the signal's reason when aborted.
   *
   * @example
   * ```typescript
   * const bag = await api.herbs.inspectBag("swojego zamknietego woreczka");
   * if (bag && bag.total > 40) { ... use another bag ... }
   * ```
   */
  inspectBag(target: string, options?: { timeout?: number; signal?: AbortSignal }): Promise<HerbBagInspection | null>;
}

/** Result of {@link HerbsApi.inspectBag} */
export interface HerbBagInspection {
  /** Herbs by id; names that are not known herbs are under their own name */
  herbs: Record<string, number>;
  /** All herbs in the bag ("wiele" counts as the player's herb setting, 25 by default) */
  total: number;
  /** True when the bag holds nothing */
  empty: boolean;
  /** Names in the bag that are not known herbs */
  unknown: string[];
}

export function createHerbsApi(ctx: PluginApiContext): HerbsApi {
  return {
    getBags: () => {
      return ctx.client.herbManager?.getBags() ?? {};
    },

    setBags: (bags: HerbBagsState) => {
      if (!ctx.client.herbManager) {
        console.warn('Herb manager not initialized');
        return;
      }
      ctx.client.herbManager.setBags(bags);
    },

    take: async (herbId: string, amount: number, fromBag?: number) => {
      if (!ctx.client.herbManager) {
        console.warn('Herb manager not initialized');
        return 0;
      }
      return await ctx.client.herbManager.take(herbId, amount, fromBag);
    },

    put: async (herbId: string, amount: number, bag: number) => {
      if (!ctx.client.herbManager) {
        console.warn('Herb manager not initialized');
        return 0;
      }
      return await ctx.client.herbManager.put(herbId, amount, bag);
    },

    move: async (options: HerbMoveOptions) => {
      if (!ctx.client.herbManager) {
        console.warn('Herb manager not initialized');
        return;
      }
      return await ctx.client.herbManager.move(options);
    },

    getData: async () => {
      return await loadHerbs();
    },

    resolve: async (text: string) => {
      const data = await getHerbsData();
      return data ? resolveHerbName(text, data) : null;
    },

    form: async (herbId: string, count: number) => {
      return herbFormForCount(herbId, count, await getHerbsData());
    },

    inspectBag: (target: string, options?: { timeout?: number; signal?: AbortSignal }) => {
      return inspectHerbBag(ctx.client, target, options);
    }
  };
}
