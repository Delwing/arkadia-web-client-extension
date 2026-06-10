import { getSnapshot as getMultibindsSnapshot, replaceAll as replaceMultibinds, type StoredMultibindRecord } from "../dataStores/multibindStore";
import type { RecordedEvent } from "./recordingStorage";
import { exportNotes, importNotes, type LocationNote } from "./locationNotesStorage";
import { exportAllKillRecords, importAllKillRecords, type KillRecord } from "@client/scripts/killLifetimeStorage.ts";
import { mergeProfessionStates } from "@client/scripts/profession";
import { getKnowledgeStore, type KnowledgeProgressByCharacter, type KnowledgeBookProgressByCharacter } from "@modules/data/dataStores/knowledgeStore";
import { getKnowledgeDetailsStore, type KnowledgeProgressByCharacter as KnowledgeDetailsProgressByCharacter, type KnowledgeCharacterMetadataMap } from "@modules/data/dataStores/knowledgeDetailsStore";
import { loadKnowledgeEvents, mergeKnowledgeEvents, type KnowledgeEventsByCharacter } from "@modules/data/dataStores/knowledgeEventsStore";
import eventBus from '@modules/core/eventBus';
import {
    getDeviceInfo,
    saveImportedDevice,
    getSyncGroup,
    triggerSettingsReload,
    shouldApplyDeviceSettings,
    type DeviceInfo,
    type ImportedDeviceEntry,
    type SyncGroup,
} from "@modules/device";
import { characterStorageKeys, globalStorageKeys } from '@modules/core/storageSchema';
import { globalStorage, characterStorage } from '@modules/core/storage';
import { migrateImportedValue } from '@modules/core/settingsMigrations';

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

export interface ExportedKnowledgeData {
    libraryProgress: KnowledgeProgressByCharacter;
    bookProgress: KnowledgeBookProgressByCharacter;
    events: KnowledgeEventsByCharacter;
    detailsProgress: KnowledgeDetailsProgressByCharacter;
    detailsCharacters: KnowledgeCharacterMetadataMap;
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
    peopleEdits: boolean;      // Local edits to people database
    knowledge: boolean;        // Knowledge progress (libraries, books, events, details)
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
    peopleEdits: true,
    knowledge: true,
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

// All known global keys derived from the storage schema
const KNOWN_GLOBAL_KEYS: ReadonlySet<string> = new Set(globalStorageKeys);

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
        killRecords?: KillRecord[];
        knowledge?: ExportedKnowledgeData;
    };
    /** Device info and settings from the exporting device */
    device?: ExportedDeviceInfo;
}

const EXCLUDED_LOCAL_STORAGE_KEYS = new Set([
    "cachedMapData",
    "cachedColors",
    "magics",
    "magic_keys",
    "herbs_data",
    "mapperRoomId"
]);

const EXCLUDED_LOCAL_STORAGE_PREFIXES = ["http://", "https://"];

// Set of known character-scoped base keys from the storage schema
const CHARACTER_BASE_KEYS: ReadonlySet<string> = new Set(characterStorageKeys);

export function parseCharacterStorageKey(key: string): { name: string; baseKey: string } | null {
    if (!key) return null;
    if (key.includes("://")) return null;
    const firstColon = key.indexOf(":");
    if (firstColon <= 0) return null;
    const name = key.slice(0, firstColon).trim();
    const baseKey = key.slice(firstColon + 1);
    if (!name || !baseKey) return null;
    // Only recognize as character-scoped if the base key is in the schema
    if (!CHARACTER_BASE_KEYS.has(baseKey)) return null;
    return { name, baseKey };
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
            // Handle peopleLocalEvents separately based on peopleEdits option
            if (parsed.baseKey === 'peopleLocalEvents') {
                if (!options.peopleEdits) continue;
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

async function exportKnowledgeData(selectedCharacters: string[]): Promise<ExportedKnowledgeData | undefined> {
    const selectedSet = new Set(selectedCharacters);

    const [knowledgeSnapshot, detailsSnapshot, allEvents] = await Promise.all([
        getKnowledgeStore().getSnapshot(),
        getKnowledgeDetailsStore().getSnapshot(),
        loadKnowledgeEvents(),
    ]);

    const libraryProgress: KnowledgeProgressByCharacter = {};
    const bookProgress: KnowledgeBookProgressByCharacter = {};
    const detailsProgress: KnowledgeDetailsProgressByCharacter = {};
    const detailsCharacters: KnowledgeCharacterMetadataMap = {};
    const events: KnowledgeEventsByCharacter = {};

    if (knowledgeSnapshot) {
        for (const [char, progress] of Object.entries(knowledgeSnapshot.data.progress)) {
            if (selectedSet.has(char)) libraryProgress[char] = progress;
        }
        for (const [char, progress] of Object.entries(knowledgeSnapshot.data.bookProgress)) {
            if (selectedSet.has(char)) bookProgress[char] = progress;
        }
    }

    if (detailsSnapshot) {
        for (const [char, progress] of Object.entries(detailsSnapshot.data.progress)) {
            if (selectedSet.has(char)) detailsProgress[char] = progress;
        }
        for (const [char, metadata] of Object.entries(detailsSnapshot.data.characters)) {
            if (selectedSet.has(char)) detailsCharacters[char] = metadata;
        }
    }

    for (const [char, data] of Object.entries(allEvents)) {
        if (selectedSet.has(char)) events[char] = data;
    }

    const hasData = Object.keys(libraryProgress).length > 0 ||
        Object.keys(bookProgress).length > 0 ||
        Object.keys(events).length > 0 ||
        Object.keys(detailsProgress).length > 0;

    if (!hasData) return undefined;

    return { libraryProgress, bookProgress, events, detailsProgress, detailsCharacters };
}

async function importKnowledgeData(data: ExportedKnowledgeData): Promise<void> {
    // Import library progress and book progress into the knowledge store
    if (Object.keys(data.libraryProgress).length > 0 || Object.keys(data.bookProgress).length > 0) {
        const store = getKnowledgeStore();
        await store.applyLocalChange((current) => {
            if (!current) return current!;
            const nextProgress = { ...current.data.progress };
            for (const [char, progress] of Object.entries(data.libraryProgress)) {
                nextProgress[char] = { ...(nextProgress[char] ?? {}), ...progress };
            }
            const nextBookProgress = { ...current.data.bookProgress };
            for (const [char, progress] of Object.entries(data.bookProgress)) {
                nextBookProgress[char] = { ...(nextBookProgress[char] ?? {}), ...progress };
            }
            return {
                ...current,
                data: { ...current.data, progress: nextProgress, bookProgress: nextBookProgress },
            };
        });
    }

    // Import knowledge events using merge (deduplication by timestamp)
    for (const [char, charData] of Object.entries(data.events)) {
        if (charData.events.length > 0) {
            await mergeKnowledgeEvents(char, charData.events);
        }
    }

    // Import details progress and characters (preserving definitions)
    if (Object.keys(data.detailsProgress).length > 0 || Object.keys(data.detailsCharacters).length > 0) {
        const detailsStore = getKnowledgeDetailsStore();
        await detailsStore.applyLocalChange((current) => {
            if (!current) return current!;
            const nextProgress = { ...current.data.progress };
            for (const [char, progress] of Object.entries(data.detailsProgress)) {
                const existing = nextProgress[char] ?? {};
                const merged = { ...existing };
                for (const [category, categoryProgress] of Object.entries(progress)) {
                    const existingCat = merged[category as keyof typeof merged];
                    if (!existingCat || categoryProgress.updatedAt > existingCat.updatedAt) {
                        merged[category as keyof typeof merged] = categoryProgress;
                    }
                }
                nextProgress[char] = merged;
            }
            const nextCharacters = { ...current.data.characters };
            for (const [char, metadata] of Object.entries(data.detailsCharacters)) {
                nextCharacters[char] = { ...nextCharacters[char], ...metadata };
            }
            return {
                ...current,
                data: { ...current.data, progress: nextProgress, characters: nextCharacters },
            };
        });
    }
}

export async function buildExport(selectedCharacters: string[], options: ExportOptions = DEFAULT_EXPORT_OPTIONS): Promise<ExportPayload> {
    const [multibinds, recordings, visitedRooms, locationNotes, killRecords, knowledge] = await Promise.all([
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
        exportAllKillRecords().then(records => {
            const selectedSet = new Set(selectedCharacters);
            return records.filter(r => selectedSet.has(r.character));
        }).catch(err => {
            console.error("Failed to export kill records", err);
            return [] as KillRecord[];
        }),
        options.knowledge
            ? exportKnowledgeData(selectedCharacters).catch(err => {
                console.error("Failed to export knowledge data", err);
                return undefined;
            })
            : Promise.resolve(undefined),
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
            killRecords,
            knowledge,
        },
        device,
    };
}

export function applyLocalStorageImport(data: ExportedLocalStorage) {
    if (!data) return;

    // Track changed keys so we can notify storage listeners afterwards.
    // Direct localStorage.setItem() bypasses TypedStorage listeners, so the UI
    // would not pick up the changes without explicit notification.
    const changedGlobalKeys: Array<{ key: string; oldRaw: string | null; newRaw: string }> = [];
    const changedCharacterKeys: Array<{ storageKey: string; baseKey: string; oldRaw: string | null; newRaw: string }> = [];

    Object.entries(data.global ?? {}).forEach(([key, raw]) => {
        if (typeof raw !== "string") return;
        if (isExcludedLocalStorageKey(key)) return;
        const oldRaw = localStorage.getItem(key);
        localStorage.setItem(key, raw);
        changedGlobalKeys.push({ key, oldRaw, newRaw: raw });
    });
    Object.entries(data.characters ?? {}).forEach(([character, entries]) => {
        if (!entries || typeof entries !== "object") return;
        Object.entries(entries).forEach(([key, raw]) => {
            if (typeof raw !== "string") return;
            const storageKey = key.includes(":") ? key : `${character}:${key}`;
            const baseIdx = storageKey.lastIndexOf(":");
            const baseKey = baseIdx > -1 ? storageKey.slice(baseIdx + 1) : storageKey;
            if (isExcludedLocalStorageKey(baseKey)) return;

            const oldRaw = localStorage.getItem(storageKey);

            // CRDT merge for profession data
            if (baseKey === 'profession') {
                try {
                    const cloudState = JSON.parse(raw);
                    const localState = oldRaw ? JSON.parse(oldRaw) : null;
                    const merged = mergeProfessionStates(localState, cloudState);
                    if (merged) {
                        const newRaw = JSON.stringify(merged);
                        localStorage.setItem(storageKey, newRaw);
                        changedCharacterKeys.push({ storageKey, baseKey, oldRaw, newRaw });
                    }
                } catch {
                    localStorage.setItem(storageKey, raw);
                    changedCharacterKeys.push({ storageKey, baseKey, oldRaw, newRaw: raw });
                }
                return;
            }

            localStorage.setItem(storageKey, raw);
            changedCharacterKeys.push({ storageKey, baseKey, oldRaw, newRaw: raw });
        });
    });

    // Notify globalStorage listeners for changed global keys
    const globalKeySet = new Set(globalStorageKeys as readonly string[]);
    for (const { key, oldRaw, newRaw } of changedGlobalKeys) {
        if (!globalKeySet.has(key)) continue;
        if (oldRaw === newRaw) continue;
        let oldValue: any;
        let newValue: any;
        if (oldRaw !== null) { try { oldValue = JSON.parse(oldRaw); } catch { oldValue = oldRaw; } }
        try { newValue = JSON.parse(newRaw); } catch { newValue = newRaw; }
        globalStorage.fireListeners(key as any, newValue, oldValue);
    }

    // Notify characterStorage listeners for changed character keys of the current character
    const currentChar = characterStorage.getCharacter();
    if (currentChar) {
        const charKeySet = new Set(characterStorageKeys as readonly string[]);
        for (const { storageKey, baseKey, oldRaw, newRaw } of changedCharacterKeys) {
            if (!charKeySet.has(baseKey)) continue;
            if (oldRaw === newRaw) continue;
            // Only fire for the current character's keys
            if (!storageKey.startsWith(currentChar + ':')) continue;
            let oldValue: any;
            let newValue: any;
            if (oldRaw !== null) { try { oldValue = JSON.parse(oldRaw); } catch { oldValue = oldRaw; } }
            try { newValue = JSON.parse(newRaw); } catch { newValue = newRaw; }
            characterStorage.fireListeners(baseKey as any, newValue, oldValue);
        }
    }
}

export function validatePayload(input: unknown): input is ExportPayload {
    if (!input || typeof input !== "object") return false;
    const payload = input as Record<string, unknown>;
    if (payload.version !== 1) return false;
    if (typeof payload.createdAt !== "string") return false;
    if (!payload.localStorage || typeof payload.localStorage !== "object") return false;
    return !(!payload.indexedDB || typeof payload.indexedDB !== "object");
}

export interface ImportResult {
    /** True if device settings were saved to imported list instead of applied */
    deviceSettingsSavedToImportedList: boolean;
}

export async function applyImportedData(payload: ExportPayload): Promise<ImportResult> {
    applyLocalStorageImport(payload.localStorage);
    await replaceMultibinds(payload.indexedDB.multibinds ?? []);
    await importRecordings(payload.indexedDB.recordings ?? []);
    await importVisitedRooms(payload.indexedDB.visitedRooms ?? []);
    await importNotes(payload.indexedDB.locationNotes ?? []);
    await importAllKillRecords(payload.indexedDB.killRecords ?? []);
    if (payload.indexedDB.knowledge) {
        await importKnowledgeData(payload.indexedDB.knowledge);
    }

    // Import device info and settings
    if (payload.device?.sourceDevice) {
        const currentDevice = getDeviceInfo();
        const currentSyncGroup = getSyncGroup();
        const applyDevSettings = shouldApplyDeviceSettings({
            sourceDeviceId: payload.device.sourceDevice.id,
            currentDeviceId: currentDevice.id,
            currentSyncGroup,
        });

        if (applyDevSettings) {
            // Same device or same sync group - apply settings immediately
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
            return { deviceSettingsSavedToImportedList: false };
        } else {
            // Different device, no sync group match - save to imported devices list
            const importedEntry: ImportedDeviceEntry = {
                deviceInfo: payload.device.sourceDevice,
                settings: payload.device.settings,
                importedAt: new Date().toISOString(),
                syncGroup: payload.device.syncGroup,
            };
            saveImportedDevice(importedEntry);
            return { deviceSettingsSavedToImportedList: true };
        }
    }

    return { deviceSettingsSavedToImportedList: false };
}

// ============================================================================
// Per-category export/import functions for Firebase sync
// ============================================================================

import type { SyncCategory, CategoryDefinition } from '@modules/firebase';
import { CATEGORY_REGISTRY } from '@modules/firebase';

export interface CategoryData {
    // uiSettings now includes layout + buttons (device-scoped settings bundle)
    uiSettings?: {
        uiSettings?: string;
        loggingEnabled?: string;
        layoutManagerState?: string;
        desktopButtonSettings?: string;
        mobileButtonSettings?: string;  // includes radial
    };
    binds?: { binds?: string; keymaps?: string };
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
    killCounts?: Record<string, string> | {_v: 2; records: KillRecord[]};  // v1: CharacterName -> kill_counter JSON, v2: IndexedDB records
    improveCounts?: Record<string, string>;   // CharacterName -> improve_counter_lifetime JSON
    deposits?: Record<string, string>;        // CharacterName -> deposits JSON
    containers?: Record<string, string>;      // CharacterName -> containers JSON
    peopleEdits?: Record<string, string>;     // CharacterName -> peopleLocalEvents JSON
    knowledge?: ExportedKnowledgeData;
}

/** Generic export for categories backed by whole global localStorage keys. */
function exportGlobalKeys(keys: readonly string[]): string | null {
    const result: Record<string, string> = {};
    for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (raw) result[key] = raw;
    }
    return Object.keys(result).length > 0 ? JSON.stringify(result) : null;
}

/** Generic export for categories backed by one character-scoped localStorage key. */
function exportCharacterScopedKey(baseKey: string, selectedCharacters: string[]): string | null {
    const result: Record<string, string> = {};
    const selectedSet = new Set(selectedCharacters);
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        const colonIdx = key.indexOf(':');
        if (colonIdx <= 0) continue;
        if (key.slice(colonIdx + 1) !== baseKey) continue;
        const charName = key.slice(0, colonIdx);
        if (!selectedSet.has(charName)) continue;
        const raw = localStorage.getItem(key);
        if (raw) result[charName] = raw;
    }
    return Object.keys(result).length > 0 ? JSON.stringify(result) : null;
}

// Export a single category as JSON string.
// Categories without customSync in the registry are exported generically from
// their declared storage keys; only the custom ones appear in the switch below.
export async function exportCategory(
    category: SyncCategory,
    selectedCharacters: string[]
): Promise<string | null> {
    try {
        const def = CATEGORY_REGISTRY[category] as CategoryDefinition | undefined;
        if (!def) return null;

        if (!def.customSync) {
            if (def.globalKeys) return exportGlobalKeys(def.globalKeys);
            if (def.characterKey) return exportCharacterScopedKey(def.characterKey, selectedCharacters);
            return null;
        }

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
                const selectedSet = new Set(selectedCharacters);
                try {
                    const allRecords = await exportAllKillRecords();
                    const filtered = allRecords.filter(r => selectedSet.has(r.character));
                    if (filtered.length > 0) {
                        return JSON.stringify({_v: 2, records: filtered});
                    }
                } catch {
                    // Fallback to localStorage if IndexedDB fails
                }
                // Fallback: export from localStorage (pre-migration data)
                return exportCharacterScopedKey('kill_counter', selectedCharacters);
            }
            case 'knowledge': {
                const knowledgeData = await exportKnowledgeData(selectedCharacters);
                return knowledgeData ? JSON.stringify(knowledgeData) : null;
            }
            default:
                return null;
        }
    } catch (err) {
        console.error(`Failed to export category ${category}`, err);
        return null;
    }
}

/**
 * Migrate an imported layoutManagerState blob (v8: nested-slots -> flat-windows).
 * The transform lives in @web/layout and is imported lazily so this module stays
 * independent of the layout bundle, matching settingsMigrations.migrateLayoutManagerState.
 */
async function migrateImportedLayoutState(raw: string): Promise<string> {
    try {
        const parsed = JSON.parse(raw);
        // Already in the new flat-windows shape — nothing to do.
        if (parsed && typeof parsed === 'object' && 'windows' in parsed) {
            return raw;
        }
        const { migrateLayoutState } = await import('@web/layout/utils/layoutStorage');
        return JSON.stringify(migrateLayoutState(parsed));
    } catch {
        return raw;
    }
}

// Import a single category from JSON string
export async function importCategory(
    category: SyncCategory,
    jsonData: string,
    options?: { skipDeviceScoped?: boolean }
): Promise<{ success: boolean; error?: string }> {
    try {
        const data = JSON.parse(jsonData);

        // Track changed keys so we can notify storage listeners afterwards.
        // Direct localStorage.setItem() bypasses TypedStorage listeners, so the UI
        // would not pick up the changes without explicit notification.
        const changedGlobalKeys: Array<{ key: string; oldRaw: string | null; newRaw: string }> = [];
        const changedCharacterKeys: Array<{ storageKey: string; baseKey: string; oldRaw: string | null; newRaw: string }> = [];

        const trackingSetItem = (key: string, value: string) => {
            const oldRaw = localStorage.getItem(key);
            localStorage.setItem(key, value);
            // Determine if this is a character-scoped key (contains ':')
            const colonIdx = key.lastIndexOf(':');
            if (colonIdx > -1) {
                const baseKey = key.slice(colonIdx + 1);
                changedCharacterKeys.push({ storageKey: key, baseKey, oldRaw, newRaw: value });
            } else {
                changedGlobalKeys.push({ key, oldRaw, newRaw: value });
            }
        };

        const def = CATEGORY_REGISTRY[category] as CategoryDefinition | undefined;
        if (!def) {
            return { success: false, error: `Unknown category: ${category}` };
        }

        // Categories without customSync are imported generically from the
        // storage keys declared in the registry.
        if (!def.customSync) {
            if (def.globalKeys) {
                for (const key of def.globalKeys) {
                    const value = (data as Record<string, unknown>)[key];
                    if (value && typeof value === 'string') trackingSetItem(key, value);
                }
            } else if (def.characterKey) {
                const baseKey = def.characterKey;
                Object.entries(data as Record<string, string>).forEach(([charName, raw]) => {
                    if (typeof raw !== 'string') return;
                    trackingSetItem(`${charName}:${baseKey}`, raw);
                });
            }
        } else switch (category) {
            case 'uiSettings': {
                // Device-scoped settings bundle: uiSettings + layout + buttons
                const skipDevice = options?.skipDeviceScoped ?? false;
                if (data.uiSettings && !skipDevice) trackingSetItem('uiSettings', data.uiSettings);
                if (data.loggingEnabled) trackingSetItem('loggingEnabled', data.loggingEnabled);
                if (data.layoutManagerState && !skipDevice) {
                    // Imported data skips the startup migration pass, so migrate a
                    // pre-v8 nested-slots layout to the flat-windows shape here.
                    trackingSetItem('layoutManagerState', await migrateImportedLayoutState(data.layoutManagerState));
                }
                if (data.desktopButtonSettings && !skipDevice) trackingSetItem('desktopButtonSettings', data.desktopButtonSettings);
                if (data.mobileButtonSettings) trackingSetItem('mobileButtonSettings', migrateImportedValue('mobileButtonSettings', data.mobileButtonSettings));
                // Notify layout system of changes
                if (data.layoutManagerState && !skipDevice) {
                    eventBus.emit('layoutManagerStateChanged', { type: 'import' });
                }
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

                        // CRDT merge for profession data
                        if (baseKey === 'profession') {
                            try {
                                const cloudState = JSON.parse(raw);
                                const localRaw = localStorage.getItem(storageKey);
                                const localState = localRaw ? JSON.parse(localRaw) : null;
                                const merged = mergeProfessionStates(localState, cloudState);
                                if (merged) {
                                    trackingSetItem(storageKey, JSON.stringify(merged));
                                }
                            } catch {
                                trackingSetItem(storageKey, raw);
                            }
                            return;
                        }

                        // Imported values bypass the startup migration pass, so run
                        // them through it here (no-op for keys without a migration).
                        trackingSetItem(storageKey, migrateImportedValue(baseKey, raw));
                    });
                });
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
                    trackingSetItem('mobileButtonSettings', migrateImportedValue('mobileButtonSettings', JSON.stringify(merged)));
                }
                if (data.desktopButtonSettings && !(options?.skipDeviceScoped)) {
                    trackingSetItem('desktopButtonSettings', data.desktopButtonSettings);
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
                    trackingSetItem('mobileButtonSettings', migrateImportedValue('mobileButtonSettings', JSON.stringify(merged)));
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
                if (data && typeof data === 'object' && '_v' in data && (data as any)._v === 2) {
                    // New format: IndexedDB records with date info
                    const records = (data as {_v: number; records: KillRecord[]}).records;
                    if (Array.isArray(records) && records.length > 0) {
                        await importAllKillRecords(records);
                        // Also update localStorage for backward compat
                        const byChar: Record<string, Record<string, number>> = {};
                        for (const r of records) {
                            if (!byChar[r.character]) byChar[r.character] = {};
                            byChar[r.character][r.mob] = (byChar[r.character][r.mob] ?? 0) + r.count;
                        }
                        for (const [charName, totals] of Object.entries(byChar)) {
                            trackingSetItem(`${charName}:kill_counter`, JSON.stringify(totals));
                        }
                    }
                } else {
                    // Old format: localStorage-based Record<string, string>
                    Object.entries(data as Record<string, string>).forEach(([charName, raw]) => {
                        if (typeof raw !== 'string') return;
                        trackingSetItem(`${charName}:kill_counter`, raw);
                    });
                }
                break;
            }
            case 'knowledge': {
                await importKnowledgeData(data as ExportedKnowledgeData);
                break;
            }
            default:
                return { success: false, error: `Unknown category: ${category}` };
        }

        // Notify storage listeners so the UI picks up the imported values
        const globalKeySet = new Set(globalStorageKeys as readonly string[]);
        for (const { key, oldRaw, newRaw } of changedGlobalKeys) {
            if (!globalKeySet.has(key)) continue;
            if (oldRaw === newRaw) continue;
            let oldValue: any;
            let newValue: any;
            if (oldRaw !== null) { try { oldValue = JSON.parse(oldRaw); } catch { oldValue = oldRaw; } }
            try { newValue = JSON.parse(newRaw); } catch { newValue = newRaw; }
            globalStorage.fireListeners(key as any, newValue, oldValue);
        }

        const currentChar = characterStorage.getCharacter();
        if (currentChar) {
            const charKeySet = new Set(characterStorageKeys as readonly string[]);
            for (const { storageKey, baseKey, oldRaw, newRaw } of changedCharacterKeys) {
                if (!charKeySet.has(baseKey)) continue;
                if (oldRaw === newRaw) continue;
                if (!storageKey.startsWith(currentChar + ':')) continue;
                let oldValue: any;
                let newValue: any;
                if (oldRaw !== null) { try { oldValue = JSON.parse(oldRaw); } catch { oldValue = oldRaw; } }
                try { newValue = JSON.parse(newRaw); } catch { newValue = newRaw; }
                characterStorage.fireListeners(baseKey as any, newValue, oldValue);
            }
        }

        return { success: true };
    } catch (err) {
        console.error(`Failed to import category ${category}`, err);
        return { success: false, error: String(err) };
    }
}

/**
 * Merge only profession data from cloud characterSettings JSON into local storage.
 * Used before "keep-local" upload to preserve cloud +staz events via CRDT merge.
 */
export function mergeCloudProfessionData(cloudCharacterSettingsJson: string): void {
    try {
        const cloudData = JSON.parse(cloudCharacterSettingsJson) as Record<string, Record<string, string>>;
        Object.entries(cloudData).forEach(([character, entries]) => {
            if (!entries || typeof entries !== 'object') return;
            Object.entries(entries).forEach(([key, raw]) => {
                if (typeof raw !== 'string') return;
                const storageKey = key.includes(':') ? key : `${character}:${key}`;
                const baseIdx = storageKey.lastIndexOf(':');
                const baseKey = baseIdx > -1 ? storageKey.slice(baseIdx + 1) : storageKey;
                if (baseKey !== 'profession') return;

                try {
                    const cloudState = JSON.parse(raw);
                    const localRaw = localStorage.getItem(storageKey);
                    const localState = localRaw ? JSON.parse(localRaw) : null;
                    const merged = mergeProfessionStates(localState, cloudState);
                    if (merged) {
                        localStorage.setItem(storageKey, JSON.stringify(merged));
                    }
                } catch {
                    // Skip if parse fails
                }
            });
        });
    } catch {
        // Skip if cloud data is invalid
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
    categoryData: Partial<Record<SyncCategory, string>>,
    options?: { skipDeviceScoped?: boolean }
): Promise<{ success: boolean; errors: Partial<Record<SyncCategory, string>> }> {
    const errors: Partial<Record<SyncCategory, string>> = {};

    await Promise.all(
        (Object.entries(categoryData) as [SyncCategory, string][]).map(async ([category, data]) => {
            if (!data) return;
            const result = await importCategory(category, data, options);
            if (!result.success && result.error) {
                errors[category] = result.error;
            }
        })
    );

    return { success: Object.keys(errors).length === 0, errors };
}
