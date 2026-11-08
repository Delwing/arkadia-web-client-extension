import {
    getDeviceInfo,
    saveImportedDevice,
    getSyncGroup,
    shouldApplyDeviceSettings,
    type DeviceInfo,
    type ImportedDeviceEntry,
    type SyncGroup,
} from "@modules/device";
import { triggerSettingsReload } from "@web/deviceSettingsReload.ts";
// Import from the registry module directly (not the @modules/firebase index)
// so this web-side module doesn't pull in the sync engine and its side effects.
import { BACKUP_CATEGORIES, DEVICE_SCOPED_SYNC_CATEGORIES, type BackupCategory } from '@modules/firebase/categoryRegistry';
import { collectCharacters } from './characterKeys';
import { exportCategories, importCategories } from './categories';
import { applyImportedData, type ExportPayload } from './legacyBackup';

/**
 * A backup file: every category of the registry (all synced data plus the
 * backup-only categories), serialized exactly as sync serializes it. There is
 * no per-category or per-character selection.
 */
export interface BackupPayload {
    version: 2;
    createdAt: string;
    /** The exporting device; decides whether its device-scoped settings apply on restore. */
    device: { sourceDevice: DeviceInfo; syncGroup?: SyncGroup };
    categories: Partial<Record<BackupCategory, string>>;
}

export interface ImportResult {
    /** True if device settings were saved to imported list instead of applied */
    deviceSettingsSavedToImportedList: boolean;
}

export async function buildBackup(): Promise<BackupPayload> {
    const syncGroup = getSyncGroup();
    return {
        version: 2,
        createdAt: new Date().toISOString(),
        device: { sourceDevice: getDeviceInfo(), ...(syncGroup ? { syncGroup } : {}) },
        categories: await exportCategories(BACKUP_CATEGORIES, collectCharacters()),
    };
}

/**
 * Device-scoped settings of a backup from another device, in the shape of the
 * imported-devices list (raw localStorage values), so the user can apply them
 * later from the devices page. The radial menu lives in mobileButtonSettings
 * locally but is a shared category, so it's folded back in here.
 */
function importedDeviceSettings(categories: Partial<Record<BackupCategory, string>>): ImportedDeviceEntry["settings"] {
    const settings: ImportedDeviceEntry["settings"] = {};
    const parse = (raw: string | undefined): Record<string, unknown> => {
        if (!raw) return {};
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch {
            return {};
        }
    };
    const ui = parse(categories.uiSettings);
    if (typeof ui.uiSettings === "string") settings.uiSettings = ui.uiSettings;
    if (typeof ui.layoutManagerState === "string") settings.layoutManagerState = ui.layoutManagerState;
    if (typeof ui.widgetLayout === "string") settings.widgetLayout = ui.widgetLayout;
    const buttons = parse(categories.buttons);
    if (typeof buttons.desktopButtonSettings === "string") settings.desktopButtonSettings = buttons.desktopButtonSettings;
    if (typeof buttons.mobileButtonSettings === "string") {
        const mobile = parse(buttons.mobileButtonSettings);
        const radial = parse(categories.radial).radial;
        settings.mobileButtonSettings = JSON.stringify(radial ? { ...mobile, radial } : mobile);
    }
    return settings;
}

/**
 * Restore a backup file. Device-scoped categories (interface layout, buttons)
 * apply only when the backup comes from this device or a member of its sync
 * group; otherwise they are saved to the imported-devices list instead.
 */
export async function restoreBackup(payload: BackupPayload | ExportPayload): Promise<ImportResult> {
    if (payload.version === 1) {
        return applyImportedData(payload);
    }

    const categories: Partial<Record<BackupCategory, string>> = { ...payload.categories };
    const applyDeviceSettings = shouldApplyDeviceSettings({
        sourceDeviceId: payload.device.sourceDevice.id,
        currentDeviceId: getDeviceInfo().id,
        currentSyncGroup: getSyncGroup(),
    });

    let deviceSettingsSavedToImportedList = false;
    const hasDeviceData = [...DEVICE_SCOPED_SYNC_CATEGORIES].some(cat => categories[cat]);
    if (!applyDeviceSettings && hasDeviceData) {
        const settings = importedDeviceSettings(categories);
        for (const cat of DEVICE_SCOPED_SYNC_CATEGORIES) {
            delete categories[cat];
        }
        if (Object.keys(settings).length > 0) {
            saveImportedDevice({
                deviceInfo: payload.device.sourceDevice,
                settings,
                importedAt: new Date().toISOString(),
                syncGroup: payload.device.syncGroup,
            });
            deviceSettingsSavedToImportedList = true;
        }
    }

    const result = await importCategories(categories);
    if (!result.success) {
        const [category, error] = Object.entries(result.errors)[0] ?? [];
        throw new Error(`Failed to restore ${category}: ${error}`);
    }

    if (applyDeviceSettings && hasDeviceData) {
        await triggerSettingsReload();
    }
    return { deviceSettingsSavedToImportedList };
}
