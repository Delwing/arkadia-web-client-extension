import {
    generateDeviceId,
    getDeviceId,
    loadFirebaseSettings,
    saveFirebaseSettings,
    loadFirebaseConfig,
    saveFirebaseConfig,
    clearFirebaseConfig,
    validateFirebaseConfig,
    FIREBASE_CONFIG_KEY,
    FIREBASE_SETTINGS_KEY,
    FIREBASE_DEVICE_ID_KEY,
    DEFAULT_SYNC_OPTIONS,
} from '@modules/firebase/firebaseTypes';
import { isEncryptedData } from '@modules/firebase/firebaseCrypto';

describe('generateDeviceId', () => {
    test('returns a 32-character string', () => {
        const id = generateDeviceId();
        expect(id).toHaveLength(32);
    });

    test('returns only hexadecimal characters', () => {
        const id = generateDeviceId();
        expect(id).toMatch(/^[0-9a-f]{32}$/);
    });

    test('returns different values on successive calls', () => {
        const id1 = generateDeviceId();
        const id2 = generateDeviceId();
        // This could theoretically collide, but with 128 bits of randomness it is astronomically unlikely
        expect(id1).not.toBe(id2);
    });
});

describe('getDeviceId', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('creates and persists a new device ID when none exists', () => {
        expect(localStorage.getItem(FIREBASE_DEVICE_ID_KEY)).toBeNull();
        const id = getDeviceId();
        expect(id).toHaveLength(32);
        expect(id).toMatch(/^[0-9a-f]{32}$/);
        expect(localStorage.getItem(FIREBASE_DEVICE_ID_KEY)).toBe(id);
    });

    test('returns the same ID on subsequent calls', () => {
        const id1 = getDeviceId();
        const id2 = getDeviceId();
        expect(id1).toBe(id2);
    });

    test('returns the existing ID stored in localStorage without replacing it', () => {
        const existing = 'aabbccddeeff00112233445566778899';
        localStorage.setItem(FIREBASE_DEVICE_ID_KEY, existing);
        const id = getDeviceId();
        expect(id).toBe(existing);
    });

    test('does not overwrite an existing device ID in localStorage', () => {
        const existing = 'aabbccddeeff00112233445566778899';
        localStorage.setItem(FIREBASE_DEVICE_ID_KEY, existing);
        getDeviceId();
        expect(localStorage.getItem(FIREBASE_DEVICE_ID_KEY)).toBe(existing);
    });
});

describe('loadFirebaseSettings', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('returns defaults when no stored settings exist', () => {
        const settings = loadFirebaseSettings();
        expect(settings.autoSyncEnabled).toBe(false);
        expect(settings.encryptionEnabled).toBe(false);
        expect(settings.categorySyncTimes).toEqual({});
        expect(settings.syncOptions).toEqual(DEFAULT_SYNC_OPTIONS);
    });

    test('default syncOptions has all sync categories enabled', () => {
        const settings = loadFirebaseSettings();
        expect(settings.syncOptions.uiSettings).toBe(true);
        expect(settings.syncOptions.binds).toBe(true);
        expect(settings.syncOptions.triggers).toBe(true);
        expect(settings.syncOptions.aliases).toBe(true);
        expect(settings.syncOptions.visitedRooms).toBe(true);
        expect(settings.syncOptions.locationNotes).toBe(true);
        expect(settings.syncOptions.killCounts).toBe(true);
        expect(settings.syncOptions.peopleEdits).toBe(true);
    });

    test('default deviceId is populated via getDeviceId', () => {
        const settings = loadFirebaseSettings();
        expect(settings.deviceId).toHaveLength(32);
        expect(settings.deviceId).toMatch(/^[0-9a-f]{32}$/);
    });

    test('merges partial stored settings with defaults', () => {
        localStorage.setItem(FIREBASE_SETTINGS_KEY, JSON.stringify({ autoSyncEnabled: true }));
        const settings = loadFirebaseSettings();
        expect(settings.autoSyncEnabled).toBe(true);
        expect(settings.encryptionEnabled).toBe(false);
        expect(settings.syncOptions).toEqual(DEFAULT_SYNC_OPTIONS);
        expect(settings.categorySyncTimes).toEqual({});
    });

    test('merges partial syncOptions with defaults', () => {
        localStorage.setItem(FIREBASE_SETTINGS_KEY, JSON.stringify({
            syncOptions: { uiSettings: false, binds: false },
        }));
        const settings = loadFirebaseSettings();
        expect(settings.syncOptions.uiSettings).toBe(false);
        expect(settings.syncOptions.binds).toBe(false);
        // All other sync options should remain at their defaults (true)
        expect(settings.syncOptions.triggers).toBe(true);
        expect(settings.syncOptions.aliases).toBe(true);
    });

    test('restores all stored fields when all are present', () => {
        const stored = {
            autoSyncEnabled: true,
            encryptionEnabled: true,
            categorySyncTimes: { binds: 1700000000000 },
            syncOptions: { ...DEFAULT_SYNC_OPTIONS, uiSettings: false },
        };
        localStorage.setItem(FIREBASE_SETTINGS_KEY, JSON.stringify(stored));
        const settings = loadFirebaseSettings();
        expect(settings.autoSyncEnabled).toBe(true);
        expect(settings.encryptionEnabled).toBe(true);
        expect(settings.categorySyncTimes).toEqual({ binds: 1700000000000 });
        expect(settings.syncOptions.uiSettings).toBe(false);
    });

    test('falls back to false for encryptionEnabled when stored value is not boolean', () => {
        localStorage.setItem(FIREBASE_SETTINGS_KEY, JSON.stringify({ encryptionEnabled: 'yes' }));
        const settings = loadFirebaseSettings();
        expect(settings.encryptionEnabled).toBe(false);
    });

    test('falls back to false for autoSyncEnabled when stored value is not boolean', () => {
        localStorage.setItem(FIREBASE_SETTINGS_KEY, JSON.stringify({ autoSyncEnabled: 1 }));
        const settings = loadFirebaseSettings();
        expect(settings.autoSyncEnabled).toBe(false);
    });

    test('falls back to empty object for categorySyncTimes when stored value is not an object', () => {
        localStorage.setItem(FIREBASE_SETTINGS_KEY, JSON.stringify({ categorySyncTimes: 'invalid' }));
        const settings = loadFirebaseSettings();
        expect(settings.categorySyncTimes).toEqual({});
    });

    test('always uses the device ID from localStorage rather than stored settings', () => {
        // The deviceId in returned settings always comes from getDeviceId(), not from stored JSON
        const stored = { deviceId: 'this-should-be-ignored' };
        localStorage.setItem(FIREBASE_SETTINGS_KEY, JSON.stringify(stored));
        const freshDeviceId = getDeviceId(); // This creates/retrieves from FIREBASE_DEVICE_ID_KEY
        const settings = loadFirebaseSettings();
        expect(settings.deviceId).toBe(freshDeviceId);
    });

    test('handles corrupted JSON gracefully and returns defaults', () => {
        localStorage.setItem(FIREBASE_SETTINGS_KEY, 'not-valid-json{{{');
        const settings = loadFirebaseSettings();
        expect(settings.autoSyncEnabled).toBe(false);
        expect(settings.encryptionEnabled).toBe(false);
        expect(settings.syncOptions).toEqual(DEFAULT_SYNC_OPTIONS);
    });

    test('handles null stored value gracefully and returns defaults', () => {
        // localStorage.getItem returns null when key does not exist; this is the standard no-data case
        const settings = loadFirebaseSettings();
        expect(settings.autoSyncEnabled).toBe(false);
        expect(settings.encryptionEnabled).toBe(false);
    });
});

describe('saveFirebaseSettings', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('creates new settings entry when none exist', () => {
        saveFirebaseSettings({ autoSyncEnabled: true });
        const raw = localStorage.getItem(FIREBASE_SETTINGS_KEY);
        expect(raw).not.toBeNull();
        const parsed = JSON.parse(raw!);
        expect(parsed.autoSyncEnabled).toBe(true);
    });

    test('merges partial settings with existing ones', () => {
        saveFirebaseSettings({ autoSyncEnabled: true });
        saveFirebaseSettings({ encryptionEnabled: true });
        const raw = localStorage.getItem(FIREBASE_SETTINGS_KEY);
        const parsed = JSON.parse(raw!);
        expect(parsed.autoSyncEnabled).toBe(true);
        expect(parsed.encryptionEnabled).toBe(true);
    });

    test('overwrites a previously saved field with a new value', () => {
        saveFirebaseSettings({ autoSyncEnabled: true });
        saveFirebaseSettings({ autoSyncEnabled: false });
        const raw = localStorage.getItem(FIREBASE_SETTINGS_KEY);
        const parsed = JSON.parse(raw!);
        expect(parsed.autoSyncEnabled).toBe(false);
    });

    test('preserves unrelated fields when saving a partial update', () => {
        saveFirebaseSettings({ autoSyncEnabled: true });
        saveFirebaseSettings({ encryptionEnabled: true });
        const raw = localStorage.getItem(FIREBASE_SETTINGS_KEY);
        const parsed = JSON.parse(raw!);
        expect(parsed.autoSyncEnabled).toBe(true);
        expect(parsed.encryptionEnabled).toBe(true);
    });

    test('saved settings can be loaded back by loadFirebaseSettings', () => {
        saveFirebaseSettings({ autoSyncEnabled: true, encryptionEnabled: true });
        const settings = loadFirebaseSettings();
        expect(settings.autoSyncEnabled).toBe(true);
        expect(settings.encryptionEnabled).toBe(true);
    });
});

describe('loadFirebaseConfig', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('returns null when no config is stored', () => {
        expect(loadFirebaseConfig()).toBeNull();
    });

    test('returns null for corrupted JSON', () => {
        localStorage.setItem(FIREBASE_CONFIG_KEY, '{bad json}}');
        expect(loadFirebaseConfig()).toBeNull();
    });

    test('returns null when apiKey is missing', () => {
        const incomplete = { authDomain: 'x.firebaseapp.com', projectId: 'proj', appId: '1:app' };
        localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(incomplete));
        expect(loadFirebaseConfig()).toBeNull();
    });

    test('returns null when authDomain is missing', () => {
        const incomplete = { apiKey: 'key', projectId: 'proj', appId: '1:app' };
        localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(incomplete));
        expect(loadFirebaseConfig()).toBeNull();
    });

    test('returns null when projectId is missing', () => {
        const incomplete = { apiKey: 'key', authDomain: 'x.firebaseapp.com', appId: '1:app' };
        localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(incomplete));
        expect(loadFirebaseConfig()).toBeNull();
    });

    test('returns null when appId is missing', () => {
        const incomplete = { apiKey: 'key', authDomain: 'x.firebaseapp.com', projectId: 'proj' };
        localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(incomplete));
        expect(loadFirebaseConfig()).toBeNull();
    });

    test('returns null when a required field is an empty string', () => {
        const invalid = { apiKey: '', authDomain: 'x.firebaseapp.com', projectId: 'proj', appId: '1:app' };
        localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(invalid));
        expect(loadFirebaseConfig()).toBeNull();
    });

    test('returns config for a valid complete config', () => {
        const validConfig = {
            apiKey: 'AIzaSyTest',
            authDomain: 'test.firebaseapp.com',
            projectId: 'test-project',
            appId: '1:123456:web:abcdef',
        };
        localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(validConfig));
        const config = loadFirebaseConfig();
        expect(config).toEqual(validConfig);
    });

    test('returns config including optional fields when present', () => {
        const fullConfig = {
            apiKey: 'AIzaSyTest',
            authDomain: 'test.firebaseapp.com',
            projectId: 'test-project',
            appId: '1:123456:web:abcdef',
            storageBucket: 'test.appspot.com',
            messagingSenderId: '123456',
            measurementId: 'G-ABC123',
        };
        localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(fullConfig));
        const config = loadFirebaseConfig();
        expect(config).toEqual(fullConfig);
    });
});

describe('saveFirebaseConfig', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('stores config as JSON in localStorage', () => {
        const config = {
            apiKey: 'AIzaSyTest',
            authDomain: 'test.firebaseapp.com',
            projectId: 'test-project',
            appId: '1:123456:web:abcdef',
        };
        saveFirebaseConfig(config);
        const raw = localStorage.getItem(FIREBASE_CONFIG_KEY);
        expect(raw).not.toBeNull();
        expect(JSON.parse(raw!)).toEqual(config);
    });

    test('round-trips valid config through save then load', () => {
        const config = {
            apiKey: 'AIzaSyTest',
            authDomain: 'test.firebaseapp.com',
            projectId: 'test-project',
            appId: '1:123456:web:abcdef',
        };
        saveFirebaseConfig(config);
        const loaded = loadFirebaseConfig();
        expect(loaded).toEqual(config);
    });

    test('overwrites a previously saved config', () => {
        const config1 = {
            apiKey: 'key1',
            authDomain: 'a.firebaseapp.com',
            projectId: 'project-a',
            appId: '1:111:web:aaa',
        };
        const config2 = {
            apiKey: 'key2',
            authDomain: 'b.firebaseapp.com',
            projectId: 'project-b',
            appId: '1:222:web:bbb',
        };
        saveFirebaseConfig(config1);
        saveFirebaseConfig(config2);
        expect(loadFirebaseConfig()).toEqual(config2);
    });
});

describe('clearFirebaseConfig', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('removes the config from localStorage', () => {
        const config = {
            apiKey: 'key',
            authDomain: 'x.firebaseapp.com',
            projectId: 'proj',
            appId: '1:app',
        };
        saveFirebaseConfig(config);
        clearFirebaseConfig();
        expect(localStorage.getItem(FIREBASE_CONFIG_KEY)).toBeNull();
    });

    test('loadFirebaseConfig returns null after clearing', () => {
        const config = {
            apiKey: 'key',
            authDomain: 'x.firebaseapp.com',
            projectId: 'proj',
            appId: '1:app',
        };
        saveFirebaseConfig(config);
        clearFirebaseConfig();
        expect(loadFirebaseConfig()).toBeNull();
    });

    test('does not throw when no config is stored', () => {
        expect(() => clearFirebaseConfig()).not.toThrow();
    });
});

describe('validateFirebaseConfig', () => {
    test('returns true for a valid config with all required fields', () => {
        const config = {
            apiKey: 'AIzaSyTest',
            authDomain: 'test.firebaseapp.com',
            projectId: 'test-project',
            appId: '1:123456:web:abcdef',
        };
        expect(validateFirebaseConfig(config)).toBe(true);
    });

    test('returns true when optional fields are also present', () => {
        const config = {
            apiKey: 'AIzaSyTest',
            authDomain: 'test.firebaseapp.com',
            projectId: 'test-project',
            appId: '1:123456:web:abcdef',
            storageBucket: 'test.appspot.com',
            messagingSenderId: '123456',
        };
        expect(validateFirebaseConfig(config)).toBe(true);
    });

    test('returns false for null', () => {
        expect(validateFirebaseConfig(null)).toBe(false);
    });

    test('returns false for undefined', () => {
        expect(validateFirebaseConfig(undefined)).toBe(false);
    });

    test('returns false for a non-object (string)', () => {
        expect(validateFirebaseConfig('config-string')).toBe(false);
    });

    test('returns false for a non-object (number)', () => {
        expect(validateFirebaseConfig(42)).toBe(false);
    });

    test('returns false for an empty object', () => {
        expect(validateFirebaseConfig({})).toBe(false);
    });

    test('returns false when apiKey is missing', () => {
        const config = { authDomain: 'x.firebaseapp.com', projectId: 'proj', appId: '1:app' };
        expect(validateFirebaseConfig(config)).toBe(false);
    });

    test('returns false when authDomain is missing', () => {
        const config = { apiKey: 'key', projectId: 'proj', appId: '1:app' };
        expect(validateFirebaseConfig(config)).toBe(false);
    });

    test('returns false when projectId is missing', () => {
        const config = { apiKey: 'key', authDomain: 'x.firebaseapp.com', appId: '1:app' };
        expect(validateFirebaseConfig(config)).toBe(false);
    });

    test('returns false when appId is missing', () => {
        const config = { apiKey: 'key', authDomain: 'x.firebaseapp.com', projectId: 'proj' };
        expect(validateFirebaseConfig(config)).toBe(false);
    });

    test('returns false when apiKey is an empty string', () => {
        const config = { apiKey: '', authDomain: 'x.firebaseapp.com', projectId: 'proj', appId: '1:app' };
        expect(validateFirebaseConfig(config)).toBe(false);
    });

    test('returns false when authDomain is an empty string', () => {
        const config = { apiKey: 'key', authDomain: '', projectId: 'proj', appId: '1:app' };
        expect(validateFirebaseConfig(config)).toBe(false);
    });

    test('returns false when projectId is an empty string', () => {
        const config = { apiKey: 'key', authDomain: 'x.firebaseapp.com', projectId: '', appId: '1:app' };
        expect(validateFirebaseConfig(config)).toBe(false);
    });

    test('returns false when appId is an empty string', () => {
        const config = { apiKey: 'key', authDomain: 'x.firebaseapp.com', projectId: 'proj', appId: '' };
        expect(validateFirebaseConfig(config)).toBe(false);
    });

    test('returns false when a required field is a non-string type', () => {
        const config = { apiKey: 123, authDomain: 'x.firebaseapp.com', projectId: 'proj', appId: '1:app' };
        expect(validateFirebaseConfig(config)).toBe(false);
    });
});

describe('isEncryptedData', () => {
    test('returns true for a valid encrypted data object', () => {
        const data = { ciphertext: 'abc123', iv: 'def456', salt: 'ghi789' };
        expect(isEncryptedData(data)).toBe(true);
    });

    test('returns false for null', () => {
        expect(isEncryptedData(null)).toBe(false);
    });

    test('returns false for undefined', () => {
        expect(isEncryptedData(undefined)).toBe(false);
    });

    test('returns false for a string', () => {
        expect(isEncryptedData('encrypted-string')).toBe(false);
    });

    test('returns false for a number', () => {
        expect(isEncryptedData(42)).toBe(false);
    });

    test('returns false for an empty object', () => {
        expect(isEncryptedData({})).toBe(false);
    });

    test('returns false when ciphertext is missing', () => {
        const data = { iv: 'def456', salt: 'ghi789' };
        expect(isEncryptedData(data)).toBe(false);
    });

    test('returns false when iv is missing', () => {
        const data = { ciphertext: 'abc123', salt: 'ghi789' };
        expect(isEncryptedData(data)).toBe(false);
    });

    test('returns false when salt is missing', () => {
        const data = { ciphertext: 'abc123', iv: 'def456' };
        expect(isEncryptedData(data)).toBe(false);
    });

    test('returns false when ciphertext is not a string', () => {
        const data = { ciphertext: 42, iv: 'def456', salt: 'ghi789' };
        expect(isEncryptedData(data)).toBe(false);
    });

    test('returns false when iv is not a string', () => {
        const data = { ciphertext: 'abc123', iv: true, salt: 'ghi789' };
        expect(isEncryptedData(data)).toBe(false);
    });

    test('returns false when salt is not a string', () => {
        const data = { ciphertext: 'abc123', iv: 'def456', salt: null };
        expect(isEncryptedData(data)).toBe(false);
    });

    test('returns true when all fields are present strings even if empty', () => {
        // The guard only checks typeof === 'string', not length
        const data = { ciphertext: '', iv: '', salt: '' };
        expect(isEncryptedData(data)).toBe(true);
    });
});
