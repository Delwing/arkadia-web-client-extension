const downloadCategories = vi.fn();
const markSyncV2Started = vi.fn();
const exportCategories = vi.fn();
const importCategories = vi.fn();

vi.mock('@modules/firebase/firebaseUnifiedSync', () => ({
    downloadCategories: (...args: unknown[]) => downloadCategories(...args),
    markSyncV2Started: () => markSyncV2Started(),
}));
vi.mock('@web/options/exportUtils', () => ({
    collectCharacters: () => ['Alice'],
    exportCategories: (...args: unknown[]) => exportCategories(...args),
    importCategories: (...args: unknown[]) => importCategories(...args),
    mergePerCharacterEnvelopes: (preferred: string, other: string) => `merged(${preferred},${other})`,
}));

import { calculateChecksum } from '@modules/firebase/firebaseCrypto';
import { saveFirebaseSettings } from '@modules/firebase/firebaseTypes';
import { loadMigration, migrateFromV1, reconcileWithV1, V1_CATEGORY_OF_TYPE } from '@web/userData/migrateFromV1';
import { createUserDataTypes } from '@web/userData/registry';

async function cloud(entries: Record<string, string>) {
    const data: Record<string, string> = {};
    const payloads: Record<string, { checksum: string }> = {};
    for (const [category, value] of Object.entries(entries)) {
        data[category] = value;
        payloads[category] = { checksum: await calculateChecksum(value) };
    }
    return { success: true, data, payloads, errors: {} };
}

async function base(entries: Record<string, string>) {
    const checksums: Record<string, string> = {};
    for (const [category, value] of Object.entries(entries)) checksums[category] = await calculateChecksum(value);
    saveFirebaseSettings({ categorySyncChecksums: checksums });
}

describe('reconcileWithV1', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        importCategories.mockResolvedValue({ success: true, errors: {} });
        markSyncV2Started.mockResolvedValue(undefined);
    });

    it('takes the cloud on a fresh device, without conflicts', async () => {
        exportCategories.mockResolvedValue({ triggers: '[default]', aliases: '[default]' });
        downloadCategories.mockResolvedValue(await cloud({ triggers: '[real]', aliases: '[real]', shortcuts: '{s}' }));

        const edits = await reconcileWithV1(null);

        expect(edits).toEqual(new Set());
        expect(importCategories).toHaveBeenCalledWith({ triggers: '[real]', aliases: '[real]', shortcuts: '{s}' });
    });

    it('takes the cloud where local is unchanged since the last sync, keeps local edits otherwise', async () => {
        await base({ triggers: '[old]', aliases: '[old]', knowledge: '{old}', deposits: '{old}', binds: '{old}' });
        exportCategories.mockResolvedValue({
            triggers: '[old]',        // unchanged locally, cloud moved -> cloud wins
            aliases: '[edited]',      // only local changed -> edit
            knowledge: '{local}',     // both changed, append -> union + edit
            deposits: '{local}',      // both changed, per character -> merged + edit
            binds: '{local}',         // both changed, whole value -> local edit kept
            locationNotes: '[n]',     // never uploaded -> edit
        });
        downloadCategories.mockResolvedValue(await cloud({
            triggers: '[new]', aliases: '[old]', knowledge: '{cloud}', deposits: '{cloud}', binds: '{cloud}',
        }));

        const edits = await reconcileWithV1(null);

        expect([...edits].sort()).toEqual(['aliases', 'binds', 'deposits', 'knowledge', 'locationNotes']);
        expect(importCategories).toHaveBeenCalledWith({
            triggers: '[new]',
            knowledge: '{cloud}',
            deposits: 'merged({local},{cloud})',
        });
    });

    it('fails when the cloud or the import fails, so the migration waits', async () => {
        exportCategories.mockResolvedValue({});
        downloadCategories.mockResolvedValue({ success: false, data: {}, payloads: {}, errors: { triggers: 'offline' } });
        await expect(reconcileWithV1(null)).rejects.toThrow('offline');
    });
});

describe('migrateFromV1', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        importCategories.mockResolvedValue({ success: true, errors: {} });
        markSyncV2Started.mockResolvedValue(undefined);
    });

    it('turns categories with local edits into v2 types recorded as edits, once per user', async () => {
        exportCategories.mockResolvedValue({ aliases: '[mine]', knowledge: '{mine}' });
        downloadCategories.mockResolvedValue(await cloud({}));

        const editTypes = await migrateFromV1('user-1', null);

        expect([...editTypes!].sort()).toEqual(
            ['aliases', 'knowledgeBooks', 'knowledgeDetails', 'knowledgeLevels', 'knowledgeLibraries', 'knowledgeTicks'],
        );
        expect(loadMigration('user-1')?.editTypes).toHaveLength(6);
        expect(markSyncV2Started).toHaveBeenCalledTimes(1);

        await migrateFromV1('user-1', null);
        expect(downloadCategories).toHaveBeenCalledTimes(1);
    });

    it('returns null and remembers nothing when it can\'t run', async () => {
        exportCategories.mockResolvedValue({});
        downloadCategories.mockResolvedValue({ success: false, data: {}, payloads: {}, errors: { triggers: 'offline' } });
        expect(await migrateFromV1('user-1', null)).toBeNull();
        expect(loadMigration('user-1')).toBeNull();
    });

    it('maps only to known v2 types', () => {
        const ids = new Set(createUserDataTypes(() => 'dev').map(t => t.id));
        for (const type of Object.keys(V1_CATEGORY_OF_TYPE)) expect(ids.has(type)).toBe(true);
    });
});
