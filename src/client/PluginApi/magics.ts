import loadMagics, { loadMagicsRaw } from "@client/scripts/magicsLoader";
import loadMagicKeys, { loadMagicKeysRaw } from "@client/scripts/magicKeyLoader";

/**
 * Grammatical case of a magic item form; `mnoga_` prefixes the plural.
 */
export type MagicCase =
  | 'mianownik'
  | 'dopelniacz'
  | 'celownik'
  | 'biernik'
  | 'narzednik'
  | 'miejscownik'
  | 'mnoga_mianownik'
  | 'mnoga_dopelniacz'
  | 'mnoga_celownik'
  | 'mnoga_biernik'
  | 'mnoga_narzednik'
  | 'mnoga_miejscownik';

/**
 * Forms of one item per case. A case holds a list because variants of the same
 * item share it - "otwarta"/"zamknieta" containers and alternate phrasings.
 */
export type MagicForms = Partial<Record<MagicCase, string[]>>;

/**
 * Single magic item entry
 */
export interface MagicEntry {
  type: string[];
  /** Declined forms grouped by case (magics data v3). */
  odmiana?: MagicForms;
  /** Forms that fit no case - irregular phrases and typos kept for matching. */
  dodatkowe_regexps?: string[];
  /** Every form in one flat list (magics data v2, still read from a stale cache). */
  regexps?: string[];
}

/**
 * Raw magics data structure
 */
export interface MagicsFile {
  version?: number;
  magics: Record<string, MagicEntry>;
}

/**
 * Magics API - Access magic item patterns
 */
export interface MagicsApi {
  /**
   * Get current magic item patterns
   * Returns patterns used to identify magic items in game output
   *
   * @returns Promise resolving to array of regex pattern strings
   *
   * @example
   * ```typescript
   * const patterns = await api.magics.getPatterns();
   * console.log(`${patterns.length} magic patterns loaded`);
   *
   * // Check if an item matches magic patterns
   * const item = "magiczny miecz";
   * const ismagic = patterns.some(p => new RegExp(p, 'i').test(item));
   * ```
   */
  getPatterns(): Promise<string[]>;

  /**
   * Get raw magics data
   * Returns the complete magics data structure with item names, types, and patterns
   *
   * @returns Promise resolving to raw MagicsFile data or undefined if not loaded
   *
   * @example
   * ```typescript
   * const rawData = await api.magics.getRawData();
   * if (rawData) {
   *   for (const [name, magic] of Object.entries(rawData.magics)) {
   *     const biernik = magic.odmiana?.biernik?.[0];
   *     console.log(`${name}: types=${magic.type.join(',')}, biernik=${biernik}`);
   *   }
   * }
   * ```
   */
  getRawData(): Promise<MagicsFile | undefined>;
}

/**
 * Raw magic keys data structure
 */
export interface MagicKeysData {
  magic_keys: string[];
}

/**
 * Magic Keys API - Access magic key patterns
 */
export interface MagicKeysApi {
  /**
   * Get current magic key patterns
   * Returns patterns used to identify magic keys in game output
   *
   * @returns Promise resolving to array of pattern strings
   *
   * @example
   * ```typescript
   * const patterns = await api.magicKeys.getPatterns();
   * console.log(`${patterns.length} magic key patterns loaded`);
   *
   * // Check if an item is a magic key
   * const item = "klucz ze srebra";
   * const isMagicKey = patterns.some(p => new RegExp(p, 'i').test(item));
   * ```
   */
  getPatterns(): Promise<string[]>;

  /**
   * Get raw magic keys data
   * Returns the complete magic keys data structure
   *
   * @returns Promise resolving to raw MagicKeysData or undefined if not loaded
   *
   * @example
   * ```typescript
   * const rawData = await api.magicKeys.getRawData();
   * if (rawData) {
   *   console.log(`${rawData.magic_keys.length} magic keys loaded`);
   * }
   * ```
   */
  getRawData(): Promise<MagicKeysData | undefined>;
}

export function createMagicsApi(): MagicsApi {
  return {
    getPatterns: async () => {
      return await loadMagics();
    },
    getRawData: async () => {
      return await loadMagicsRaw();
    }
  };
}

export function createMagicKeysApi(): MagicKeysApi {
  return {
    getPatterns: async () => {
      return await loadMagicKeys();
    },
    getRawData: async () => {
      return await loadMagicKeysRaw();
    }
  };
}
