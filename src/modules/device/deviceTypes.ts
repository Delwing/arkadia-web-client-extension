import type { LayoutState } from '@web/layout/types';
import type { UiSettings } from '@web/defaultUiSettings';
import type { DesktopButtonsSettings } from '@web/desktopButtonSettings';
import type { Settings as MobileButtonsSettings } from '@web/mobileButtonSettings';

/**
 * Device information - identifies a specific browser/device
 */
export interface DeviceInfo {
    /** Unique device ID (UUID) */
    id: string;
    /** Auto-generated name based on browser/OS (e.g., "Chrome on Windows") */
    name: string;
    /** User-defined custom name override */
    customName?: string;
    /** ISO timestamp when device was first registered */
    createdAt: string;
    /** ISO timestamp of last sync to cloud */
    lastSyncedAt?: string;
    /** Browser and OS information */
    browserInfo: {
        browser: string;
        os: string;
        userAgent: string;
    };
}

/**
 * Device-scoped settings bundle
 * These settings are specific to a device (not character)
 */
export interface DeviceSettings {
    /** Device ID this settings bundle belongs to */
    deviceId: string;
    /** Settings format version */
    version: 1;
    /** ISO timestamp of last update */
    updatedAt: string;
    /** Window manager layout state */
    layoutManagerState?: LayoutState;
    /** UI settings (fonts, map, display) */
    uiSettings?: UiSettings;
    /** Desktop button settings */
    desktopButtonSettings?: DesktopButtonsSettings;
    /** Mobile button settings */
    mobileButtonSettings?: MobileButtonsSettings;
}

/**
 * Device registry entry stored in cloud
 */
export interface DeviceRegistryEntry {
    /** Device information */
    deviceInfo: DeviceInfo;
    /** SHA-256 checksum of settings for change detection */
    settingsChecksum: string;
    /** ISO timestamp of last update */
    lastUpdated: string;
}

/**
 * Device settings export format (for file export/import)
 */
export interface DeviceSettingsExport {
    /** Export format version */
    version: 1;
    /** ISO timestamp when exported */
    exportedAt: string;
    /** Device info of the source device */
    sourceDevice: DeviceInfo;
    /** The settings bundle */
    settings: DeviceSettings;
}

/**
 * Imported device settings (from file import)
 * Stored locally for user to copy from
 */
export interface ImportedDeviceEntry {
    /** Device info from the import */
    deviceInfo: DeviceInfo;
    /** The device settings data (raw localStorage keys) */
    settings: {
        layoutManagerState?: string;
        uiSettings?: string;
        desktopButtonSettings?: string;
        mobileButtonSettings?: string;
    };
    /** ISO timestamp when imported */
    importedAt: string;
    /** Sync group from the imported device (if any) */
    syncGroup?: SyncGroup;
}

/**
 * Sync group - links multiple devices to share settings
 */
export interface SyncGroup {
    /** Unique sync group ID (UUID) */
    id: string;
    /** User-friendly group name (e.g., "Home Setup") */
    name: string;
    /** Array of device IDs in this group */
    devices: string[];
    /** ISO timestamp when group was created */
    createdAt: string;
    /** ISO timestamp when group was last updated */
    updatedAt: string;
}

/**
 * Synced device settings stored in cloud for a sync group
 */
export interface SyncedDeviceSettings {
    /** Sync group ID this belongs to */
    groupId: string;
    /** Version number, incremented on each change */
    version: number;
    /** ISO timestamp of last update */
    updatedAt: string;
    /** Device ID that made this change */
    updatedByDeviceId: string;
    /** SHA-256 checksum for change detection */
    checksum: string;
    /** The settings data (raw localStorage strings) */
    settings: {
        layoutManagerState?: string;
        uiSettings?: string;
        desktopButtonSettings?: string;
        mobileButtonSettings?: string;
    };
}

/**
 * Sync conflict information
 */
export interface SyncConflict {
    /** Sync group ID */
    groupId: string;
    /** Local settings version */
    localVersion: number;
    /** Remote settings version */
    remoteVersion: number;
    /** Device name that made remote change */
    remoteUpdatedBy: string;
    /** ISO timestamp of remote change */
    remoteUpdatedAt: string;
    /** Remote settings to apply if user chooses remote */
    remoteSettings: SyncedDeviceSettings;
}

/**
 * Storage keys for device data in localStorage
 */
export const DEVICE_STORAGE_KEYS = {
    /** Device info object */
    DEVICE_INFO: 'arkadia.deviceInfo',
    /** Imported device settings from file imports */
    IMPORTED_DEVICES: 'arkadia.importedDevices',
    /** Combined sync state (group + version) */
    SYNC_STATE: 'arkadia.syncState',
} as const;

/**
 * Combined sync state stored in localStorage
 */
export interface SyncState {
    /** The sync group this device belongs to */
    group: SyncGroup;
    /** Local sync version number */
    version: number;
}

/**
 * Display name for device in Polish UI
 */
export function getDeviceDisplayName(device: DeviceInfo): string {
    return device.customName || device.name;
}
