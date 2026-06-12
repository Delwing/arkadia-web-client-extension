/**
 * Firebase Unified Sync Module
 *
 * SINGLE DOCUMENT approach for all user data to minimize reads:
 * - Shared categories (triggers, aliases, characterSettings, ...)
 * - Per-device categories (uiSettings, buttons) under deviceCategories.{deviceId}
 * - Device registry
 *
 * Structure: users/{userId}/sync/syncData (one document), plus
 * users/{userId}/syncGroups/{groupId} for sync group membership.
 */

import type {DeviceInfo, SyncGroup} from '@modules/device';
import {
    clearSyncState,
    getDeviceInfo,
    setSyncGroup,
} from '@modules/device';
import type {
    CategoryConflictInfo,
    CategoryPayload,
    CategorySyncTimes,
    EncryptedData,
    SyncCategory
} from './firebaseTypes';
import {
    DEVICE_SCOPED_SYNC_CATEGORIES,
    FIREBASE_ERRORS,
    getDeviceId,
    loadFirebaseSettings,
    saveFirebaseSettings,
    SYNC_CATEGORIES
} from './firebaseTypes';
import {ensureFirebaseInitialized, getFirebaseAuth} from './firebaseConfig';
import {calculateChecksum, decrypt, encrypt, isEncryptedData} from './firebaseCrypto';
import { isCategoryDeviceScoped, getSyncGroup } from '@modules/device';

// Single document path
const USERS_COLLECTION = 'users';
const SYNC_DATA_DOC = 'syncData';

// ============================================================================
// Unified Document Structure
// ============================================================================

/** Raw localStorage values from the retired per-device settings snapshot. */
interface LegacyPerDeviceSettings {
    settings?: {
        layoutManagerState?: string;
        uiSettings?: string;
        desktopButtonSettings?: string;
        mobileButtonSettings?: string;
        tripRoutes?: string;
        activeKeymap?: string;
    };
}

export interface UnifiedSyncData {
    // Shared categories (triggers, aliases, shortcuts, characterSettings, etc.)
    categories?: {
        [K in SyncCategory]?: CategoryPayload;
    };
    // Per-device categories (uiSettings, buttons — device-scoped)
    deviceCategories?: {
        [deviceId: string]: { [K in SyncCategory]?: CategoryPayload };
    };
    // Device registry
    devices?: { [deviceId: string]: DeviceInfo };
    // Legacy per-device settings snapshot (no longer written; read as a
    // fallback by copySettingsFromCloudDevice for devices that never synced
    // their device-scoped categories)
    perDeviceSettings?: { [deviceId: string]: LegacyPerDeviceSettings };
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
        const existingDeviceCategories = existingData?.deviceCategories || {};

        // Build category payloads - use dot notation for updateDoc
        const categoryUpdates: { [key: string]: CategoryPayload } = {};

        for (const category of categories) {
            const data = categoryData[category];
            if (!data) continue;

            try {
                const checksum = await calculateChecksum(data);
                checksums[category] = checksum;

                // Device-scoped categories go to deviceCategories.{deviceId}.{cat}
                const isDeviceScoped = isCategoryDeviceScoped(category);
                const cloudPayload = isDeviceScoped
                    ? existingDeviceCategories[deviceId]?.[category]
                    : existingCategories[category];

                // Skip upload if checksum matches cloud data (no changes)
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

                const payload: CategoryPayload = {
                    version: 1,
                    syncedAt: new Date().toISOString(),
                    deviceId,
                    checksum,
                    encrypted: options.encrypted,
                    data: finalData,
                };

                // Use dot notation key for updateDoc (will be interpreted as path)
                if (isDeviceScoped) {
                    categoryUpdates[`deviceCategories.${deviceId}.${category}`] = payload;
                    // Also write to legacy path for backward compat with old clients
                    categoryUpdates[`categories.${category}`] = payload;
                } else {
                    categoryUpdates[`categories.${category}`] = payload;
                }

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
            console.log(`[Firebase WRITE] uploadCategories (updateDoc): ${changedCount} changed categories:`, Object.keys(categoryUpdates));
            await updateDoc(docRef, {
                ...categoryUpdates,
                updatedAt: serverTimestamp(),
            });
        } else {
            // Document doesn't exist - create with proper nested structure
            const nestedShared: { [key: string]: CategoryPayload } = {};
            const nestedDevice: { [devId: string]: { [cat: string]: CategoryPayload } } = {};
            for (const [key, payload] of Object.entries(categoryUpdates)) {
                if (key.startsWith('deviceCategories.')) {
                    // deviceCategories.{deviceId}.{category}
                    const parts = key.split('.');
                    const devId = parts[1];
                    const cat = parts[2];
                    if (!nestedDevice[devId]) nestedDevice[devId] = {};
                    nestedDevice[devId][cat] = payload;
                } else {
                    const cat = key.replace('categories.', '');
                    nestedShared[cat] = payload;
                }
            }
            console.log(`[Firebase WRITE] uploadCategories (setDoc): ${changedCount} categories`);
            const docData: Record<string, unknown> = { updatedAt: serverTimestamp() };
            if (Object.keys(nestedShared).length > 0) docData.categories = nestedShared;
            if (Object.keys(nestedDevice).length > 0) docData.deviceCategories = nestedDevice;
            await setDoc(docRef, docData);
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
 * Find the best per-device payload for a device-scoped category.
 * Checks own device first, then sync group members. Picks the most recent.
 * Falls back to legacy categories.{cat} if deviceCategories is empty.
 */
function findDeviceCategoryPayload(
    syncData: UnifiedSyncData,
    category: SyncCategory,
): CategoryPayload | undefined {
    const deviceId = getDeviceId();
    const currentSyncGroup = getSyncGroup();
    const deviceCats = syncData.deviceCategories || {};

    // Gather relevant device IDs: self + sync group members
    const relevantIds = new Set<string>([deviceId]);
    if (currentSyncGroup) {
        for (const id of currentSyncGroup.devices) {
            relevantIds.add(id);
        }
    }

    // Find the most recently synced payload from relevant devices
    let best: CategoryPayload | undefined;
    for (const devId of relevantIds) {
        const payload = deviceCats[devId]?.[category];
        if (!payload) continue;
        if (!best || payload.syncedAt > best.syncedAt) {
            best = payload;
        }
    }

    // Fallback: check legacy categories.{cat} (migration)
    if (!best) {
        const legacyPayload = syncData.categories?.[category];
        if (legacyPayload) {
            best = legacyPayload;
        }
    }

    return best;
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
            // For device-scoped categories, find per-device payload
            const payload = isCategoryDeviceScoped(category)
                ? findDeviceCategoryPayload(syncData, category)
                : cloudCategories[category];
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

            // For device-scoped categories, compare against own per-device data
            const cloudPayload = isCategoryDeviceScoped(category)
                ? (syncData.deviceCategories?.[deviceId]?.[category] ?? cloudCategories[category])
                : cloudCategories[category];
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
        // For device-scoped categories, find the most relevant per-device payload
        const payload = isCategoryDeviceScoped(category)
            ? findDeviceCategoryPayload(syncData, category)
            : cloudCategories[category];
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
        const deviceId = getDeviceId();

        // Delete from both shared and per-device paths
        const updates: Record<string, unknown> = {
            [`categories.${category}`]: deleteField(),
        };
        if (isCategoryDeviceScoped(category)) {
            updates[`deviceCategories.${deviceId}.${category}`] = deleteField();
        }

        console.log(`[Firebase WRITE] deleteCategory: ${category}`);
        await updateDoc(docRef, updates);

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

        const deviceId = getDeviceId();
        const docRef = doc(db, USERS_COLLECTION, userId, 'sync', SYNC_DATA_DOC);
        console.log(`[Firebase WRITE] deleteAllCategories`);
        await updateDoc(docRef, {
            categories: deleteField(),
            [`deviceCategories.${deviceId}`]: deleteField(),
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
 * Register current device in the device registry. Device-scoped settings are
 * uploaded separately by the regular category sync (deviceCategories).
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

        if (snapshot.exists()) {
            // Use updateDoc with dot notation for nested field update
            console.log(`[Firebase WRITE] registerDevice (updateDoc): ${deviceInfo.id}`);
            await updateDoc(docRef, {
                [`devices.${deviceInfo.id}`]: deviceData,
                updatedAt: serverTimestamp(),
            });
        } else {
            // Document doesn't exist, create it with setDoc
            console.log(`[Firebase WRITE] registerDevice (setDoc): ${deviceInfo.id}`);
            await setDoc(docRef, {
                devices: { [deviceInfo.id]: deviceData },
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
// Sync Groups (device membership)
//
// Collection: users/{userId}/syncGroups/{groupId} — each document holds only
// the group membership ({ group }). The device-scoped settings themselves
// travel through the regular category sync (deviceCategories.{deviceId});
// group membership merely controls whose payloads a device applies.
// ============================================================================

const SYNC_GROUPS_SUBCOLLECTION = 'syncGroups';

interface SyncGroupDocument {
    group: SyncGroup;
}

async function readSyncGroupDoc(userId: string, groupId: string): Promise<SyncGroup | null> {
    const { db } = await ensureFirebaseInitialized();
    const { doc, getDoc } = await import('firebase/firestore');
    const groupDocRef = doc(db, USERS_COLLECTION, userId, SYNC_GROUPS_SUBCOLLECTION, groupId);
    const snapshot = await getDoc(groupDocRef);
    if (!snapshot.exists()) return null;
    return (snapshot.data() as SyncGroupDocument).group ?? null;
}

/**
 * Write a sync group document. Uses setDoc with the bare membership shape,
 * which also clears the legacy settings blob from pre-collapse documents.
 */
async function writeSyncGroupDoc(userId: string, group: SyncGroup): Promise<void> {
    const { db } = await ensureFirebaseInitialized();
    const { doc, setDoc } = await import('firebase/firestore');
    const groupDocRef = doc(db, USERS_COLLECTION, userId, SYNC_GROUPS_SUBCOLLECTION, group.id);
    const data: SyncGroupDocument = { group };
    await setDoc(groupDocRef, data);
}

/**
 * Apply the most recent device-scoped category payloads from sync group
 * members to this device. Used right after joining a group so the user sees
 * the group's interface settings without waiting for the next remote change.
 */
async function applyGroupDeviceCategories(passphrase?: string): Promise<void> {
    const deviceCategories = Array.from(DEVICE_SCOPED_SYNC_CATEGORIES);
    const { data } = await downloadCategories(deviceCategories, passphrase);
    if (Object.keys(data).length === 0) return;

    const { importCategories } = await import('@web/options/exportUtils');
    await importCategories(data);
}

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

        const group: SyncGroup = {
            id: crypto.randomUUID(),
            name: name.trim() || 'Moje urzadzenia',
            devices: [deviceInfo.id],
            createdAt: now,
            updatedAt: now,
        };

        console.log(`[Firebase WRITE] createSyncGroup: ${group.name}`);
        await writeSyncGroupDoc(userId, group);

        setSyncGroup(group);
        return { success: true, group };
    } catch (err) {
        console.error('Failed to create sync group', err);
        return { success: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

/**
 * Join an existing sync group and apply the group's device-scoped settings.
 */
export async function joinSyncGroup(
    groupId: string,
    options?: { passphrase?: string },
): Promise<{
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

        const existingGroup = await readSyncGroupDoc(userId, groupId);
        if (!existingGroup) {
            return { success: false, error: 'Grupa synchronizacji nie istnieje.' };
        }

        const deviceInfo = getDeviceInfo();
        const group = { ...existingGroup };

        // Add device to group if not already in it
        if (!group.devices.includes(deviceInfo.id)) {
            group.devices = [...group.devices, deviceInfo.id];
            group.updatedAt = new Date().toISOString();

            console.log(`[Firebase WRITE] joinSyncGroup: adding device ${deviceInfo.id}`);
            await writeSyncGroupDoc(userId, group);
        }

        // Membership must be saved first — downloadCategories consults it to
        // pick payloads from group members.
        setSyncGroup(group);

        try {
            await applyGroupDeviceCategories(options?.passphrase);
        } catch (err) {
            console.warn('Joined group but failed to apply group settings', err);
        }

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
        const currentGroup = getSyncGroup();
        if (!currentGroup) {
            return { success: true };
        }

        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { success: false, error: FIREBASE_ERRORS.AUTH_FAILED };
        }

        const existingGroup = await readSyncGroupDoc(userId, currentGroup.id);

        if (existingGroup) {
            const deviceInfo = getDeviceInfo();
            const group = { ...existingGroup };
            group.devices = group.devices.filter(id => id !== deviceInfo.id);

            if (group.devices.length === 0) {
                // Last device leaving - delete the group document
                const { db } = await ensureFirebaseInitialized();
                const { doc, deleteDoc } = await import('firebase/firestore');
                const groupDocRef = doc(db, USERS_COLLECTION, userId, SYNC_GROUPS_SUBCOLLECTION, group.id);
                console.log(`[Firebase DELETE] leaveSyncGroupCloud: deleting empty group`);
                await deleteDoc(groupDocRef);
            } else {
                // Other devices still in group - just update without this device
                console.log(`[Firebase WRITE] leaveSyncGroupCloud: removing device from group`);
                await writeSyncGroupDoc(userId, group);
            }
        }

        clearSyncState();
        return { success: true };
    } catch (err) {
        console.error('Failed to leave sync group', err);
        return { success: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

/**
 * Get all sync groups from cloud
 */
export async function getCloudSyncGroups(): Promise<{
    groups: SyncGroup[];
    error?: string;
}> {
    try {
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { groups: [], error: FIREBASE_ERRORS.AUTH_FAILED };
        }

        const { db } = await ensureFirebaseInitialized();
        const { collection, getDocs } = await import('firebase/firestore');

        const collRef = collection(db, USERS_COLLECTION, userId, SYNC_GROUPS_SUBCOLLECTION);
        const snapshot = await getDocs(collRef);

        const groups: SyncGroup[] = [];
        snapshot.forEach((docSnap) => {
            const data = docSnap.data() as SyncGroupDocument;
            if (data.group?.id) {
                groups.push(data.group);
            }
        });

        return { groups };
    } catch (err) {
        console.error('Failed to get cloud sync groups', err);
        return { groups: [], error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

/**
 * Copy settings from a cloud device to this device.
 * Reads the device's per-device category payloads (deviceCategories) and
 * imports them locally; auto-sync then uploads them as this device's own.
 */
export async function copySettingsFromCloudDevice(
    deviceId: string,
    passphrase?: string,
): Promise<{
    success: boolean;
    error?: string;
}> {
    try {
        const { data: syncData, error: syncError } = await getFullSyncData();
        if (syncError || !syncData) {
            return { success: false, error: syncError || FIREBASE_ERRORS.SYNC_FAILED };
        }

        const devicePayloads = syncData.deviceCategories?.[deviceId];
        const data: Partial<Record<SyncCategory, string>> = {};

        for (const category of DEVICE_SCOPED_SYNC_CATEGORIES) {
            const payload = devicePayloads?.[category];
            if (!payload) continue;

            if (payload.encrypted) {
                if (!passphrase) {
                    return { success: false, error: FIREBASE_ERRORS.WRONG_PASSPHRASE };
                }
                try {
                    const encryptedData = JSON.parse(payload.data);
                    if (!isEncryptedData(encryptedData)) {
                        return { success: false, error: FIREBASE_ERRORS.DECRYPTION_FAILED };
                    }
                    data[category] = await decrypt(encryptedData as EncryptedData, passphrase);
                } catch {
                    return { success: false, error: FIREBASE_ERRORS.DECRYPTION_FAILED };
                }
            } else {
                data[category] = payload.data;
            }
        }

        if (Object.keys(data).length === 0) {
            // Legacy fallback: per-device snapshot written by pre-collapse clients
            const legacy = syncData.perDeviceSettings?.[deviceId];
            if (legacy?.settings) {
                applyLegacyDeviceSettings(legacy.settings);
                return { success: true };
            }
            return { success: false, error: 'Nie znaleziono ustawien dla tego urzadzenia.' };
        }

        const { importCategories } = await import('@web/options/exportUtils');
        await importCategories(data);

        return { success: true };
    } catch (err) {
        console.error('Failed to copy settings from cloud device', err);
        return { success: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

/** Apply a legacy per-device settings snapshot (raw localStorage values). */
function applyLegacyDeviceSettings(settings: NonNullable<LegacyPerDeviceSettings['settings']>): void {
    const keyMap: Record<string, string | undefined> = {
        layoutManagerState: settings.layoutManagerState,
        uiSettings: settings.uiSettings,
        desktopButtonSettings: settings.desktopButtonSettings,
        mobileButtonSettings: settings.mobileButtonSettings,
        tripRoutes: settings.tripRoutes,
    };
    for (const [key, value] of Object.entries(keyMap)) {
        if (value) localStorage.setItem(key, value);
    }

    if (settings.activeKeymap) {
        import('@modules/core/keymapTypes').then(({ ACTIVE_KEYMAP_STORAGE_KEY }) => {
            localStorage.setItem(ACTIVE_KEYMAP_STORAGE_KEY, settings.activeKeymap!);
            return import('@modules/core/keymapStorage');
        }).then(({ switchKeymap }) => {
            switchKeymap(settings.activeKeymap!);
        }).catch(() => {
            // keymapStorage may not be available in all contexts
        });
    }

    // Notify the layout system so the imported layout is picked up
    import('@modules/core/eventBus').then(({ default: eventBus }) => {
        eventBus.emit('layoutManagerStateChanged', { type: 'import' });
    }).catch(() => {
        // eventBus unavailable in this context
    });
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

        const group = await readSyncGroupDoc(userId, groupId);
        if (!group) {
            return { success: false, error: 'Grupa nie istnieje.' };
        }

        if (group.devices.length > 0) {
            return { success: false, error: 'Grupa nie jest pusta. Najpierw usun wszystkie urzadzenia.' };
        }

        const { db } = await ensureFirebaseInitialized();
        const { doc, deleteDoc } = await import('firebase/firestore');
        const groupDocRef = doc(db, USERS_COLLECTION, userId, SYNC_GROUPS_SUBCOLLECTION, groupId);

        console.log(`[Firebase DELETE] deleteEmptySyncGroup: ${groupId}`);
        await deleteDoc(groupDocRef);

        // If current device was in this group, clear local sync state
        if (getSyncGroup()?.id === groupId) {
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
