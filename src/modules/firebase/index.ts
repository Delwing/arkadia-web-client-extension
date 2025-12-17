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

// Sync (per-category)
export {
    uploadCategory,
    uploadCategories,
    downloadCategory,
    downloadCategories,
    checkCategoryConflict,
    checkCategoriesConflicts,
    getAllCategoriesMetadata,
    getCategoryMetadata,
    deleteCategory,
    deleteAllCategories,
    updateCategorySyncTime,
    canPerformSyncCheck,
    updateLastSyncCheckTime,
    SYNC_CHECK_INTERVAL_MS,
} from './firebaseSync';

// Crypto
export {
    encrypt,
    decrypt,
    calculateChecksum,
    isEncryptedData,
} from './firebaseCrypto';
