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

export interface UnifiedSyncData {
    // Categories (triggers, aliases, variables, uiSettings)
    categories?: {
        [K in SyncCategory]?: CategoryPayload;
    };
    // Device registry
    devices?: { [deviceId: string]: DeviceInfo };
    // Multiple sync groups (keyed by groupId)
    groups?: { [groupId: string]: SyncGroup };
    // Device settings per group (keyed by groupId) - for sync groups
    deviceSettings?: { [groupId: string]: SyncedDeviceSettings };
    // Individual device settings (keyed by deviceId) - for per-device copy
    perDeviceSettings?: { [deviceId: string]: SyncedDeviceSettings };
    // Last update timestamp
    updatedAt?: unknown; // serverTimestamp

    // Legacy fields (for migration) - will be removed after first access
    group?: SyncGroup | null;
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

export function updateCache(data: UnifiedSyncData): void {
    cachedSyncData = data;
    cacheTimestamp = Date.now();
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
): Promise<{ success: boolean; errors: Partial<Record<SyncCategory, string>>; timestamps: CategorySyncTimes; checksums: Partial<Record<SyncCategory, string>> }> {
    const errors: Partial<Record<SyncCategory, string>> = {};
    const timestamps: CategorySyncTimes = {};
    const checksums: Partial<Record<SyncCategory, string>> = {};

    try {
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { success: false, errors: { uiSettings: FIREBASE_ERRORS.AUTH_FAILED }, timestamps, checksums };
        }

        const { db } = await ensureFirebaseInitialized();
        const { doc, setDoc, updateDoc, getDoc, serverTimestamp } = await import('firebase/firestore');

        const categories = Object.keys(categoryData) as SyncCategory[];
        const now = Date.now();
        const deviceId = getDeviceId();

        const docRef = doc(db, USERS_COLLECTION, userId, 'sync', SYNC_DATA_DOC);

        // Read existing document to compare checksums and check existence
        const snapshot = await getDoc(docRef);
        const existingData = snapshot.exists() ? snapshot.data() as UnifiedSyncData : null;
        const existingCategories = existingData?.categories || {};

        // Build category payloads - use dot notation for updateDoc
        const categoryUpdates: { [key: string]: CategoryPayload } = {};

        for (const category of categories) {
            const data = categoryData[category];
            if (!data) continue;

            try {
                const checksum = await calculateChecksum(data);
                checksums[category] = checksum;

                // Skip upload if checksum matches cloud data (no changes)
                const cloudPayload = existingCategories[category];
                if (cloudPayload && cloudPayload.checksum === checksum) {
                    continue;
                }

                let finalData: string;

                if (options.encrypted && options.passphrase) {
                    const encryptedData = await encrypt(data, options.passphrase);
                    finalData = JSON.stringify(encryptedData);
                } else {
                    finalData = data;
                }

                // Use dot notation key for updateDoc (will be interpreted as path)
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

        // Skip write if no categories have changed
        if (Object.keys(categoryUpdates).length === 0) {
            console.log(`[Firebase] uploadCategories: no changes to upload`);
            return { success: true, errors, timestamps, checksums };
        }

        const changedCount = Object.keys(categoryUpdates).length;

        if (snapshot.exists()) {
            // Use updateDoc - it interprets dots as paths
            console.log(`[Firebase WRITE] uploadCategories (updateDoc): ${changedCount} changed categories:`, Object.keys(categoryUpdates).map(k => k.replace('categories.', '')));
            await updateDoc(docRef, {
                ...categoryUpdates,
                updatedAt: serverTimestamp(),
            });
        } else {
            // Document doesn't exist - create with proper nested structure
            const nestedCategories: { [key: string]: CategoryPayload } = {};
            for (const key of Object.keys(categoryUpdates)) {
                // Convert 'categories.triggers' to nested { categories: { triggers: ... } }
                const category = key.replace('categories.', '');
                nestedCategories[category] = categoryUpdates[key];
            }
            console.log(`[Firebase WRITE] uploadCategories (setDoc): ${changedCount} categories:`, Object.keys(nestedCategories));
            await setDoc(docRef, {
                categories: nestedCategories,
                updatedAt: serverTimestamp(),
            });
        }

        invalidateCache();

        // Update local sync times
        const settings = loadFirebaseSettings();
        const updatedTimes: CategorySyncTimes = { ...settings.categorySyncTimes, ...timestamps };
        saveFirebaseSettings({ categorySyncTimes: updatedTimes });

    } catch (err) {
        console.error('Failed to upload categories', err);
        return { success: false, errors: { uiSettings: FIREBASE_ERRORS.SYNC_FAILED }, timestamps, checksums };
    }

    const success = Object.keys(errors).length === 0;
    return { success, errors, timestamps, checksums };
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
 * Register current device and upload its settings (uses updateDoc for proper nested field update)
 */
export async function registerDevice(): Promise<{ success: boolean; error?: string }> {
    try {
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { success: false, error: FIREBASE_ERRORS.AUTH_FAILED };
        }

        const deviceInfo = getDeviceInfo();
        const { db } = await ensureFirebaseInitialized();
        const { doc, setDoc, updateDoc, getDoc, serverTimestamp } = await import('firebase/firestore');

        const docRef = doc(db, USERS_COLLECTION, userId, 'sync', SYNC_DATA_DOC);

        // Check if document exists
        const snapshot = await getDoc(docRef);

        const deviceData = {
            ...deviceInfo,
            lastSeen: new Date().toISOString(),
        };

        // Also upload current device settings for per-device copy
        const now = new Date().toISOString();
        const checksum = await calculateSettingsChecksum();
        const perDeviceSettings: SyncedDeviceSettings = {
            groupId: '', // Not associated with a group
            version: 1,
            updatedAt: now,
            updatedByDeviceId: deviceInfo.id,
            checksum,
            settings: getRawDeviceSettings(),
        };

        if (snapshot.exists()) {
            // Use updateDoc with dot notation for nested field update
            console.log(`[Firebase WRITE] registerDevice (updateDoc): ${deviceInfo.id}`);
            await updateDoc(docRef, {
                [`devices.${deviceInfo.id}`]: deviceData,
                [`perDeviceSettings.${deviceInfo.id}`]: perDeviceSettings,
                updatedAt: serverTimestamp(),
            });
        } else {
            // Document doesn't exist, create it with setDoc
            console.log(`[Firebase WRITE] registerDevice (setDoc): ${deviceInfo.id}`);
            await setDoc(docRef, {
                devices: { [deviceInfo.id]: deviceData },
                perDeviceSettings: { [deviceInfo.id]: perDeviceSettings },
                updatedAt: serverTimestamp(),
            });
        }

        invalidateCache();
        return { success: true };
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
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { success: false, error: FIREBASE_ERRORS.AUTH_FAILED };
        }

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

        // Store in groups[groupId] and deviceSettings[groupId]
        const { db } = await ensureFirebaseInitialized();
        const { doc, updateDoc, setDoc, getDoc, serverTimestamp } = await import('firebase/firestore');
        const docRef = doc(db, USERS_COLLECTION, userId, 'sync', SYNC_DATA_DOC);

        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
            console.log(`[Firebase WRITE] createSyncGroup (updateDoc): ${group.name}`);
            await updateDoc(docRef, {
                [`groups.${group.id}`]: group,
                [`deviceSettings.${group.id}`]: deviceSettings,
                updatedAt: serverTimestamp(),
            });
        } else {
            console.log(`[Firebase WRITE] createSyncGroup (setDoc): ${group.name}`);
            await setDoc(docRef, {
                groups: { [group.id]: group },
                deviceSettings: { [group.id]: deviceSettings },
                updatedAt: serverTimestamp(),
            });
        }

        invalidateCache();
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
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { success: false, error: FIREBASE_ERRORS.AUTH_FAILED };
        }

        const { data: syncData, error } = await getFullSyncData(true); // Force refresh
        if (error || !syncData) {
            return { success: false, error: error || FIREBASE_ERRORS.SYNC_FAILED };
        }

        // Look for group in groups collection (new structure)
        const existingGroup = syncData.groups?.[groupId] ?? (syncData.group?.id === groupId ? syncData.group : null);
        if (!existingGroup) {
            return { success: false, error: 'Grupa synchronizacji nie istnieje.' };
        }

        const deviceInfo = getDeviceInfo();
        const group = { ...existingGroup };

        // Add device to group if not already in it
        if (!group.devices.includes(deviceInfo.id)) {
            group.devices.push(deviceInfo.id);
            group.updatedAt = new Date().toISOString();

            // Update in groups collection
            const { db } = await ensureFirebaseInitialized();
            const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
            const docRef = doc(db, USERS_COLLECTION, userId, 'sync', SYNC_DATA_DOC);
            console.log(`[Firebase WRITE] joinSyncGroup (updateDoc): ${group.name}`);
            await updateDoc(docRef, {
                [`groups.${group.id}`]: group,
                updatedAt: serverTimestamp(),
            });
            invalidateCache();
        }

        // Apply settings from the correct group
        // Check new structure first, then legacy format (single object with groupId property)
        let groupSettings: SyncedDeviceSettings | null = syncData.deviceSettings?.[groupId] ?? null;
        if (!groupSettings && syncData.deviceSettings) {
            const legacy = syncData.deviceSettings as unknown as SyncedDeviceSettings;
            if ('groupId' in syncData.deviceSettings && legacy.groupId === groupId) {
                groupSettings = legacy;
            }
        }

        if (groupSettings) {
            applySyncedSettings(groupSettings);
        }

        setSyncState({ group, version: groupSettings?.version ?? 1 });
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

        const groupId = state.group.id;
        const { data: syncData, error } = await getFullSyncData(true);
        if (error) {
            return { success: false, error };
        }

        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { success: false, error: FIREBASE_ERRORS.AUTH_FAILED };
        }

        const { db } = await ensureFirebaseInitialized();
        const { doc, updateDoc, serverTimestamp, deleteField } = await import('firebase/firestore');
        const docRef = doc(db, USERS_COLLECTION, userId, 'sync', SYNC_DATA_DOC);

        // Find the group in the new structure or legacy structure
        const existingGroup = syncData?.groups?.[groupId] ?? syncData?.group;
        if (existingGroup) {
            const deviceInfo = getDeviceInfo();
            const group = { ...existingGroup };
            group.devices = group.devices.filter(id => id !== deviceInfo.id);

            if (group.devices.length === 0) {
                // Last device leaving - delete the group and its settings
                console.log(`[Firebase WRITE] leaveSyncGroupCloud: clearing group (last device)`);
                await updateDoc(docRef, {
                    [`groups.${groupId}`]: deleteField(),
                    [`deviceSettings.${groupId}`]: deleteField(),
                    updatedAt: serverTimestamp(),
                });
            } else {
                // Other devices still in group - just remove this device
                console.log(`[Firebase WRITE] leaveSyncGroupCloud: removing device from group`);
                await updateDoc(docRef, {
                    [`groups.${groupId}`]: group,
                    updatedAt: serverTimestamp(),
                });
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

        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { success: false, error: FIREBASE_ERRORS.AUTH_FAILED };
        }

        const groupId = state.group.id;
        const deviceInfo = getDeviceInfo();
        const checksum = await calculateSettingsChecksum();
        const newVersion = state.version + 1;
        const now = new Date().toISOString();

        const deviceSettings: SyncedDeviceSettings = {
            groupId,
            version: newVersion,
            updatedAt: now,
            updatedByDeviceId: deviceInfo.id,
            checksum,
            settings: getRawDeviceSettings(),
        };

        // Store in deviceSettings[groupId]
        const { db } = await ensureFirebaseInitialized();
        const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
        const docRef = doc(db, USERS_COLLECTION, userId, 'sync', SYNC_DATA_DOC);

        console.log(`[Firebase WRITE] uploadSyncedSettings: group ${groupId}`);
        await updateDoc(docRef, {
            [`deviceSettings.${groupId}`]: deviceSettings,
            updatedAt: serverTimestamp(),
        });

        invalidateCache();
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

        const groupId = state.group.id;
        const { data: syncData, error } = await getFullSyncData(true); // Force refresh for sync check
        if (error || !syncData) {
            return { hasUpdate: false, error };
        }

        // Get settings for this specific group
        // Check new structure first, then legacy format (single object with groupId property)
        let groupSettings: SyncedDeviceSettings | null = syncData.deviceSettings?.[groupId] ?? null;
        if (!groupSettings && syncData.deviceSettings) {
            const legacy = syncData.deviceSettings as unknown as SyncedDeviceSettings;
            if ('groupId' in syncData.deviceSettings && legacy.groupId === groupId) {
                groupSettings = legacy;
            }
        }

        if (!groupSettings) {
            return { hasUpdate: false };
        }

        const deviceInfo = getDeviceInfo();
        const localChecksum = await calculateSettingsChecksum();

        if (groupSettings.checksum === localChecksum) {
            return { hasUpdate: false };
        }

        if (groupSettings.updatedByDeviceId === deviceInfo.id) {
            return { hasUpdate: false };
        }

        if (groupSettings.version > state.version) {
            const conflict: SyncConflict = {
                groupId,
                localVersion: state.version,
                remoteVersion: groupSettings.version,
                remoteUpdatedBy: groupSettings.updatedByDeviceId,
                remoteUpdatedAt: groupSettings.updatedAt,
                remoteSettings: groupSettings,
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

/**
 * Get all sync groups from cloud
 * This is useful to check what sync groups exist and let user join one
 */
export async function getCloudSyncGroups(): Promise<{
    groups: SyncGroup[];
    error?: string;
}> {
    const { data: syncData, error } = await getFullSyncData();
    if (error) {
        return { groups: [], error };
    }

    const groups: SyncGroup[] = [];

    // Get groups from new structure
    if (syncData?.groups) {
        groups.push(...Object.values(syncData.groups));
    }

    // Also check legacy structure for migration
    if (syncData?.group && !groups.find(g => g.id === syncData.group?.id)) {
        groups.push(syncData.group);
    }

    return { groups };
}

/**
 * Get sync group from cloud (if any exists) - for backwards compatibility
 * @deprecated Use getCloudSyncGroups instead
 */
export async function getCloudSyncGroup(): Promise<{
    group: SyncGroup | null;
    error?: string;
}> {
    const { groups, error } = await getCloudSyncGroups();
    if (error) {
        return { group: null, error };
    }
    return { group: groups[0] ?? null };
}

/**
 * Get device settings for a specific sync group from cloud
 */
export async function getCloudGroupSettings(groupId: string): Promise<{
    settings: SyncedDeviceSettings | null;
    error?: string;
}> {
    const { data: syncData, error } = await getFullSyncData();
    if (error || !syncData) {
        return { settings: null, error };
    }

    const groupSettings = syncData.deviceSettings?.[groupId] ?? null;
    return { settings: groupSettings };
}

/**
 * Get settings for a specific device from cloud (per-device settings)
 */
export async function getCloudDeviceSettings(deviceId: string): Promise<{
    settings: SyncedDeviceSettings | null;
    error?: string;
}> {
    const { data: syncData, error } = await getFullSyncData();
    if (error || !syncData) {
        return { settings: null, error };
    }

    const deviceSettings = syncData.perDeviceSettings?.[deviceId] ?? null;
    return { settings: deviceSettings };
}

/**
 * Copy settings from a cloud device to this device.
 * Uses per-device settings, with fallback to group settings if device is in a group.
 * If the current device is in a sync group, the settings will be uploaded to that group.
 */
export async function copySettingsFromCloudDevice(deviceId: string): Promise<{
    success: boolean;
    error?: string;
}> {
    try {
        const { data: syncData, error: syncError } = await getFullSyncData();
        if (syncError || !syncData) {
            return { success: false, error: syncError || FIREBASE_ERRORS.SYNC_FAILED };
        }

        // First try per-device settings
        let settings = syncData.perDeviceSettings?.[deviceId] ?? null;

        // Fallback: if device is in a group, use group settings
        if (!settings && syncData.groups) {
            for (const group of Object.values(syncData.groups)) {
                if (group.devices.includes(deviceId)) {
                    settings = syncData.deviceSettings?.[group.id] ?? null;
                    if (settings) break;
                }
            }
        }

        if (!settings) {
            return { success: false, error: 'Nie znaleziono ustawien dla tego urzadzenia.' };
        }

        // Apply settings locally
        applySyncedSettings(settings);

        // If we're in a sync group, upload the new settings to our group
        const state = getSyncState();
        if (state) {
            const uploadResult = await uploadSyncedSettings();
            if (!uploadResult.success) {
                // Settings were applied locally but failed to upload
                console.warn('Settings applied locally but failed to sync to group:', uploadResult.error);
            }
        }

        return { success: true };
    } catch (err) {
        console.error('Failed to copy settings from cloud device', err);
        return { success: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

/**
 * Copy settings from a cloud sync group to this device.
 * If the current device is in a sync group, the settings will be uploaded to that group.
 * @deprecated Use copySettingsFromCloudDevice instead
 */
export async function copySettingsFromCloudGroup(groupId: string): Promise<{
    success: boolean;
    error?: string;
}> {
    try {
        const { settings, error } = await getCloudGroupSettings(groupId);
        if (error || !settings) {
            return { success: false, error: error || 'Nie znaleziono ustawien dla tej grupy.' };
        }

        // Apply settings locally
        applySyncedSettings(settings);

        // If we're in a sync group, upload the new settings to our group
        const state = getSyncState();
        if (state) {
            const uploadResult = await uploadSyncedSettings();
            if (!uploadResult.success) {
                // Settings were applied locally but failed to upload
                console.warn('Settings applied locally but failed to sync to group:', uploadResult.error);
            }
        }

        return { success: true };
    } catch (err) {
        console.error('Failed to copy settings from cloud group', err);
        return { success: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

/**
 * Delete an empty sync group from cloud.
 * Only deletes if the group has no devices.
 * If the current device was in this group, clears local sync state.
 */
export async function deleteEmptySyncGroup(groupId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { success: false, error: FIREBASE_ERRORS.AUTH_FAILED };
        }

        const { data: syncData, error } = await getFullSyncData(true);
        if (error || !syncData) {
            return { success: false, error: error || FIREBASE_ERRORS.SYNC_FAILED };
        }

        const group = syncData.groups?.[groupId];
        if (!group) {
            return { success: false, error: 'Grupa nie istnieje.' };
        }

        if (group.devices.length > 0) {
            return { success: false, error: 'Grupa nie jest pusta. Najpierw usun wszystkie urzadzenia.' };
        }

        const { db } = await ensureFirebaseInitialized();
        const { doc, updateDoc, deleteField, serverTimestamp } = await import('firebase/firestore');
        const docRef = doc(db, USERS_COLLECTION, userId, 'sync', SYNC_DATA_DOC);

        console.log(`[Firebase WRITE] deleteEmptySyncGroup: ${groupId}`);
        await updateDoc(docRef, {
            [`groups.${groupId}`]: deleteField(),
            [`deviceSettings.${groupId}`]: deleteField(),
            updatedAt: serverTimestamp(),
        });

        invalidateCache();

        // If current device was in this group, clear local sync state
        const state = getSyncState();
        if (state?.group.id === groupId) {
            clearSyncState();
        }

        return { success: true };
    } catch (err) {
        console.error('Failed to delete empty sync group', err);
        return { success: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

// ============================================================================
// Cache Management
// ============================================================================

export { invalidateCache as invalidateSyncCache };
