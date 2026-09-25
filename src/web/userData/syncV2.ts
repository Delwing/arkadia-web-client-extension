/**
 * Starts sync v2 in the browser. See docs/dev/SYNC_V2_PLAN.md, section 8.
 *
 * On by default; `localStorage.setItem('arkadia.syncV2', '0')` and a reload
 * fall back to sync v1 until v1 is removed. Runs only while auto-sync is on,
 * and only in one tab per browser (the Web Lock holder); other tabs see
 * localStorage values through the `storage` event. Before its first start
 * for a user, a device migrates from v1 (migrateFromV1).
 */

import { getFirestore } from '@modules/firebase/firebaseConfig';
import { getDeviceId, loadFirebaseSettings } from '@modules/firebase/firebaseTypes';
import { registerDevice } from '@modules/firebase/firebaseUnifiedSync';
import { SyncEngineV2, type VisibilitySource } from '@modules/syncV2/engine';
import { FirestoreTransport } from '@modules/syncV2/firestoreTransport';
import { createUsageCounter } from '@modules/syncV2/usage';
import { migrateFromV1 } from './migrateFromV1';
import { createUserDataTracker, createUserDataTypes } from './registry';

export const SYNC_V2_FLAG_KEY = 'arkadia.syncV2';
const LOCK_NAME = 'arkadia-sync-v2';
const MIGRATION_RETRY_MS = 60 * 1000;
const cursorKey = (userId: string) => `arkadia.syncV2.cursors:${userId}`;

export function isSyncV2Enabled(): boolean {
    try {
        return localStorage.getItem(SYNC_V2_FLAG_KEY) !== '0';
    } catch {
        return true;
    }
}

const browserVisibility: VisibilitySource = {
    isVisible: () => document.visibilityState === 'visible',
    onChange(listener) {
        const handler = () => listener(document.visibilityState === 'visible');
        document.addEventListener('visibilitychange', handler);
        return () => document.removeEventListener('visibilitychange', handler);
    },
    onPageHide(listener) {
        window.addEventListener('pagehide', listener);
        return () => window.removeEventListener('pagehide', listener);
    },
};

let engine: SyncEngineV2 | null = null;
let releaseLock: (() => void) | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let startToken = 0;
let startedFor: string | null = null;

/**
 * Start for the signed-in user. `passphrase` returns the encryption
 * passphrase known to this tab (null when none).
 */
export function startSyncV2(userId: string, passphrase: () => string | null): void {
    // Startup and the settings tab both start sync on sign-in: once per user.
    if (startedFor === userId) return;
    startedFor = userId;
    const token = ++startToken;

    const run = async (): Promise<void> => {
        if (token !== startToken) return;
        const db = getFirestore();
        if (!db || !loadFirebaseSettings().autoSyncEnabled) return retryLater();
        const editTypes = await migrateFromV1(userId, passphrase()).catch(error => {
            console.warn('[SyncV2] v1 migration failed:', error);
            return null;
        });
        if (token !== startToken) return;
        if (!editTypes) return retryLater();

        engine = new SyncEngineV2({
            deviceId: getDeviceId(),
            tracker: createUserDataTracker(undefined, type => editTypes.has(type)),
            types: createUserDataTypes(),
            transport: new FirestoreTransport(db, userId),
            encryptionKey: () => (loadFirebaseSettings().encryptionEnabled ? passphrase() : null),
            decryptionKey: passphrase,
            locked: () => {
                const settings = loadFirebaseSettings();
                return !settings.autoSyncEnabled || (settings.encryptionEnabled && !passphrase());
            },
            visibility: browserVisibility,
            cursors: {
                load: () => {
                    try {
                        return JSON.parse(localStorage.getItem(cursorKey(userId)) ?? '{}') as Record<string, number>;
                    } catch {
                        return {};
                    }
                },
                save: cursors => localStorage.setItem(cursorKey(userId), JSON.stringify(cursors)),
            },
            usage: createUsageCounter(),
            onError: error => console.error('[SyncV2]', error),
        });
        engine.start();
        console.log('[SyncV2] Started');
        // List this device for the others (Devices page), whether or not that
        // page was ever opened here.
        void registerDevice().catch(error => console.warn('[SyncV2] Could not register the device:', error));
    };

    // Auto-sync off, offline, or the passphrase not entered yet: try again later.
    const retryLater = (): void => {
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => { void run(); }, MIGRATION_RETRY_MS);
    };

    const locks = typeof navigator !== 'undefined'
        ? (navigator as Navigator & { locks?: LockManager }).locks
        : undefined;
    if (!locks?.request) {
        void run();
        return;
    }
    void locks.request(LOCK_NAME, { mode: 'exclusive' }, () => {
        if (token !== startToken) return undefined;
        void run();
        // Hold the lock until stop() or the tab closes.
        return new Promise<void>(resolve => { releaseLock = resolve; });
    });
}

export async function stopSyncV2(): Promise<void> {
    startToken += 1;
    startedFor = null;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    const running = engine;
    engine = null;
    await running?.stop();
    releaseLock?.();
    releaseLock = null;
}

/** Whether sync v2 is running in this tab (it runs in one tab per browser). */
export function isSyncV2Running(): boolean {
    return engine !== null;
}

/** Upload local changes now (the "send" button, after a restore). */
export async function flushSyncV2(): Promise<void> {
    await engine?.flush();
}

/** Read everything in the cloud again and apply it (the "download" button). */
export async function redownloadSyncV2(): Promise<void> {
    await engine?.redownload();
}

/**
 * Copy the interface and button settings of other devices here: one device
 * ("copy from device"), or the members of a sync group just joined (the newest
 * among them). Returns whether any settings were found for them.
 */
export async function applyDeviceSettingsFrom(devices: string[]): Promise<boolean> {
    return (await engine?.applyDeviceValues(devices)) ?? false;
}

/** Delete all sync data in the cloud; this device uploads everything again. */
export async function resetSyncV2Cloud(): Promise<void> {
    await engine?.resetCloud();
}
