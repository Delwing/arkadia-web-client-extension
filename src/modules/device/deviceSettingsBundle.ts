import { globalStorage } from '@modules/core/storage';
import eventBus from '@modules/core/eventBus';
import { loadLayoutState, saveLayoutState } from '@web/layout/utils/layoutStorage';
import { defaultUiSettings, type UiSettings } from '@web/defaultUiSettings';
import { chromeSettingsKeys } from '@shared/settingsDefaults';
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
    // uiSettings now holds only stock chrome; the moved fields live in the
    // shared slice keys and sync separately. Write chrome-only so a device
    // bundle never reintroduces stale moved fields into the uiSettings blob.
    const source = settings as unknown as Record<string, unknown>;
    const chrome: Record<string, unknown> = {};
    for (const key of chromeSettingsKeys) {
        if (key in source) {
            chrome[key] = source[key];
        }
    }
    globalStorage.set('uiSettings', chrome as never);
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
        eventBus.emit('layoutManagerStateChanged', { type: 'import' });
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

