/**
 * Firebase Device Sync Module
 *
 * Handles device registration and sync groups using Firestore.
 * - Auto-registers device on login
 * - Manages sync groups for sharing UI settings between devices
 * - Syncs on load (no realtime listeners)
 */

import type { DeviceInfo, SyncGroup, SyncedDeviceSettings, SyncConflict } from '@modules/device';
import {
    getDeviceInfo,
    getSyncState,
    setSyncState,
    clearSyncState,
    getRawDeviceSettings,
    calculateSettingsChecksum,
    applySyncedSettings,
    getDeviceDisplayName,
} from '@modules/device';
import { FIREBASE_ERRORS } from './firebaseTypes';
import { ensureFirebaseInitialized, getFirebaseAuth } from './firebaseConfig';

// Firestore paths - SINGLE DOCUMENT for all device data to minimize reads
const USERS_COLLECTION = 'users';
const DEVICE_STATE_DOC = 'deviceState'; // Combined: devices + group + settings

// ============================================================================
// Device Registry - Auto-register devices on login
// ============================================================================

/**
 * Register current device in the cloud registry
 * Called automatically on Firebase login
 */
export async function registerDevice(): Promise<{ success: boolean; error?: string }> {
    try {
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { success: false, error: FIREBASE_ERRORS.AUTH_FAILED };
        }

        const { db } = await ensureFirebaseInitialized();
        const { doc, setDoc } = await import('firebase/firestore');

        const deviceInfo = getDeviceInfo();
        const docRef = doc(db, USERS_COLLECTION, userId, 'sync', DEVICE_STATE_DOC);

        console.log(`[Firebase WRITE] registerDevice: ${deviceInfo.id}`);
        await setDoc(docRef, {
            [`devices.${deviceInfo.id}`]: {
                ...deviceInfo,
                lastSeen: new Date().toISOString(),
            },
        }, { merge: true });

        return { success: true };
    } catch (err) {
        console.error('Failed to register device', err);
        return { success: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

/**
 * Get all registered devices for the current user
 */
export async function getRegisteredDevices(): Promise<{
    devices: DeviceInfo[];
    error?: string;
}> {
    try {
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { devices: [], error: FIREBASE_ERRORS.AUTH_FAILED };
        }

        const { db } = await ensureFirebaseInitialized();
        const { doc, getDoc } = await import('firebase/firestore');

        const docRef = doc(db, USERS_COLLECTION, userId, 'sync', DEVICE_STATE_DOC);
        console.log(`[Firebase READ] getRegisteredDevices`);
        const snapshot = await getDoc(docRef);

        if (!snapshot.exists()) {
            return { devices: [] };
        }

        const data = snapshot.data() as CloudDeviceState;
        const devices: DeviceInfo[] = [];

        if (data?.devices && typeof data.devices === 'object') {
            Object.values(data.devices).forEach((device: unknown) => {
                if (device && typeof device === 'object' && 'id' in device) {
                    devices.push(device as DeviceInfo);
                }
            });
        }

        return { devices };
    } catch (err) {
        console.error('Failed to get registered devices', err);
        return { devices: [], error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

/**
 * Remove a device from the registry
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

        const docRef = doc(db, USERS_COLLECTION, userId, 'sync', DEVICE_STATE_DOC);

        console.log(`[Firebase WRITE] unregisterDevice: ${deviceId}`);
        await updateDoc(docRef, {
            [`devices.${deviceId}`]: deleteField(),
        });

        return { success: true };
    } catch (err) {
        console.error('Failed to unregister device', err);
        return { success: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

// ============================================================================
// Combined Document Structure
// ============================================================================

interface CloudDeviceState {
    // Device registry
    devices?: { [deviceId: string]: DeviceInfo };
    // Sync group (null if not in a group)
    group?: SyncGroup | null;
    // Synced settings (null if no group)
    settings?: SyncedDeviceSettings | null;
    // Last update timestamp
    updatedAt?: string;
}

// ============================================================================
// Sync Groups - Share settings between devices
// ============================================================================

/**
 * Create a new sync group and upload initial settings
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

        const { db } = await ensureFirebaseInitialized();
        const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');

        const deviceInfo = getDeviceInfo();
        const now = new Date().toISOString();
        const checksum = await calculateSettingsChecksum();

        // Create sync group
        const group: SyncGroup = {
            id: crypto.randomUUID(),
            name: name.trim() || 'Moje urzadzenia',
            devices: [deviceInfo.id],
            createdAt: now,
            updatedAt: now,
        };

        // Create initial settings
        const settings: SyncedDeviceSettings = {
            groupId: group.id,
            version: 1,
            updatedAt: now,
            updatedByDeviceId: deviceInfo.id,
            checksum,
            settings: getRawDeviceSettings(),
        };

        // Save to Firestore (merge with existing device registry)
        const docRef = doc(db, USERS_COLLECTION, userId, 'sync', DEVICE_STATE_DOC);
        console.log(`[Firebase WRITE] createSyncGroup: ${group.id}`);
        await setDoc(docRef, {
            group,
            settings,
            updatedAt: serverTimestamp(),
        }, { merge: true });

        // Update local state
        setSyncState({ group, version: 1 });

        return { success: true, group };
    } catch (err) {
        console.error('Failed to create sync group', err);
        return { success: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

/**
 * Join an existing sync group (by group ID)
 * Downloads and applies the group's settings
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

        const { db } = await ensureFirebaseInitialized();
        const { doc, getDoc, setDoc, serverTimestamp } = await import('firebase/firestore');

        const docRef = doc(db, USERS_COLLECTION, userId, 'sync', DEVICE_STATE_DOC);
        console.log(`[Firebase READ] joinSyncGroup: ${groupId}`);
        const snapshot = await getDoc(docRef);

        if (!snapshot.exists()) {
            return { success: false, error: 'Grupa synchronizacji nie istnieje.' };
        }

        const data = snapshot.data() as CloudDeviceState;
        if (!data.group || data.group.id !== groupId) {
            return { success: false, error: 'Grupa synchronizacji nie istnieje.' };
        }

        // Add this device to the group
        const deviceInfo = getDeviceInfo();
        if (!data.group.devices.includes(deviceInfo.id)) {
            data.group.devices.push(deviceInfo.id);
            data.group.updatedAt = new Date().toISOString();

            console.log(`[Firebase WRITE] joinSyncGroup: adding device ${deviceInfo.id}`);
            await setDoc(docRef, {
                group: data.group,
                updatedAt: serverTimestamp(),
            }, { merge: true });
        }

        // Apply settings from the group
        if (data.settings) {
            applySyncedSettings(data.settings);
        }

        // Update local state
        setSyncState({ group: data.group, version: data.settings?.version ?? 1 });

        return { success: true, group: data.group };
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
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { success: false, error: FIREBASE_ERRORS.AUTH_FAILED };
        }

        const state = getSyncState();
        if (!state) {
            return { success: true }; // Already not in a group
        }

        const { db } = await ensureFirebaseInitialized();
        const { doc, getDoc, setDoc, serverTimestamp, deleteField } = await import('firebase/firestore');

        const docRef = doc(db, USERS_COLLECTION, userId, 'sync', DEVICE_STATE_DOC);
        console.log(`[Firebase READ] leaveSyncGroupCloud`);
        const snapshot = await getDoc(docRef);

        if (snapshot.exists()) {
            const data = snapshot.data() as CloudDeviceState;
            const deviceInfo = getDeviceInfo();

            if (data.group) {
                // Remove this device from the group
                data.group.devices = data.group.devices.filter(id => id !== deviceInfo.id);

                if (data.group.devices.length === 0) {
                    // Last device - clear group and settings but keep device registry
                    console.log(`[Firebase WRITE] leaveSyncGroupCloud: clearing group (last device)`);
                    await setDoc(docRef, {
                        group: deleteField(),
                        settings: deleteField(),
                        updatedAt: serverTimestamp(),
                    }, { merge: true });
                } else {
                    // Update the group without this device
                    console.log(`[Firebase WRITE] leaveSyncGroupCloud: removing device`);
                    await setDoc(docRef, {
                        group: data.group,
                        updatedAt: serverTimestamp(),
                    }, { merge: true });
                }
            }
        }

        // Clear local state
        clearSyncState();

        return { success: true };
    } catch (err) {
        console.error('Failed to leave sync group', err);
        return { success: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

/**
 * Upload current device settings to the sync group
 */
export async function uploadSyncedSettings(): Promise<{ success: boolean; error?: string }> {
    try {
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { success: false, error: FIREBASE_ERRORS.AUTH_FAILED };
        }

        const state = getSyncState();
        if (!state) {
            return { success: false, error: 'Nie nalezysz do zadnej grupy synchronizacji.' };
        }

        const { db } = await ensureFirebaseInitialized();
        const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');

        const deviceInfo = getDeviceInfo();
        const checksum = await calculateSettingsChecksum();
        const newVersion = state.version + 1;
        const now = new Date().toISOString();

        const settings: SyncedDeviceSettings = {
            groupId: state.group.id,
            version: newVersion,
            updatedAt: now,
            updatedByDeviceId: deviceInfo.id,
            checksum,
            settings: getRawDeviceSettings(),
        };

        const docRef = doc(db, USERS_COLLECTION, userId, 'sync', DEVICE_STATE_DOC);
        console.log(`[Firebase WRITE] uploadSyncedSettings: version ${newVersion}`);
        await setDoc(docRef, {
            settings,
            updatedAt: serverTimestamp(),
        }, { merge: true });

        // Update local version
        setSyncState({ ...state, version: newVersion });

        return { success: true };
    } catch (err) {
        console.error('Failed to upload synced settings', err);
        return { success: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

/**
 * Check for sync updates (called on load)
 * Returns conflict if cloud has newer settings from another device
 */
export async function checkForSyncUpdates(): Promise<{
    hasUpdate: boolean;
    conflict?: SyncConflict;
    error?: string;
}> {
    try {
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { hasUpdate: false, error: FIREBASE_ERRORS.AUTH_FAILED };
        }

        const state = getSyncState();
        if (!state) {
            return { hasUpdate: false }; // Not in a group
        }

        const { db } = await ensureFirebaseInitialized();
        const { doc, getDoc } = await import('firebase/firestore');

        const docRef = doc(db, USERS_COLLECTION, userId, 'sync', DEVICE_STATE_DOC);
        console.log(`[Firebase READ] checkForSyncUpdates`);
        const snapshot = await getDoc(docRef);

        if (!snapshot.exists()) {
            return { hasUpdate: false };
        }

        const data = snapshot.data() as CloudDeviceState;
        if (!data.settings) {
            return { hasUpdate: false };
        }

        const deviceInfo = getDeviceInfo();
        const localChecksum = await calculateSettingsChecksum();

        // No update if checksums match
        if (data.settings.checksum === localChecksum) {
            return { hasUpdate: false };
        }

        // No conflict if we made the change
        if (data.settings.updatedByDeviceId === deviceInfo.id) {
            return { hasUpdate: false };
        }

        // Cloud has different settings from another device
        if (data.settings.version > state.version) {
            // Cloud is newer - potential conflict
            const conflict: SyncConflict = {
                groupId: state.group.id,
                localVersion: state.version,
                remoteVersion: data.settings.version,
                remoteUpdatedBy: data.settings.updatedByDeviceId,
                remoteUpdatedAt: data.settings.updatedAt,
                remoteSettings: data.settings,
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
 * Resolve a sync conflict by choosing local or remote settings
 */
export async function resolveSyncConflict(
    choice: 'keep-local' | 'use-remote',
    conflict: SyncConflict
): Promise<{ success: boolean; error?: string }> {
    try {
        if (choice === 'use-remote') {
            // Apply remote settings
            applySyncedSettings(conflict.remoteSettings);
            // Update local version to match
            const state = getSyncState();
            if (state) {
                setSyncState({ ...state, version: conflict.remoteVersion });
            }
            return { success: true };
        } else {
            // Keep local - upload our settings as newer version
            return uploadSyncedSettings();
        }
    } catch (err) {
        console.error('Failed to resolve sync conflict', err);
        return { success: false, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}

/**
 * Sync now - checks for updates and uploads if needed
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

        // No conflict - upload our current settings
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
 * Get the remote device name from a device ID
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
 * Get full device state with a single read (for local caching)
 * Returns devices, group, and settings in one read operation
 */
export async function getFullDeviceState(): Promise<{
    devices: DeviceInfo[];
    group: SyncGroup | null;
    settings: SyncedDeviceSettings | null;
    error?: string;
}> {
    try {
        const auth = getFirebaseAuth();
        const userId = auth?.currentUser?.uid;
        if (!userId) {
            return { devices: [], group: null, settings: null, error: FIREBASE_ERRORS.AUTH_FAILED };
        }

        const { db } = await ensureFirebaseInitialized();
        const { doc, getDoc } = await import('firebase/firestore');

        const docRef = doc(db, USERS_COLLECTION, userId, 'sync', DEVICE_STATE_DOC);
        console.log(`[Firebase READ] getFullDeviceState`);
        const snapshot = await getDoc(docRef);

        if (!snapshot.exists()) {
            return { devices: [], group: null, settings: null };
        }

        const data = snapshot.data() as CloudDeviceState;
        const devices: DeviceInfo[] = [];

        if (data?.devices && typeof data.devices === 'object') {
            Object.values(data.devices).forEach((device: unknown) => {
                if (device && typeof device === 'object' && 'id' in device) {
                    devices.push(device as DeviceInfo);
                }
            });
        }

        return {
            devices,
            group: data.group ?? null,
            settings: data.settings ?? null,
        };
    } catch (err) {
        console.error('Failed to get full device state', err);
        return { devices: [], group: null, settings: null, error: FIREBASE_ERRORS.SYNC_FAILED };
    }
}
