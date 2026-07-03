// Firebase configuration provided by user
export interface FirebaseUserConfig {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId: string;
    measurementId?: string;
}

// Categories, their display names, defaults and storage mappings all derive
// from the category registry — see ./categoryRegistry.
import { DEFAULT_SYNC_OPTIONS } from './categoryRegistry';
import type { SyncCategory, SyncOptions } from './categoryRegistry';

export {
    CATEGORY_REGISTRY,
    getCategoryDefinition,
    CATEGORY_GROUPS,
    getCategoriesByGroup,
    SYNC_CATEGORIES,
    SYNC_CATEGORY_NAMES,
    DEFAULT_SYNC_OPTIONS,
    COLD_SYNC_CATEGORIES,
    COLD_STORAGE_KEYS,
    DEVICE_SCOPED_SYNC_CATEGORIES,
} from './categoryRegistry';
export type { SyncCategory, SyncOptions, CategoryDefinition, CategoryGroup } from './categoryRegistry';

// Encrypted data structure
export interface EncryptedData {
    ciphertext: string;  // Base64
    iv: string;          // Base64 (12 bytes for AES-GCM)
    salt: string;        // Base64 (16 bytes for PBKDF2)
}

// Per-category payload stored in Firestore
// Path: users/{userId}/sync/{category}
export interface CategoryPayload {
    version: 1;
    syncedAt: string;
    deviceId: string;
    checksum: string;
    encrypted: boolean;
    data: string;  // JSON string (encrypted or plain)
}

// Per-category sync status
export interface CategorySyncStatus {
    category: SyncCategory;
    lastSyncTime: number | null;
    checksum: string | null;
    hasLocalChanges: boolean;
    hasCloudData: boolean;
}

// Per-category conflict information
export interface CategoryConflictInfo {
    category: SyncCategory;
    localTimestamp: number;
    cloudTimestamp: number;
    localChecksum: string;
    cloudChecksum: string;
    cloudData: CategoryPayload;
}

export type ConflictResolution = 'keep-local' | 'use-cloud' | 'cancel';

// Per-category sync timestamps
export type CategorySyncTimes = Partial<Record<SyncCategory, number>>;

// Per-category checksums of the last state this device synced (uploaded,
// applied or downloaded). Acts as the three-way merge base for conflict
// detection: local != base means we changed, cloud != base means the cloud
// changed. Unlike timestamps this is immune to clock skew between devices.
export type CategorySyncChecksums = Partial<Record<SyncCategory, string>>;

// Firebase settings stored in localStorage
export interface FirebaseSettings {
    syncOptions: SyncOptions;
    encryptionEnabled: boolean;
    autoSyncEnabled: boolean;
    categorySyncTimes: CategorySyncTimes;
    categorySyncChecksums: CategorySyncChecksums;
    deviceId: string;
}

// Auth state
export interface FirebaseAuthState {
    isAuthenticated: boolean;
    userId: string | null;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
    providerId: string | null;
    loading: boolean;
    error: string | null;
}

export const INITIAL_AUTH_STATE: FirebaseAuthState = {
    isAuthenticated: false,
    userId: null,
    email: null,
    displayName: null,
    photoURL: null,
    providerId: null,
    loading: true,
    error: null,
};

// Storage keys
export const FIREBASE_CONFIG_KEY = 'arkadia.firebaseConfig';
export const FIREBASE_SETTINGS_KEY = 'arkadia.firebaseSettings';
export const FIREBASE_DEVICE_ID_KEY = 'arkadia.firebaseDeviceId';

// Error messages (Polish)
export const FIREBASE_ERRORS = {
    INVALID_CONFIG: 'Nieprawidlowa konfiguracja Firebase.',
    AUTH_FAILED: 'Logowanie nie powiodlo sie.',
    REGISTER_FAILED: 'Rejestracja nie powiodla sie.',
    WRONG_PASSPHRASE: 'Nieprawidlowe haslo szyfrowania.',
    SYNC_FAILED: 'Synchronizacja nie powiodla sie.',
    ENCRYPTION_FAILED: 'Szyfrowanie danych nie powiodlo sie.',
    DECRYPTION_FAILED: 'Odszyfrowanie nie powiodlo sie. Sprawdz haslo.',
    NETWORK_ERROR: 'Blad polaczenia z serwerem.',
    NOT_INITIALIZED: 'Firebase nie zostal zainicjalizowany.',
    EMAIL_IN_USE: 'Ten adres email jest juz uzywany.',
    WEAK_PASSWORD: 'Haslo jest zbyt slabe. Uzyj co najmniej 6 znakow.',
    INVALID_EMAIL: 'Nieprawidlowy adres email.',
    USER_NOT_FOUND: 'Nie znaleziono uzytkownika z tym adresem email.',
    WRONG_PASSWORD: 'Nieprawidlowe haslo.',
    POPUP_BLOCKED: 'Popup zostal zablokowany. Odblokuj popupy dla tej strony.',
    POPUP_CLOSED: 'Logowanie zostalo anulowane.',
};

// Helper to generate device ID
export function generateDeviceId(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Helper to get or create device ID
export function getDeviceId(): string {
    let deviceId = localStorage.getItem(FIREBASE_DEVICE_ID_KEY);
    if (!deviceId) {
        deviceId = generateDeviceId();
        localStorage.setItem(FIREBASE_DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
}

// Load Firebase settings from localStorage
export function loadFirebaseSettings(): FirebaseSettings {
    const defaults: FirebaseSettings = {
        syncOptions: { ...DEFAULT_SYNC_OPTIONS },
        encryptionEnabled: false,
        autoSyncEnabled: false,
        categorySyncTimes: {},
        categorySyncChecksums: {},
        deviceId: getDeviceId(),
    };

    try {
        const raw = localStorage.getItem(FIREBASE_SETTINGS_KEY);
        if (!raw) return defaults;
        const parsed = JSON.parse(raw);
        return {
            syncOptions: { ...defaults.syncOptions, ...parsed.syncOptions },
            encryptionEnabled: typeof parsed.encryptionEnabled === 'boolean' ? parsed.encryptionEnabled : false,
            autoSyncEnabled: typeof parsed.autoSyncEnabled === 'boolean' ? parsed.autoSyncEnabled : false,
            categorySyncTimes: parsed.categorySyncTimes && typeof parsed.categorySyncTimes === 'object'
                ? parsed.categorySyncTimes
                : {},
            categorySyncChecksums: parsed.categorySyncChecksums && typeof parsed.categorySyncChecksums === 'object'
                ? parsed.categorySyncChecksums
                : {},
            deviceId: defaults.deviceId,
        };
    } catch {
        return defaults;
    }
}

// Save Firebase settings to localStorage
export function saveFirebaseSettings(settings: Partial<FirebaseSettings>): void {
    try {
        const current = loadFirebaseSettings();
        const updated = { ...current, ...settings };
        localStorage.setItem(FIREBASE_SETTINGS_KEY, JSON.stringify(updated));
    } catch (err) {
        console.error('Failed to save Firebase settings', err);
    }
}

// Load Firebase config from localStorage
export function loadFirebaseConfig(): FirebaseUserConfig | null {
    try {
        const raw = localStorage.getItem(FIREBASE_CONFIG_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed.apiKey || !parsed.authDomain || !parsed.projectId || !parsed.appId) {
            return null;
        }
        return parsed as FirebaseUserConfig;
    } catch {
        return null;
    }
}

// Save Firebase config to localStorage
export function saveFirebaseConfig(config: FirebaseUserConfig): void {
    try {
        localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
    } catch (err) {
        console.error('Failed to save Firebase config', err);
    }
}

// Clear Firebase config from localStorage
export function clearFirebaseConfig(): void {
    try {
        localStorage.removeItem(FIREBASE_CONFIG_KEY);
    } catch (err) {
        console.error('Failed to clear Firebase config', err);
    }
}

// Validate Firebase config structure
export function validateFirebaseConfig(input: unknown): input is FirebaseUserConfig {
    if (!input || typeof input !== 'object') return false;
    const config = input as Record<string, unknown>;
    return (
        typeof config.apiKey === 'string' && config.apiKey.length > 0 &&
        typeof config.authDomain === 'string' && config.authDomain.length > 0 &&
        typeof config.projectId === 'string' && config.projectId.length > 0 &&
        typeof config.appId === 'string' && config.appId.length > 0
    );
}
