/**
 * Re-apply device settings (layout, buttons, uiSettings) after a backup restore
 * or an imported device's settings were written to storage, without a page reload.
 * The stores belong to the web UI, which is why this lives here and not with the
 * device registry in @modules/device.
 */
import eventBus from '@modules/core/eventBus';
import { globalStorage } from '@modules/core/storage';
import { getImportedDevices } from '@modules/device';

/**
 * Trigger dynamic reload of all device settings without page refresh.
 * Dispatches events that various UI systems listen to.
 */
export async function triggerSettingsReload(): Promise<void> {
    if (typeof window === 'undefined') return;

    // 1. Reload layout manager state
    try {
        const { invalidateLayoutCache } = await import('./layout');
        invalidateLayoutCache();
    } catch (err) {
        console.error('Failed to reload the layout', err);
    }
    // Emitted with the import type so popups re-evaluate their auto-open state
    eventBus.emit('layoutManagerStateChanged', { type: 'import' });

    // 2. Reload and fire uiSettings listeners (for mobile buttons visibility, etc.)
    try {
        const stored = globalStorage.get('uiSettings');
        if (stored) {
            globalStorage.fireListeners('uiSettings', stored, stored);
        }
    } catch (err) {
        console.error('Failed to reload uiSettings', err);
    }

    // 2b. Widget placements, written straight to localStorage by the apply step
    try {
        const widgets = globalStorage.get('widgetLayout');
        if (widgets) {
            globalStorage.fireListeners('widgetLayout', widgets, widgets);
        }
    } catch (err) {
        console.error('Failed to reload widget layout', err);
    }

    // 3. Reload mobile button settings
    try {
        const { loadSettings, applySettings } = await import('./mobileButtonSettings');
        const settings = loadSettings();
        applySettings(settings);
    } catch (err) {
        console.error('Failed to reload mobile button settings', err);
    }

    // 4. Reload desktop button settings
    try {
        const { loadSettings, applySettings } = await import('./desktopButtonSettings');
        const settings = loadSettings();
        applySettings(settings);
    } catch (err) {
        console.error('Failed to reload desktop button settings', err);
    }

    // 5. Dispatch generic event for any other listeners
    window.dispatchEvent(new CustomEvent('deviceSettingsChanged'));
}

/**
 * Apply settings from an imported device to the current device.
 * @param deviceId - The device ID to copy settings from
 * @returns true if settings were applied successfully
 */
export function applyImportedDeviceSettings(deviceId: string): boolean {
    const devices = getImportedDevices();
    const entry = devices.find(e => e.deviceInfo.id === deviceId);
    if (!entry) return false;

    try {
        if (entry.settings.layoutManagerState) {
            localStorage.setItem('layoutManagerState', entry.settings.layoutManagerState);
        }
        if (entry.settings.widgetLayout) {
            localStorage.setItem('widgetLayout', entry.settings.widgetLayout);
        }
        if (entry.settings.uiSettings) {
            localStorage.setItem('uiSettings', entry.settings.uiSettings);
        }
        if (entry.settings.desktopButtonSettings) {
            localStorage.setItem('desktopButtonSettings', entry.settings.desktopButtonSettings);
        }
        if (entry.settings.mobileButtonSettings) {
            localStorage.setItem('mobileButtonSettings', entry.settings.mobileButtonSettings);
        }

        // Trigger dynamic reload of settings
        triggerSettingsReload();

        return true;
    } catch (err) {
        console.error('Failed to apply imported device settings', err);
        return false;
    }
}
