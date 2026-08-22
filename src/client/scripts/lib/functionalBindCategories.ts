/**
 * Categories for multi-functional binds.
 *
 * Each functional bind caller belongs to a category. When multiple categories
 * share the same key, only the highest-priority active bind fires. Lower-priority
 * binds are preserved and restored when higher-priority ones clear.
 *
 * When multiple categories share the same key, the most recently set
 * category fires. When it is cleared, earlier categories surface.
 */

export type FunctionalBindCategory = 'gates' | 'transport' | 'loot' | 'default';

export const FUNCTIONAL_BIND_CATEGORIES: FunctionalBindCategory[] = ['gates', 'transport', 'loot', 'default'];

/** Static priorities are no longer used for dispatch order.
 *  The FunctionalBindManager uses a dynamic "last set wins" approach instead. */

export const CATEGORY_LABELS: Record<FunctionalBindCategory, string> = {
    gates: 'Wrota',
    transport: 'Transport',
    loot: 'Zbieranie z cial',
    default: 'Domyślny',
};

/** Storage key suffixes for per-category bind overrides in BindSettings */
export const CATEGORY_BIND_KEYS: Record<FunctionalBindCategory, string> = {
    gates: 'mainGates',
    transport: 'mainTransport',
    loot: 'mainLoot',
    default: 'main',
};
