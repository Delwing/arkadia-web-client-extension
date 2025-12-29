import type { CategoryPayload, SyncCategory, CategoryConflictInfo, EncryptedData, CategorySyncTimes } from './firebaseTypes';
import { FIREBASE_ERRORS, getDeviceId, saveFirebaseSettings, loadFirebaseSettings, SYNC_CATEGORIES } from './firebaseTypes';
import { ensureFirebaseInitialized, getFirebaseAuth } from './firebaseConfig';
import { encrypt, decrypt, calculateChecksum, isEncryptedData } from './firebaseCrypto';

const SYNC_COLLECTION = 'users';
const SYNC_SUBCOLLECTION = 'sync';

// Rate limiting: max 1 sync check per 10 minutes
export const SYNC_CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// Check if enough time has passed since last sync check
export function canPerformSyncCheck(): boolean {
    const settings = loadFirebaseSettings();
    const now = Date.now();
    return now - (settings.lastSyncCheckTime || 0) >= SYNC_CHECK_INTERVAL_MS;
}

// Update last sync check time
export function updateLastSyncCheckTime(): void {
    saveFirebaseSettings({ lastSyncCheckTime: Date.now() });
}

// Upload a single category to Firestore
export async function uploadCategory(
    category: SyncCategory,
    data: string,
    options: {
        encrypted: boolean;
        passphrase?: string;
    }
): Promise<{ success: boolean; error?: string; timestamp?: number }> {
    try {
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { success: false, error: FIREBASE_ERRORS.AUTH_FAILED };
        }

        const { db } = await ensureFirebaseInitialized();
        const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');

        // Calculate checksum of original data
        const checksum = await calculateChecksum(data);

        // Encrypt if needed
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
            deviceId: getDeviceId(),
            checksum,
            encrypted: options.encrypted,
            data: finalData,
        };

        const docRef = doc(db, SYNC_COLLECTION, userId, SYNC_SUBCOLLECTION, category);
        console.log(`[Firebase WRITE] setDoc: ${category}`, { userId, category });
        await setDoc(docRef, {
            ...payload,
            updatedAt: serverTimestamp(),
        });

        const now = Date.now();
        const settings = loadFirebaseSettings();
        const updatedTimes: CategorySyncTimes = { ...settings.categorySyncTimes, [category]: now };
        saveFirebaseSettings({ categorySyncTimes: updatedTimes });

        return { success: true, timestamp: now };
    } catch (err) {
        console.error(`Failed to upload category ${category} to Firestore`, err);
        return { success: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

// Upload multiple categories to Firestore using batch write (single network request)
export async function uploadCategories(
    categoryData: Partial<Record<SyncCategory, string>>,
    options: {
        encrypted: boolean;
        passphrase?: string;
    }
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
        const { doc, writeBatch, serverTimestamp } = await import('firebase/firestore');

        const batch = writeBatch(db);
        const categories = Object.keys(categoryData) as SyncCategory[];
        const now = Date.now();
        const deviceId = getDeviceId();

        // Prepare all payloads
        for (const category of categories) {
            const data = categoryData[category];
            if (!data) continue;

            try {
                // Calculate checksum of original data
                const checksum = await calculateChecksum(data);

                // Encrypt if needed
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

                const docRef = doc(db, SYNC_COLLECTION, userId, SYNC_SUBCOLLECTION, category);
                batch.set(docRef, {
                    ...payload,
                    updatedAt: serverTimestamp(),
                });

                timestamps[category] = now;
            } catch (err) {
                console.error(`Failed to prepare category ${category}`, err);
                errors[category] = FIREBASE_ERRORS.SYNC_FAILED;
            }
        }

        // Commit batch in single network request
        console.log(`[Firebase WRITE] batch.commit: ${categories.length} categories`, { userId, categories });
        await batch.commit();

        // Update local sync times
        const settings = loadFirebaseSettings();
        const updatedTimes: CategorySyncTimes = { ...settings.categorySyncTimes, ...timestamps };
        saveFirebaseSettings({ categorySyncTimes: updatedTimes });

    } catch (err) {
        console.error('Failed to upload categories batch', err);
        return { success: false, errors: { uiSettings: FIREBASE_ERRORS.SYNC_FAILED }, timestamps };
    }

    const success = Object.keys(errors).length === 0;
    return { success, errors, timestamps };
}

// Download a single category from Firestore
export async function downloadCategory(
    category: SyncCategory,
    passphrase?: string
): Promise<{ success: boolean; data?: string; payload?: CategoryPayload; error?: string }> {
    try {
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { success: false, error: FIREBASE_ERRORS.AUTH_FAILED };
        }

        const { db } = await ensureFirebaseInitialized();
        const { doc, getDoc } = await import('firebase/firestore');

        const docRef = doc(db, SYNC_COLLECTION, userId, SYNC_SUBCOLLECTION, category);
        console.log(`[Firebase READ] getDoc: ${category}`, { userId, category });
        const snapshot = await getDoc(docRef);

        if (!snapshot.exists()) {
            return { success: true, data: undefined, payload: undefined };
        }

        const payload = snapshot.data() as CategoryPayload;

        // Decrypt if needed
        let data: string;
        if (payload.encrypted) {
            if (!passphrase) {
                return { success: false, error: FIREBASE_ERRORS.WRONG_PASSPHRASE };
            }
            try {
                const encryptedData = JSON.parse(payload.data);
                if (!isEncryptedData(encryptedData)) {
                    return { success: false, error: FIREBASE_ERRORS.DECRYPTION_FAILED };
                }
                data = await decrypt(encryptedData as EncryptedData, passphrase);
            } catch {
                return { success: false, error: FIREBASE_ERRORS.DECRYPTION_FAILED };
            }
        } else {
            data = payload.data;
        }

        // Verify checksum
        const checksum = await calculateChecksum(data);
        if (checksum !== payload.checksum) {
            console.warn(`Checksum mismatch for category ${category} - data may be corrupted`);
        }

        return { success: true, data, payload };
    } catch (err) {
        console.error(`Failed to download category ${category} from Firestore`, err);
        return { success: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

// Metadata returned with downloaded categories (for local conflict checking)
export interface DownloadedCategoryMeta {
    checksum: string;
    deviceId: string;
    syncedAt: string;
    encrypted: boolean;
}

// Download multiple categories from Firestore using single collection read
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
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { success: false, data, payloads, errors: { uiSettings: FIREBASE_ERRORS.AUTH_FAILED } };
        }

        const { db } = await ensureFirebaseInitialized();
        const { collection, getDocs } = await import('firebase/firestore');

        // Single query to get all documents in the sync subcollection
        const collRef = collection(db, SYNC_COLLECTION, userId, SYNC_SUBCOLLECTION);
        console.log(`[Firebase READ] getDocs: downloadCategories`, { userId, categories });
        const snapshot = await getDocs(collRef);

        // Build a map of all cloud data
        const cloudData = new Map<SyncCategory, CategoryPayload>();
        snapshot.forEach((docSnap) => {
            const category = docSnap.id as SyncCategory;
            if (categories.includes(category)) {
                cloudData.set(category, docSnap.data() as CategoryPayload);
            }
        });

        // Process requested categories
        for (const category of categories) {
            const payload = cloudData.get(category);
            if (!payload) {
                // No data for this category - not an error
                continue;
            }

            try {
                // Decrypt if needed
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
                    console.warn(`Checksum mismatch for category ${category} - data may be corrupted`);
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

// Check for conflicts locally using already-downloaded payload metadata (no Firebase read!)
export async function checkConflictsLocally(
    localData: Partial<Record<SyncCategory, string>>,
    cloudPayloads: Partial<Record<SyncCategory, DownloadedCategoryMeta>>
): Promise<CategoryConflictInfo[]> {
    const conflicts: CategoryConflictInfo[] = [];
    const settings = loadFirebaseSettings();
    const deviceId = getDeviceId();

    for (const category of Object.keys(localData) as SyncCategory[]) {
        const cloudMeta = cloudPayloads[category];
        if (!cloudMeta) continue; // No cloud data for this category

        const localDataStr = localData[category];
        if (!localDataStr) continue;

        const localChecksum = await calculateChecksum(localDataStr);

        // Same checksum - no conflict
        if (localChecksum === cloudMeta.checksum) continue;

        // Different device made the last change - potential conflict
        if (cloudMeta.deviceId !== deviceId) {
            const cloudTimestamp = new Date(cloudMeta.syncedAt).getTime();
            const localTimestamp = settings.categorySyncTimes[category] ?? 0;

            // Cloud is newer than our last sync - conflict
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
                        data: '', // Not needed for conflict display
                    },
                });
            }
        }
    }

    return conflicts;
}

// Check for conflicts on a single category
export async function checkCategoryConflict(
    category: SyncCategory,
    localData: string,
    passphrase?: string
): Promise<{ hasConflict: boolean; conflictInfo?: CategoryConflictInfo; error?: string }> {
    try {
        const result = await downloadCategory(category, passphrase);

        if (!result.success) {
            return { hasConflict: false, error: result.error };
        }

        // No cloud data - no conflict
        if (!result.payload || !result.data) {
            return { hasConflict: false };
        }

        const localChecksum = await calculateChecksum(localData);
        const cloudPayload = result.payload;
        const settings = loadFirebaseSettings();

        // Same checksum - no conflict
        if (localChecksum === cloudPayload.checksum) {
            return { hasConflict: false };
        }

        // Different device made the last change - potential conflict
        if (cloudPayload.deviceId !== getDeviceId()) {
            const cloudTimestamp = new Date(cloudPayload.syncedAt).getTime();
            const localTimestamp = settings.categorySyncTimes[category] ?? 0;

            // Cloud is newer than our last sync - conflict
            if (cloudTimestamp > localTimestamp) {
                return {
                    hasConflict: true,
                    conflictInfo: {
                        category,
                        localTimestamp,
                        cloudTimestamp,
                        localChecksum,
                        cloudChecksum: cloudPayload.checksum,
                        cloudData: cloudPayload,
                    },
                };
            }
        }

        return { hasConflict: false };
    } catch (err) {
        console.error(`Failed to check conflict for category ${category}`, err);
        return { hasConflict: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

// Check for conflicts on multiple categories using single collection read
export async function checkCategoriesConflicts(
    categoryData: Partial<Record<SyncCategory, string>>,
    passphrase?: string
): Promise<{
    conflicts: CategoryConflictInfo[];
    errors: Partial<Record<SyncCategory, string>>;
}> {
    const conflicts: CategoryConflictInfo[] = [];
    const errors: Partial<Record<SyncCategory, string>> = {};

    try {
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { conflicts, errors: { uiSettings: FIREBASE_ERRORS.AUTH_FAILED } };
        }

        const { db } = await ensureFirebaseInitialized();
        const { collection, getDocs } = await import('firebase/firestore');

        // Single query to get all documents
        const collRef = collection(db, SYNC_COLLECTION, userId, SYNC_SUBCOLLECTION);
        console.log(`[Firebase READ] getDocs: checkCategoriesConflicts`, { userId });
        const snapshot = await getDocs(collRef);

        // Build map of cloud payloads
        const cloudPayloads = new Map<SyncCategory, CategoryPayload>();
        snapshot.forEach((docSnap) => {
            const category = docSnap.id as SyncCategory;
            cloudPayloads.set(category, docSnap.data() as CategoryPayload);
        });

        const categories = Object.keys(categoryData) as SyncCategory[];
        const settings = loadFirebaseSettings();
        const deviceId = getDeviceId();

        for (const category of categories) {
            const localData = categoryData[category];
            if (!localData) continue;

            const cloudPayload = cloudPayloads.get(category);
            if (!cloudPayload) {
                // No cloud data - no conflict
                continue;
            }

            try {
                const localChecksum = await calculateChecksum(localData);

                // Same checksum - no conflict
                if (localChecksum === cloudPayload.checksum) {
                    continue;
                }

                // Different device made the last change - potential conflict
                if (cloudPayload.deviceId !== deviceId) {
                    const cloudTimestamp = new Date(cloudPayload.syncedAt).getTime();
                    const localTimestamp = settings.categorySyncTimes[category] ?? 0;

                    // Cloud is newer than our last sync - conflict
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

// Get metadata for all categories
export async function getAllCategoriesMetadata(): Promise<{
    categories: Partial<Record<SyncCategory, {
        exists: boolean;
        syncedAt?: string;
        deviceId?: string;
        encrypted?: boolean;
    }>>;
    error?: string;
}> {
    try {
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { categories: {}, error: FIREBASE_ERRORS.AUTH_FAILED };
        }

        const { db } = await ensureFirebaseInitialized();
        const { collection, getDocs } = await import('firebase/firestore');

        const collRef = collection(db, SYNC_COLLECTION, userId, SYNC_SUBCOLLECTION);
        console.log(`[Firebase READ] getDocs: getAllCategoriesMetadata`, { userId });
        const snapshot = await getDocs(collRef);

        const categories: Partial<Record<SyncCategory, {
            exists: boolean;
            syncedAt?: string;
            deviceId?: string;
            encrypted?: boolean;
        }>> = {};

        snapshot.forEach((docSnap) => {
            const category = docSnap.id as SyncCategory;
            if (SYNC_CATEGORIES.includes(category)) {
                const data = docSnap.data();
                categories[category] = {
                    exists: true,
                    syncedAt: data.syncedAt,
                    deviceId: data.deviceId,
                    encrypted: data.encrypted,
                };
            }
        });

        return { categories };
    } catch (err) {
        console.error('Failed to get categories metadata', err);
        return { categories: {}, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

// Get metadata for a single category
export async function getCategoryMetadata(category: SyncCategory): Promise<{
    exists: boolean;
    syncedAt?: string;
    deviceId?: string;
    encrypted?: boolean;
    error?: string;
}> {
    try {
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { exists: false, error: FIREBASE_ERRORS.AUTH_FAILED };
        }

        const { db } = await ensureFirebaseInitialized();
        const { doc, getDoc } = await import('firebase/firestore');

        const docRef = doc(db, SYNC_COLLECTION, userId, SYNC_SUBCOLLECTION, category);
        console.log(`[Firebase READ] getDoc: getCategoryMetadata ${category}`, { userId, category });
        const snapshot = await getDoc(docRef);

        if (!snapshot.exists()) {
            return { exists: false };
        }

        const data = snapshot.data();
        return {
            exists: true,
            syncedAt: data.syncedAt,
            deviceId: data.deviceId,
            encrypted: data.encrypted,
        };
    } catch (err) {
        console.error(`Failed to get metadata for category ${category}`, err);
        return { exists: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

// Delete a single category from cloud
export async function deleteCategory(category: SyncCategory): Promise<{ success: boolean; error?: string }> {
    try {
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { success: false, error: FIREBASE_ERRORS.AUTH_FAILED };
        }

        const { db } = await ensureFirebaseInitialized();
        const { doc, deleteDoc } = await import('firebase/firestore');

        const docRef = doc(db, SYNC_COLLECTION, userId, SYNC_SUBCOLLECTION, category);
        console.log(`[Firebase DELETE] deleteDoc: ${category}`, { userId, category });
        await deleteDoc(docRef);

        // Clear local sync time for this category
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

// Delete all categories from cloud using batch delete (single network request)
export async function deleteAllCategories(): Promise<{ success: boolean; errors: Partial<Record<SyncCategory, string>> }> {
    const errors: Partial<Record<SyncCategory, string>> = {};

    try {
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { success: false, errors: { uiSettings: FIREBASE_ERRORS.AUTH_FAILED } };
        }

        const { db } = await ensureFirebaseInitialized();
        const { collection, getDocs, writeBatch, doc } = await import('firebase/firestore');

        // Get all documents to delete
        const collRef = collection(db, SYNC_COLLECTION, userId, SYNC_SUBCOLLECTION);
        console.log(`[Firebase READ] getDocs: deleteAllCategories`, { userId });
        const snapshot = await getDocs(collRef);

        if (snapshot.empty) {
            return { success: true, errors };
        }

        // Batch delete all documents
        const batch = writeBatch(db);
        const deletedCategories: SyncCategory[] = [];

        snapshot.forEach((docSnap) => {
            const category = docSnap.id as SyncCategory;
            const docRef = doc(db, SYNC_COLLECTION, userId, SYNC_SUBCOLLECTION, category);
            batch.delete(docRef);
            deletedCategories.push(category);
        });

        console.log(`[Firebase DELETE] batch.commit: ${deletedCategories.length} categories`, { userId, deletedCategories });
        await batch.commit();

        // Clear local sync times for deleted categories
        const settings = loadFirebaseSettings();
        const updatedTimes = { ...settings.categorySyncTimes };
        for (const category of deletedCategories) {
            delete updatedTimes[category];
        }
        saveFirebaseSettings({ categorySyncTimes: updatedTimes });

    } catch (err) {
        console.error('Failed to delete all categories', err);
        return { success: false, errors: { uiSettings: FIREBASE_ERRORS.SYNC_FAILED } };
    }

    return { success: true, errors };
}

// Update sync time for a category (without uploading)
export function updateCategorySyncTime(category: SyncCategory, timestamp?: number): void {
    const settings = loadFirebaseSettings();
    const updatedTimes: CategorySyncTimes = {
        ...settings.categorySyncTimes,
        [category]: timestamp ?? Date.now(),
    };
    saveFirebaseSettings({ categorySyncTimes: updatedTimes });
}
