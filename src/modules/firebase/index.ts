// Firebase module exports

// Types
export type {
    FirebaseUserConfig,
    SyncOptions,
    SyncCategory,
    EncryptedData,
    CategoryPayload,
    CategorySyncStatus,
    CategoryConflictInfo,
    CategorySyncTimes,
    ConflictResolution,
    FirebaseSettings,
    FirebaseAuthState,
} from './firebaseTypes';

export {
    DEFAULT_SYNC_OPTIONS,
    SYNC_CATEGORIES,
    SYNC_CATEGORY_NAMES,
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
    SYNC_CHECK_INTERVAL_MS,
    canPerformSyncCheck,
    updateLastSyncCheckTime,

    // Category sync
    uploadCategories,
    downloadCategories,
    checkCategoriesConflicts,
    checkConflictsLocally,
    getAllCategoriesMetadata,
    deleteCategory,
    deleteAllCategories,
    updateCategorySyncTime,

    // Device registry
    registerDevice,
    getRegisteredDevices,
    unregisterDevice,

    // Sync groups
    createSyncGroup,
    joinSyncGroup,
    leaveSyncGroupCloud,
    uploadSyncedSettings,
    checkForSyncUpdates,
    resolveSyncConflict,
    syncNow,
    getRemoteDeviceName,
    getCloudSyncGroup,
    getCloudSyncGroups,
    getCloudGroupSettings,
    getCloudDeviceSettings,
    copySettingsFromCloudGroup,
    copySettingsFromCloudDevice,
    deleteEmptySyncGroup,
} from './firebaseUnifiedSync';

export type { DownloadedCategoryMeta } from './firebaseUnifiedSync';

// Sync debounce manager (hot/cold sync)
export { syncDebounceManager } from './syncDebounceManager';
export type { SyncDebounceCallbacks } from './syncDebounceManager';

// Real-time sync listener
export { syncListener } from './firebaseSyncListener';

// Headless auto-sync engine (storage watching + debounced upload)
export { syncEngine } from './syncEngine';
export type { SyncRunResult } from './syncEngine';
