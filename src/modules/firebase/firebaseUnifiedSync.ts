/**
 * Firebase Unified Sync Module
 *
 * SINGLE DOCUMENT approach for all user data to minimize reads:
 * - Categories (triggers, aliases, variables, uiSettings)
 * - Device registry
 * - Sync groups and settings
 *
 * Structure: users/{userId}/syncData (one document)
 */

import type {DeviceInfo, SyncConflict, SyncedDeviceSettings, SyncGroup} from '@modules/device';
import {
    applySyncedSettings,
    calculateSettingsChecksum,
    clearSyncState,
    getDeviceDisplayName,
    getDeviceInfo,
    getRawDeviceSettings,
    getSyncState,
    setSyncState,
} from '@modules/device';
import type {
    CategoryConflictInfo,
    CategoryPayload,
    CategorySyncTimes,
    EncryptedData,
    SyncCategory
} from './firebaseTypes';
import {
    FIREBASE_ERRORS,
    getDeviceId,
    loadFirebaseSettings,
    saveFirebaseSettings,
    SYNC_CATEGORIES
} from './firebaseTypes';
import {ensureFirebaseInitialized, getFirebaseAuth} from './firebaseConfig';
import {calculateChecksum, decrypt, encrypt, isEncryptedData} from './firebaseCrypto';

// Single document path
const USERS_COLLECTION = 'users';
const SYNC_DATA_DOC = 'syncData';

// Rate limiting: max 1 sync check per 10 minutes
export const SYNC_CHECK_INTERVAL_MS = 10 * 60 * 1000;

// ============================================================================
// Unified Document Structure
// ============================================================================

interface UnifiedSyncData {
    // Categories (triggers, aliases, variables, uiSettings)
    categories?: {
        [K in SyncCategory]?: CategoryPayload;
    };
    // Device registry
    devices?: { [deviceId: string]: DeviceInfo };
    // Sync group (null if not in a group)
    group?: SyncGroup | null;
    // Device synced settings (null if no group)
    deviceSettings?: SyncedDeviceSettings | null;
    // Last update timestamp
    updatedAt?: unknown; // serverTimestamp
}

// Local cache of the full document (to avoid re-reading)
let cachedSyncData: UnifiedSyncData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isCacheValid(): boolean {
    return cachedSyncData !== null && (Date.now() - cacheTimestamp) < CACHE_TTL_MS;
}

function invalidateCache(): void {
    cachedSyncData = null;
    cacheTimestamp = 0;
}

// ============================================================================
// Core Read/Write Operations
// ============================================================================

/**
 * Get the full sync document (single read)
 * Uses cache if available and valid
 */
export async function getFullSyncData(forceRefresh = false): Promise<{
    data: UnifiedSyncData | null;
    error?: string;
}> {
    // Return cached if valid
    if (!forceRefresh && isCacheValid()) {
        return { data: cachedSyncData };
    }

    try {
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { data: null, error: FIREBASE_ERRORS.AUTH_FAILED };
        }

        const { db } = await ensureFirebaseInitialized();
        const { doc, getDoc } = await import('firebase/firestore');

        const docRef = doc(db, USERS_COLLECTION, userId, 'sync', SYNC_DATA_DOC);
        console.log(`[Firebase READ] getFullSyncData`);
        const snapshot = await getDoc(docRef);

        if (!snapshot.exists()) {
            cachedSyncData = {};
            cacheTimestamp = Date.now();
            return { data: {} };
        }

        cachedSyncData = snapshot.data() as UnifiedSyncData;
        cacheTimestamp = Date.now();
        return { data: cachedSyncData };
    } catch (err) {
        console.error('Failed to get sync data', err);
        return { data: null, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

/**
 * Update parts of the sync document (merge write)
 */
async function updateSyncData(updates: Partial<UnifiedSyncData>): Promise<{ success: boolean; error?: string }> {
    try {
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { success: false, error: FIREBASE_ERRORS.AUTH_FAILED };
        }

        const { db } = await ensureFirebaseInitialized();
        const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');

        const docRef = doc(db, USERS_COLLECTION, userId, 'sync', SYNC_DATA_DOC);
        console.log(`[Firebase WRITE] updateSyncData`, Object.keys(updates));
        await setDoc(docRef, {
            ...updates,
            updatedAt: serverTimestamp(),
        }, { merge: true });

        // Invalidate cache after write
        invalidateCache();

        return { success: true };
    } catch (err) {
        console.error('Failed to update sync data', err);
        return { success: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

// ============================================================================
// Category Sync (triggers, aliases, variables, uiSettings)
// ============================================================================

export function canPerformSyncCheck(): boolean {
    const settings = loadFirebaseSettings();
    const now = Date.now();
    return now - (settings.lastSyncCheckTime || 0) >= SYNC_CHECK_INTERVAL_MS;
}

export function updateLastSyncCheckTime(): void {
    saveFirebaseSettings({ lastSyncCheckTime: Date.now() });
}

/**
 * Upload categories to the unified document
 */
export async function uploadCategories(
    categoryData: Partial<Record<SyncCategory, string>>,
    options: { encrypted: boolean; passphrase?: string }
): Promise<{ success: boolean; errors: Partial<Record<SyncCategory, string>>; timestamps: CategorySyncTimes }> {
    const errors: Partial<Record<SyncCategory, string>> = {};
    const timestamps: CategorySyncTimes = {};

    try {
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { success: false, errors: { uiSettings: FIREBASE_ERRORS.AUTH_FAILED }, timestamps };
        }

        const { db } = await ensureFirebaseInitialized();
        const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');

        const categories = Object.keys(categoryData) as SyncCategory[];
        const now = Date.now();
        const deviceId = getDeviceId();

        // Build category payloads
        const categoryUpdates: { [key: string]: CategoryPayload } = {};

        for (const category of categories) {
            const data = categoryData[category];
            if (!data) continue;

            try {
                const checksum = await calculateChecksum(data);
                let finalData: string;

                if (options.encrypted && options.passphrase) {
                    const encryptedData = await encrypt(data, options.passphrase);
                    finalData = JSON.stringify(encryptedData);
                } else {
                    finalData = data;
                }

                categoryUpdates[`categories.${category}`] = {
                    version: 1,
                    syncedAt: new Date().toISOString(),
                    deviceId,
                    checksum,
                    encrypted: options.encrypted,
                    data: finalData,
                };

                timestamps[category] = now;
            } catch (err) {
                console.error(`Failed to prepare category ${category}`, err);
                errors[category] = FIREBASE_ERRORS.SYNC_FAILED;
            }
        }

        // Single write with all category updates
        const docRef = doc(db, USERS_COLLECTION, userId, 'sync', SYNC_DATA_DOC);
        console.log(`[Firebase WRITE] uploadCategories: ${categories.length} categories`);
        await setDoc(docRef, {
            ...categoryUpdates,
            updatedAt: serverTimestamp(),
        }, { merge: true });

        invalidateCache();

        // Update local sync times
        const settings = loadFirebaseSettings();
        const updatedTimes: CategorySyncTimes = { ...settings.categorySyncTimes, ...timestamps };
        saveFirebaseSettings({ categorySyncTimes: updatedTimes });

    } catch (err) {
        console.error('Failed to upload categories', err);
        return { success: false, errors: { uiSettings: FIREBASE_ERRORS.SYNC_FAILED }, timestamps };
    }

    const success = Object.keys(errors).length === 0;
    return { success, errors, timestamps };
}

export interface DownloadedCategoryMeta {
    checksum: string;
    deviceId: string;
    syncedAt: string;
    encrypted: boolean;
}

/**
 * Download categories from the unified document (uses cached data if available)
 */
export async function downloadCategories(
    categories: SyncCategory[],
    passphrase?: string
): Promise<{
    success: boolean;
    data: Partial<Record<SyncCategory, string>>;
    payloads: Partial<Record<SyncCategory, DownloadedCategoryMeta>>;
    errors: Partial<Record<SyncCategory, string>>;
}> {
    const data: Partial<Record<SyncCategory, string>> = {};
    const payloads: Partial<Record<SyncCategory, DownloadedCategoryMeta>> = {};
    const errors: Partial<Record<SyncCategory, string>> = {};

    try {
        const { data: syncData, error } = await getFullSyncData();
        if (error || !syncData) {
            return { success: false, data, payloads, errors: { uiSettings: error || FIREBASE_ERRORS.SYNC_FAILED } };
        }

        const cloudCategories = syncData.categories || {};

        for (const category of categories) {
            const payload = cloudCategories[category];
            if (!payload) continue;

            try {
                let categoryData: string;

                if (payload.encrypted) {
                    if (!passphrase) {
                        errors[category] = FIREBASE_ERRORS.WRONG_PASSPHRASE;
                        continue;
                    }
                    try {
                        const encryptedData = JSON.parse(payload.data);
                        if (!isEncryptedData(encryptedData)) {
                            errors[category] = FIREBASE_ERRORS.DECRYPTION_FAILED;
                            continue;
                        }
                        categoryData = await decrypt(encryptedData as EncryptedData, passphrase);
                    } catch {
                        errors[category] = FIREBASE_ERRORS.DECRYPTION_FAILED;
                        continue;
                    }
                } else {
                    categoryData = payload.data;
                }

                // Verify checksum
                const checksum = await calculateChecksum(categoryData);
                if (checksum !== payload.checksum) {
                    console.warn(`Checksum mismatch for category ${category}`);
                }

                data[category] = categoryData;
                payloads[category] = {
                    checksum: payload.checksum,
                    deviceId: payload.deviceId,
                    syncedAt: payload.syncedAt,
                    encrypted: payload.encrypted,
                };
            } catch (err) {
                console.error(`Failed to process category ${category}`, err);
                errors[category] = FIREBASE_ERRORS.SYNC_FAILED;
            }
        }
    } catch (err) {
        console.error('Failed to download categories', err);
        return { success: false, data, payloads, errors: { uiSettings: FIREBASE_ERRORS.SYNC_FAILED } };
    }

    const success = Object.keys(errors).length === 0;
    return { success, data, payloads, errors };
}

/**
 * Check for conflicts on multiple categories (uses single read via cache)
 */
export async function checkCategoriesConflicts(
    categoryData: Partial<Record<SyncCategory, string>>
): Promise<{
    conflicts: CategoryConflictInfo[];
    errors: Partial<Record<SyncCategory, string>>;
}> {
    const conflicts: CategoryConflictInfo[] = [];
    const errors: Partial<Record<SyncCategory, string>> = {};

    try {
        const { data: syncData, error } = await getFullSyncData();
        if (error || !syncData) {
            return { conflicts, errors: { uiSettings: error || FIREBASE_ERRORS.SYNC_FAILED } };
        }

        const cloudCategories = syncData.categories || {};
        const categories = Object.keys(categoryData) as SyncCategory[];
        const settings = loadFirebaseSettings();
        const deviceId = getDeviceId();

        for (const category of categories) {
            const localData = categoryData[category];
            if (!localData) continue;

            const cloudPayload = cloudCategories[category];
            if (!cloudPayload) continue;

            try {
                const localChecksum = await calculateChecksum(localData);
                if (localChecksum === cloudPayload.checksum) continue;

                if (cloudPayload.deviceId !== deviceId) {
                    const cloudTimestamp = new Date(cloudPayload.syncedAt).getTime();
                    const localTimestamp = settings.categorySyncTimes[category] ?? 0;

                    if (cloudTimestamp > localTimestamp) {
                        conflicts.push({
                            category,
                            localTimestamp,
                            cloudTimestamp,
                            localChecksum,
                            cloudChecksum: cloudPayload.checksum,
                            cloudData: cloudPayload,
                        });
                    }
                }
            } catch (err) {
                console.error(`Failed to check conflict for category ${category}`, err);
                errors[category] = FIREBASE_ERRORS.SYNC_FAILED;
            }
        }
    } catch (err) {
        console.error('Failed to check conflicts', err);
        return { conflicts, errors: { uiSettings: FIREBASE_ERRORS.SYNC_FAILED } };
    }

    return { conflicts, errors };
}

/**
 * Check for category conflicts using cached data (no extra read)
 */
export async function checkConflictsLocally(
    localData: Partial<Record<SyncCategory, string>>,
    cloudPayloads: Partial<Record<SyncCategory, DownloadedCategoryMeta>>
): Promise<CategoryConflictInfo[]> {
    const conflicts: CategoryConflictInfo[] = [];
    const settings = loadFirebaseSettings();
    const deviceId = getDeviceId();

    for (const category of Object.keys(localData) as SyncCategory[]) {
        const cloudMeta = cloudPayloads[category];
        if (!cloudMeta) continue;

        const localDataStr = localData[category];
        if (!localDataStr) continue;

        const localChecksum = await calculateChecksum(localDataStr);
        if (localChecksum === cloudMeta.checksum) continue;

        if (cloudMeta.deviceId !== deviceId) {
            const cloudTimestamp = new Date(cloudMeta.syncedAt).getTime();
            const localTimestamp = settings.categorySyncTimes[category] ?? 0;

            if (cloudTimestamp > localTimestamp) {
                conflicts.push({
                    category,
                    localTimestamp,
                    cloudTimestamp,
                    localChecksum,
                    cloudChecksum: cloudMeta.checksum,
                    cloudData: {
                        version: 1,
                        syncedAt: cloudMeta.syncedAt,
                        deviceId: cloudMeta.deviceId,
                        checksum: cloudMeta.checksum,
                        encrypted: cloudMeta.encrypted,
                        data: '',
                    },
                });
            }
        }
    }

    return conflicts;
}

/**
 * Get metadata for all categories (uses cache)
 */
export async function getAllCategoriesMetadata(): Promise<{
    categories: Partial<Record<SyncCategory, {
        exists: boolean;
        syncedAt?: string;
        deviceId?: string;
        encrypted?: boolean;
    }>>;
    error?: string;
}> {
    const { data: syncData, error } = await getFullSyncData();
    if (error || !syncData) {
        return { categories: {}, error };
    }

    const categories: Partial<Record<SyncCategory, {
        exists: boolean;
        syncedAt?: string;
        deviceId?: string;
        encrypted?: boolean;
    }>> = {};

    const cloudCategories = syncData.categories || {};
    for (const category of SYNC_CATEGORIES) {
        const payload = cloudCategories[category];
        if (payload) {
            categories[category] = {
                exists: true,
                syncedAt: payload.syncedAt,
                deviceId: payload.deviceId,
                encrypted: payload.encrypted,
            };
        }
    }

    return { categories };
}

/**
 * Delete a category from the unified document
 */
export async function deleteCategory(category: SyncCategory): Promise<{ success: boolean; error?: string }> {
    try {
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { success: false, error: FIREBASE_ERRORS.AUTH_FAILED };
        }

        const { db } = await ensureFirebaseInitialized();
        const { doc, updateDoc, deleteField } = await import('firebase/firestore');

        const docRef = doc(db, USERS_COLLECTION, userId, 'sync', SYNC_DATA_DOC);
        console.log(`[Firebase WRITE] deleteCategory: ${category}`);
        await updateDoc(docRef, {
            [`categories.${category}`]: deleteField(),
        });

        invalidateCache();

        // Clear local sync time
        const settings = loadFirebaseSettings();
        const updatedTimes = { ...settings.categorySyncTimes };
        delete updatedTimes[category];
        saveFirebaseSettings({ categorySyncTimes: updatedTimes });

        return { success: true };
    } catch (err) {
        console.error(`Failed to delete category ${category}`, err);
        return { success: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

/**
 * Delete all categories
 */
export async function deleteAllCategories(): Promise<{ success: boolean; errors: Partial<Record<SyncCategory, string>> }> {
    try {
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { success: false, errors: { uiSettings: FIREBASE_ERRORS.AUTH_FAILED } };
        }

        const { db } = await ensureFirebaseInitialized();
        const { doc, updateDoc, deleteField } = await import('firebase/firestore');

        const docRef = doc(db, USERS_COLLECTION, userId, 'sync', SYNC_DATA_DOC);
        console.log(`[Firebase WRITE] deleteAllCategories`);
        await updateDoc(docRef, {
            categories: deleteField(),
        });

        invalidateCache();

        // Clear all local sync times
        saveFirebaseSettings({ categorySyncTimes: {} });

        return { success: true, errors: {} };
    } catch (err) {
        console.error('Failed to delete all categories', err);
        return { success: false, errors: { uiSettings: FIREBASE_ERRORS.SYNC_FAILED } };
    }
}

export function updateCategorySyncTime(category: SyncCategory, timestamp?: number): void {
    const settings = loadFirebaseSettings();
    const updatedTimes: CategorySyncTimes = {
        ...settings.categorySyncTimes,
        [category]: timestamp ?? Date.now(),
    };
    saveFirebaseSettings({ categorySyncTimes: updatedTimes });
}

// ============================================================================
// Device Registry
// ============================================================================

/**
 * Register current device (uses merge write)
 */
export async function registerDevice(): Promise<{ success: boolean; error?: string }> {
    try {
        const deviceInfo = getDeviceInfo();
        return await updateSyncData({
            [`devices.${deviceInfo.id}` as keyof UnifiedSyncData]: {
                ...deviceInfo,
                lastSeen: new Date().toISOString(),
            } as unknown as UnifiedSyncData[keyof UnifiedSyncData],
        });
    } catch (err) {
        console.error('Failed to register device', err);
        return { success: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

/**
 * Get all registered devices (from cache if available)
 */
export async function getRegisteredDevices(): Promise<{
    devices: DeviceInfo[];
    error?: string;
}> {
    const { data: syncData, error } = await getFullSyncData();
    if (error || !syncData) {
        return { devices: [], error };
    }

    const devices: DeviceInfo[] = [];
    if (syncData.devices && typeof syncData.devices === 'object') {
        Object.values(syncData.devices).forEach((device: unknown) => {
            if (device && typeof device === 'object' && 'id' in device) {
                devices.push(device as DeviceInfo);
            }
        });
    }

    return { devices };
}

/**
 * Unregister a device
 */
export async function unregisterDevice(deviceId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { success: false, error: FIREBASE_ERRORS.AUTH_FAILED };
        }

        const { db } = await ensureFirebaseInitialized();
        const { doc, updateDoc, deleteField } = await import('firebase/firestore');

        const docRef = doc(db, USERS_COLLECTION, userId, 'sync', SYNC_DATA_DOC);
        console.log(`[Firebase WRITE] unregisterDevice: ${deviceId}`);
        await updateDoc(docRef, {
            [`devices.${deviceId}`]: deleteField(),
        });

        invalidateCache();
        return { success: true };
    } catch (err) {
        console.error('Failed to unregister device', err);
        return { success: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

// ============================================================================
// Sync Groups (device settings sharing)
// ============================================================================

/**
 * Create a new sync group
 */
export async function createSyncGroup(name: string): Promise<{
    success: boolean;
    group?: SyncGroup;
    error?: string;
}> {
    try {
        const deviceInfo = getDeviceInfo();
        const now = new Date().toISOString();
        const checksum = await calculateSettingsChecksum();

        const group: SyncGroup = {
            id: crypto.randomUUID(),
            name: name.trim() || 'Moje urzadzenia',
            devices: [deviceInfo.id],
            createdAt: now,
            updatedAt: now,
        };

        const deviceSettings: SyncedDeviceSettings = {
            groupId: group.id,
            version: 1,
            updatedAt: now,
            updatedByDeviceId: deviceInfo.id,
            checksum,
            settings: getRawDeviceSettings(),
        };

        const result = await updateSyncData({ group, deviceSettings });
        if (!result.success) {
            return { success: false, error: result.error };
        }

        setSyncState({ group, version: 1 });
        return { success: true, group };
    } catch (err) {
        console.error('Failed to create sync group', err);
        return { success: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

/**
 * Join an existing sync group
 */
export async function joinSyncGroup(groupId: string): Promise<{
    success: boolean;
    group?: SyncGroup;
    error?: string;
}> {
    try {
        const { data: syncData, error } = await getFullSyncData(true); // Force refresh
        if (error || !syncData) {
            return { success: false, error: error || FIREBASE_ERRORS.SYNC_FAILED };
        }

        if (!syncData.group || syncData.group.id !== groupId) {
            return { success: false, error: 'Grupa synchronizacji nie istnieje.' };
        }

        const deviceInfo = getDeviceInfo();
        const group = { ...syncData.group };

        if (!group.devices.includes(deviceInfo.id)) {
            group.devices.push(deviceInfo.id);
            group.updatedAt = new Date().toISOString();
            await updateSyncData({ group });
        }

        if (syncData.deviceSettings) {
            applySyncedSettings(syncData.deviceSettings);
        }

        setSyncState({ group, version: syncData.deviceSettings?.version ?? 1 });
        return { success: true, group };
    } catch (err) {
        console.error('Failed to join sync group', err);
        return { success: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

/**
 * Leave the current sync group
 */
export async function leaveSyncGroupCloud(): Promise<{ success: boolean; error?: string }> {
    try {
        const state = getSyncState();
        if (!state) {
            return { success: true };
        }

        const { data: syncData, error } = await getFullSyncData(true);
        if (error) {
            return { success: false, error };
        }

        if (syncData?.group) {
            const deviceInfo = getDeviceInfo();
            const group = { ...syncData.group };
            group.devices = group.devices.filter(id => id !== deviceInfo.id);

            const auth = getFirebaseAuth();
            const userId = auth?.currentUser?.uid;
            if (!userId) {
                return { success: false, error: FIREBASE_ERRORS.AUTH_FAILED };
            }

            const { db } = await ensureFirebaseInitialized();
            const { doc, setDoc, serverTimestamp, deleteField } = await import('firebase/firestore');
            const docRef = doc(db, USERS_COLLECTION, userId, 'sync', SYNC_DATA_DOC);

            if (group.devices.length === 0) {
                console.log(`[Firebase WRITE] leaveSyncGroupCloud: clearing group (last device)`);
                await setDoc(docRef, {
                    group: deleteField(),
                    deviceSettings: deleteField(),
                    updatedAt: serverTimestamp(),
                }, { merge: true });
            } else {
                console.log(`[Firebase WRITE] leaveSyncGroupCloud: removing device`);
                await setDoc(docRef, {
                    group,
                    updatedAt: serverTimestamp(),
                }, { merge: true });
            }

            invalidateCache();
        }

        clearSyncState();
        return { success: true };
    } catch (err) {
        console.error('Failed to leave sync group', err);
        return { success: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

/**
 * Upload current device settings to sync group
 */
export async function uploadSyncedSettings(): Promise<{ success: boolean; error?: string }> {
    try {
        const state = getSyncState();
        if (!state) {
            return { success: false, error: 'Nie nalezysz do zadnej grupy synchronizacji.' };
        }

        const deviceInfo = getDeviceInfo();
        const checksum = await calculateSettingsChecksum();
        const newVersion = state.version + 1;
        const now = new Date().toISOString();

        const deviceSettings: SyncedDeviceSettings = {
            groupId: state.group.id,
            version: newVersion,
            updatedAt: now,
            updatedByDeviceId: deviceInfo.id,
            checksum,
            settings: getRawDeviceSettings(),
        };

        const result = await updateSyncData({ deviceSettings });
        if (!result.success) {
            return { success: false, error: result.error };
        }

        setSyncState({ ...state, version: newVersion });
        return { success: true };
    } catch (err) {
        console.error('Failed to upload synced settings', err);
        return { success: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

/**
 * Check for sync updates (from cache after initial read)
 */
export async function checkForSyncUpdates(): Promise<{
    hasUpdate: boolean;
    conflict?: SyncConflict;
    error?: string;
}> {
    try {
        const state = getSyncState();
        if (!state) {
            return { hasUpdate: false };
        }

        const { data: syncData, error } = await getFullSyncData(true); // Force refresh for sync check
        if (error || !syncData) {
            return { hasUpdate: false, error };
        }

        if (!syncData.deviceSettings) {
            return { hasUpdate: false };
        }

        const deviceInfo = getDeviceInfo();
        const localChecksum = await calculateSettingsChecksum();

        if (syncData.deviceSettings.checksum === localChecksum) {
            return { hasUpdate: false };
        }

        if (syncData.deviceSettings.updatedByDeviceId === deviceInfo.id) {
            return { hasUpdate: false };
        }

        if (syncData.deviceSettings.version > state.version) {
            const conflict: SyncConflict = {
                groupId: state.group.id,
                localVersion: state.version,
                remoteVersion: syncData.deviceSettings.version,
                remoteUpdatedBy: syncData.deviceSettings.updatedByDeviceId,
                remoteUpdatedAt: syncData.deviceSettings.updatedAt,
                remoteSettings: syncData.deviceSettings,
            };
            return { hasUpdate: true, conflict };
        }

        return { hasUpdate: false };
    } catch (err) {
        console.error('Failed to check for sync updates', err);
        return { hasUpdate: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

/**
 * Resolve sync conflict
 */
export async function resolveSyncConflict(
    choice: 'keep-local' | 'use-remote',
    conflict: SyncConflict
): Promise<{ success: boolean; error?: string }> {
    try {
        if (choice === 'use-remote') {
            applySyncedSettings(conflict.remoteSettings);
            const state = getSyncState();
            if (state) {
                setSyncState({ ...state, version: conflict.remoteVersion });
            }
            return { success: true };
        } else {
            // When keeping local, we must bump the version to be higher than remote
            // so other devices will accept the update
            const state = getSyncState();
            if (state) {
                setSyncState({ ...state, version: conflict.remoteVersion });
            }
            return uploadSyncedSettings();
        }
    } catch (err) {
        console.error('Failed to resolve sync conflict', err);
        return { success: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

/**
 * Sync now - check for updates and upload if needed
 */
export async function syncNow(): Promise<{
    success: boolean;
    action?: 'uploaded' | 'downloaded' | 'conflict' | 'no-change';
    conflict?: SyncConflict;
    error?: string;
}> {
    try {
        const updateResult = await checkForSyncUpdates();

        if (updateResult.error) {
            return { success: false, error: updateResult.error };
        }

        if (updateResult.hasUpdate && updateResult.conflict) {
            return { success: true, action: 'conflict', conflict: updateResult.conflict };
        }

        const uploadResult = await uploadSyncedSettings();
        if (!uploadResult.success) {
            return { success: false, error: uploadResult.error };
        }

        return { success: true, action: 'uploaded' };
    } catch (err) {
        console.error('Failed to sync', err);
        return { success: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

/**
 * Get device display name from ID (uses cache)
 */
export async function getRemoteDeviceName(deviceId: string): Promise<string> {
    const result = await getRegisteredDevices();
    const device = result.devices.find(d => d.id === deviceId);
    if (device) {
        return getDeviceDisplayName(device);
    }
    return deviceId.slice(0, 8) + '...';
}

// ============================================================================
// Cache Management
// ============================================================================

export { invalidateCache as invalidateSyncCache };
