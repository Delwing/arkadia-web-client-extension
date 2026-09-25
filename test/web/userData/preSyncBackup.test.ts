const buildBackup = vi.fn();
vi.mock('@web/options/exportUtils', () => ({ buildBackup: () => buildBackup() }));

import { loadPreSyncBackup, PRE_SYNC_BACKUP_SAVED_EVENT, savePreSyncBackup } from '@web/userData/preSyncBackup';

const backup = (createdAt: string) => ({
    version: 2, createdAt, device: { sourceDevice: { id: 'd' } }, categories: { aliases: '[]' },
});

describe('preSyncBackup', () => {
    it('keeps the first backup: the state from before sync v2', async () => {
        expect(await loadPreSyncBackup()).toBeNull();
        const saved = vi.fn();
        window.addEventListener(PRE_SYNC_BACKUP_SAVED_EVENT, saved);

        buildBackup.mockResolvedValueOnce(backup('first'));
        await savePreSyncBackup();
        buildBackup.mockResolvedValueOnce(backup('second'));
        await savePreSyncBackup();

        expect((await loadPreSyncBackup())?.createdAt).toBe('first');
        expect(saved).toHaveBeenCalledTimes(1);
        expect(buildBackup).toHaveBeenCalledTimes(1);
    });
});
