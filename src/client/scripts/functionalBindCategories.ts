/**
 * Categories for multi-functional binds.
 *
 * Each functional bind caller belongs to a category. When multiple categories
 * share the same key, only the highest-priority active bind fires. Lower-priority
 * binds are preserved and restored when higher-priority ones clear.
 *
 * Priority order (highest first): default > transport > gates
 */

export type FunctionalBindCategory = 'gates' | 'transport' | 'default';

export const FUNCTIONAL_BIND_CATEGORIES: FunctionalBindCategory[] = ['gates', 'transport', 'default'];

export const CATEGORY_PRIORITIES: Record<FunctionalBindCategory, number> = {
    gates: 0,
    transport: 1,
    default: 2,
};

export const CATEGORY_LABELS: Record<FunctionalBindCategory, string> = {
    gates: 'Wrota',
    transport: 'Transport',
    default: 'Domyślny',
};

/** Storage key suffixes for per-category bind overrides in BindSettings */
export const CATEGORY_BIND_KEYS: Record<FunctionalBindCategory, string> = {
    gates: 'mainGates',
    transport: 'mainTransport',
    default: 'main',
};
