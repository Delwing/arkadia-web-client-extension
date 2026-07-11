import {
    CATEGORY_GROUPS,
    CATEGORY_REGISTRY,
    COLD_STORAGE_KEYS,
    COLD_SYNC_CATEGORIES,
    DEFAULT_SYNC_OPTIONS,
    DEVICE_SCOPED_SYNC_CATEGORIES,
    SYNC_CATEGORIES,
    SYNC_CATEGORY_NAMES,
    getCategoriesByGroup,
    getCategoryDefinition,
    type CategoryDefinition,
    type SyncCategory,
} from '@modules/firebase/categoryRegistry';

describe('CATEGORY_REGISTRY', () => {
    it('keeps the historical category order (cloud payload compatibility)', () => {
        expect(SYNC_CATEGORIES).toEqual([
            'uiSettings',
            'binds',
            'shortcuts',
            'characterSettings',
            'triggers',
            'aliases',
            'multibinds',
            'buttons',
            'radial',
            'visitedRooms',
            'locationNotes',
            'killCounts',
            'improveCounts',
            'deposits',
            'containers',
            'peopleEdits',
            'knowledge',
            'shellSettings',
            'renderSettings',
            'mapSettings',
            'behaviorSettings',
        ]);
    });

    it('every category has a non-empty display name', () => {
        for (const cat of SYNC_CATEGORIES) {
            expect(SYNC_CATEGORY_NAMES[cat]).toBeTruthy();
        }
    });

    it('every category is either declarative (storage keys) or customSync', () => {
        for (const cat of SYNC_CATEGORIES) {
            const def = getCategoryDefinition(cat);
            const hasKeys = (def.globalKeys?.length ?? 0) > 0 || !!def.characterKey;
            expect(
                def.customSync || hasKeys,
                `${cat} must declare storage keys or be customSync`,
            ).toBe(true);
        }
    });

    it('no storage key is claimed by more than one category', () => {
        const seen = new Map<string, SyncCategory>();
        for (const cat of SYNC_CATEGORIES) {
            const def: CategoryDefinition = CATEGORY_REGISTRY[cat];
            const keys = [
                ...(def.globalKeys ?? []),
                ...(def.characterKey ? [`character:${def.characterKey}`] : []),
            ];
            for (const key of keys) {
                expect(
                    seen.has(key),
                    `storage key "${key}" is claimed by both "${seen.get(key)}" and "${cat}"`,
                ).toBe(false);
                seen.set(key, cat);
            }
        }
    });

    it('all categories sync by default', () => {
        for (const cat of SYNC_CATEGORIES) {
            expect(DEFAULT_SYNC_OPTIONS[cat]).toBe(true);
        }
    });

    it('derives the cold categories used by the debounce manager', () => {
        expect(new Set(COLD_SYNC_CATEGORIES)).toEqual(new Set(['killCounts', 'visitedRooms']));
    });

    it('derives the cold storage keys used by the debounce manager', () => {
        expect(new Set(COLD_STORAGE_KEYS)).toEqual(new Set(['kill_counter']));
    });

    it('derives the device-scoped categories', () => {
        expect(new Set(DEVICE_SCOPED_SYNC_CATEGORIES)).toEqual(new Set(['uiSettings', 'buttons']));
    });

    it('assigns every category to exactly one declared UI group', () => {
        const groupIds = new Set(CATEGORY_GROUPS.map(g => g.id));
        for (const cat of SYNC_CATEGORIES) {
            expect(groupIds.has(getCategoryDefinition(cat).group)).toBe(true);
        }
    });

    it('every UI group covers a disjoint, complete partition of categories', () => {
        const seen = new Set<SyncCategory>();
        for (const group of CATEGORY_GROUPS) {
            for (const cat of getCategoriesByGroup(group.id)) {
                expect(seen.has(cat)).toBe(false);
                seen.add(cat);
            }
        }
        expect(seen).toEqual(new Set(SYNC_CATEGORIES));
    });
});
