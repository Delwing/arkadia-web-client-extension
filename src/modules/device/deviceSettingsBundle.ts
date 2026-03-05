import { globalStorage } from '@modules/core/storage';
import eventBus from '@modules/core/eventBus';
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
import { ACTIVE_KEYMAP_STORAGE_KEY } from '@modules/core/keymapTypes';

/**
 * Load uiSettings from storage
 */
function loadUiSettings(): UiSettings {
    const raw = globalStorage.get('uiSettings');
    if (raw && typeof raw === 'object') {
        return { ...defaultUiSettings, ...raw };
    }
    return { ...defaultUiSettings };
}

/**
 * Save uiSettings to storage
 */
function saveUiSettings(settings: UiSettings): void {
    globalStorage.set('uiSettings', settings);
}

/**
 * Export all device-scoped settings as a bundle
 */
export function exportDeviceSettings(): DeviceSettings {
    const deviceInfo = getDeviceInfo();

    const uiSettings = loadUiSettings();
    const layoutManagerState = loadLayoutState();
    const desktopButtonSettings = loadDesktopButtonSettings();
    const mobileButtonSettings = loadMobileButtonSettings();

    const activeKeymap = localStorage.getItem(ACTIVE_KEYMAP_STORAGE_KEY) || undefined;

    return {
        deviceId: deviceInfo.id,
        version: 1,
        updatedAt: new Date().toISOString(),
        layoutManagerState,
        uiSettings,
        desktopButtonSettings,
        mobileButtonSettings,
        activeKeymap,
    };
}

/**
 * Import device settings bundle and apply to current device
 */
export function importDeviceSettings(settings: DeviceSettings): void {
    // Apply layout manager state
    if (settings.layoutManagerState) {
        saveLayoutState(settings.layoutManagerState);
        // Notify React context
        eventBus.emit('layoutManagerStateChanged');
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

    // Apply active keymap selection
    if (settings.activeKeymap) {
        localStorage.setItem(ACTIVE_KEYMAP_STORAGE_KEY, settings.activeKeymap);
        import('@modules/core/keymapStorage').then(({ switchKeymap }) => {
            switchKeymap(settings.activeKeymap!);
        }).catch(() => {
            // keymapStorage may not be available in all contexts
        });
    }
}

/**
 * Create a device settings export object (for file export)
 */
export function createDeviceSettingsExport(): DeviceSettingsExport {
    const deviceInfo = getDeviceInfo();
    const settings = exportDeviceSettings();

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
export function importDeviceSettingsExport(exportData: DeviceSettingsExport): void {
    // Update the deviceId to current device (settings are now owned by this device)
    const deviceInfo = getDeviceInfo();
    const settings: DeviceSettings = {
        ...exportData.settings,
        deviceId: deviceInfo.id,
        updatedAt: new Date().toISOString(),
    };

    importDeviceSettings(settings);
}

/**
 * Calculate SHA-256 checksum of device settings for change detection
 */
export async function getDeviceSettingsChecksum(): Promise<string> {
    const settings = exportDeviceSettings();

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
export function exportPartialDeviceSettings(options: {
    layoutManagerState?: boolean;
    uiSettings?: boolean;
    desktopButtonSettings?: boolean;
    mobileButtonSettings?: boolean;
}): Partial<DeviceSettings> {
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
        result.uiSettings = loadUiSettings();
    }

    if (options.desktopButtonSettings) {
        result.desktopButtonSettings = loadDesktopButtonSettings();
    }

    if (options.mobileButtonSettings) {
        result.mobileButtonSettings = loadMobileButtonSettings();
    }

    return result;
}
