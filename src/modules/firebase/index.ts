// Firebase module exports

// Types
export type {
    FirebaseUserConfig,
    SyncOptions,
    SyncCategory,
    CategoryDefinition,
    CategoryGroup,
    EncryptedData,
    CategoryPayload,
    CategorySyncStatus,
    CategoryConflictInfo,
    CategorySyncTimes,
    CategorySyncChecksums,
    ConflictResolution,
    FirebaseSettings,
    FirebaseAuthState,
} from './firebaseTypes';

export {
    CATEGORY_REGISTRY,
    getCategoryDefinition,
    CATEGORY_GROUPS,
    getCategoriesByGroup,
    DEFAULT_SYNC_OPTIONS,
    SYNC_CATEGORIES,
    SYNC_CATEGORY_NAMES,
    COLD_SYNC_CATEGORIES,
    COLD_STORAGE_KEYS,
    DEVICE_SCOPED_SYNC_CATEGORIES,
    INITIAL_AUTH_STATE,
    FIREBASE_CONFIG_KEY,
    FIREBASE_SETTINGS_KEY,
    FIREBASE_DEVICE_ID_KEY,
    FIREBASE_ERRORS,
    generateDeviceId,
    getDeviceId,
    loadFirebaseSettings,
    saveFirebaseSettings,
    loadFirebaseConfig,
    saveFirebaseConfig,
    clearFirebaseConfig,
    validateFirebaseConfig,
} from './firebaseTypes';

// Config
export {
    isFirebaseInitialized,
    getFirebaseApp,
    getFirebaseAuth,
    getFirestore,
    initializeFirebase,
    cleanupFirebase,
    ensureFirebaseInitialized,
} from './firebaseConfig';

// Auth
export {
    getCurrentAuthState,
    registerWithEmail,
    signInWithEmail,
    signInWithGoogle,
    signOut,
    onAuthStateChanged,
    sendPasswordReset,
} from './firebaseAuth';

// Crypto
export {
    encrypt,
    decrypt,
    calculateChecksum,
    isEncryptedData,
} from './firebaseCrypto';

// ============================================================================
// UNIFIED SYNC - Single document for all data (categories + devices + groups)
// ============================================================================

export {
    // Core
    getFullSyncData,
    invalidateSyncCache,

    // Category sync
    uploadCategories,
    downloadCategories,
    planSync,
    getAllCategoriesMetadata,
    deleteCategory,
    deleteAllCategories,
    updateCategorySyncTime,
    recordCategorySyncState,

    // Device registry
    registerDevice,
    getRegisteredDevices,
    unregisterDevice,

    // Sync groups (membership)
    createSyncGroup,
    joinSyncGroup,
    leaveSyncGroupCloud,
    getCloudSyncGroups,
    copySettingsFromCloudDevice,
    deleteEmptySyncGroup,
} from './firebaseUnifiedSync';

export type { DownloadedCategoryMeta, SyncPlan, UploadCategoriesResult } from './firebaseUnifiedSync';

// Sync debounce manager (hot/cold sync)
export { syncDebounceManager } from './syncDebounceManager';
export type { SyncDebounceCallbacks } from './syncDebounceManager';

// Real-time sync listener
export { syncListener } from './firebaseSyncListener';

// Headless auto-sync engine (storage watching + debounced upload)
export { syncEngine } from './syncEngine';
export type { SyncRunResult } from './syncEngine';
