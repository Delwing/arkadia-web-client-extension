// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://arkadia.example/"}

import { vi } from 'vitest';
import type { SyncRunResult } from '@modules/firebase/syncEngine';
import type { SyncPlan } from '@modules/firebase/firebaseUnifiedSync';

vi.mock('@modules/firebase/firebaseUnifiedSync', () => ({
    planSync: vi.fn(),
    uploadCategories: vi.fn(),
    downloadCategories: vi.fn(),
    recordCategorySyncState: vi.fn(),
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
    importCategories: vi.fn(() => Promise.resolve({ success: true, errors: {} })),
    mergeCloudProfessionData: vi.fn(),
    mergePerCharacterEnvelopes: vi.fn((preferred: string) => preferred),
}));

import { syncEngine } from '@modules/firebase/syncEngine';
import { planSync, downloadCategories, recordCategorySyncState, uploadCategories } from '@modules/firebase/firebaseUnifiedSync';
import { syncListener } from '@modules/firebase/firebaseSyncListener';
import { exportCategories, importCategories, mergePerCharacterEnvelopes } from '@web/options/exportUtils';
import { saveFirebaseSettings, FIREBASE_SETTINGS_KEY } from '@modules/firebase/firebaseTypes';
import { globalStorage } from '@modules/core/storage';
import eventBus from '@modules/core/eventBus';

const HOT_SYNC_MS = 30 * 1000;

const mockedExport = exportCategories as jest.Mock;
const mockedImport = importCategories as jest.Mock;
const mockedPlan = planSync as jest.Mock;
const mockedUpload = uploadCategories as jest.Mock;
const mockedDownload = downloadCategories as jest.Mock;
const mockedRecordState = recordCategorySyncState as jest.Mock;
const mockedMergeEnvelopes = mergePerCharacterEnvelopes as jest.Mock;

function emptyPlan(overrides: Partial<SyncPlan> = {}): SyncPlan {
    return {
        uploads: [],
        applies: {},
        conflicts: [],
        pendingPassphrase: [],
        inSync: {},
        errors: {},
        ...overrides,
    };
}

function givenCleanUploadPath(data: Record<string, string> = { triggers: '{"triggers":"[]"}' }) {
    mockedExport.mockResolvedValue(data);
    // Default plan: everything exported is a local-only change → upload
    mockedPlan.mockImplementation(async (categoryData: Record<string, string>) =>
        emptyPlan({ uploads: Object.keys(categoryData) as never }));
    mockedDownload.mockResolvedValue({ success: true, data: {}, payloads: {}, errors: {} });
    mockedImport.mockResolvedValue({ success: true, errors: {} });
    mockedUpload.mockResolvedValue({
        success: true,
        errors: {},
        timestamps: { triggers: 123 },
        checksums: { triggers: 'abc' },
        conflicts: [],
    });
}

/** Flush pending microtasks so async work triggered by timers settles. */
async function flushAsync() {
    for (let i = 0; i < 50; i++) {
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
        syncEngine.clearPendingConflicts();
        syncEngine.setConflictUiActive(false);
        jest.clearAllMocks();
        eventUnsubs = [];
        saveFirebaseSettings({ autoSyncEnabled: true, encryptionEnabled: false });
    });

    afterEach(() => {
        syncEngine.stop();
        syncEngine.clearPendingConflicts();
        eventUnsubs.forEach(unsub => unsub());
        jest.useRealTimers();
    });

    function onEvent<T>(event: string): T[] {
        const received: T[] = [];
        eventUnsubs.push(eventBus.on(event as never, (payload: T) => { received.push(payload); }) as () => void);
        return received;
    }

    describe('startup reconcile', () => {
        it('syncs once at start() so pending/offline changes propagate', async () => {
            givenCleanUploadPath();
            syncEngine.start();
            await flushAsync();

            expect(mockedUpload).toHaveBeenCalledTimes(1);
        });

        it('does not sync at start() when auto-sync is disabled', async () => {
            givenCleanUploadPath();
            saveFirebaseSettings({ autoSyncEnabled: false });
            syncEngine.start();
            await flushAsync();

            expect(mockedUpload).not.toHaveBeenCalled();
        });
    });

    describe('auto-sync via storage changes', () => {
        it('uploads after the hot debounce when a watched key changes', async () => {
            givenCleanUploadPath();
            syncEngine.start();
            await flushAsync();
            expect(mockedUpload).toHaveBeenCalledTimes(1); // startup reconcile

            globalStorage.set('triggers' as never, [] as never);

            expect(mockedUpload).toHaveBeenCalledTimes(1);
            await jest.advanceTimersByTimeAsync(HOT_SYNC_MS);
            await flushAsync();

            expect(mockedUpload).toHaveBeenCalledTimes(2);
            expect(syncListener.notifyLocalUpload).toHaveBeenCalledWith({ triggers: 'abc' });
        });

        it('emits pending=true on change and pending=false when the sync fires', async () => {
            givenCleanUploadPath();
            syncEngine.start();
            await flushAsync();
            const pendingEvents = onEvent<{ pending: boolean }>('firebase.autosync.pending');

            globalStorage.set('triggers' as never, [] as never);
            expect(pendingEvents).toEqual([{ pending: true }]);

            await jest.advanceTimersByTimeAsync(HOT_SYNC_MS);
            await flushAsync();
            expect(pendingEvents).toEqual([{ pending: true }, { pending: false }]);
        });

        it('emits firebase.sync.uploaded with auto=true after a debounced upload', async () => {
            givenCleanUploadPath();
            syncEngine.start();
            await flushAsync();
            const uploadedEvents = onEvent<{ categories: string[]; auto: boolean }>('firebase.sync.uploaded');

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
            await flushAsync();

            globalStorage.set('triggers' as never, [] as never);
            await jest.advanceTimersByTimeAsync(HOT_SYNC_MS);
            await flushAsync();

            expect(mockedUpload).not.toHaveBeenCalled();
        });

        it('does not schedule a sync when encryption is on without a passphrase', async () => {
            givenCleanUploadPath();
            saveFirebaseSettings({ encryptionEnabled: true });
            syncEngine.start();
            await flushAsync();

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
            await flushAsync();

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
            await flushAsync();
            mockedUpload.mockClear();

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
            await flushAsync();
            syncEngine.stop();
            mockedUpload.mockClear();

            globalStorage.set('triggers' as never, [] as never);
            await jest.advanceTimersByTimeAsync(HOT_SYNC_MS);
            await flushAsync();

            expect(mockedUpload).not.toHaveBeenCalled();
        });

        it('cancels a pending sync when settings change disables auto-sync', async () => {
            givenCleanUploadPath();
            syncEngine.start();
            await flushAsync();
            mockedUpload.mockClear();

            globalStorage.set('triggers' as never, [] as never);
            saveFirebaseSettings({ autoSyncEnabled: false });
            syncEngine.settingsChanged();

            await jest.advanceTimersByTimeAsync(HOT_SYNC_MS);
            await flushAsync();

            expect(mockedUpload).not.toHaveBeenCalled();
        });
    });

    describe('immediate sync when auto-sync is switched on', () => {
        it('reconciles with the cloud right away (no debounce wait)', async () => {
            givenCleanUploadPath();
            saveFirebaseSettings({ autoSyncEnabled: false });
            syncEngine.start();
            await flushAsync();
            expect(mockedUpload).not.toHaveBeenCalled();

            saveFirebaseSettings({ autoSyncEnabled: true });
            syncEngine.settingsChanged();
            await jest.advanceTimersByTimeAsync(0);
            await flushAsync();

            expect(mockedUpload).toHaveBeenCalledTimes(1);
        });

        it('surfaces conflicts on enable instead of uploading', async () => {
            givenCleanUploadPath();
            const conflict = { category: 'triggers', localTimestamp: 1, cloudTimestamp: 2 };
            mockedPlan.mockResolvedValue(emptyPlan({ conflicts: [conflict as never] }));
            const conflictEvents = onEvent<{ conflicts: unknown[] }>('firebase.sync.conflict');

            saveFirebaseSettings({ autoSyncEnabled: false });
            syncEngine.start();
            saveFirebaseSettings({ autoSyncEnabled: true });
            syncEngine.settingsChanged();
            await jest.advanceTimersByTimeAsync(0);
            await flushAsync();

            expect(conflictEvents).toHaveLength(1);
            expect(mockedUpload).not.toHaveBeenCalled();
        });

        it('does not re-sync when settings change but auto-sync was already on', async () => {
            givenCleanUploadPath();
            syncEngine.start(); // beforeEach enabled auto-sync → startup reconcile runs
            await flushAsync();
            expect(mockedUpload).toHaveBeenCalledTimes(1);

            syncEngine.settingsChanged();
            await flushAsync();
            expect(mockedUpload).toHaveBeenCalledTimes(1);
        });

        it('does not run an immediate sync if the engine is not watching', async () => {
            givenCleanUploadPath();
            saveFirebaseSettings({ autoSyncEnabled: false });
            // no start() — engine not watching (e.g. logged out / localhost)
            saveFirebaseSettings({ autoSyncEnabled: true });
            syncEngine.settingsChanged();
            await jest.advanceTimersByTimeAsync(0);
            await flushAsync();

            expect(mockedUpload).not.toHaveBeenCalled();
        });
    });

    describe('syncNow', () => {
        it('returns uploaded with the synced categories on success', async () => {
            givenCleanUploadPath({ triggers: 'data', aliases: 'data' });
            mockedUpload.mockResolvedValue({
                success: true,
                errors: {},
                timestamps: { triggers: 123, aliases: 123 },
                checksums: { triggers: 'abc', aliases: 'def' },
                conflicts: [],
            });

            const result = await syncEngine.syncNow(false);

            expect(result).toEqual({
                status: 'uploaded',
                categories: ['triggers', 'aliases'],
                applied: [],
                timestamps: { triggers: 123, aliases: 123 },
            });
        });

        it('applies cloud-side changes and records the new sync base', async () => {
            givenCleanUploadPath({ triggers: 'local-data' });
            mockedPlan.mockResolvedValue(emptyPlan({
                applies: { triggers: { data: 'cloud-data', checksum: 'cloud-sum', syncedAt: '2026-01-01' } } as never,
            }));
            const appliedEvents = onEvent<{ categories: string[] }>('firebase.sync.applied');

            const result = await syncEngine.syncNow(false);

            expect(mockedImport).toHaveBeenCalledWith({ triggers: 'cloud-data' });
            expect(mockedRecordState).toHaveBeenCalledWith({ triggers: 'cloud-sum' });
            expect(appliedEvents).toEqual([{ categories: ['triggers'] }]);
            expect(result).toEqual({
                status: 'uploaded',
                categories: [],
                applied: ['triggers'],
                timestamps: {},
            });
            expect(mockedUpload).not.toHaveBeenCalled();
        });

        it('returns in-sync when nothing changed on either side', async () => {
            givenCleanUploadPath({ triggers: 'data' });
            mockedPlan.mockResolvedValue(emptyPlan({ inSync: { triggers: 'sum' } as never }));

            const result = await syncEngine.syncNow(false);

            expect(result).toEqual({ status: 'in-sync' });
            expect(mockedRecordState).toHaveBeenCalledWith({ triggers: 'sum' });
            expect(mockedUpload).not.toHaveBeenCalled();
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

        it('skips when there is nothing to export and nothing in the cloud', async () => {
            givenCleanUploadPath({});

            const result = await syncEngine.syncNow(false);

            expect(result).toEqual({ status: 'skipped', reason: 'no-data' });
            expect(mockedUpload).not.toHaveBeenCalled();
        });

        it('emits firebase.sync.conflict and does not upload on conflicts', async () => {
            givenCleanUploadPath();
            const conflict = { category: 'triggers', localTimestamp: 1, cloudTimestamp: 2 };
            mockedPlan.mockResolvedValue(emptyPlan({ conflicts: [conflict as never] }));
            const conflictEvents = onEvent<{ conflicts: unknown[] }>('firebase.sync.conflict');

            const result = await syncEngine.syncNow(false);

            expect(result).toEqual({ status: 'conflict' });
            expect(conflictEvents).toEqual([{ conflicts: [conflict] }]);
            expect(mockedUpload).not.toHaveBeenCalled();
        });

        it('reports conflicts detected by the upload transaction', async () => {
            givenCleanUploadPath();
            const conflict = { category: 'triggers', localTimestamp: 1, cloudTimestamp: 2 };
            mockedUpload.mockResolvedValue({
                success: true,
                errors: {},
                timestamps: {},
                checksums: {},
                conflicts: [conflict],
            });
            const conflictEvents = onEvent<{ conflicts: unknown[] }>('firebase.sync.conflict');

            const result = await syncEngine.syncNow(false);

            expect(result).toEqual({ status: 'conflict' });
            expect(conflictEvents).toEqual([{ conflicts: [conflict] }]);
        });

        it('emits firebase.sync.error and returns error when upload fails', async () => {
            givenCleanUploadPath();
            mockedUpload.mockResolvedValue({ success: false, errors: { triggers: 'boom' }, timestamps: {}, checksums: {}, conflicts: [] });
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

            resolveUpload({ success: true, errors: {}, timestamps: {}, checksums: {}, conflicts: [] });
            const firstResult: SyncRunResult = await first;
            expect(firstResult.status).toBe('in-sync');
        });
    });

    describe('pending conflicts', () => {
        it('keeps conflicts emitted on the bus until resolved', () => {
            const conflict = { category: 'triggers', localTimestamp: 1, cloudTimestamp: 2 } as never;
            eventBus.emit('firebase.sync.conflict', { conflicts: [conflict] });

            expect(syncEngine.getPendingConflicts()).toEqual([conflict]);

            syncEngine.clearPendingConflicts(['triggers']);
            expect(syncEngine.getPendingConflicts()).toEqual([]);
        });

        it('announces new conflicts with a notify toast when no conflict UI is mounted', () => {
            const notifications = onEvent<{ text: string }>('notify');
            const conflict = { category: 'triggers', localTimestamp: 1, cloudTimestamp: 2 } as never;

            eventBus.emit('firebase.sync.conflict', { conflicts: [conflict] });
            expect(notifications).toHaveLength(1);

            // Re-detection of the same category does not toast again
            eventBus.emit('firebase.sync.conflict', { conflicts: [conflict] });
            expect(notifications).toHaveLength(1);
        });

        it('suppresses the toast while the conflict UI is active', () => {
            const notifications = onEvent<{ text: string }>('notify');
            syncEngine.setConflictUiActive(true);

            eventBus.emit('firebase.sync.conflict', {
                conflicts: [{ category: 'triggers', localTimestamp: 1, cloudTimestamp: 2 } as never],
            });

            expect(notifications).toHaveLength(0);
        });
    });

    describe('resolveConflicts', () => {
        beforeEach(() => {
            givenCleanUploadPath();
        });

        it('cancel clears pending conflicts and touches nothing', async () => {
            eventBus.emit('firebase.sync.conflict', {
                conflicts: [{ category: 'triggers', localTimestamp: 1, cloudTimestamp: 2 } as never],
            });

            const result = await syncEngine.resolveConflicts('cancel', ['triggers']);

            expect(result.success).toBe(true);
            expect(syncEngine.getPendingConflicts()).toEqual([]);
            expect(mockedUpload).not.toHaveBeenCalled();
            expect(mockedImport).not.toHaveBeenCalled();
        });

        it('keep-local force-uploads whole-value categories without importing', async () => {
            mockedExport.mockResolvedValue({ triggers: 'local-data' });

            const result = await syncEngine.resolveConflicts('keep-local', ['triggers']);

            expect(result.success).toBe(true);
            expect(mockedImport).not.toHaveBeenCalled();
            expect(mockedUpload).toHaveBeenCalledWith(
                { triggers: 'local-data' },
                expect.objectContaining({ force: true }),
            );
        });

        it('use-cloud imports whole-value categories and records the cloud base', async () => {
            mockedDownload.mockResolvedValue({
                success: true,
                data: { triggers: 'cloud-data' },
                payloads: { triggers: { checksum: 'cloud-sum', deviceId: 'other', syncedAt: 'x', encrypted: false } },
                errors: {},
            });

            const result = await syncEngine.resolveConflicts('use-cloud', ['triggers']);

            expect(result.success).toBe(true);
            expect(mockedImport).toHaveBeenCalledWith({ triggers: 'cloud-data' });
            expect(mockedUpload).not.toHaveBeenCalled();
            expect(mockedRecordState).toHaveBeenCalledWith({ triggers: 'cloud-sum' });
        });

        it('merges per-character categories so both sides keep exclusive characters', async () => {
            mockedDownload.mockResolvedValue({
                success: true,
                data: { deposits: '{"Bob":"cloud"}' },
                payloads: { deposits: { checksum: 'c', deviceId: 'other', syncedAt: 'x', encrypted: false } },
                errors: {},
            });
            mockedExport.mockResolvedValue({ deposits: '{"Alice":"local"}' });
            mockedMergeEnvelopes.mockReturnValue('{"Alice":"local","Bob":"cloud"}');

            const result = await syncEngine.resolveConflicts('keep-local', ['deposits']);

            expect(result.success).toBe(true);
            // Local preferred on keep-local
            expect(mockedMergeEnvelopes).toHaveBeenCalledWith('{"Alice":"local"}', '{"Bob":"cloud"}');
            expect(mockedImport).toHaveBeenCalledWith({ deposits: '{"Alice":"local","Bob":"cloud"}' });
            // Merged result is uploaded so the cloud gains the local-only character
            expect(mockedUpload).toHaveBeenCalledWith(
                expect.objectContaining({ deposits: expect.anything() }),
                expect.objectContaining({ force: true }),
            );
        });

        it('imports append-merge categories on keep-local too (union semantics)', async () => {
            mockedDownload.mockResolvedValue({
                success: true,
                data: { visitedRooms: '[{"id":"Alice:map","rooms":[1]}]' },
                payloads: { visitedRooms: { checksum: 'c', deviceId: 'other', syncedAt: 'x', encrypted: false } },
                errors: {},
            });
            mockedExport.mockResolvedValue({ visitedRooms: '[{"id":"Alice:map","rooms":[1,2]}]' });

            const result = await syncEngine.resolveConflicts('keep-local', ['visitedRooms']);

            expect(result.success).toBe(true);
            // Cloud data imported (import performs the union), merged result uploaded
            expect(mockedImport).toHaveBeenCalledWith({ visitedRooms: '[{"id":"Alice:map","rooms":[1]}]' });
            expect(mockedUpload).toHaveBeenCalledWith(
                expect.objectContaining({ visitedRooms: expect.anything() }),
                expect.objectContaining({ force: true }),
            );
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
