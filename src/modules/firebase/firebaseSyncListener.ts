/**
 * Firebase Sync Listener
 *
 * Manages a Firestore onSnapshot listener on the unified sync document.
 * Processes incoming remote changes and applies them locally.
 * Communicates state changes via eventBus.
 */

import type { Unsubscribe } from 'firebase/firestore';
import type { SyncCategory, CategoryPayload, CategoryConflictInfo } from './firebaseTypes';
import { getDeviceId, loadFirebaseSettings, SYNC_CATEGORIES } from './firebaseTypes';
import { ensureFirebaseInitialized } from './firebaseConfig';
import { calculateChecksum, decrypt, isEncryptedData } from './firebaseCrypto';
import { updateCache, updateCategorySyncTime } from './firebaseUnifiedSync';
import type { UnifiedSyncData } from './firebaseUnifiedSync';
import type { FirebaseSyncMetadataPayload } from '@shared/events/clientEvents';
import eventBus from '@modules/core/eventBus';

class FirebaseSyncListener {
    private lastKnownChecksums: Partial<Record<SyncCategory, string>> = {};
    private pendingEncryptedPayloads: Partial<Record<SyncCategory, CategoryPayload>> = {};
    private active = false;
    private unsubscribe: Unsubscribe | null = null;
    private passphrase: string | null = null;
    private isInitialSnapshot = true;
    private processing = false;

    async start(userId: string): Promise<void> {
        if ((window as { __DISABLE_FIREBASE__?: boolean }).__DISABLE_FIREBASE__) {
            return;
        }

        this.stop();

        try {
            const { db } = await ensureFirebaseInitialized();
            const { doc, onSnapshot } = await import('firebase/firestore');

            const docRef = doc(db, 'users', userId, 'sync', 'syncData');

            this.isInitialSnapshot = true;
            this.active = true;

            this.unsubscribe = onSnapshot(
                docRef,
                (snapshot) => {
                    const data = snapshot.exists()
                        ? snapshot.data() as UnifiedSyncData
                        : null;
                    this.handleSnapshot(data).catch(err => {
                        console.error('[SyncListener] Error processing snapshot', err);
                        eventBus.emit('firebase.sync.error', {
                            message: err instanceof Error ? err.message : 'Unknown error',
                        });
                    });
                },
                (error) => {
                    console.error('[SyncListener] onSnapshot error', error);
                    eventBus.emit('firebase.sync.error', { message: error.message });
                    this.active = false;
                    eventBus.emit('firebase.listener.status', { active: false });
                },
            );

            eventBus.emit('firebase.listener.status', { active: true });
            console.log('[SyncListener] Started for user', userId);
        } catch (err) {
            console.error('[SyncListener] Failed to start', err);
            this.active = false;
            eventBus.emit('firebase.listener.status', { active: false });
        }
    }

    stop(): void {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        this.active = false;
        this.isInitialSnapshot = true;
        this.lastKnownChecksums = {};
        this.pendingEncryptedPayloads = {};
        this.processing = false;
        eventBus.emit('firebase.listener.status', { active: false });
    }

    setPassphrase(passphrase: string | null): void {
        this.passphrase = passphrase;
        if (passphrase && Object.keys(this.pendingEncryptedPayloads).length > 0) {
            this.retryPendingPayloads().catch(err => {
                console.error('[SyncListener] Error retrying pending payloads', err);
            });
        }
    }

    notifyLocalUpload(checksums: Partial<Record<SyncCategory, string>>): void {
        for (const [cat, checksum] of Object.entries(checksums)) {
            if (checksum) {
                this.lastKnownChecksums[cat as SyncCategory] = checksum;
            }
        }
    }

    isActive(): boolean {
        return this.active;
    }

    private async handleSnapshot(data: UnifiedSyncData | null): Promise<void> {
        if (this.processing) return;
        this.processing = true;

        try {
            const cloudCategories = data?.categories || {};

            // Always update cache with fresh data
            if (data) {
                updateCache(data);
            }

            // Always emit metadata
            const metadata = this.buildMetadata(cloudCategories);
            eventBus.emit('firebase.sync.metadata', metadata);

            // On initial snapshot, just record checksums
            if (this.isInitialSnapshot) {
                this.isInitialSnapshot = false;
                for (const cat of SYNC_CATEGORIES) {
                    const payload = cloudCategories[cat];
                    if (payload) {
                        this.lastKnownChecksums[cat] = payload.checksum;
                    }
                }
                return;
            }

            const settings = loadFirebaseSettings();
            if (!settings.autoSyncEnabled) return;

            const enabledCategories = SYNC_CATEGORIES.filter(cat => settings.syncOptions[cat]);
            const deviceId = getDeviceId();

            const applied: SyncCategory[] = [];
            const pendingPassphrase: SyncCategory[] = [];
            const conflicts: CategoryConflictInfo[] = [];

            for (const category of enabledCategories) {
                const payload = cloudCategories[category];
                if (!payload) continue;

                // Skip if checksum hasn't changed
                if (this.lastKnownChecksums[category] === payload.checksum) continue;

                // Skip own-device changes
                if (payload.deviceId === deviceId) {
                    this.lastKnownChecksums[category] = payload.checksum;
                    continue;
                }

                const result = await this.processCategory(category, payload);
                this.lastKnownChecksums[category] = payload.checksum;

                switch (result) {
                    case 'applied': applied.push(category); break;
                    case 'pending-passphrase': pendingPassphrase.push(category); break;
                    case 'conflict':
                        conflicts.push({
                            category,
                            localTimestamp: settings.categorySyncTimes[category] ?? 0,
                            cloudTimestamp: new Date(payload.syncedAt).getTime(),
                            localChecksum: '',
                            cloudChecksum: payload.checksum,
                            cloudData: payload,
                        });
                        break;
                }
            }

            if (applied.length > 0) {
                eventBus.emit('firebase.sync.applied', { categories: applied });
            }
            if (pendingPassphrase.length > 0) {
                eventBus.emit('firebase.sync.pendingPassphrase', { categories: pendingPassphrase });
            }
            if (conflicts.length > 0) {
                eventBus.emit('firebase.sync.conflict', { conflicts });
            }
        } finally {
            this.processing = false;
        }
    }

    private async processCategory(
        category: SyncCategory,
        payload: CategoryPayload,
    ): Promise<'applied' | 'conflict' | 'pending-passphrase' | 'skipped'> {
        // Handle encrypted data
        if (payload.encrypted) {
            if (!this.passphrase) {
                this.pendingEncryptedPayloads[category] = payload;
                return 'pending-passphrase';
            }
            try {
                const encryptedData = JSON.parse(payload.data);
                if (!isEncryptedData(encryptedData)) return 'skipped';
                const decryptedData = await decrypt(encryptedData, this.passphrase);
                return await this.applyOrConflict(category, decryptedData, payload);
            } catch {
                this.pendingEncryptedPayloads[category] = payload;
                return 'pending-passphrase';
            }
        }

        return await this.applyOrConflict(category, payload.data, payload);
    }

    private async applyOrConflict(
        category: SyncCategory,
        decryptedData: string,
        payload: CategoryPayload,
    ): Promise<'applied' | 'conflict' | 'skipped'> {
        const { exportCategories, collectCharacters } = await import('@web/options/exportUtils');
        const allCharacters = collectCharacters();
        const localData = await exportCategories([category], allCharacters);
        const localCategoryData = localData[category];

        if (localCategoryData) {
            const localChecksum = await calculateChecksum(localCategoryData);

            // Already in sync
            if (localChecksum === payload.checksum) return 'skipped';

            // Check if local data changed since we last synced
            const lastKnown = this.lastKnownChecksums[category];
            if (lastKnown && localChecksum !== lastKnown) {
                // Local has changed AND cloud has changed = conflict
                return 'conflict';
            }
        }

        // Pre-merge CRDT for characterSettings (profession data)
        if (category === 'characterSettings') {
            const { mergeCloudProfessionData } = await import('@web/options/exportUtils');
            mergeCloudProfessionData(decryptedData);
        }

        const { importCategory } = await import('@web/options/exportUtils');
        const result = await importCategory(category, decryptedData);

        if (result.success) {
            updateCategorySyncTime(category, Date.now());
            return 'applied';
        }

        return 'skipped';
    }

    private async retryPendingPayloads(): Promise<void> {
        if (!this.passphrase) return;

        const pending = { ...this.pendingEncryptedPayloads };
        this.pendingEncryptedPayloads = {};

        const applied: SyncCategory[] = [];

        for (const [cat, payload] of Object.entries(pending) as [SyncCategory, CategoryPayload][]) {
            const result = await this.processCategory(cat, payload);
            if (result === 'applied') {
                applied.push(cat);
                this.lastKnownChecksums[cat] = payload.checksum;
            } else if (result === 'pending-passphrase') {
                // Still can't decrypt — remains in pendingEncryptedPayloads
            }
        }

        if (applied.length > 0) {
            eventBus.emit('firebase.sync.applied', { categories: applied });
        }
    }

    private buildMetadata(
        categories: { [K in SyncCategory]?: CategoryPayload },
    ): FirebaseSyncMetadataPayload {
        const metadata: FirebaseSyncMetadataPayload = {};
        for (const cat of SYNC_CATEGORIES) {
            const payload = categories[cat];
            if (payload) {
                metadata[cat] = {
                    exists: true,
                    syncedAt: payload.syncedAt,
                    deviceId: payload.deviceId,
                    encrypted: payload.encrypted,
                };
            }
        }
        return metadata;
    }
}

export const syncListener = new FirebaseSyncListener();
