const syncNow = vi.fn();
const downloadCategories = vi.fn();
const markSyncV2Started = vi.fn();
const exportCategories = vi.fn();

vi.mock('@modules/firebase/syncEngine', () => ({ syncEngine: { syncNow: (...args: unknown[]) => syncNow(...args) } }));
vi.mock('@modules/firebase/firebaseUnifiedSync', () => ({
    downloadCategories: (...args: unknown[]) => downloadCategories(...args),
    markSyncV2Started: () => markSyncV2Started(),
}));
vi.mock('@web/options/exportUtils', () => ({
    collectCharacters: () => ['Alice'],
    exportCategories: (...args: unknown[]) => exportCategories(...args),
}));

import { calculateChecksum } from '@modules/firebase/firebaseCrypto';
import { loadMigration, migrateFromV1, V1_CATEGORY_OF_TYPE } from '@web/userData/migrateFromV1';
import { createUserDataTypes } from '@web/userData/registry';

describe('migrateFromV1', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        syncNow.mockResolvedValue({ status: 'in-sync' });
        markSyncV2Started.mockResolvedValue(undefined);
    });

    it('records the first capture as edits only for categories that still differ from the v1 cloud', async () => {
        exportCategories.mockResolvedValue({ triggers: '[1]', aliases: '[2]', knowledge: '{"k":1}' });
        downloadCategories.mockResolvedValue({
            success: true,
            data: {},
            errors: {},
            payloads: {
                triggers: { checksum: await calculateChecksum('[1]') },     // in sync
                aliases: { checksum: await calculateChecksum('[old]') },  // differs
                // knowledge was never uploaded
            },
        });

        const editTypes = await migrateFromV1('user-1', null);

        expect(syncNow).toHaveBeenCalledTimes(1);
        expect([...editTypes!].sort()).toEqual(
            ['aliases', 'knowledgeBooks', 'knowledgeDetails', 'knowledgeLevels', 'knowledgeLibraries', 'knowledgeTicks'],
        );
        expect(loadMigration('user-1')?.editTypes).toHaveLength(6);
        expect(markSyncV2Started).toHaveBeenCalled();
    });

    it('runs once per user', async () => {
        exportCategories.mockResolvedValue({});
        downloadCategories.mockResolvedValue({ success: true, data: {}, errors: {}, payloads: {} });
        await migrateFromV1('user-1', null);
        await migrateFromV1('user-1', null);
        expect(syncNow).toHaveBeenCalledTimes(1);
    });

    it('waits when the v1 sync or the cloud can\'t be read', async () => {
        syncNow.mockResolvedValue({ status: 'skipped', reason: 'needs-passphrase' });
        expect(await migrateFromV1('user-1', null)).toBeNull();

        syncNow.mockResolvedValue({ status: 'in-sync' });
        exportCategories.mockResolvedValue({ triggers: '[1]' });
        downloadCategories.mockResolvedValue({ success: false, data: {}, errors: { triggers: 'offline' }, payloads: {} });
        expect(await migrateFromV1('user-1', null)).toBeNull();
        expect(loadMigration('user-1')).toBeNull();
    });

    it('maps only to known v2 types', () => {
        const ids = new Set(createUserDataTypes(() => 'dev').map(t => t.id));
        for (const type of Object.keys(V1_CATEGORY_OF_TYPE)) expect(ids.has(type)).toBe(true);
    });
});
