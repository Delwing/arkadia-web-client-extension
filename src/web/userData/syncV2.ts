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
import { getSyncGroup } from '@modules/device/syncGroup';
import { refreshSyncGroup, registerDevice } from '@modules/firebase/firebaseUnifiedSync';
import { SyncEngineV2, type VisibilitySource } from '@modules/syncV2/engine';
import { FirestoreTransport } from '@modules/syncV2/firestoreTransport';
import { createUsageCounter } from '@modules/syncV2/usage';
import { migrateFromV1 } from './migrateFromV1';
import { createUserDataTracker, createUserDataTypes } from './registry';

export const SYNC_V2_FLAG_KEY = 'arkadia.syncV2';
const LOCK_NAME = 'arkadia-sync-v2';
const MIGRATION_RETRY_MS = 60 * 1000;
const cursorKey = (userId: string) => `arkadia.syncV2.cursors:${userId}`;
const epochKey = (userId: string) => `arkadia.syncV2.epoch:${userId}`;

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
let pendingRun: (() => void) | null = null;
let readyWaiters: Array<() => void> = [];

/** Manual send / download actions in progress: they run sync even with auto-sync off. */
let manualActions = 0;
/** Wait for the next start attempt (set while sync is started for a user). */
let rearm: (() => void) | null = null;

const autoSyncOn = (): boolean => loadFirebaseSettings().autoSyncEnabled;
/** Sync may run: auto-sync is on, or the user asked for a send / download. */
const syncAllowed = (): boolean => autoSyncOn() || manualActions > 0;

let groupRefresh: Promise<void> | null = null;
const devicesChecked = new Set<string>();

/**
 * Read the sync group again; when devices joined or left, apply the newest
 * interface settings among the members (including this device, so its own
 * newer settings stay). The device that created a group learns who joined
 * only this way.
 */
function refreshGroup(): void {
    if (groupRefresh) return;
    groupRefresh = (async () => {
        const group = await refreshSyncGroup();
        if (group) await engine?.applyDeviceValues(group.devices);
    })()
        .catch(error => console.warn('[SyncV2] Could not refresh the sync group:', error))
        .finally(() => { groupRefresh = null; });
}

/** Settings arrived from a device not in this device's group: read the group once per device and session. */
function checkDeviceOutsideGroup(deviceId: string): void {
    if (devicesChecked.has(deviceId)) return;
    devicesChecked.add(deviceId);
    refreshGroup();
}

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
        if (!db || !syncAllowed()) return retryLater();
        const editTypes = await migrateFromV1(userId, passphrase()).catch(error => {
            console.warn('[SyncV2] v1 migration failed:', error);
            return null;
        });
        if (token !== startToken) return;
        if (!editTypes) return retryLater();

        engine = new SyncEngineV2({
            deviceId: getDeviceId(),
            tracker: createUserDataTracker(undefined, type => editTypes.has(type), checkDeviceOutsideGroup),
            types: createUserDataTypes(),
            transport: new FirestoreTransport(db, userId),
            encryptionKey: () => (loadFirebaseSettings().encryptionEnabled ? passphrase() : null),
            decryptionKey: passphrase,
            locked: () => {
                const settings = loadFirebaseSettings();
                return !syncAllowed() || (settings.encryptionEnabled && !passphrase());
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
            epoch: {
                load: () => localStorage.getItem(epochKey(userId)),
                save: epoch => localStorage.setItem(epochKey(userId), epoch),
            },
            usage: createUsageCounter(),
            onError: error => console.error('[SyncV2]', error),
            log: message => console.info(`[SyncV2] ${message}`),
        });
        engine.start();
        console.log('[SyncV2] Started');
        readyWaiters.splice(0).forEach(resolve => resolve());
        // List this device for the others (Devices page), whether or not that
        // page was ever opened here.
        void registerDevice().catch(error => console.warn('[SyncV2] Could not register the device:', error));
        if (getSyncGroup()) refreshGroup();
    };

    // Auto-sync off, offline, or the passphrase not entered yet: try again later.
    const retryLater = (): void => {
        if (token !== startToken) return;
        if (retryTimer) clearTimeout(retryTimer);
        pendingRun = () => { void run(); };
        retryTimer = setTimeout(() => {
            retryTimer = null;
            pendingRun = null;
            void run();
        }, MIGRATION_RETRY_MS);
    };

    rearm = retryLater;

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
    rearm = null;
    devicesChecked.clear();
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    pendingRun = null;
    const running = engine;
    engine = null;
    await running?.stop();
    releaseLock?.();
    releaseLock = null;
}

/**
 * Retry a start that is waiting (auto-sync was off, the passphrase missing,
 * or offline) now instead of at the next retry — e.g. right after auto-sync
 * is switched on.
 */
export function nudgeSyncV2(): void {
    // Auto-sync switched off: stop listening and uploading until it is back.
    if (engine && !syncAllowed()) {
        void pauseSyncV2();
        return;
    }
    const run = pendingRun;
    if (!run) return;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    pendingRun = null;
    run();
}

/**
 * Resolves true once sync v2 runs in this tab, false after `timeoutMs` (it
 * can't start yet, or another tab of this browser runs it).
 */
export function waitForSyncV2(timeoutMs: number): Promise<boolean> {
    if (engine) return Promise.resolve(true);
    nudgeSyncV2();
    return new Promise(resolve => {
        const done = (ready: boolean) => {
            clearTimeout(timer);
            readyWaiters = readyWaiters.filter(waiter => waiter !== onReady);
            resolve(ready);
        };
        const onReady = () => done(true);
        const timer = setTimeout(() => done(false), timeoutMs);
        readyWaiters.push(onReady);
    });
}

/** Stop the engine (auto-sync is off) and wait for the next start. */
async function pauseSyncV2(): Promise<void> {
    const running = engine;
    engine = null;
    await running?.stop();
    console.log('[SyncV2] Paused: auto-sync is off');
    rearm?.();
}

/**
 * Run a manual send / download: sync starts for it even with auto-sync off,
 * first applies what the cloud has, then runs `action`; with auto-sync off it
 * stops again afterwards. Resolves false when sync can't run in this tab
 * (another tab runs it, offline, passphrase missing).
 */
export async function runSyncV2Action(
    action: (engine: SyncEngineV2) => Promise<void>,
    timeoutMs = 10_000,
): Promise<boolean> {
    manualActions += 1;
    try {
        if (!(await waitForSyncV2(timeoutMs)) || !engine) return false;
        const running = engine;
        await running.ready();
        await action(running);
        return true;
    } finally {
        manualActions -= 1;
        if (manualActions === 0 && engine && !autoSyncOn()) await pauseSyncV2();
    }
}

/** Upload local changes now (the "send" button, after a restore). */
export async function flushSyncV2(): Promise<void> {
    await engine?.flush();
}

/**
 * Copy the interface and button settings of other devices here: one device
 * ("copy from device"), or the members of a sync group just joined (the newest
 * among them). Returns whether any settings were found for them.
 */
export async function applyDeviceSettingsFrom(devices: string[]): Promise<boolean> {
    return (await engine?.applyDeviceValues(devices)) ?? false;
}
