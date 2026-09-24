import {
    BACKUP_CATEGORIES,
    BACKUP_ONLY_REGISTRY,
    CATEGORY_REGISTRY,
    COLD_STORAGE_KEYS,
    COLD_SYNC_CATEGORIES,
    DEVICE_SCOPED_SYNC_CATEGORIES,
    SYNC_CATEGORIES,
    SYNC_CATEGORY_NAMES,
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
            'automationGroups',
            'automationScripts',
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

    it('derives the cold categories used by the debounce manager', () => {
        expect(new Set(COLD_SYNC_CATEGORIES)).toEqual(new Set(['killCounts', 'visitedRooms']));
    });

    it('derives the cold storage keys used by the debounce manager', () => {
        expect(new Set(COLD_STORAGE_KEYS)).toEqual(new Set(['kill_counter']));
    });

    it('derives the device-scoped categories', () => {
        expect(new Set(DEVICE_SCOPED_SYNC_CATEGORIES)).toEqual(new Set(['uiSettings', 'buttons']));
    });

    it('backs up every synced category plus the backup-only ones', () => {
        expect(BACKUP_CATEGORIES).toEqual([...SYNC_CATEGORIES, 'scripts', 'recordings']);
        for (const cat of Object.keys(BACKUP_ONLY_REGISTRY)) {
            expect(SYNC_CATEGORIES).not.toContain(cat);
        }
    });

    it('resolves definitions of backup-only categories', () => {
        expect(getCategoryDefinition('scripts').globalKeys).toEqual(['scripts', 'stored_scripts']);
        expect(getCategoryDefinition('recordings').customSync).toBe(true);
        expect(getCategoryDefinition('triggers')).toBe(CATEGORY_REGISTRY.triggers);
    });
});
