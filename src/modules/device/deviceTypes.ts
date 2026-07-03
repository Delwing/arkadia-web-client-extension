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
    /** Per-device active keymap ID */
    activeKeymap?: string;
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
 * Storage keys for device data in localStorage
 */
export const DEVICE_STORAGE_KEYS = {
    /** Device info object */
    DEVICE_INFO: 'arkadia.deviceInfo',
    /** Imported device settings from file imports */
    IMPORTED_DEVICES: 'arkadia.importedDevices',
    /** Sync group membership */
    SYNC_STATE: 'arkadia.syncState',
} as const;

/**
 * Sync state stored in localStorage. Device-scoped settings themselves travel
 * through the regular category sync; only the group membership is kept here.
 */
export interface SyncState {
    /** The sync group this device belongs to */
    group: SyncGroup;
}

/**
 * Display name for device in Polish UI
 */
export function getDeviceDisplayName(device: DeviceInfo): string {
    return device.customName || device.name;
}
