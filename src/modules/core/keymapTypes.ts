/**
 * Keymap system types.
 *
 * Keymaps allow users to maintain multiple alternative key binding sets and
 * switch between them.  The currently-selected keymap is a device-scoped
 * setting (each device can independently choose which keymap to use), while
 * the collection of keymaps itself is synced across devices via the Firebase
 * `binds` sync category.
 *
 * Storage layout:
 * - `localStorage['keymaps']`           → KeymapStore  (all keymaps)
 * - `localStorage['binds']`             → BindSettings  (active keymap's binds, derived)
 * - `localStorage['arkadia.activeKeymap']` → string     (keymap ID, per-device)
 */

export interface Bind {
    key: string;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
}

export interface CustomBind extends Bind {
    command: string;
}

export interface DirectionBinds {
    n: Bind;
    s: Bind;
    w: Bind;
    e: Bind;
    nw: Bind;
    ne: Bind;
    sw: Bind;
    se: Bind;
    u: Bind;
    d: Bind;
    zerknij: Bind;
    special: Bind;
}

export interface BindSettings {
    main: Bind;
    /** Optional separate key for gates functional bind. When undefined, inherits from `main`. */
    mainGates?: Bind;
    /** Optional separate key for transport functional bind. When undefined, inherits from `main`. */
    mainTransport?: Bind;
    /** Optional separate key for loot functional bind. When undefined, inherits from `main`. */
    mainLoot?: Bind;
    lamp: Bind;
    attack: Bind;
    support: Bind;
    moveMode: Bind;
    roomBind: Bind;
    drinkable: Bind;
    directions: DirectionBinds;
    custom: CustomBind[];
    temp: Bind[];
    enemy: Bind[];
    enemyBlock: Bind[];
}

/**
 * A single named keymap – a labeled set of key bindings.
 */
export interface Keymap {
    /** Unique keymap identifier (UUID). */
    id: string;
    /** User-facing name (e.g. "Laptop", "Numpad"). */
    name: string;
    /** The actual bindings for this keymap. */
    binds: BindSettings;
    /** ISO timestamp of creation. */
    createdAt: string;
}

/**
 * Root object stored under the `keymaps` localStorage key.
 */
export interface KeymapStore {
    /** Format version for future-proofing migration. */
    version: 1;
    /** All keymaps keyed by their ID. */
    keymaps: Record<string, Keymap>;
}

/** localStorage key that holds the full keymap collection. */
export const KEYMAPS_STORAGE_KEY = 'keymaps';

/** localStorage key that holds the per-device active keymap ID. */
export const ACTIVE_KEYMAP_STORAGE_KEY = 'arkadia.activeKeymap';

/** ID reserved for the default keymap created during migration. */
export const DEFAULT_KEYMAP_ID = 'default';

/** Default name for the initial keymap (Polish UI). */
export const DEFAULT_KEYMAP_NAME = 'Domyślna';

/**
 * Check whether a KeyboardEvent matches a Bind.
 */
export function bindMatches(ev: KeyboardEvent, bind: Bind): boolean {
    const matchesKey = ev.code === bind.key || ev.key === bind.key.toLowerCase()
    if (!matchesKey) return false
    return !!bind.ctrl === ev.ctrlKey && !!bind.alt === ev.altKey && !!bind.shift === ev.shiftKey
}
