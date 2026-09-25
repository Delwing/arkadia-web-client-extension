/**
 * Sync Category Registry
 *
 * Single source of truth for synced and backed-up data categories. Everything
 * that used to be maintained as parallel lists (category ids, display names,
 * hot/cold debounce classes, device-scoped sets, storage-key mappings) is
 * derived from these tables. There is no per-category selection: everything
 * in CATEGORY_REGISTRY syncs, and a backup contains every category of both
 * tables.
 *
 * Adding a new synced category:
 * 1. Add an entry below. For data stored in plain localStorage keys, set
 *    `globalKeys` and/or `characterKey` — export/import is then fully generic.
 * 2. Only if the data needs custom handling (IndexedDB, CRDT merge, key
 *    splitting), set `customSync: true` and add export/import cases in
 *    @web/options/exportUtils.
 */

export interface CategoryDefinition {
    /** Display name (Polish), shown in conflict dialogs */
    name: string;
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
    uiSettings: { name: 'Ustawienia interfejsu', scope: 'device', speed: 'hot', customSync: true },
    binds: { name: 'Bindy klawiszy', scope: 'shared', speed: 'hot', globalKeys: ['binds', 'keymaps'] },
    shortcuts: { name: 'Skroty', scope: 'shared', speed: 'hot', globalKeys: ['shortcuts'] },
    characterSettings: { name: 'Ustawienia postaci', scope: 'shared', speed: 'hot', merge: 'perCharacter', customSync: true },
    triggers: { name: 'Triggery', scope: 'shared', speed: 'hot', globalKeys: ['triggers'] },
    aliases: { name: 'Aliasy', scope: 'shared', speed: 'hot', globalKeys: ['aliases'] },
    multibinds: { name: 'Multibindy', scope: 'shared', speed: 'hot', customSync: true },
    buttons: { name: 'Przyciski', scope: 'device', speed: 'hot', customSync: true },
    radial: { name: 'Menu radialne', scope: 'shared', speed: 'hot', customSync: true },
    visitedRooms: { name: 'Odwiedzone lokacje', scope: 'shared', speed: 'cold', merge: 'append', customSync: true },
    locationNotes: { name: 'Notatki lokacji', scope: 'shared', speed: 'hot', customSync: true },
    killCounts: { name: 'Licznik zabitych', scope: 'shared', speed: 'cold', merge: 'append', characterKey: 'kill_counter', customSync: true },
    improveCounts: { name: 'Licznik postepow', scope: 'shared', speed: 'hot', merge: 'perCharacter', characterKey: 'improve_counter_lifetime' },
    deposits: { name: 'Depozyty', scope: 'shared', speed: 'hot', merge: 'perCharacter', characterKey: 'deposits' },
    containers: { name: 'Pojemniki', scope: 'shared', speed: 'hot', merge: 'perCharacter', characterKey: 'containers' },
    peopleEdits: { name: 'Edycje bazy postaci', scope: 'shared', speed: 'hot', merge: 'perCharacter', characterKey: 'peopleLocalEvents' },
    knowledge: { name: 'Wiedza', scope: 'shared', speed: 'hot', merge: 'append', customSync: true },
    // Concern-scoped slices split out of uiSettings. Unlike uiSettings (device),
    // these are shared so terminal/map/behaviour prefs sync across devices.
    // Appended at the end to preserve historical category order (cloud payload
    // compatibility).
    shellSettings: { name: 'Ustawienia okna', scope: 'shared', speed: 'hot', globalKeys: ['shellSettings'] },
    renderSettings: { name: 'Wyglad tekstu', scope: 'shared', speed: 'hot', globalKeys: ['renderSettings'] },
    mapSettings: { name: 'Wyglad mapy', scope: 'shared', speed: 'hot', globalKeys: ['mapSettings'] },
    behaviorSettings: { name: 'Zachowanie interfejsu', scope: 'shared', speed: 'hot', globalKeys: ['behaviorSettings'] },
    automationGroups: { name: 'Grupy automatyzacji', scope: 'shared', speed: 'hot', globalKeys: ['automationGroups'] },
    automationScripts: { name: 'Skrypty automatyzacji', scope: 'shared', speed: 'hot', globalKeys: ['automationScripts'] },
} as const satisfies Record<string, CategoryDefinition>;

/**
 * Local data that goes into backups but never syncs: large or device-local
 * (session recordings) or planned for their own API later (plugin scripts).
 */
export const BACKUP_ONLY_REGISTRY = {
    scripts: { name: 'Skrypty', scope: 'shared', speed: 'hot', globalKeys: ['scripts', 'stored_scripts'] },
    recordings: { name: 'Nagrania', scope: 'shared', speed: 'cold', customSync: true },
} as const satisfies Record<string, CategoryDefinition>;

export type SyncCategory = keyof typeof CATEGORY_REGISTRY;
export type BackupOnlyCategory = keyof typeof BACKUP_ONLY_REGISTRY;
/** Everything a backup file carries: all synced categories plus the backup-only ones. */
export type BackupCategory = SyncCategory | BackupOnlyCategory;

// All sync categories as array (registry order)
export const SYNC_CATEGORIES = Object.keys(CATEGORY_REGISTRY) as SyncCategory[];

export const BACKUP_CATEGORIES: BackupCategory[] = [
    ...SYNC_CATEGORIES,
    ...(Object.keys(BACKUP_ONLY_REGISTRY) as BackupOnlyCategory[]),
];

export function getCategoryDefinition(category: BackupCategory): CategoryDefinition {
    return category in CATEGORY_REGISTRY
        ? CATEGORY_REGISTRY[category as SyncCategory]
        : BACKUP_ONLY_REGISTRY[category as BackupOnlyCategory];
}

// Category display names (Polish)
export const SYNC_CATEGORY_NAMES = Object.fromEntries(
    SYNC_CATEGORIES.map(cat => [cat, CATEGORY_REGISTRY[cat].name]),
) as Record<SyncCategory, string>;

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
