// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://arkadia.example/"}

import { vi } from 'vitest';
import type { SyncRunResult } from '@modules/firebase/syncEngine';

vi.mock('@modules/firebase/firebaseUnifiedSync', () => ({
    checkCategoriesConflicts: vi.fn(),
    uploadCategories: vi.fn(),
    downloadCategories: vi.fn(),
}));

vi.mock('@modules/firebase/firebaseSyncListener', () => ({
    syncListener: {
        notifyLocalUpload: vi.fn(),
        setPassphrase: vi.fn(),
    },
}));

vi.mock('@web/options/exportUtils', () => ({
    collectCharacters: vi.fn(() => ['Alice']),
    exportCategories: vi.fn(),
    mergeCloudProfessionData: vi.fn(),
}));

import { syncEngine } from '@modules/firebase/syncEngine';
import { checkCategoriesConflicts, downloadCategories, uploadCategories } from '@modules/firebase/firebaseUnifiedSync';
import { syncListener } from '@modules/firebase/firebaseSyncListener';
import { exportCategories } from '@web/options/exportUtils';
import { saveFirebaseSettings, FIREBASE_SETTINGS_KEY } from '@modules/firebase/firebaseTypes';
import { globalStorage } from '@modules/core/storage';
import eventBus from '@modules/core/eventBus';

const HOT_SYNC_MS = 30 * 1000;

const mockedExport = exportCategories as jest.Mock;
const mockedConflicts = checkCategoriesConflicts as jest.Mock;
const mockedUpload = uploadCategories as jest.Mock;
const mockedDownload = downloadCategories as jest.Mock;

function givenCleanUploadPath(data: Record<string, string> = { triggers: '{"triggers":"[]"}' }) {
    mockedExport.mockResolvedValue(data);
    mockedConflicts.mockResolvedValue({ conflicts: [], errors: {} });
    mockedDownload.mockResolvedValue({ success: true, data: {}, payloads: {}, errors: {} });
    mockedUpload.mockResolvedValue({
        success: true,
        errors: {},
        timestamps: { triggers: 123 },
        checksums: { triggers: 'abc' },
    });
}

/** Flush pending microtasks so async work triggered by timers settles. */
async function flushAsync() {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

describe('FirebaseSyncEngine', () => {
    let eventUnsubs: Array<() => void>;

    beforeEach(() => {
        jest.useFakeTimers();
        localStorage.clear();
        sessionStorage.clear();
        syncEngine.stop();
        syncEngine.setPassphrase(null);
        jest.clearAllMocks();
        eventUnsubs = [];
        saveFirebaseSettings({ autoSyncEnabled: true, encryptionEnabled: false });
    });

    afterEach(() => {
        syncEngine.stop();
        eventUnsubs.forEach(unsub => unsub());
        jest.useRealTimers();
    });

    function onEvent<T>(event: string): T[] {
        const received: T[] = [];
        eventUnsubs.push(eventBus.on(event as never, (payload: T) => { received.push(payload); }) as () => void);
        return received;
    }

    describe('auto-sync via storage changes', () => {
        it('uploads after the hot debounce when a watched key changes', async () => {
            givenCleanUploadPath();
            syncEngine.start();

            globalStorage.set('triggers' as never, [] as never);

            expect(mockedUpload).not.toHaveBeenCalled();
            await jest.advanceTimersByTimeAsync(HOT_SYNC_MS);
            await flushAsync();

            expect(mockedUpload).toHaveBeenCalledTimes(1);
            expect(syncListener.notifyLocalUpload).toHaveBeenCalledWith({ triggers: 'abc' });
        });

        it('emits pending=true on change and pending=false when the sync fires', async () => {
            givenCleanUploadPath();
            const pendingEvents = onEvent<{ pending: boolean }>('firebase.autosync.pending');
            syncEngine.start();

            globalStorage.set('triggers' as never, [] as never);
            expect(pendingEvents).toEqual([{ pending: true }]);

            await jest.advanceTimersByTimeAsync(HOT_SYNC_MS);
            await flushAsync();
            expect(pendingEvents).toEqual([{ pending: true }, { pending: false }]);
        });

        it('emits firebase.sync.uploaded with auto=true after a debounced upload', async () => {
            givenCleanUploadPath();
            const uploadedEvents = onEvent<{ categories: string[]; auto: boolean }>('firebase.sync.uploaded');
            syncEngine.start();

            globalStorage.set('triggers' as never, [] as never);
            await jest.advanceTimersByTimeAsync(HOT_SYNC_MS);
            await flushAsync();

            expect(uploadedEvents).toHaveLength(1);
            expect(uploadedEvents[0]).toMatchObject({ categories: ['triggers'], auto: true });
        });

        it('does not schedule a sync when auto-sync is disabled', async () => {
            givenCleanUploadPath();
            saveFirebaseSettings({ autoSyncEnabled: false });
            syncEngine.start();

            globalStorage.set('triggers' as never, [] as never);
            await jest.advanceTimersByTimeAsync(HOT_SYNC_MS);
            await flushAsync();

            expect(mockedUpload).not.toHaveBeenCalled();
        });

        it('does not schedule a sync when encryption is on without a passphrase', async () => {
            givenCleanUploadPath();
            saveFirebaseSettings({ encryptionEnabled: true });
            syncEngine.start();

            globalStorage.set('triggers' as never, [] as never);
            await jest.advanceTimersByTimeAsync(HOT_SYNC_MS);
            await flushAsync();

            expect(mockedUpload).not.toHaveBeenCalled();
        });

        it('syncs with encryption when a passphrase is set', async () => {
            givenCleanUploadPath();
            saveFirebaseSettings({ encryptionEnabled: true });
            syncEngine.start();
            syncEngine.setPassphrase('secret');

            globalStorage.set('triggers' as never, [] as never);
            await jest.advanceTimersByTimeAsync(HOT_SYNC_MS);
            await flushAsync();

            expect(mockedUpload).toHaveBeenCalledWith(
                expect.anything(),
                { encrypted: true, passphrase: 'secret' },
            );
        });

        it('ignores firebase metadata keys (no sync loop between windows)', async () => {
            givenCleanUploadPath();
            syncEngine.start();

            // saveFirebaseSettings writes the settings key directly; simulate the
            // cross-tab notification for it instead.
            globalStorage.fireListeners(FIREBASE_SETTINGS_KEY as never, '{}' as never, undefined);
            await jest.advanceTimersByTimeAsync(HOT_SYNC_MS);
            await flushAsync();

            expect(mockedUpload).not.toHaveBeenCalled();
        });

        it('stops watching after stop()', async () => {
            givenCleanUploadPath();
            syncEngine.start();
            syncEngine.stop();

            globalStorage.set('triggers' as never, [] as never);
            await jest.advanceTimersByTimeAsync(HOT_SYNC_MS);
            await flushAsync();

            expect(mockedUpload).not.toHaveBeenCalled();
        });

        it('cancels a pending sync when settings change disables auto-sync', async () => {
            givenCleanUploadPath();
            syncEngine.start();

            globalStorage.set('triggers' as never, [] as never);
            saveFirebaseSettings({ autoSyncEnabled: false });
            syncEngine.settingsChanged();

            await jest.advanceTimersByTimeAsync(HOT_SYNC_MS);
            await flushAsync();

            expect(mockedUpload).not.toHaveBeenCalled();
        });
    });

    describe('syncNow', () => {
        it('returns uploaded with the synced categories on success', async () => {
            givenCleanUploadPath({ triggers: 'data', aliases: 'data' });

            const result = await syncEngine.syncNow(false);

            expect(result).toEqual({
                status: 'uploaded',
                categories: ['triggers', 'aliases'],
                timestamps: { triggers: 123 },
            });
        });

        it('skips when encryption is enabled without a passphrase', async () => {
            saveFirebaseSettings({ encryptionEnabled: true });

            const result = await syncEngine.syncNow(false);

            expect(result).toEqual({ status: 'skipped', reason: 'needs-passphrase' });
            expect(mockedExport).not.toHaveBeenCalled();
        });

        it('skips when no categories are enabled', async () => {
            const allOff = Object.fromEntries(
                Object.keys(JSON.parse(localStorage.getItem(FIREBASE_SETTINGS_KEY)!).syncOptions)
                    .map(cat => [cat, false]),
            );
            saveFirebaseSettings({ syncOptions: allOff as never });

            const result = await syncEngine.syncNow(false);

            expect(result).toEqual({ status: 'skipped', reason: 'no-categories' });
        });

        it('skips when there is nothing to export', async () => {
            givenCleanUploadPath({});

            const result = await syncEngine.syncNow(false);

            expect(result).toEqual({ status: 'skipped', reason: 'no-data' });
            expect(mockedUpload).not.toHaveBeenCalled();
        });

        it('emits firebase.sync.conflict and does not upload on conflicts', async () => {
            givenCleanUploadPath();
            const conflict = { category: 'triggers', localTimestamp: 1, cloudTimestamp: 2 };
            mockedConflicts.mockResolvedValue({ conflicts: [conflict], errors: {} });
            const conflictEvents = onEvent<{ conflicts: unknown[] }>('firebase.sync.conflict');

            const result = await syncEngine.syncNow(false);

            expect(result).toEqual({ status: 'conflict' });
            expect(conflictEvents).toEqual([{ conflicts: [conflict] }]);
            expect(mockedUpload).not.toHaveBeenCalled();
        });

        it('emits firebase.sync.error and returns error when upload fails', async () => {
            givenCleanUploadPath();
            mockedUpload.mockResolvedValue({ success: false, errors: { triggers: 'boom' }, timestamps: {}, checksums: {} });
            const errorEvents = onEvent<{ message: string }>('firebase.sync.error');

            const result = await syncEngine.syncNow(false);

            expect(result).toEqual({ status: 'error', error: 'boom' });
            expect(errorEvents).toEqual([{ message: 'boom' }]);
        });

        it('serializes concurrent runs (second call is busy)', async () => {
            givenCleanUploadPath();
            let resolveUpload!: (v: unknown) => void;
            mockedUpload.mockReturnValue(new Promise(resolve => { resolveUpload = resolve; }));

            const first = syncEngine.syncNow(false);
            await flushAsync();
            const second = await syncEngine.syncNow(false);
            expect(second).toEqual({ status: 'skipped', reason: 'busy' });

            resolveUpload({ success: true, errors: {}, timestamps: {}, checksums: {} });
            const firstResult: SyncRunResult = await first;
            expect(firstResult.status).toBe('uploaded');
        });
    });

    describe('passphrase handling', () => {
        it('persists the passphrase to sessionStorage and forwards it to the listener', () => {
            saveFirebaseSettings({ encryptionEnabled: true });
            syncEngine.setPassphrase('secret');

            expect(sessionStorage.getItem('arkadia.firebasePassphrase')).toBe('secret');
            expect(syncListener.setPassphrase).toHaveBeenLastCalledWith('secret');
        });

        it('forwards null to the listener when encryption is disabled', () => {
            saveFirebaseSettings({ encryptionEnabled: false });
            syncEngine.setPassphrase('secret');

            expect(syncListener.setPassphrase).toHaveBeenLastCalledWith(null);
        });

        it('clears the passphrase on stop()', () => {
            syncEngine.start();
            syncEngine.setPassphrase('secret');

            syncEngine.stop();

            expect(syncEngine.getPassphrase()).toBeNull();
            expect(sessionStorage.getItem('arkadia.firebasePassphrase')).toBeNull();
        });
    });
});
