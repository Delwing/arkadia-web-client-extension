const buildBackup = vi.fn();
vi.mock('@web/options/exportUtils', () => ({ buildBackup: () => buildBackup() }));

import { loadPreSyncBackup, savePreSyncBackup } from '@web/userData/preSyncBackup';

const backup = (createdAt: string) => ({
    version: 2, createdAt, device: { sourceDevice: { id: 'd' } }, categories: { aliases: '[]' },
});

describe('preSyncBackup', () => {
    it('keeps the first backup: the state from before sync v2', async () => {
        expect(await loadPreSyncBackup()).toBeNull();

        buildBackup.mockResolvedValueOnce(backup('first'));
        await savePreSyncBackup();
        buildBackup.mockResolvedValueOnce(backup('second'));
        await savePreSyncBackup();

        expect((await loadPreSyncBackup())?.createdAt).toBe('first');
        expect(buildBackup).toHaveBeenCalledTimes(1);
    });
});
