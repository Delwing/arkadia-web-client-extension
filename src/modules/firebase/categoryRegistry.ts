/**
 * Sync Category Registry
 *
 * Single source of truth for synced data categories. Everything that used to
 * be maintained as parallel lists (category ids, display names, default
 * options, hot/cold debounce classes, device-scoped sets, storage-key
 * mappings) is derived from this one table.
 *
 * Adding a new synced category:
 * 1. Add an entry below. For data stored in plain localStorage keys, set
 *    `globalKeys` and/or `characterKey` — export/import is then fully generic.
 * 2. Only if the data needs custom handling (IndexedDB, CRDT merge, key
 *    splitting), set `customSync: true` and add export/import cases in
 *    @web/options/exportUtils.
 */

/** UI grouping for the sync options screen. */
export type CategoryGroup = 'control' | 'character' | 'map' | 'interface';

export interface CategoryDefinition {
    /** Display name (Polish), shown in the options UI and conflict dialogs */
    name: string;
    /** UI group this category is shown under in the sync options screen */
    group: CategoryGroup;
    /** 'device': stored per-device in the cloud and only applied from sync-group members */
    scope: 'shared' | 'device';
    /** 'cold': changes frequently during play; synced with the long (10 min) debounce */
    speed: 'hot' | 'cold';
    /**
     * How diverged local and cloud versions can be combined on conflict:
     * - 'append': data is additive (rooms visited, kill records, knowledge
     *   events) — importing performs a union, so both sides merge losslessly.
     * - 'perCharacter': payload is a { characterName: data } map — merge keeps
     *   the chosen side for overlapping characters and both sides' exclusive
     *   characters, so playing different characters on two devices never
     *   discards one of them.
     * - undefined: opaque whole-value data; conflict resolution is
     *   keep-local / use-cloud as a whole.
     */
    merge?: 'append' | 'perCharacter';
    /** Global localStorage keys, exported as { [key]: rawValue } */
    globalKeys?: readonly string[];
    /** Character-scoped localStorage base key, exported as { [characterName]: rawValue } */
    characterKey?: string;
    /**
     * Export/import is implemented by hand in @web/options/exportUtils
     * (IndexedDB-backed data, CRDT merges, key splitting). Any globalKeys /
     * characterKey are then only used for change watching, not generic export.
     */
    customSync?: true;
}

export const CATEGORY_REGISTRY = {
    uiSettings: { name: 'Ustawienia interfejsu', group: 'interface', scope: 'device', speed: 'hot', customSync: true },
    binds: { name: 'Bindy klawiszy', group: 'control', scope: 'shared', speed: 'hot', globalKeys: ['binds', 'keymaps'] },
    shortcuts: { name: 'Skroty', group: 'map', scope: 'shared', speed: 'hot', globalKeys: ['shortcuts'] },
    characterSettings: { name: 'Ustawienia postaci', group: 'character', scope: 'shared', speed: 'hot', merge: 'perCharacter', customSync: true },
    triggers: { name: 'Triggery', group: 'control', scope: 'shared', speed: 'hot', globalKeys: ['triggers'] },
    aliases: { name: 'Aliasy', group: 'control', scope: 'shared', speed: 'hot', globalKeys: ['aliases'] },
    multibinds: { name: 'Multibindy', group: 'control', scope: 'shared', speed: 'hot', customSync: true },
    buttons: { name: 'Przyciski', group: 'interface', scope: 'device', speed: 'hot', customSync: true },
    radial: { name: 'Menu radialne', group: 'interface', scope: 'shared', speed: 'hot', customSync: true },
    visitedRooms: { name: 'Odwiedzone lokacje', group: 'map', scope: 'shared', speed: 'cold', merge: 'append', customSync: true },
    locationNotes: { name: 'Notatki lokacji', group: 'map', scope: 'shared', speed: 'hot', customSync: true },
    killCounts: { name: 'Licznik zabitych', group: 'character', scope: 'shared', speed: 'cold', merge: 'append', characterKey: 'kill_counter', customSync: true },
    improveCounts: { name: 'Licznik postepow', group: 'character', scope: 'shared', speed: 'hot', merge: 'perCharacter', characterKey: 'improve_counter_lifetime' },
    deposits: { name: 'Depozyty', group: 'character', scope: 'shared', speed: 'hot', merge: 'perCharacter', characterKey: 'deposits' },
    containers: { name: 'Pojemniki', group: 'character', scope: 'shared', speed: 'hot', merge: 'perCharacter', characterKey: 'containers' },
    peopleEdits: { name: 'Edycje bazy postaci', group: 'character', scope: 'shared', speed: 'hot', merge: 'perCharacter', characterKey: 'peopleLocalEvents' },
    knowledge: { name: 'Wiedza', group: 'character', scope: 'shared', speed: 'hot', merge: 'append', customSync: true },
} as const satisfies Record<string, CategoryDefinition>;

// Sync category names (matches SyncOptions keys)
export type SyncCategory = keyof typeof CATEGORY_REGISTRY;

// Sync options - precise control over what to sync
export type SyncOptions = Record<SyncCategory, boolean>;

// All sync categories as array (registry order)
export const SYNC_CATEGORIES = Object.keys(CATEGORY_REGISTRY) as SyncCategory[];

export function getCategoryDefinition(category: SyncCategory): CategoryDefinition {
    return CATEGORY_REGISTRY[category];
}

/** Display order and labels for the sync option groups (Polish). */
export const CATEGORY_GROUPS: ReadonlyArray<{ id: CategoryGroup; name: string }> = [
    { id: 'control', name: 'Sterowanie' },
    { id: 'character', name: 'Postac' },
    { id: 'map', name: 'Mapa' },
    { id: 'interface', name: 'Interfejs i urzadzenie' },
];

/** Categories belonging to a UI group, in registry order. */
export function getCategoriesByGroup(group: CategoryGroup): SyncCategory[] {
    return SYNC_CATEGORIES.filter(cat => CATEGORY_REGISTRY[cat].group === group);
}

// Category display names (Polish)
export const SYNC_CATEGORY_NAMES = Object.fromEntries(
    SYNC_CATEGORIES.map(cat => [cat, CATEGORY_REGISTRY[cat].name]),
) as Record<SyncCategory, string>;

export const DEFAULT_SYNC_OPTIONS = Object.fromEntries(
    SYNC_CATEGORIES.map(cat => [cat, true]),
) as SyncOptions;

/** Categories synced with the long debounce because they change during play. */
export const COLD_SYNC_CATEGORIES: ReadonlySet<SyncCategory> = new Set(
    SYNC_CATEGORIES.filter(cat => CATEGORY_REGISTRY[cat].speed === 'cold'),
);

/** localStorage base keys belonging to cold categories (for change classification). */
export const COLD_STORAGE_KEYS: ReadonlySet<string> = new Set(
    SYNC_CATEGORIES
        .filter(cat => CATEGORY_REGISTRY[cat].speed === 'cold')
        .flatMap(cat => {
            const def: CategoryDefinition = CATEGORY_REGISTRY[cat];
            return [...(def.globalKeys ?? []), ...(def.characterKey ? [def.characterKey] : [])];
        }),
);

/** Categories whose data is tied to a physical device (layout, buttons). */
export const DEVICE_SCOPED_SYNC_CATEGORIES: ReadonlySet<SyncCategory> = new Set(
    SYNC_CATEGORIES.filter(cat => CATEGORY_REGISTRY[cat].scope === 'device'),
);
