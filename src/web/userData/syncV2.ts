/**
 * Starts sync v2 in the browser, behind a flag, instead of the v1 sync.
 * See docs/dev/SYNC_V2_PLAN.md, section 8 (stage 3).
 *
 * Enable with `localStorage.setItem('arkadia.syncV2', '1')` and reload. Runs
 * only while auto-sync is on, and only in one tab per browser (the Web Lock
 * holder); other tabs see localStorage values through the `storage` event.
 */

import { getFirestore } from '@modules/firebase/firebaseConfig';
import { loadFirebaseSettings } from '@modules/firebase/firebaseTypes';
import { getDeviceId } from '@modules/firebase/firebaseTypes';
import { SyncEngineV2, type VisibilitySource } from '@modules/syncV2/engine';
import { FirestoreTransport } from '@modules/syncV2/firestoreTransport';
import { createUsageCounter } from '@modules/syncV2/usage';
import { createUserDataTracker, createUserDataTypes } from './registry';

export const SYNC_V2_FLAG_KEY = 'arkadia.syncV2';
const LOCK_NAME = 'arkadia-sync-v2';
const cursorKey = (userId: string) => `arkadia.syncV2.cursors:${userId}`;

export function isSyncV2Enabled(): boolean {
    try {
        return localStorage.getItem(SYNC_V2_FLAG_KEY) === '1';
    } catch {
        return false;
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
let startToken = 0;

/**
 * Start for the signed-in user. `passphrase` returns the encryption
 * passphrase known to this tab (null when none).
 */
export function startSyncV2(userId: string, passphrase: () => string | null): void {
    const token = ++startToken;
    const run = () => {
        if (token !== startToken) return;
        const db = getFirestore();
        if (!db) return;
        const types = createUserDataTypes();
        engine = new SyncEngineV2({
            deviceId: getDeviceId(),
            tracker: createUserDataTracker(),
            types,
            transport: new FirestoreTransport(db, userId),
            passphrase: () => (loadFirebaseSettings().encryptionEnabled ? passphrase() : null),
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
    };

    const locks = typeof navigator !== 'undefined'
        ? (navigator as Navigator & { locks?: LockManager }).locks
        : undefined;
    if (!locks?.request) {
        run();
        return;
    }
    void locks.request(LOCK_NAME, { mode: 'exclusive' }, () => {
        if (token !== startToken) return undefined;
        run();
        // Hold the lock until stop() or the tab closes.
        return new Promise<void>(resolve => { releaseLock = resolve; });
    });
}

export async function stopSyncV2(): Promise<void> {
    startToken += 1;
    const running = engine;
    engine = null;
    await running?.stop();
    releaseLock?.();
    releaseLock = null;
}

/** Upload local changes now (e.g. the "sync now" button). */
export async function flushSyncV2(): Promise<void> {
    await engine?.flush();
}
