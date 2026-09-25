const settings = { autoSyncEnabled: false, encryptionEnabled: false };
const engineStart = vi.fn();
const engineStop = vi.fn(() => Promise.resolve());
const registerDevice = vi.fn(() => Promise.resolve({ success: true }));

vi.mock('@modules/firebase/firebaseConfig', () => ({ getFirestore: () => ({}) }));
vi.mock('@modules/firebase/firebaseTypes', () => ({
    getDeviceId: () => 'dev',
    loadFirebaseSettings: () => settings,
}));
vi.mock('@modules/firebase/firebaseUnifiedSync', () => ({ registerDevice: () => registerDevice() }));
vi.mock('@web/userData/migrateFromV1', () => ({ migrateFromV1: () => Promise.resolve(new Set<string>()) }));
vi.mock('@web/userData/registry', () => ({ createUserDataTracker: () => ({}), createUserDataTypes: () => [] }));
vi.mock('@modules/syncV2/firestoreTransport', () => ({ FirestoreTransport: function FirestoreTransport() {} }));
vi.mock('@modules/syncV2/engine', () => ({
    SyncEngineV2: function SyncEngineV2() {
        return { start: engineStart, stop: engineStop, flush: () => Promise.resolve(), ready: () => Promise.resolve() };
    },
}));

import { nudgeSyncV2, runSyncV2Action, startSyncV2, stopSyncV2, waitForSyncV2 } from '@web/userData/syncV2';

describe('startSyncV2', () => {
    afterEach(async () => {
        await stopSyncV2();
        settings.autoSyncEnabled = false;
        vi.clearAllMocks();
    });

    it('waits while auto-sync is off and starts at once when asked after it is switched on', async () => {
        startSyncV2('user-1', () => null);
        expect(await waitForSyncV2(50)).toBe(false);
        expect(engineStart).not.toHaveBeenCalled();

        settings.autoSyncEnabled = true;
        // Well before the one-minute retry
        expect(await waitForSyncV2(1_000)).toBe(true);
        expect(engineStart).toHaveBeenCalledTimes(1);
        await vi.waitFor(() => expect(registerDevice).toHaveBeenCalled());
    });

    it('starts once per user however often it is asked', async () => {
        settings.autoSyncEnabled = true;
        startSyncV2('user-1', () => null);
        startSyncV2('user-1', () => null);
        expect(await waitForSyncV2(1_000)).toBe(true);
        expect(engineStart).toHaveBeenCalledTimes(1);
    });

    it('runs a manual send with auto-sync off, then stops again', async () => {
        startSyncV2('user-1', () => null);
        const action = vi.fn(() => Promise.resolve());

        expect(await runSyncV2Action(action, 1_000)).toBe(true);

        expect(action).toHaveBeenCalledTimes(1);
        expect(engineStart).toHaveBeenCalledTimes(1);
        expect(engineStop).toHaveBeenCalledTimes(1);
        expect(await waitForSyncV2(50)).toBe(false);

        // Switched on later: starts for good
        settings.autoSyncEnabled = true;
        expect(await waitForSyncV2(1_000)).toBe(true);
        expect(engineStart).toHaveBeenCalledTimes(2);
    });

    it('keeps running after a manual send while auto-sync is on', async () => {
        settings.autoSyncEnabled = true;
        startSyncV2('user-1', () => null);
        expect(await runSyncV2Action(() => Promise.resolve(), 1_000)).toBe(true);
        expect(engineStop).not.toHaveBeenCalled();
    });

    it('stops when auto-sync is switched off', async () => {
        settings.autoSyncEnabled = true;
        startSyncV2('user-1', () => null);
        expect(await waitForSyncV2(1_000)).toBe(true);

        settings.autoSyncEnabled = false;
        nudgeSyncV2();
        await vi.waitFor(() => expect(engineStop).toHaveBeenCalledTimes(1));
        expect(await waitForSyncV2(50)).toBe(false);
    });
});
