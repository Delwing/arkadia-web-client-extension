/**
 * Firebase Sync Engine
 *
 * Headless auto-sync service that owns the upload side of synchronization:
 * watching local storage changes, debouncing them (via syncDebounceManager),
 * exporting enabled categories, conflict checking and uploading.
 *
 * It runs independently of any UI — started/stopped from the auth-state
 * handler in web/main.ts — so auto-sync keeps working no matter which
 * options tab (if any) is currently open. It also owns the encryption
 * passphrase (kept in sessionStorage so it survives the options dialog
 * being closed and page reloads within the same browser tab).
 *
 * The UI observes progress via eventBus:
 * - 'firebase.autosync.pending'  a debounced sync was scheduled / cleared
 * - 'firebase.sync.uploaded'     an upload finished (manual or auto)
 * - 'firebase.sync.conflict'     local and cloud changed independently
 * - 'firebase.sync.error'        a sync attempt failed
 */

import eventBus from '@modules/core/eventBus';
import { characterStorage, globalStorage } from '@modules/core/storage';
import type { CategorySyncTimes, SyncCategory } from './firebaseTypes';
import {
    FIREBASE_CONFIG_KEY,
    FIREBASE_ERRORS,
    FIREBASE_SETTINGS_KEY,
    loadFirebaseSettings,
    SYNC_CATEGORIES,
} from './firebaseTypes';
import { syncDebounceManager } from './syncDebounceManager';
import { syncListener } from './firebaseSyncListener';
import { checkCategoriesConflicts, downloadCategories, uploadCategories } from './firebaseUnifiedSync';

const PASSPHRASE_SESSION_KEY = 'arkadia.firebasePassphrase';

// Sync metadata keys must never re-trigger auto-sync (prevents sync loops
// when multiple windows are open).
const IGNORED_STORAGE_KEYS = new Set([FIREBASE_SETTINGS_KEY, FIREBASE_CONFIG_KEY]);

export type SyncRunResult =
    | { status: 'uploaded'; categories: SyncCategory[]; timestamps: CategorySyncTimes }
    | { status: 'conflict' }
    | { status: 'error'; error: string }
    | { status: 'skipped'; reason: 'busy' | 'no-categories' | 'needs-passphrase' | 'no-data' };

class FirebaseSyncEngine {
    private storageUnsubs: Array<() => void> = [];
    private syncing = false;
    private watching = false;
    private passphrase: string | null = null;
    /** Whether auto-sync could run last time settings were evaluated. */
    private autoSyncReady = false;

    constructor() {
        try {
            this.passphrase = sessionStorage.getItem(PASSPHRASE_SESSION_KEY);
        } catch {
            this.passphrase = null;
        }
    }

    /** Start watching local changes for auto-sync. Idempotent; called on sign-in. */
    start(): void {
        if (typeof window !== 'undefined') {
            if ((window as { __DISABLE_FIREBASE__?: boolean }).__DISABLE_FIREBASE__) return;
            // No auto-sync on localhost to prevent excessive writes during development
            const host = window.location.hostname;
            if (host === 'localhost' || host === '127.0.0.1') return;
        }
        if (this.watching) return;
        this.watching = true;

        syncDebounceManager.initialize({
            onSyncNeeded: () => {
                eventBus.emit('firebase.autosync.pending', { pending: false });
                void this.syncNow(true);
            },
        });

        const onChange = (key: string) => this.handleStorageChange(key);
        this.storageUnsubs = [
            characterStorage.onAnyChange(onChange),
            globalStorage.onAnyChange(onChange),
        ];

        this.pushPassphraseToListener();
        // Baseline readiness so a later enable is detected as a transition; we
        // don't fire an initial sync just for app startup.
        this.autoSyncReady = this.canAutoSync();
        console.log('[SyncEngine] Started');
    }

    /** Stop watching and forget the passphrase. Called on sign-out. */
    stop(): void {
        if (!this.watching) return;
        this.watching = false;
        this.autoSyncReady = false;
        this.storageUnsubs.forEach(unsub => unsub());
        this.storageUnsubs = [];
        syncDebounceManager.destroy();
        this.setPassphrase(null);
        eventBus.emit('firebase.autosync.pending', { pending: false });
        console.log('[SyncEngine] Stopped');
    }

    isWatching(): boolean {
        return this.watching;
    }

    /** True while a debounced auto-sync is scheduled but has not fired yet. */
    hasPendingAutoSync(): boolean {
        return syncDebounceManager.hasPendingSync();
    }

    setPassphrase(passphrase: string | null): void {
        this.passphrase = passphrase || null;
        try {
            if (this.passphrase) {
                sessionStorage.setItem(PASSPHRASE_SESSION_KEY, this.passphrase);
            } else {
                sessionStorage.removeItem(PASSPHRASE_SESSION_KEY);
            }
        } catch {
            // sessionStorage unavailable — passphrase stays in memory only
        }
        this.pushPassphraseToListener();
    }

    getPassphrase(): string | null {
        return this.passphrase;
    }

    /** Re-evaluate after sync settings change (auto-sync toggle, encryption, categories). */
    settingsChanged(): void {
        this.pushPassphraseToListener();
        this.reconcileAutoSyncReadiness();
    }

    /**
     * React to a change in whether auto-sync can run. When it first becomes
     * possible — e.g. the user just switched auto-sync on — reconcile with the
     * cloud immediately (push local changes, surface any conflicts) instead of
     * waiting for the next local edit. Only fires while the engine is actually
     * watching, so the localhost / disabled guards in start() still hold.
     */
    private reconcileAutoSyncReadiness(): void {
        const ready = this.canAutoSync();
        if (ready && !this.autoSyncReady && this.watching) {
            void this.syncNow(false);
        } else if (!ready) {
            syncDebounceManager.cancelAll();
            eventBus.emit('firebase.autosync.pending', { pending: false });
        }
        this.autoSyncReady = ready;
    }

    /**
     * Export enabled categories, check conflicts and upload.
     * Outcomes are also broadcast on the eventBus so the UI can display them
     * regardless of whether the run was manual or debounced.
     */
    async syncNow(auto = false): Promise<SyncRunResult> {
        if (this.syncing) return { status: 'skipped', reason: 'busy' };

        const settings = loadFirebaseSettings();
        if (settings.encryptionEnabled && !this.passphrase) {
            return { status: 'skipped', reason: 'needs-passphrase' };
        }
        const enabledCategories = SYNC_CATEGORIES.filter(cat => settings.syncOptions[cat]);
        if (enabledCategories.length === 0) {
            return { status: 'skipped', reason: 'no-categories' };
        }

        this.syncing = true;
        try {
            const passphrase = settings.encryptionEnabled ? this.passphrase ?? undefined : undefined;
            const { collectCharacters, exportCategories, mergeCloudProfessionData } =
                await import('@web/options/exportUtils');

            // Pre-merge CRDT data (profession) from cloud before exporting, so we
            // don't overwrite +staz events that were added on another device.
            if (enabledCategories.includes('characterSettings')) {
                try {
                    const cloudResult = await downloadCategories(['characterSettings'], passphrase);
                    if (cloudResult.success && cloudResult.data.characterSettings) {
                        mergeCloudProfessionData(cloudResult.data.characterSettings);
                    }
                } catch {
                    // Non-critical: proceed with upload even if pre-merge fails
                }
            }

            const categoryData = await exportCategories(enabledCategories, collectCharacters());
            if (Object.keys(categoryData).length === 0) {
                return { status: 'skipped', reason: 'no-data' };
            }

            const conflictResult = await checkCategoriesConflicts(categoryData);
            if (Object.keys(conflictResult.errors).length > 0) {
                const error = Object.values(conflictResult.errors)[0] ?? FIREBASE_ERRORS.SYNC_FAILED;
                eventBus.emit('firebase.sync.error', { message: error });
                return { status: 'error', error };
            }
            if (conflictResult.conflicts.length > 0) {
                eventBus.emit('firebase.sync.conflict', { conflicts: conflictResult.conflicts });
                return { status: 'conflict' };
            }

            const uploadResult = await uploadCategories(categoryData, {
                encrypted: settings.encryptionEnabled,
                passphrase,
            });
            if (!uploadResult.success) {
                const error = Object.values(uploadResult.errors)[0] ?? FIREBASE_ERRORS.SYNC_FAILED;
                eventBus.emit('firebase.sync.error', { message: error });
                return { status: 'error', error };
            }

            // Tell the realtime listener these checksums are ours so the next
            // snapshot doesn't re-apply our own upload.
            syncListener.notifyLocalUpload(uploadResult.checksums);

            const categories = Object.keys(categoryData) as SyncCategory[];
            eventBus.emit('firebase.sync.uploaded', {
                categories,
                timestamps: uploadResult.timestamps,
                encrypted: settings.encryptionEnabled,
                auto,
            });
            return { status: 'uploaded', categories, timestamps: uploadResult.timestamps };
        } catch (err) {
            console.error('[SyncEngine] Sync failed', err);
            eventBus.emit('firebase.sync.error', { message: FIREBASE_ERRORS.SYNC_FAILED });
            return { status: 'error', error: FIREBASE_ERRORS.SYNC_FAILED };
        } finally {
            this.syncing = false;
        }
    }

    private canAutoSync(): boolean {
        const settings = loadFirebaseSettings();
        if (!settings.autoSyncEnabled) return false;
        return !settings.encryptionEnabled || !!this.passphrase;
    }

    /** The realtime listener decrypts incoming payloads only while encryption is enabled. */
    private pushPassphraseToListener(): void {
        const settings = loadFirebaseSettings();
        syncListener.setPassphrase(settings.encryptionEnabled ? this.passphrase : null);
    }

    private handleStorageChange(key: string): void {
        if (IGNORED_STORAGE_KEYS.has(key)) return;
        if (!this.canAutoSync()) return;
        const result = syncDebounceManager.handleStorageChange([key]);
        if (result.shouldSync) {
            eventBus.emit('firebase.autosync.pending', { pending: true });
        }
    }
}

// Export singleton instance
export const syncEngine = new FirebaseSyncEngine();
