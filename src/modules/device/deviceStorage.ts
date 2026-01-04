import { getDeviceId } from '@modules/firebase/firebaseTypes';
import type { DeviceInfo, ImportedDeviceEntry } from './deviceTypes';
import { DEVICE_STORAGE_KEYS } from './deviceTypes';

/**
 * Detect browser name from user agent
 */
export function detectBrowser(userAgent: string): string {
    const ua = userAgent.toLowerCase();

    // Check in order of specificity
    if (ua.includes('edg/') || ua.includes('edge/')) {
        return 'Edge';
    }
    if (ua.includes('opr/') || ua.includes('opera')) {
        return 'Opera';
    }
    if (ua.includes('vivaldi')) {
        return 'Vivaldi';
    }
    if (ua.includes('brave')) {
        return 'Brave';
    }
    if (ua.includes('chrome') || ua.includes('crios')) {
        return 'Chrome';
    }
    if (ua.includes('firefox') || ua.includes('fxios')) {
        return 'Firefox';
    }
    if (ua.includes('safari') && !ua.includes('chrome')) {
        return 'Safari';
    }

    return 'Browser';
}

/**
 * Detect OS name from user agent and platform
 */
export function detectOS(userAgent: string, platform?: string): string {
    const ua = userAgent.toLowerCase();
    const plat = (platform || navigator.platform || '').toLowerCase();

    // Mobile detection first
    if (ua.includes('android')) {
        return 'Android';
    }
    if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
        return 'iOS';
    }

    // Desktop OS detection
    if (ua.includes('win') || plat.includes('win')) {
        return 'Windows';
    }
    if (ua.includes('mac') || plat.includes('mac')) {
        return 'macOS';
    }
    if (ua.includes('linux') || plat.includes('linux')) {
        return 'Linux';
    }
    if (ua.includes('cros')) {
        return 'ChromeOS';
    }

    return 'Unknown';
}

/**
 * Generate a user-friendly device name based on browser and OS
 */
export function generateDeviceName(userAgent?: string, platform?: string): string {
    const ua = userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
    const plat = platform || (typeof navigator !== 'undefined' ? navigator.platform : '');

    const browser = detectBrowser(ua);
    const os = detectOS(ua, plat);

    return `${browser} on ${os}`;
}

/**
 * Create a new DeviceInfo object
 */
function createDeviceInfo(existingId?: string): DeviceInfo {
    const id = existingId || getDeviceId();
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const platform = typeof navigator !== 'undefined' ? navigator.platform : '';

    return {
        id,
        name: generateDeviceName(userAgent, platform),
        createdAt: new Date().toISOString(),
        browserInfo: {
            browser: detectBrowser(userAgent),
            os: detectOS(userAgent, platform),
            userAgent,
        },
    };
}

/**
 * Load device info from localStorage
 */
function loadDeviceInfo(): DeviceInfo | null {
    try {
        const raw = localStorage.getItem(DEVICE_STORAGE_KEYS.DEVICE_INFO);
        if (!raw) return null;

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        if (!parsed.id || typeof parsed.id !== 'string') return null;
        if (!parsed.name || typeof parsed.name !== 'string') return null;
        if (!parsed.createdAt || typeof parsed.createdAt !== 'string') return null;

        return parsed as DeviceInfo;
    } catch {
        return null;
    }
}

/**
 * Save device info to localStorage
 */
function saveDeviceInfo(info: DeviceInfo): void {
    try {
        localStorage.setItem(DEVICE_STORAGE_KEYS.DEVICE_INFO, JSON.stringify(info));
    } catch (err) {
        console.error('Failed to save device info', err);
    }
}

/**
 * Get or create device info
 * - On first load: creates new device info and saves it
 * - On subsequent loads: returns existing device info
 * - Migrates from existing firebaseDeviceId if present
 */
export function getOrCreateDeviceInfo(): DeviceInfo {
    // Try to load existing device info
    let info = loadDeviceInfo();

    if (!info) {
        // Check if there's an existing Firebase device ID to reuse
        const existingFirebaseDeviceId = getDeviceId();
        info = createDeviceInfo(existingFirebaseDeviceId);
        saveDeviceInfo(info);
    }

    return info;
}

/**
 * Get current device info (or create if not exists)
 */
export function getDeviceInfo(): DeviceInfo {
    return getOrCreateDeviceInfo();
}

/**
 * Set a custom name for the device
 */
export function setDeviceCustomName(customName: string | undefined): DeviceInfo {
    const info = getOrCreateDeviceInfo();

    if (customName && customName.trim()) {
        info.customName = customName.trim();
    } else {
        delete info.customName;
    }

    saveDeviceInfo(info);
    return info;
}

/**
 * Update the lastSyncedAt timestamp
 */
export function updateDeviceSyncTime(): DeviceInfo {
    const info = getOrCreateDeviceInfo();
    info.lastSyncedAt = new Date().toISOString();
    saveDeviceInfo(info);
    return info;
}

/**
 * Get the display name for the current device
 */
export function getDeviceDisplayName(): string {
    const info = getDeviceInfo();
    return info.customName || info.name;
}

// ============================================================================
// Imported Device Settings (from file imports)
// ============================================================================

/**
 * Load imported devices from localStorage
 */
export function getImportedDevices(): ImportedDeviceEntry[] {
    try {
        const raw = localStorage.getItem(DEVICE_STORAGE_KEYS.IMPORTED_DEVICES);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * Save an imported device entry
 * Replaces any existing entry with the same device ID
 */
export function saveImportedDevice(entry: ImportedDeviceEntry): void {
    try {
        const existing = getImportedDevices();
        // Remove any existing entry with the same device ID
        const filtered = existing.filter(e => e.deviceInfo.id !== entry.deviceInfo.id);
        filtered.push(entry);
        localStorage.setItem(DEVICE_STORAGE_KEYS.IMPORTED_DEVICES, JSON.stringify(filtered));
    } catch (err) {
        console.error('Failed to save imported device', err);
    }
}

/**
 * Delete an imported device entry
 */
export function deleteImportedDevice(deviceId: string): void {
    try {
        const existing = getImportedDevices();
        const filtered = existing.filter(e => e.deviceInfo.id !== deviceId);
        localStorage.setItem(DEVICE_STORAGE_KEYS.IMPORTED_DEVICES, JSON.stringify(filtered));
    } catch (err) {
        console.error('Failed to delete imported device', err);
    }
}

/**
 * Trigger dynamic reload of all device settings without page refresh.
 * Dispatches events that various UI systems listen to.
 */
export async function triggerSettingsReload(): Promise<void> {
    if (typeof window === 'undefined') return;

    // 1. Reload layout manager state
    try {
        const { invalidateLayoutCache } = await import('@web/layout');
        invalidateLayoutCache();
    } catch {
        const eventBus = (await import('@modules/core/eventBus')).default;
        eventBus.emit('layoutManagerStateChanged');
    }

    // 2. Reload and emit uiSettings (for mobile buttons visibility, etc.)
    try {
        const eventBus = (await import('@modules/core/eventBus')).default;
        const { defaultUiSettings } = await import('@web/defaultUiSettings');
        const raw = localStorage.getItem('uiSettings');
        const uiSettings = raw ? { ...defaultUiSettings, ...JSON.parse(raw) } : defaultUiSettings;

        // Emit uiSettings event with relevant payload
        eventBus.emit('uiSettings', {
            mobileDirectionButtons: uiSettings.showButtons,
            hapticFeedback: uiSettings.hapticFeedback,
            emojiLabels: uiSettings.emojiLabels,
            xtermPalette: uiSettings.xtermPalette,
            footerMode: uiSettings.footerMode,
            fightTitleIcon: uiSettings.fightTitleIcon,
            clearInputOnSend: uiSettings.clearInputOnSend,
            showTransportLabel: uiSettings.showTransportLabel,
            showCombatTimer: uiSettings.showCombatTimer,
            showClockDisplay: uiSettings.showClockDisplay,
            autoLowercaseCommands: uiSettings.autoLowercaseCommands,
        });
    } catch (err) {
        console.error('Failed to reload uiSettings', err);
    }

    // 3. Reload mobile button settings
    try {
        const { loadSettings, applySettings } = await import('@web/mobileButtonSettings');
        const settings = await loadSettings();
        applySettings(settings);
    } catch (err) {
        console.error('Failed to reload mobile button settings', err);
    }

    // 4. Reload desktop button settings
    try {
        const { loadSettings, applySettings } = await import('@web/desktopButtonSettings');
        const settings = await loadSettings();
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
