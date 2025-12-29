import storage from '@modules/core/storage';
import { loadLayoutState, saveLayoutState } from '@web/layout/utils/layoutStorage';
import { defaultUiSettings, type UiSettings } from '@web/defaultUiSettings';
import {
    loadSettings as loadDesktopButtonSettings,
    saveSettings as saveDesktopButtonSettings,

} from '@web/desktopButtonSettings';
import {
    loadSettings as loadMobileButtonSettings,
    saveSettings as saveMobileButtonSettings,

} from '@web/mobileButtonSettings';
import type { DeviceSettings, DeviceSettingsExport } from './deviceTypes';
import { getDeviceInfo } from './deviceStorage';

/**
 * Load uiSettings from storage
 */
async function loadUiSettings(): Promise<UiSettings> {
    try {
        const data = await storage.getItem('uiSettings');
        const raw = data?.uiSettings;
        if (raw && typeof raw === 'object') {
            return { ...defaultUiSettings, ...raw };
        }
    } catch {
        // ignore
    }
    return { ...defaultUiSettings };
}

/**
 * Save uiSettings to storage
 */
function saveUiSettings(settings: UiSettings): void {
    storage.setItem('uiSettings', settings);
}

/**
 * Export all device-scoped settings as a bundle
 */
export async function exportDeviceSettings(): Promise<DeviceSettings> {
    const deviceInfo = getDeviceInfo();

    const [layoutManagerState, uiSettings, desktopButtonSettings, mobileButtonSettings] = await Promise.all([
        Promise.resolve(loadLayoutState()),
        loadUiSettings(),
        loadDesktopButtonSettings(),
        loadMobileButtonSettings(),
    ]);

    return {
        deviceId: deviceInfo.id,
        version: 1,
        updatedAt: new Date().toISOString(),
        layoutManagerState,
        uiSettings,
        desktopButtonSettings,
        mobileButtonSettings,
    };
}

/**
 * Import device settings bundle and apply to current device
 */
export async function importDeviceSettings(settings: DeviceSettings): Promise<void> {
    // Apply layout manager state
    if (settings.layoutManagerState) {
        saveLayoutState(settings.layoutManagerState);
        // Notify React context
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('layoutManagerStateChanged'));
        }
    }

    // Apply UI settings
    if (settings.uiSettings) {
        saveUiSettings(settings.uiSettings);
    }

    // Apply desktop button settings
    if (settings.desktopButtonSettings) {
        saveDesktopButtonSettings(settings.desktopButtonSettings);
    }

    // Apply mobile button settings
    if (settings.mobileButtonSettings) {
        saveMobileButtonSettings(settings.mobileButtonSettings);
    }
}

/**
 * Create a device settings export object (for file export)
 */
export async function createDeviceSettingsExport(): Promise<DeviceSettingsExport> {
    const deviceInfo = getDeviceInfo();
    const settings = await exportDeviceSettings();

    return {
        version: 1,
        exportedAt: new Date().toISOString(),
        sourceDevice: deviceInfo,
        settings,
    };
}

/**
 * Validate a device settings export object
 */
export function validateDeviceSettingsExport(data: unknown): data is DeviceSettingsExport {
    if (!data || typeof data !== 'object') return false;

    const obj = data as Record<string, unknown>;

    if (obj.version !== 1) return false;
    if (typeof obj.exportedAt !== 'string') return false;
    if (!obj.sourceDevice || typeof obj.sourceDevice !== 'object') return false;
    if (!obj.settings || typeof obj.settings !== 'object') return false;

    const sourceDevice = obj.sourceDevice as Record<string, unknown>;
    if (typeof sourceDevice.id !== 'string') return false;
    return typeof sourceDevice.name === 'string';


}

/**
 * Import device settings from an export object (from file import)
 */
export async function importDeviceSettingsExport(exportData: DeviceSettingsExport): Promise<void> {
    // Update the deviceId to current device (settings are now owned by this device)
    const deviceInfo = getDeviceInfo();
    const settings: DeviceSettings = {
        ...exportData.settings,
        deviceId: deviceInfo.id,
        updatedAt: new Date().toISOString(),
    };

    await importDeviceSettings(settings);
}

/**
 * Calculate SHA-256 checksum of device settings for change detection
 */
export async function getDeviceSettingsChecksum(): Promise<string> {
    const settings = await exportDeviceSettings();

    // Create a stable string representation (exclude updatedAt for checksum)
    const { updatedAt: _, ...settingsForChecksum } = settings;
    const json = JSON.stringify(settingsForChecksum, Object.keys(settingsForChecksum).sort());

    // Calculate SHA-256 hash
    const encoder = new TextEncoder();
    const data = encoder.encode(json);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get a partial device settings object with only specific parts
 */
export async function exportPartialDeviceSettings(options: {
    layoutManagerState?: boolean;
    uiSettings?: boolean;
    desktopButtonSettings?: boolean;
    mobileButtonSettings?: boolean;
}): Promise<Partial<DeviceSettings>> {
    const deviceInfo = getDeviceInfo();
    const result: Partial<DeviceSettings> = {
        deviceId: deviceInfo.id,
        version: 1,
        updatedAt: new Date().toISOString(),
    };

    if (options.layoutManagerState) {
        result.layoutManagerState = loadLayoutState();
    }

    if (options.uiSettings) {
        result.uiSettings = await loadUiSettings();
    }

    if (options.desktopButtonSettings) {
        result.desktopButtonSettings = await loadDesktopButtonSettings();
    }

    if (options.mobileButtonSettings) {
        result.mobileButtonSettings = await loadMobileButtonSettings();
    }

    return result;
}
