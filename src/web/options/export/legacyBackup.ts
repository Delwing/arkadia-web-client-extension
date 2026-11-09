import { replaceAll as replaceMultibinds, type StoredMultibindRecord } from "@web/dataStores/multibindStore.ts";
import { importNotes, type LocationNote } from "../locationNotesStorage";
import { importAllKillRecords, migrateFromLocalStorage, type KillRecord } from "@client/scripts/killLifetimeStorage.ts";
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
import type { ImportResult } from './backup';
import { isExcludedLocalStorageKey } from './characterKeys';
import { StorageChangeTracker } from './storageChanges';
import { importCharacterEntries } from './categories/characterSettings';
import { importKnowledgeData, type ExportedKnowledgeData } from './categories/knowledge';
import { importRecordings, type ExportedRecording } from './categories/recordings';
import { importVisitedRooms, type ExportedVisitedRoomsEntry } from './categories/visitedRooms';

export interface ExportedLocalStorage {
    global: Record<string, string>;
    characters: Record<string, Record<string, string>>;
}

export interface ExportedDeviceInfo {
    sourceDevice: DeviceInfo;
    settings: {
        layoutManagerState?: string;
        uiSettings?: string;
        desktopButtonSettings?: string;
        mobileButtonSettings?: string;
    };
    syncGroup?: SyncGroup;
}

/**
 * Legacy (version 1) backup file, written before backups were built from the
 * category registry. Still accepted on import; see BackupPayload for the
 * current format.
 */
export interface ExportPayload {
    version: 1;
    createdAt: string;
    characters: string[];
    localStorage: ExportedLocalStorage;
    indexedDB: {
        multibinds: StoredMultibindRecord[];
        recordings?: ExportedRecording[];
        visitedRooms: ExportedVisitedRoomsEntry[];
        locationNotes?: LocationNote[];
        killRecords?: KillRecord[];
        knowledge?: ExportedKnowledgeData;
    };
    /** Device info and settings from the exporting device */
    device?: ExportedDeviceInfo;
}

/** Write a legacy file's localStorage section, then notify storage listeners. */
export function applyLocalStorageImport(data: ExportedLocalStorage) {
    if (!data) return;

    const storage = new StorageChangeTracker();

    Object.entries(data.global ?? {}).forEach(([key, raw]) => {
        if (typeof raw !== "string") return;
        if (isExcludedLocalStorageKey(key)) return;
        const oldRaw = localStorage.getItem(key);
        localStorage.setItem(key, raw);
        storage.recordGlobal(key, oldRaw, raw);
    });
    importCharacterEntries(data.characters ?? {}, storage, { migrate: false });

    storage.notify();
}

/** Device settings carried by a legacy file: applied here, or kept for later. */
async function applyLegacyDeviceSettings(device: ExportedDeviceInfo): Promise<ImportResult> {
    const applyDevSettings = shouldApplyDeviceSettings({
        sourceDeviceId: device.sourceDevice.id,
        currentDeviceId: getDeviceInfo().id,
        currentSyncGroup: getSyncGroup(),
    });

    if (applyDevSettings) {
        // Same device or same sync group - apply settings immediately
        const { settings } = device;
        if (settings.layoutManagerState) {
            localStorage.setItem('layoutManagerState', settings.layoutManagerState);
        }
        if (settings.uiSettings) {
            localStorage.setItem('uiSettings', settings.uiSettings);
        }
        if (settings.desktopButtonSettings) {
            localStorage.setItem('desktopButtonSettings', settings.desktopButtonSettings);
        }
        if (settings.mobileButtonSettings) {
            localStorage.setItem('mobileButtonSettings', settings.mobileButtonSettings);
        }
        await triggerSettingsReload();
        return { deviceSettingsSavedToImportedList: false };
    }

    // Different device, no sync group match - save to imported devices list
    const importedEntry: ImportedDeviceEntry = {
        deviceInfo: device.sourceDevice,
        settings: device.settings,
        importedAt: new Date().toISOString(),
        syncGroup: device.syncGroup,
    };
    saveImportedDevice(importedEntry);
    return { deviceSettingsSavedToImportedList: true };
}

/** Restores a legacy (version 1) backup file. */
export async function applyImportedData(payload: ExportPayload): Promise<ImportResult> {
    // Move pre-IndexedDB kill totals in first: the file's kill_counter aggregate
    // replaces them below, and a later migration would count it a second time.
    const killCharacters = new Set([
        ...Object.keys(payload.localStorage?.characters ?? {}),
        ...(payload.indexedDB.killRecords ?? []).map(r => r.character),
    ]);
    for (const character of killCharacters) {
        await migrateFromLocalStorage(character);
    }
    applyLocalStorageImport(payload.localStorage);
    await replaceMultibinds(payload.indexedDB.multibinds ?? []);
    await importRecordings(payload.indexedDB.recordings ?? []);
    await importVisitedRooms(payload.indexedDB.visitedRooms ?? []);
    await importNotes(payload.indexedDB.locationNotes ?? []);
    await importAllKillRecords(payload.indexedDB.killRecords ?? []);
    if (payload.indexedDB.knowledge) {
        await importKnowledgeData(payload.indexedDB.knowledge);
    }

    if (payload.device?.sourceDevice) {
        return applyLegacyDeviceSettings(payload.device);
    }
    return { deviceSettingsSavedToImportedList: false };
}
