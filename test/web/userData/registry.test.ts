import { createUserDataTypes } from '@web/userData/registry';

describe('createUserDataTypes', () => {
    it('gives every synced type a unique id', () => {
        const ids = createUserDataTypes(() => 'dev').map(t => t.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('covers every data store listed in the plan', () => {
        const ids = new Set(createUserDataTypes(() => 'dev').map(t => t.id));
        for (const id of [
            'triggers', 'aliases', 'automationGroups', 'automationScripts', 'shortcuts', 'keymaps',
            'characterKeys', 'profession', 'deposits', 'containers', 'improveCounts', 'peopleEdits',
            'deviceInterface', 'deviceButtons', 'radial',
            'knowledgeLibraries', 'knowledgeBooks', 'knowledgeDetails', 'knowledgeTicks', 'knowledgeLevels',
            'kills', 'visitedRooms', 'locationNotes', 'multibinds',
            'tamingFeedings', 'tamingLevels', 'tamingFoodGroups', 'enemyResistances', 'zlom',
            'transportSegments', 'deliveries',
        ]) {
            expect(ids.has(id)).toBe(true);
        }
    });
});
