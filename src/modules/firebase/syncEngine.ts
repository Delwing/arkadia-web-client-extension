/**
 * Firebase Sync Engine
 *
 * Headless auto-sync service that owns synchronization between local storage
 * and the cloud: watching local changes, debouncing them (via
 * syncDebounceManager), reconciling with the cloud (upload / apply /
 * conflict) and resolving conflicts.
 *
 * It runs independently of any UI — started/stopped from the auth-state
 * handler in web/main.ts — so auto-sync keeps working no matter which
 * options tab (if any) is currently open. It also owns the encryption
 * passphrase (kept in sessionStorage so it survives the options dialog
 * being closed and page reloads within the same browser tab).
 *
 * Reconciliation is three-way: each category's local export and cloud payload
 * are compared against the persisted sync base (categorySyncChecksums — the
 * last state this device synced). Only local moved → upload; only cloud
 * moved → apply; both moved → conflict. This runs on every sync, including
 * once at startup, so changes made while the device was closed propagate in
 * both directions without waiting for the next edit.
 *
 * Multi-tab: the watcher runs in a single tab per browser, elected via the
 * Web Locks API. When the leader tab closes, the lock is released and a
 * waiting tab takes over. Manual syncs and the realtime listener work in
 * every tab (localStorage is shared, applies are idempotent).
 *
 * The UI observes progress via eventBus:
 * - 'firebase.autosync.pending'  a debounced sync was scheduled / cleared
 * - 'firebase.sync.uploaded'     an upload finished (manual or auto)
 * - 'firebase.sync.applied'      remote data was imported locally
 * - 'firebase.sync.conflict'     local and cloud changed independently
 * - 'firebase.sync.error'        a sync attempt failed
 * Conflicts are additionally kept as pending state on the engine (see
 * getPendingConflicts) so the options UI can show them when it mounts later,
 * and announced with a 'notify' toast while no conflict UI is listening.
 */

import eventBus from '@modules/core/eventBus';
import { characterStorage, globalStorage } from '@modules/core/storage';
import type { CategoryConflictInfo, CategorySyncTimes, ConflictResolution, SyncCategory } from './firebaseTypes';
import {
    FIREBASE_CONFIG_KEY,
    FIREBASE_ERRORS,
    FIREBASE_SETTINGS_KEY,
    getCategoryDefinition,
    loadFirebaseSettings,
    SYNC_CATEGORIES,
} from './firebaseTypes';
import { syncDebounceManager } from './syncDebounceManager';
import { syncListener } from './firebaseSyncListener';
import {
    downloadCategories,
    planSync,
    recordCategorySyncState,
    uploadCategories,
} from './firebaseUnifiedSync';

const PASSPHRASE_SESSION_KEY = 'arkadia.firebasePassphrase';
const SYNC_ENGINE_LOCK = 'arkadia-firebase-sync-engine';

// Sync metadata keys must never re-trigger auto-sync (prevents sync loops
// when multiple windows are open).
const IGNORED_STORAGE_KEYS = new Set([FIREBASE_SETTINGS_KEY, FIREBASE_CONFIG_KEY]);

export type SyncRunResult =
    | { status: 'uploaded'; categories: SyncCategory[]; applied: SyncCategory[]; timestamps: CategorySyncTimes }
    | { status: 'in-sync' }
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
    /** start() was called and stop() has not been — may still be waiting for the tab lock. */
    private desiredRunning = false;
    /** Resolves the Web Lock holder promise, handing leadership to another tab. */
    private releaseLock: (() => void) | null = null;
    private lockPending = false;
    /** A debounced sync fired while another sync was running — rerun when it finishes. */
    private rerunAfterSync = false;
    /** Conflicts detected but not yet resolved by the user. */
    private pendingConflicts = new Map<SyncCategory, CategoryConflictInfo>();
    /** True while a conflict-capable UI (options dialog) is mounted — suppresses toasts. */
    private conflictUiActive = false;

    constructor() {
        try {
            this.passphrase = sessionStorage.getItem(PASSPHRASE_SESSION_KEY);
        } catch {
            this.passphrase = null;
        }
        // Track conflicts from every source (own syncs and the realtime
        // listener) so they survive until a UI is around to show them.
        eventBus.on('firebase.sync.conflict', ({ conflicts }) => {
            this.trackConflicts(conflicts);
        });
    }

    /**
     * Start the engine. Idempotent; called on sign-in. The storage watcher is
     * leader-elected across tabs via the Web Locks API — non-leader tabs stay
     * passive until the leader tab closes and the lock is released.
     */
    start(): void {
        if (typeof window !== 'undefined') {
            if ((window as { __DISABLE_FIREBASE__?: boolean }).__DISABLE_FIREBASE__) return;
            // No auto-sync on localhost to prevent excessive writes during development
            const host = window.location.hostname;
            if (host === 'localhost' || host === '127.0.0.1') return;
        }
        if (this.desiredRunning) return;
        this.desiredRunning = true;

        const locks = typeof navigator !== 'undefined'
            ? (navigator as Navigator & { locks?: LockManager }).locks
            : undefined;
        if (locks?.request) {
            if (this.lockPending) return;
            this.lockPending = true;
            void locks.request(SYNC_ENGINE_LOCK, { mode: 'exclusive' }, () => {
                this.lockPending = false;
                if (!this.desiredRunning) return; // stopped while waiting for the lock
                this.doStart();
                // Hold the lock until stop() or tab close (auto-released by the browser)
                return new Promise<void>(resolve => { this.releaseLock = resolve; });
            }).catch(err => {
                console.error('[SyncEngine] Lock acquisition failed, starting without leader election', err);
                this.lockPending = false;
                if (this.desiredRunning && !this.watching) this.doStart();
            });
        } else {
            this.doStart();
        }
    }

    private doStart(): void {
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
        this.autoSyncReady = this.canAutoSync();
        // Startup reconcile: pushes changes left unsynced when the previous
        // session closed and pulls cloud changes made while this device was
        // offline — without it, neither side propagates until the next edit.
        if (this.autoSyncReady) {
            void this.syncNow(true);
        }
        console.log('[SyncEngine] Started');
    }

    /** Stop the engine and forget the passphrase. Called on sign-out. */
    stop(): void {
        const wasActive = this.desiredRunning || this.watching;
        this.desiredRunning = false;
        if (this.releaseLock) {
            this.releaseLock();
            this.releaseLock = null;
        }
        if (this.watching) {
            this.watching = false;
            this.storageUnsubs.forEach(unsub => unsub());
            this.storageUnsubs = [];
            syncDebounceManager.destroy();
            eventBus.emit('firebase.autosync.pending', { pending: false });
        }
        if (!wasActive) return;
        this.autoSyncReady = false;
        this.rerunAfterSync = false;
        this.pendingConflicts.clear();
        this.setPassphrase(null);
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

    // ── Pending conflicts ────────────────────────────────────────────────────

    /** Conflicts detected but not yet resolved — shown by the options UI on mount. */
    getPendingConflicts(): CategoryConflictInfo[] {
        return [...this.pendingConflicts.values()];
    }

    clearPendingConflicts(categories?: SyncCategory[]): void {
        if (categories) {
            categories.forEach(cat => this.pendingConflicts.delete(cat));
        } else {
            this.pendingConflicts.clear();
        }
    }

    /** The options dialog registers itself so conflicts don't also toast. */
    setConflictUiActive(active: boolean): void {
        this.conflictUiActive = active;
    }

    private trackConflicts(conflicts: CategoryConflictInfo[]): void {
        const fresh = conflicts.filter(c => !this.pendingConflicts.has(c.category));
        for (const conflict of conflicts) {
            this.pendingConflicts.set(conflict.category, conflict);
        }
        // Announce only newly-conflicted categories, and only when no conflict
        // UI is mounted — otherwise the modal is already on screen.
        if (fresh.length > 0 && !this.conflictUiActive) {
            eventBus.emit('notify', {
                text: 'Wykryto konflikt synchronizacji ustawien. Otworz Eksport / Import, aby go rozwiazac.',
                time: 8000,
            });
        }
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
     * Reconcile all enabled categories with the cloud: upload what changed
     * locally, apply what changed in the cloud, surface what changed on both
     * sides. Outcomes are also broadcast on the eventBus so the UI can display
     * them regardless of whether the run was manual or debounced.
     */
    async syncNow(auto = false): Promise<SyncRunResult> {
        if (this.syncing) {
            // A debounced sync landed mid-run — its changes may postdate the
            // running sync's export, so run once more when it finishes.
            if (auto) this.rerunAfterSync = true;
            return { status: 'skipped', reason: 'busy' };
        }

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
            // Cloud payloads may be encrypted even when local encryption was
            // just switched off — always offer the passphrase for decryption.
            const decryptPassphrase = this.passphrase ?? undefined;
            const { collectCharacters, exportCategories, importCategories, mergeCloudProfessionData } =
                await import('@web/options/exportUtils');

            // Pre-merge CRDT data (profession) from cloud before exporting, so we
            // don't overwrite +staz events that were added on another device.
            if (enabledCategories.includes('characterSettings')) {
                try {
                    const cloudResult = await downloadCategories(['characterSettings'], decryptPassphrase);
                    if (cloudResult.success && cloudResult.data.characterSettings) {
                        mergeCloudProfessionData(cloudResult.data.characterSettings);
                    }
                } catch {
                    // Non-critical: proceed with upload even if pre-merge fails
                }
            }

            const categoryData = await exportCategories(enabledCategories, collectCharacters());
            const plan = await planSync(categoryData, enabledCategories, decryptPassphrase);

            if (Object.keys(plan.errors).length > 0) {
                const error = Object.values(plan.errors)[0] ?? FIREBASE_ERRORS.SYNC_FAILED;
                eventBus.emit('firebase.sync.error', { message: error });
                return { status: 'error', error };
            }

            // Heal the sync base for categories that already match the cloud
            recordCategorySyncState(plan.inSync);

            // Apply cloud-side changes (cloud moved, local did not)
            const applied: SyncCategory[] = [];
            const applyEntries = Object.entries(plan.applies) as
                Array<[SyncCategory, { data: string; checksum: string; syncedAt: string }]>;
            if (applyEntries.length > 0) {
                const toImport: Partial<Record<SyncCategory, string>> = {};
                for (const [category, entry] of applyEntries) {
                    toImport[category] = entry.data;
                }
                const importResult = await importCategories(toImport);
                const appliedChecksums: Partial<Record<SyncCategory, string>> = {};
                for (const [category, entry] of applyEntries) {
                    if (!importResult.errors[category]) {
                        appliedChecksums[category] = entry.checksum;
                        applied.push(category);
                    }
                }
                recordCategorySyncState(appliedChecksums);
                if (applied.length > 0) {
                    eventBus.emit('firebase.sync.applied', { categories: applied });
                }
            }

            const conflicts: CategoryConflictInfo[] = [...plan.conflicts];

            // Upload local-side changes
            let uploadedCategories: SyncCategory[] = [];
            let timestamps: CategorySyncTimes = {};
            if (plan.uploads.length > 0) {
                const uploadData: Partial<Record<SyncCategory, string>> = {};
                for (const category of plan.uploads) {
                    if (categoryData[category]) uploadData[category] = categoryData[category];
                }
                const uploadResult = await uploadCategories(uploadData, {
                    encrypted: settings.encryptionEnabled,
                    passphrase,
                });
                if (!uploadResult.success) {
                    const error = Object.values(uploadResult.errors)[0] ?? FIREBASE_ERRORS.SYNC_FAILED;
                    eventBus.emit('firebase.sync.error', { message: error });
                    return { status: 'error', error };
                }
                // The transaction may have found conflicts the plan could not
                // see yet (another device wrote in between)
                conflicts.push(...uploadResult.conflicts);

                // Tell the realtime listener these checksums are ours so the next
                // snapshot doesn't re-apply our own upload.
                syncListener.notifyLocalUpload(uploadResult.checksums);

                uploadedCategories = Object.keys(uploadResult.timestamps) as SyncCategory[];
                timestamps = uploadResult.timestamps;
                if (uploadedCategories.length > 0) {
                    eventBus.emit('firebase.sync.uploaded', {
                        categories: uploadedCategories,
                        timestamps,
                        encrypted: settings.encryptionEnabled,
                        auto,
                    });
                }
            }

            if (plan.pendingPassphrase.length > 0) {
                eventBus.emit('firebase.sync.pendingPassphrase', { categories: plan.pendingPassphrase });
            }

            if (conflicts.length > 0) {
                eventBus.emit('firebase.sync.conflict', { conflicts });
                return { status: 'conflict' };
            }

            if (uploadedCategories.length === 0 && applied.length === 0) {
                if (Object.keys(categoryData).length === 0 && Object.keys(plan.inSync).length === 0) {
                    return { status: 'skipped', reason: 'no-data' };
                }
                return { status: 'in-sync' };
            }
            return { status: 'uploaded', categories: uploadedCategories, applied, timestamps };
        } catch (err) {
            console.error('[SyncEngine] Sync failed', err);
            eventBus.emit('firebase.sync.error', { message: FIREBASE_ERRORS.SYNC_FAILED });
            return { status: 'error', error: FIREBASE_ERRORS.SYNC_FAILED };
        } finally {
            this.syncing = false;
            if (this.rerunAfterSync) {
                this.rerunAfterSync = false;
                if (this.watching && this.canAutoSync()) {
                    void this.syncNow(true);
                }
            }
        }
    }

    /**
     * Resolve conflicts for the given categories. Merge-capable categories
     * (see CATEGORY_REGISTRY merge strategies) are combined instead of
     * overwritten, so neither side's exclusive data is lost:
     * - 'append' (visitedRooms, killCounts, knowledge): cloud data is imported
     *   with union semantics and the merged result uploaded — identical for
     *   both resolutions, nothing is discarded.
     * - 'perCharacter' (characterSettings, deposits, ...): the chosen side wins
     *   for characters present on both, characters exclusive to either side
     *   are all kept.
     * - others: classic keep-local (force upload) / use-cloud (import).
     */
    async resolveConflicts(
        resolution: ConflictResolution,
        categories: SyncCategory[],
    ): Promise<{ success: boolean; error?: string }> {
        this.clearPendingConflicts(categories);
        if (resolution === 'cancel' || categories.length === 0) {
            return { success: true };
        }

        try {
            const settings = loadFirebaseSettings();
            const passphrase = settings.encryptionEnabled ? this.passphrase ?? undefined : undefined;
            const {
                collectCharacters, exportCategories, importCategories,
                mergeCloudProfessionData, mergePerCharacterEnvelopes,
            } = await import('@web/options/exportUtils');

            const append: SyncCategory[] = [];
            const perCharacter: SyncCategory[] = [];
            const whole: SyncCategory[] = [];
            for (const category of categories) {
                const merge = getCategoryDefinition(category)?.merge;
                if (merge === 'append') append.push(category);
                else if (merge === 'perCharacter') perCharacter.push(category);
                else whole.push(category);
            }

            // Cloud data is needed for merges and for use-cloud imports
            const needDownload = resolution === 'use-cloud'
                ? categories
                : [...append, ...perCharacter];
            let cloudData: Partial<Record<SyncCategory, string>> = {};
            if (needDownload.length > 0) {
                const download = await downloadCategories(needDownload, this.passphrase ?? undefined);
                if (!download.success) {
                    const firstError = Object.values(download.errors)[0];
                    return { success: false, error: firstError ?? FIREBASE_ERRORS.SYNC_FAILED };
                }
                cloudData = download.data;
            }

            // CRDT premerge for profession data before characterSettings is merged
            if (cloudData.characterSettings) {
                mergeCloudProfessionData(cloudData.characterSettings);
            }

            const characters = collectCharacters();
            const localExports = await exportCategories(
                [...append, ...perCharacter],
                characters,
            );

            const toImport: Partial<Record<SyncCategory, string>> = {};
            // Append-only data: import performs a union — same for both choices
            for (const category of append) {
                if (cloudData[category]) toImport[category] = cloudData[category];
            }
            // Per-character maps: chosen side wins overlapping characters,
            // exclusive characters from both sides survive
            for (const category of perCharacter) {
                const cloud = cloudData[category];
                const local = localExports[category];
                if (cloud && local) {
                    toImport[category] = resolution === 'keep-local'
                        ? mergePerCharacterEnvelopes(local, cloud)
                        : mergePerCharacterEnvelopes(cloud, local);
                } else if (cloud && resolution === 'use-cloud') {
                    toImport[category] = cloud;
                }
            }
            // Opaque whole-value data: import only when the cloud side was chosen
            if (resolution === 'use-cloud') {
                for (const category of whole) {
                    if (cloudData[category]) toImport[category] = cloudData[category];
                }
            }

            if (Object.keys(toImport).length > 0) {
                const importResult = await importCategories(toImport);
                if (!importResult.success) {
                    const firstError = Object.values(importResult.errors)[0];
                    return { success: false, error: firstError ?? FIREBASE_ERRORS.SYNC_FAILED };
                }
                eventBus.emit('firebase.sync.applied', {
                    categories: Object.keys(toImport) as SyncCategory[],
                });
            }

            // Upload the resolved state. keep-local: everything (forced).
            // use-cloud: only merged categories — the cloud may lack local-only
            // characters / records that the merge just preserved.
            const toUpload = resolution === 'keep-local'
                ? categories
                : [...append, ...perCharacter];
            if (toUpload.length > 0) {
                const uploadData = await exportCategories(toUpload, collectCharacters());
                const uploadResult = await uploadCategories(uploadData, {
                    encrypted: settings.encryptionEnabled,
                    passphrase,
                    force: true,
                });
                if (!uploadResult.success) {
                    const firstError = Object.values(uploadResult.errors)[0];
                    return { success: false, error: firstError ?? FIREBASE_ERRORS.SYNC_FAILED };
                }
                syncListener.notifyLocalUpload(uploadResult.checksums);
                eventBus.emit('firebase.sync.uploaded', {
                    categories: Object.keys(uploadData) as SyncCategory[],
                    timestamps: uploadResult.timestamps,
                    encrypted: settings.encryptionEnabled,
                    auto: false,
                });
            }

            // For use-cloud whole-value categories nothing was uploaded — record
            // the cloud checksum as the new sync base directly.
            if (resolution === 'use-cloud' && whole.length > 0) {
                const download = await downloadCategories(whole, this.passphrase ?? undefined);
                const baseChecksums: Partial<Record<SyncCategory, string>> = {};
                for (const category of whole) {
                    const payload = download.payloads[category];
                    if (payload) baseChecksums[category] = payload.checksum;
                }
                recordCategorySyncState(baseChecksums);
            }

            return { success: true };
        } catch (err) {
            console.error('[SyncEngine] Conflict resolution failed', err);
            return { success: false, error: FIREBASE_ERRORS.SYNC_FAILED };
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
