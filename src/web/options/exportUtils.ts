import { getSnapshot as getMultibindsSnapshot, replaceAll as replaceMultibinds, type StoredMultibindRecord } from "../dataStores/multibindStore";
import type { RecordedEvent } from "./recordingStorage";
import { exportNotes, importNotes, type LocationNote } from "./locationNotesStorage";
import {
    getDeviceInfo,
    saveImportedDevice,
    getSyncGroup,
    triggerSettingsReload,
    type DeviceInfo,
    type ImportedDeviceEntry,
    type SyncGroup,
} from "@modules/device";

export interface ExportedLocalStorage {
    global: Record<string, string>;
    characters: Record<string, Record<string, string>>;
}

export interface ExportedRecording {
    id: string;
    events: RecordedEvent[];
}

export interface ExportedVisitedRoomsEntry {
    id: string;
    rooms: number[];
}

export interface ExportOptions {
    uiSettings: boolean;       // Interface settings (colors, themes, layout)
    binds: boolean;            // Key bindings
    shortcuts: boolean;        // Shortcuts
    characterSettings: boolean; // Character gameplay settings
    triggers: boolean;
    aliases: boolean;
    buttons: boolean;
    radial: boolean;
    scripts: boolean;
    multibinds: boolean;
    recordings: boolean;
    visitedRooms: boolean;
    locationNotes: boolean;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
    uiSettings: true,
    binds: true,
    shortcuts: true,
    characterSettings: true,
    triggers: true,
    aliases: true,
    buttons: true,
    radial: true,
    scripts: true,
    multibinds: true,
    recordings: true,
    visitedRooms: true,
    locationNotes: true,
};

// Map specific global keys to their export options
export const EXPORT_SPECIFIC_GLOBAL_KEYS: Record<string, keyof ExportOptions> = {
    uiSettings: "uiSettings",
    binds: "binds",
    shortcuts: "shortcuts",
    triggers: "triggers",
    aliases: "aliases",
    mobileButtonSettings: "buttons",
    desktopButtonSettings: "buttons",
    scripts: "scripts",
    stored_scripts: "scripts",
};

// List of all known global keys that the application uses
// Keys not in this list will be excluded from sync
const KNOWN_GLOBAL_KEYS = new Set([
    "uiSettings",
    "binds",
    "shortcuts",
    "triggers",
    "aliases",
    "mobileButtonSettings",
    "desktopButtonSettings",
    "scripts",
    "stored_scripts",
    "loggingEnabled",
]);

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
    };
    /** Device info and settings from the exporting device */
    device?: ExportedDeviceInfo;
}

const EXCLUDED_LOCAL_STORAGE_KEYS = new Set([
    "cachedMapData",
    "cachedColors",
    "magics",
    "magic_keys",
    "herbs_data"
]);

const EXCLUDED_LOCAL_STORAGE_PREFIXES = ["http://", "https://"];
const IGNORED_CHARACTER_KEY_PREFIXES = new Set([
    "firebase",
    "arkadia",
    "containers",
    "deposits",
    "improve_counter",
    "kill_counter",
    "mapperRoomId",
    "object_num",
    "Player"
]);

export function parseCharacterStorageKey(key: string): { name: string; baseKey: string } | null {
    if (!key) return null;
    if (key.includes("://")) return null;
    const firstColon = key.indexOf(":");
    if (firstColon <= 0) return null;
    const prefix = key.slice(0, firstColon);
    if (IGNORED_CHARACTER_KEY_PREFIXES.has(prefix)) {
        return null;
    }
    const name = prefix.trim();
    const baseKey = key.slice(firstColon + 1);
    return name ? { name, baseKey } : null;
}

export function isExcludedLocalStorageKey(key: string) {
    if (EXCLUDED_LOCAL_STORAGE_KEYS.has(key)) {
        return true;
    }
    return EXCLUDED_LOCAL_STORAGE_PREFIXES.some(prefix => key.startsWith(prefix));
}

export function collectCharacters(): string[] {
    const names = new Set<string>();
    for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key) continue;
        const parsed = parseCharacterStorageKey(key);
        if (parsed?.name) {
            names.add(parsed.name);
        }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function exportLocalStorage(selectedCharacters: string[], options: ExportOptions): ExportedLocalStorage {
    const global: Record<string, string> = {};
    const characters: Record<string, Record<string, string>> = {};
    const selectedSet = new Set(selectedCharacters);

    for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (key.includes("://")) continue;
        const raw = localStorage.getItem(key);
        if (raw === null) continue;

        const parsed = parseCharacterStorageKey(key);
        if (parsed?.name) {
            if (!selectedSet.has(parsed.name)) continue;
            if (parsed.baseKey && isExcludedLocalStorageKey(parsed.baseKey)) {
                continue;
            }
            if (!characters[parsed.name]) {
                characters[parsed.name] = {};
            }
            characters[parsed.name][key] = raw;
            continue;
        }
        if (isExcludedLocalStorageKey(key)) continue;

        // Only include known global keys
        if (!KNOWN_GLOBAL_KEYS.has(key)) continue;

        // Handle specific global keys based on export options
        const specificOption = EXPORT_SPECIFIC_GLOBAL_KEYS[key];
        if (specificOption) {
            if (key === "mobileButtonSettings") {
                // Handle mobileButtonSettings specially for radial
                if (!options.buttons && !options.radial) continue;
                try {
                    const parsedSettings = JSON.parse(raw);
                    if (options.buttons && options.radial) {
                        global[key] = raw;
                    } else if (options.buttons && !options.radial) {
                        const { radial: _radial, ...rest } = parsedSettings;
                        global[key] = JSON.stringify(rest);
                    } else if (!options.buttons && options.radial && parsedSettings.radial) {
                        global[key] = JSON.stringify({ radial: parsedSettings.radial });
                    }
                } catch {
                    if (options.buttons) global[key] = raw;
                }
            } else if (options[specificOption]) {
                global[key] = raw;
            }
            continue;
        }

        // Include loggingEnabled only if uiSettings is enabled (it's a UI preference)
        if (key === "loggingEnabled" && options.uiSettings) {
            global[key] = raw;
        }
    }

    return { global, characters };
}

async function openRecordingsDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("ArkadiaRecordingsDB", 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains("recordings")) {
                db.createObjectStore("recordings", { keyPath: "id" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error("Failed to open recordings IndexedDB"));
    });
}

export async function exportRecordings(): Promise<ExportedRecording[]> {
    try {
        const db = await openRecordingsDb();
        return await new Promise<ExportedRecording[]>((resolve, reject) => {
            const tx = db.transaction(["recordings"], "readonly");
            const store = tx.objectStore("recordings");
            const req = store.getAll();
            req.onsuccess = () => {
                const list = Array.isArray(req.result) ? req.result : [];
                const result: ExportedRecording[] = list
                    .filter((entry: any) => typeof entry?.id === "string" && Array.isArray(entry?.events))
                    .map((entry: any) => ({
                        id: entry.id as string,
                        events: entry.events as RecordedEvent[],
                    }));
                resolve(result);
            };
            req.onerror = () => reject(new Error("Failed to read recordings"));
        });
    } catch (err) {
        console.error("Failed to export recordings", err);
        return [];
    }
}

export async function importRecordings(records: ExportedRecording[]): Promise<void> {
    const list = Array.isArray(records) ? records : [];
    const db = await openRecordingsDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["recordings"], "readwrite");
        const store = tx.objectStore("recordings");
        const clearReq = store.clear();
        clearReq.onerror = () => reject(new Error("Failed to clear recordings store"));
        clearReq.onsuccess = () => {
            list.forEach(record => {
                store.put({ id: record.id, events: record.events });
            });
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error("Failed to save recordings"));
    });
}

async function openVisitedDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("ArkadiaVisitedRoomsDB", 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains("visitedRooms")) {
                db.createObjectStore("visitedRooms", { keyPath: "id" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error("Failed to open visited rooms IndexedDB"));
    });
}

export async function exportVisitedRooms(selectedCharacters: string[]): Promise<ExportedVisitedRoomsEntry[]> {
    try {
        const db = await openVisitedDb();
        return await new Promise<ExportedVisitedRoomsEntry[]>((resolve, reject) => {
            const tx = db.transaction(["visitedRooms"], "readonly");
            const store = tx.objectStore("visitedRooms");
            const req = store.getAll();
            req.onsuccess = () => {
                const selectedSet = new Set(selectedCharacters);
                const result: ExportedVisitedRoomsEntry[] = [];
                const list = Array.isArray(req.result) ? req.result : [];
                list.forEach((entry: any) => {
                    const id = typeof entry?.id === "string" ? entry.id : "";
                    if (!id) return;
                    const idx = id.indexOf(":");
                    if (idx > 0) {
                        const name = id.slice(0, idx);
                        if (!selectedSet.has(name)) {
                            return;
                        }
                    }
                    const rooms = Array.isArray(entry?.rooms)
                        ? entry.rooms.filter((v: unknown) => Number.isFinite(v as number)).map((v: number) => Number(v))
                        : [];
                    result.push({ id, rooms });
                });
                resolve(result);
            };
            req.onerror = () => reject(new Error("Failed to read visited rooms"));
        });
    } catch (err) {
        console.error("Failed to export visited rooms", err);
        return [];
    }
}

export async function importVisitedRooms(entries: ExportedVisitedRoomsEntry[]): Promise<void> {
    if (!Array.isArray(entries)) return;
    if (entries.length === 0) return;
    const db = await openVisitedDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["visitedRooms"], "readwrite");
        const store = tx.objectStore("visitedRooms");
        entries.forEach(entry => {
            store.put({ id: entry.id, rooms: Array.isArray(entry.rooms) ? entry.rooms : [] });
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error("Failed to store visited rooms"));
    });
}

export async function buildExport(selectedCharacters: string[], options: ExportOptions = DEFAULT_EXPORT_OPTIONS): Promise<ExportPayload> {
    const [multibinds, recordings, visitedRooms, locationNotes] = await Promise.all([
        options.multibinds
            ? getMultibindsSnapshot().catch(err => {
                console.error("Failed to export multibinds", err);
                return [] as StoredMultibindRecord[];
            })
            : Promise.resolve([] as StoredMultibindRecord[]),
        options.recordings
            ? exportRecordings()
            : Promise.resolve([] as ExportedRecording[]),
        options.visitedRooms
            ? exportVisitedRooms(selectedCharacters)
            : Promise.resolve([] as ExportedVisitedRoomsEntry[]),
        options.locationNotes
            ? exportNotes().catch(err => {
                console.error("Failed to export location notes", err);
                return [] as LocationNote[];
            })
            : Promise.resolve([] as LocationNote[]),
    ]);

    const localStorageData = exportLocalStorage(selectedCharacters, options);
    // Check if any global option is enabled
    const anyGlobalEnabled = options.uiSettings || options.binds || options.shortcuts ||
        options.triggers || options.aliases || options.buttons || options.radial || options.scripts;
    const filteredLocalStorage: ExportedLocalStorage = {
        global: anyGlobalEnabled ? localStorageData.global : {},
        characters: options.characterSettings ? localStorageData.characters : {},
    };

    // Build device info with settings
    const deviceInfo = getDeviceInfo();
    const syncGroup = getSyncGroup();
    const device: ExportedDeviceInfo = {
        sourceDevice: deviceInfo,
        settings: {
            layoutManagerState: localStorage.getItem('layoutManagerState') || undefined,
            uiSettings: localStorage.getItem('uiSettings') || undefined,
            desktopButtonSettings: localStorage.getItem('desktopButtonSettings') || undefined,
            mobileButtonSettings: localStorage.getItem('mobileButtonSettings') || undefined,
        },
        syncGroup: syncGroup || undefined,
    };

    return {
        version: 1,
        createdAt: new Date().toISOString(),
        characters: selectedCharacters,
        localStorage: filteredLocalStorage,
        indexedDB: {
            multibinds,
            recordings,
            visitedRooms,
            locationNotes,
        },
        device,
    };
}

export function applyLocalStorageImport(data: ExportedLocalStorage) {
    if (!data) return;
    Object.entries(data.global ?? {}).forEach(([key, raw]) => {
        if (typeof raw !== "string") return;
        if (isExcludedLocalStorageKey(key)) return;
        localStorage.setItem(key, raw);
    });
    Object.entries(data.characters ?? {}).forEach(([character, entries]) => {
        if (!entries || typeof entries !== "object") return;
        Object.entries(entries).forEach(([key, raw]) => {
            if (typeof raw !== "string") return;
            const storageKey = key.includes(":") ? key : `${character}:${key}`;
            const baseIdx = storageKey.lastIndexOf(":");
            const baseKey = baseIdx > -1 ? storageKey.slice(baseIdx + 1) : storageKey;
            if (isExcludedLocalStorageKey(baseKey)) return;
            localStorage.setItem(storageKey, raw);
        });
    });
}

export function validatePayload(input: unknown): input is ExportPayload {
    if (!input || typeof input !== "object") return false;
    const payload = input as Record<string, unknown>;
    if (payload.version !== 1) return false;
    if (typeof payload.createdAt !== "string") return false;
    if (!payload.localStorage || typeof payload.localStorage !== "object") return false;
    return !(!payload.indexedDB || typeof payload.indexedDB !== "object");
}

export async function applyImportedData(payload: ExportPayload): Promise<void> {
    applyLocalStorageImport(payload.localStorage);
    await replaceMultibinds(payload.indexedDB.multibinds ?? []);
    await importRecordings(payload.indexedDB.recordings ?? []);
    await importVisitedRooms(payload.indexedDB.visitedRooms ?? []);
    await importNotes(payload.indexedDB.locationNotes ?? []);

    // Import device info and settings
    if (payload.device?.sourceDevice) {
        const currentDevice = getDeviceInfo();
        const isSameDevice = payload.device.sourceDevice.id === currentDevice.id;

        if (isSameDevice) {
            // Same device (restoring own backup) - apply settings immediately
            const { settings } = payload.device;
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
        } else {
            // Different device - save to imported devices list (user can copy settings later)
            const importedEntry: ImportedDeviceEntry = {
                deviceInfo: payload.device.sourceDevice,
                settings: payload.device.settings,
                importedAt: new Date().toISOString(),
                syncGroup: payload.device.syncGroup,
            };
            saveImportedDevice(importedEntry);
        }
    }
}

// ============================================================================
// Per-category export/import functions for Firebase sync
// ============================================================================

import type { SyncCategory } from '@modules/firebase';

export interface CategoryData {
    // uiSettings now includes layout + buttons (device-scoped settings bundle)
    uiSettings?: {
        uiSettings?: string;
        loggingEnabled?: string;
        layoutManagerState?: string;
        desktopButtonSettings?: string;
        mobileButtonSettings?: string;  // includes radial
    };
    binds?: { binds?: string };
    shortcuts?: { shortcuts?: string };
    characterSettings?: Record<string, Record<string, string>>;
    triggers?: { triggers?: string };
    aliases?: { aliases?: string };
    multibinds?: StoredMultibindRecord[];
    scripts?: { scripts?: string; stored_scripts?: string };
    buttons?: { mobileButtonSettings?: string; desktopButtonSettings?: string };
    radial?: { radial?: unknown };
    recordings?: ExportedRecording[];
    visitedRooms?: ExportedVisitedRoomsEntry[];
    locationNotes?: LocationNote[];
    killCounts?: Record<string, string>;      // CharacterName -> kill_counter JSON
    improveCounts?: Record<string, string>;   // CharacterName -> improve_counter_lifetime JSON
    deposits?: Record<string, string>;        // CharacterName -> deposits JSON
    containers?: Record<string, string>;      // CharacterName -> containers JSON
}

// Export a single category as JSON string
export async function exportCategory(
    category: SyncCategory,
    selectedCharacters: string[]
): Promise<string | null> {
    try {
        switch (category) {
            case 'uiSettings': {
                // Device-scoped settings bundle: uiSettings + layout + buttons
                const data: CategoryData['uiSettings'] = {};
                const uiSettings = localStorage.getItem('uiSettings');
                if (uiSettings) data.uiSettings = uiSettings;
                const loggingEnabled = localStorage.getItem('loggingEnabled');
                if (loggingEnabled) data.loggingEnabled = loggingEnabled;
                const layoutManagerState = localStorage.getItem('layoutManagerState');
                if (layoutManagerState) data.layoutManagerState = layoutManagerState;
                const desktopButtonSettings = localStorage.getItem('desktopButtonSettings');
                if (desktopButtonSettings) data.desktopButtonSettings = desktopButtonSettings;
                const mobileButtonSettings = localStorage.getItem('mobileButtonSettings');
                if (mobileButtonSettings) data.mobileButtonSettings = mobileButtonSettings;
                return Object.keys(data).length > 0 ? JSON.stringify(data) : null;
            }
            case 'binds': {
                const binds = localStorage.getItem('binds');
                return binds ? JSON.stringify({ binds }) : null;
            }
            case 'shortcuts': {
                const shortcuts = localStorage.getItem('shortcuts');
                return shortcuts ? JSON.stringify({ shortcuts }) : null;
            }
            case 'characterSettings': {
                const characters: Record<string, Record<string, string>> = {};
                const selectedSet = new Set(selectedCharacters);
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (!key) continue;
                    const parsed = parseCharacterStorageKey(key);
                    if (!parsed?.name) continue;
                    if (!selectedSet.has(parsed.name)) continue;
                    if (parsed.baseKey && isExcludedLocalStorageKey(parsed.baseKey)) continue;
                    const raw = localStorage.getItem(key);
                    if (raw === null) continue;
                    if (!characters[parsed.name]) characters[parsed.name] = {};
                    characters[parsed.name][key] = raw;
                }
                return Object.keys(characters).length > 0 ? JSON.stringify(characters) : null;
            }
            case 'triggers': {
                const triggers = localStorage.getItem('triggers');
                return triggers ? JSON.stringify({ triggers }) : null;
            }
            case 'aliases': {
                const aliases = localStorage.getItem('aliases');
                return aliases ? JSON.stringify({ aliases }) : null;
            }
            case 'multibinds': {
                const multibinds = await getMultibindsSnapshot().catch(() => []);
                return multibinds.length > 0 ? JSON.stringify(multibinds) : null;
            }
            case 'buttons': {
                const data: CategoryData['buttons'] = {};
                const mobile = localStorage.getItem('mobileButtonSettings');
                if (mobile) {
                    try {
                        const parsed = JSON.parse(mobile);
                        const { radial: _radial, ...rest } = parsed;
                        if (Object.keys(rest).length > 0) {
                            data.mobileButtonSettings = JSON.stringify(rest);
                        }
                    } catch {
                        data.mobileButtonSettings = mobile;
                    }
                }
                const desktop = localStorage.getItem('desktopButtonSettings');
                if (desktop) data.desktopButtonSettings = desktop;
                return Object.keys(data).length > 0 ? JSON.stringify(data) : null;
            }
            case 'radial': {
                const mobile = localStorage.getItem('mobileButtonSettings');
                if (!mobile) return null;
                try {
                    const parsed = JSON.parse(mobile);
                    if (parsed.radial) {
                        return JSON.stringify({ radial: parsed.radial });
                    }
                } catch {
                    // Invalid JSON
                }
                return null;
            }
            case 'visitedRooms': {
                const visitedRooms = await exportVisitedRooms(selectedCharacters);
                return visitedRooms.length > 0 ? JSON.stringify(visitedRooms) : null;
            }
            case 'locationNotes': {
                const locationNotes = await exportNotes();
                return locationNotes.length > 0 ? JSON.stringify(locationNotes) : null;
            }
            case 'killCounts': {
                const result: Record<string, string> = {};
                const selectedSet = new Set(selectedCharacters);
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (!key) continue;
                    const colonIdx = key.indexOf(':');
                    if (colonIdx <= 0) continue;
                    const charName = key.slice(0, colonIdx);
                    const baseKey = key.slice(colonIdx + 1);
                    if (baseKey !== 'kill_counter') continue;
                    if (!selectedSet.has(charName)) continue;
                    const raw = localStorage.getItem(key);
                    if (raw) result[charName] = raw;
                }
                return Object.keys(result).length > 0 ? JSON.stringify(result) : null;
            }
            case 'improveCounts': {
                const result: Record<string, string> = {};
                const selectedSet = new Set(selectedCharacters);
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (!key) continue;
                    const colonIdx = key.indexOf(':');
                    if (colonIdx <= 0) continue;
                    const charName = key.slice(0, colonIdx);
                    const baseKey = key.slice(colonIdx + 1);
                    if (baseKey !== 'improve_counter_lifetime') continue;
                    if (!selectedSet.has(charName)) continue;
                    const raw = localStorage.getItem(key);
                    if (raw) result[charName] = raw;
                }
                return Object.keys(result).length > 0 ? JSON.stringify(result) : null;
            }
            case 'deposits': {
                const result: Record<string, string> = {};
                const selectedSet = new Set(selectedCharacters);
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (!key) continue;
                    const colonIdx = key.indexOf(':');
                    if (colonIdx <= 0) continue;
                    const charName = key.slice(0, colonIdx);
                    const baseKey = key.slice(colonIdx + 1);
                    if (baseKey !== 'deposits') continue;
                    if (!selectedSet.has(charName)) continue;
                    const raw = localStorage.getItem(key);
                    if (raw) result[charName] = raw;
                }
                return Object.keys(result).length > 0 ? JSON.stringify(result) : null;
            }
            case 'containers': {
                const result: Record<string, string> = {};
                const selectedSet = new Set(selectedCharacters);
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (!key) continue;
                    const colonIdx = key.indexOf(':');
                    if (colonIdx <= 0) continue;
                    const charName = key.slice(0, colonIdx);
                    const baseKey = key.slice(colonIdx + 1);
                    if (baseKey !== 'containers') continue;
                    if (!selectedSet.has(charName)) continue;
                    const raw = localStorage.getItem(key);
                    if (raw) result[charName] = raw;
                }
                return Object.keys(result).length > 0 ? JSON.stringify(result) : null;
            }
            default:
                return null;
        }
    } catch (err) {
        console.error(`Failed to export category ${category}`, err);
        return null;
    }
}

// Import a single category from JSON string
export async function importCategory(
    category: SyncCategory,
    jsonData: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const data = JSON.parse(jsonData);

        switch (category) {
            case 'uiSettings': {
                // Device-scoped settings bundle: uiSettings + layout + buttons
                if (data.uiSettings) localStorage.setItem('uiSettings', data.uiSettings);
                if (data.loggingEnabled) localStorage.setItem('loggingEnabled', data.loggingEnabled);
                if (data.layoutManagerState) localStorage.setItem('layoutManagerState', data.layoutManagerState);
                if (data.desktopButtonSettings) localStorage.setItem('desktopButtonSettings', data.desktopButtonSettings);
                if (data.mobileButtonSettings) localStorage.setItem('mobileButtonSettings', data.mobileButtonSettings);
                // Notify layout system of changes
                if (data.layoutManagerState && typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('layoutManagerStateChanged', { detail: { type: 'import' } }));
                }
                break;
            }
            case 'binds': {
                if (data.binds) localStorage.setItem('binds', data.binds);
                break;
            }
            case 'shortcuts': {
                if (data.shortcuts) localStorage.setItem('shortcuts', data.shortcuts);
                break;
            }
            case 'characterSettings': {
                Object.entries(data as Record<string, Record<string, string>>).forEach(([character, entries]) => {
                    if (!entries || typeof entries !== 'object') return;
                    Object.entries(entries).forEach(([key, raw]) => {
                        if (typeof raw !== 'string') return;
                        const storageKey = key.includes(':') ? key : `${character}:${key}`;
                        const baseIdx = storageKey.lastIndexOf(':');
                        const baseKey = baseIdx > -1 ? storageKey.slice(baseIdx + 1) : storageKey;
                        if (isExcludedLocalStorageKey(baseKey)) return;
                        localStorage.setItem(storageKey, raw);
                    });
                });
                break;
            }
            case 'triggers': {
                if (data.triggers) localStorage.setItem('triggers', data.triggers);
                break;
            }
            case 'aliases': {
                if (data.aliases) localStorage.setItem('aliases', data.aliases);
                break;
            }
            case 'multibinds': {
                await replaceMultibinds(Array.isArray(data) ? data : []);
                break;
            }
            case 'buttons': {
                // Merge with existing mobileButtonSettings to preserve radial
                if (data.mobileButtonSettings) {
                    const existing = localStorage.getItem('mobileButtonSettings');
                    let merged: Record<string, unknown> = {};
                    if (existing) {
                        try {
                            merged = JSON.parse(existing);
                        } catch {
                            // Invalid existing data
                        }
                    }
                    try {
                        const incoming = JSON.parse(data.mobileButtonSettings);
                        merged = { ...merged, ...incoming };
                    } catch {
                        // Invalid incoming data
                    }
                    localStorage.setItem('mobileButtonSettings', JSON.stringify(merged));
                }
                if (data.desktopButtonSettings) {
                    localStorage.setItem('desktopButtonSettings', data.desktopButtonSettings);
                }
                break;
            }
            case 'radial': {
                if (data.radial) {
                    const existing = localStorage.getItem('mobileButtonSettings');
                    let merged: Record<string, unknown> = {};
                    if (existing) {
                        try {
                            merged = JSON.parse(existing);
                        } catch {
                            // Invalid existing data
                        }
                    }
                    merged.radial = data.radial;
                    localStorage.setItem('mobileButtonSettings', JSON.stringify(merged));
                }
                break;
            }
            case 'visitedRooms': {
                await importVisitedRooms(Array.isArray(data) ? data : []);
                break;
            }
            case 'locationNotes': {
                await importNotes(Array.isArray(data) ? data : []);
                break;
            }
            case 'killCounts': {
                Object.entries(data as Record<string, string>).forEach(([charName, raw]) => {
                    if (typeof raw !== 'string') return;
                    localStorage.setItem(`${charName}:kill_counter`, raw);
                });
                break;
            }
            case 'improveCounts': {
                Object.entries(data as Record<string, string>).forEach(([charName, raw]) => {
                    if (typeof raw !== 'string') return;
                    localStorage.setItem(`${charName}:improve_counter_lifetime`, raw);
                });
                break;
            }
            case 'deposits': {
                Object.entries(data as Record<string, string>).forEach(([charName, raw]) => {
                    if (typeof raw !== 'string') return;
                    localStorage.setItem(`${charName}:deposits`, raw);
                });
                break;
            }
            case 'containers': {
                Object.entries(data as Record<string, string>).forEach(([charName, raw]) => {
                    if (typeof raw !== 'string') return;
                    localStorage.setItem(`${charName}:containers`, raw);
                });
                break;
            }
            default:
                return { success: false, error: `Unknown category: ${category}` };
        }

        return { success: true };
    } catch (err) {
        console.error(`Failed to import category ${category}`, err);
        return { success: false, error: String(err) };
    }
}

// Export multiple categories
export async function exportCategories(
    categories: SyncCategory[],
    selectedCharacters: string[]
): Promise<Partial<Record<SyncCategory, string>>> {
    const result: Partial<Record<SyncCategory, string>> = {};

    await Promise.all(
        categories.map(async (category) => {
            const data = await exportCategory(category, selectedCharacters);
            if (data) {
                result[category] = data;
            }
        })
    );

    return result;
}

// Import multiple categories
export async function importCategories(
    categoryData: Partial<Record<SyncCategory, string>>
): Promise<{ success: boolean; errors: Partial<Record<SyncCategory, string>> }> {
    const errors: Partial<Record<SyncCategory, string>> = {};

    await Promise.all(
        (Object.entries(categoryData) as [SyncCategory, string][]).map(async ([category, data]) => {
            if (!data) return;
            const result = await importCategory(category, data);
            if (!result.success && result.error) {
                errors[category] = result.error;
            }
        })
    );

    return { success: Object.keys(errors).length === 0, errors };
}
