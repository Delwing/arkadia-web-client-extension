const settings = { autoSyncEnabled: false, encryptionEnabled: false };
const engineStart = vi.fn();
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
        return { start: engineStart, stop: () => Promise.resolve(), flush: () => Promise.resolve() };
    },
}));

import { startSyncV2, stopSyncV2, waitForSyncV2 } from '@web/userData/syncV2';

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
});
