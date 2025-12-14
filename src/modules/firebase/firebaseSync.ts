import type { CategoryPayload, SyncCategory, CategoryConflictInfo, EncryptedData, CategorySyncTimes } from './firebaseTypes';
import { FIREBASE_ERRORS, getDeviceId, saveFirebaseSettings, loadFirebaseSettings, SYNC_CATEGORIES } from './firebaseTypes';
import { ensureFirebaseInitialized, getFirebaseAuth } from './firebaseConfig';
import { encrypt, decrypt, calculateChecksum, isEncryptedData } from './firebaseCrypto';

const SYNC_COLLECTION = 'users';
const SYNC_SUBCOLLECTION = 'sync';

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

// Upload multiple categories to Firestore
export async function uploadCategories(
    categoryData: Partial<Record<SyncCategory, string>>,
    options: {
        encrypted: boolean;
        passphrase?: string;
    }
): Promise<{ success: boolean; errors: Partial<Record<SyncCategory, string>>; timestamps: CategorySyncTimes }> {
    const errors: Partial<Record<SyncCategory, string>> = {};
    const timestamps: CategorySyncTimes = {};

    const categories = Object.keys(categoryData) as SyncCategory[];

    await Promise.all(
        categories.map(async (category) => {
            const data = categoryData[category];
            if (!data) return;

            const result = await uploadCategory(category, data, options);
            if (result.success && result.timestamp) {
                timestamps[category] = result.timestamp;
            } else if (result.error) {
                errors[category] = result.error;
            }
        })
    );

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

// Download multiple categories from Firestore
export async function downloadCategories(
    categories: SyncCategory[],
    passphrase?: string
): Promise<{
    success: boolean;
    data: Partial<Record<SyncCategory, string>>;
    errors: Partial<Record<SyncCategory, string>>;
}> {
    const data: Partial<Record<SyncCategory, string>> = {};
    const errors: Partial<Record<SyncCategory, string>> = {};

    await Promise.all(
        categories.map(async (category) => {
            const result = await downloadCategory(category, passphrase);
            if (result.success && result.data !== undefined) {
                data[category] = result.data;
            } else if (result.error) {
                errors[category] = result.error;
            }
        })
    );

    const success = Object.keys(errors).length === 0;
    return { success, data, errors };
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

// Check for conflicts on multiple categories
export async function checkCategoriesConflicts(
    categoryData: Partial<Record<SyncCategory, string>>,
    passphrase?: string
): Promise<{
    conflicts: CategoryConflictInfo[];
    errors: Partial<Record<SyncCategory, string>>;
}> {
    const conflicts: CategoryConflictInfo[] = [];
    const errors: Partial<Record<SyncCategory, string>> = {};

    const categories = Object.keys(categoryData) as SyncCategory[];

    await Promise.all(
        categories.map(async (category) => {
            const data = categoryData[category];
            if (!data) return;

            const result = await checkCategoryConflict(category, data, passphrase);
            if (result.hasConflict && result.conflictInfo) {
                conflicts.push(result.conflictInfo);
            } else if (result.error) {
                errors[category] = result.error;
            }
        })
    );

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

// Delete all categories from cloud
export async function deleteAllCategories(): Promise<{ success: boolean; errors: Partial<Record<SyncCategory, string>> }> {
    const errors: Partial<Record<SyncCategory, string>> = {};

    // Get all existing categories first
    const metadata = await getAllCategoriesMetadata();
    if (metadata.error) {
        return { success: false, errors: { uiSettings: metadata.error } };
    }

    const existingCategories = Object.keys(metadata.categories) as SyncCategory[];

    await Promise.all(
        existingCategories.map(async (category) => {
            const result = await deleteCategory(category);
            if (!result.success && result.error) {
                errors[category] = result.error;
            }
        })
    );

    const success = Object.keys(errors).length === 0;
    return { success, errors };
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
