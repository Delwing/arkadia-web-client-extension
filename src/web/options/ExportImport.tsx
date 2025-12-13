import {ChangeEvent, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Alert, Button, Form, Spinner} from "react-bootstrap";
import storage from "@modules/core/storage";
import { getSnapshot as getMultibindsSnapshot, replaceAll as replaceMultibinds, type StoredMultibindRecord } from "../dataStores/multibindStore";
import type {RecordedEvent} from "./recordingStorage";

const GOOGLE_CLIENT_ID = "717498712073-50tjdorsa6vk4mq0fj774u0rhqr5jkd4.apps.googleusercontent.com";
const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.appdata"];
const DRIVE_TOKEN_STORAGE_KEY = "arkadia.driveToken";
const AUTO_BACKUP_SETTINGS_KEY = "arkadia.autoBackup";
const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const AUTO_BACKUP_RETENTION_DAYS = 7;
const AUTO_BACKUP_PREFIX = "arkadia-auto-backup-";

interface AutoBackupSettings {
    enabled: boolean;
    lastBackupTime: number | null;
}

function loadAutoBackupSettings(): AutoBackupSettings {
    const defaults: AutoBackupSettings = { enabled: true, lastBackupTime: null };
    if (typeof localStorage === "undefined") return defaults;
    try {
        const raw = localStorage.getItem(AUTO_BACKUP_SETTINGS_KEY);
        if (!raw) return defaults;
        const parsed = JSON.parse(raw);
        return {
            enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : true,
            lastBackupTime: typeof parsed.lastBackupTime === "number" ? parsed.lastBackupTime : null,
        };
    } catch {
        return defaults;
    }
}

function saveAutoBackupSettings(settings: AutoBackupSettings) {
    if (typeof localStorage === "undefined") return;
    try {
        localStorage.setItem(AUTO_BACKUP_SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) {
        console.error("Failed to save auto-backup settings", err);
    }
}

interface StoredDriveToken {
    token: string;
    expiresAt: number;
}

function loadStoredDriveToken(): StoredDriveToken | null {
    if (typeof localStorage === "undefined") {
        return null;
    }
    try {
        const raw = localStorage.getItem(DRIVE_TOKEN_STORAGE_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw) as Partial<StoredDriveToken> | null;
        if (!parsed || typeof parsed.token !== "string" || typeof parsed.expiresAt !== "number") {
            return null;
        }
        return parsed as StoredDriveToken;
    } catch (err) {
        console.error("Failed to load stored Google Drive token", err);
        return null;
    }
}

function saveStoredDriveToken(token: string, expiresAt: number) {
    if (typeof localStorage === "undefined") {
        return;
    }
    try {
        const value: StoredDriveToken = {token, expiresAt};
        localStorage.setItem(DRIVE_TOKEN_STORAGE_KEY, JSON.stringify(value));
    } catch (err) {
        console.error("Failed to persist Google Drive token", err);
    }
}

function clearStoredDriveToken() {
    if (typeof localStorage === "undefined") {
        return;
    }
    try {
        localStorage.removeItem(DRIVE_TOKEN_STORAGE_KEY);
    } catch (err) {
        console.error("Failed to clear stored Google Drive token", err);
    }
}

interface GoogleTokenResponse {
    access_token?: string;
    expires_in?: number | string;
    error?: string;
}

interface GoogleTokenClient {
    callback: (response: GoogleTokenResponse) => void;
    requestAccessToken: (options?: { prompt?: "" | "consent" }) => void;
}

interface GoogleTokenClientConfig {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    use_fedcm_for_prompt?: boolean;
}

interface DriveFileSummary {
    id: string;
    name: string;
    modifiedTime?: string;
    size?: string;
}

declare global {
    interface Window {
        google?: {
            accounts?: {
                oauth2?: {
                    initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient;
                    revoke?: (token: string, done?: () => void) => void;
                };
            };
        };
    }
}

interface ExportedLocalStorage {
    global: Record<string, string>;
    characters: Record<string, Record<string, string>>;
}

interface ExportedRecording {
    id: string;
    events: RecordedEvent[];
}

interface ExportedVisitedRoomsEntry {
    id: string;
    rooms: number[];
}

interface ExportOptions {
    globalSettings: boolean;
    characterSettings: boolean;
    triggers: boolean;
    aliases: boolean;
    buttons: boolean;
    radial: boolean;
    scripts: boolean;
    multibinds: boolean;
    recordings: boolean;
    visitedRooms: boolean;
}

const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
    globalSettings: true,
    characterSettings: true,
    triggers: true,
    aliases: true,
    buttons: true,
    radial: true,
    scripts: true,
    multibinds: true,
    recordings: true,
    visitedRooms: true,
};

const EXPORT_SPECIFIC_GLOBAL_KEYS: Record<string, keyof ExportOptions> = {
    triggers: "triggers",
    aliases: "aliases",
    mobileButtonSettings: "buttons",
    desktopButtonSettings: "buttons",
    scripts: "scripts",
    stored_scripts: "scripts",
};

interface ExportPayload {
    version: 1;
    createdAt: string;
    characters: string[];
    localStorage: ExportedLocalStorage;
    indexedDB: {
        multibinds: StoredMultibindRecord[];
        recordings?: ExportedRecording[];
        visitedRooms: ExportedVisitedRoomsEntry[];
    };
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

function parseCharacterStorageKey(key: string): { name: string; baseKey: string } | null {
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
    return name ? {name, baseKey} : null;
}

function isExcludedLocalStorageKey(key: string) {
    if (EXCLUDED_LOCAL_STORAGE_KEYS.has(key)) {
        return true;
    }
    return EXCLUDED_LOCAL_STORAGE_PREFIXES.some(prefix => key.startsWith(prefix));
}

function formatDriveDate(iso?: string) {
    if (!iso) return "Nieznana data";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString();
}

function formatDriveSize(size?: string) {
    if (!size) return null;
    const value = Number(size);
    if (!Number.isFinite(value)) return null;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function collectCharacters(): string[] {
    const names = new Set<string>();
    for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key) continue;
        const parsed = parseCharacterStorageKey(key);
        if (parsed?.name) {
            names.add(parsed.name);
        }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, undefined, {sensitivity: "base"}));
}

function exportLocalStorage(selectedCharacters: string[], options: ExportOptions): ExportedLocalStorage {
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

        // Handle specific global keys based on export options
        const specificOption = EXPORT_SPECIFIC_GLOBAL_KEYS[key];
        if (specificOption) {
            if (key === "mobileButtonSettings") {
                // Handle mobileButtonSettings specially for radial
                if (!options.buttons && !options.radial) continue;
                try {
                    const parsed = JSON.parse(raw);
                    if (options.buttons && options.radial) {
                        global[key] = raw;
                    } else if (options.buttons && !options.radial) {
                        const {radial: _radial, ...rest} = parsed;
                        global[key] = JSON.stringify(rest);
                    } else if (!options.buttons && options.radial && parsed.radial) {
                        global[key] = JSON.stringify({radial: parsed.radial});
                    }
                } catch {
                    if (options.buttons) global[key] = raw;
                }
            } else if (options[specificOption]) {
                global[key] = raw;
            }
            continue;
        }

        global[key] = raw;
    }

    return {global, characters};
}

async function openRecordingsDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("ArkadiaRecordingsDB", 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains("recordings")) {
                db.createObjectStore("recordings", {keyPath: "id"});
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error("Failed to open recordings IndexedDB"));
    });
}

async function exportRecordings(): Promise<ExportedRecording[]> {
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

async function importRecordings(records: ExportedRecording[]): Promise<void> {
    const list = Array.isArray(records) ? records : [];
    const db = await openRecordingsDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["recordings"], "readwrite");
        const store = tx.objectStore("recordings");
        const clearReq = store.clear();
        clearReq.onerror = () => reject(new Error("Failed to clear recordings store"));
        clearReq.onsuccess = () => {
            list.forEach(record => {
                store.put({id: record.id, events: record.events});
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
                db.createObjectStore("visitedRooms", {keyPath: "id"});
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error("Failed to open visited rooms IndexedDB"));
    });
}

async function exportVisitedRooms(selectedCharacters: string[]): Promise<ExportedVisitedRoomsEntry[]> {
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
                    result.push({id, rooms});
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

async function importVisitedRooms(entries: ExportedVisitedRoomsEntry[]): Promise<void> {
    if (!Array.isArray(entries)) return;
    if (entries.length === 0) return;
    const db = await openVisitedDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["visitedRooms"], "readwrite");
        const store = tx.objectStore("visitedRooms");
        entries.forEach(entry => {
            store.put({id: entry.id, rooms: Array.isArray(entry.rooms) ? entry.rooms : []});
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error("Failed to store visited rooms"));
    });
}

async function buildExport(selectedCharacters: string[], options: ExportOptions = DEFAULT_EXPORT_OPTIONS): Promise<ExportPayload> {
    const [multibinds, recordings, visitedRooms] = await Promise.all([
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
    ]);

    const localStorageData = exportLocalStorage(selectedCharacters, options);
    const filteredLocalStorage: ExportedLocalStorage = {
        global: options.globalSettings || options.triggers || options.aliases || options.buttons || options.radial
            ? localStorageData.global
            : {},
        characters: options.characterSettings ? localStorageData.characters : {},
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
        },
    };
}

function applyLocalStorageImport(data: ExportedLocalStorage) {
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

function validatePayload(input: unknown): input is ExportPayload {
    if (!input || typeof input !== "object") return false;
    const payload = input as Record<string, unknown>;
    if (payload.version !== 1) return false;
    if (typeof payload.createdAt !== "string") return false;
    if (!payload.localStorage || typeof payload.localStorage !== "object") return false;
    return !(!payload.indexedDB || typeof payload.indexedDB !== "object");

}

function ExportImport() {
    const [characters, setCharacters] = useState<string[]>([]);
    const [selection, setSelection] = useState<Record<string, boolean>>({});
    const [exportOptions, setExportOptions] = useState<ExportOptions>({...DEFAULT_EXPORT_OPTIONS});
    const [status, setStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDriveScriptReady, setIsDriveScriptReady] = useState(false);
    const [isDriveBusy, setIsDriveBusy] = useState(false);
    const [isDriveLoading, setIsDriveLoading] = useState(false);
    const [driveFiles, setDriveFiles] = useState<DriveFileSummary[]>([]);
    const [driveStatus, setDriveStatus] = useState<string | null>(null);
    const [driveError, setDriveError] = useState<string | null>(null);
    const [driveToken, setDriveToken] = useState<string | null>(null);
    const [driveAction, setDriveAction] = useState<string | null>(null);
    const tokenClientRef = useRef<GoogleTokenClient | null>(null);
    const driveTokenRef = useRef<string | null>(null);
    const driveTokenExpiryRef = useRef(0);
    const [autoBackupEnabled, setAutoBackupEnabled] = useState(() => loadAutoBackupSettings().enabled);
    const [lastAutoBackup, setLastAutoBackup] = useState<number | null>(() => loadAutoBackupSettings().lastBackupTime);
    const [isAutoBackupRunning, setIsAutoBackupRunning] = useState(false);
    const autoBackupRunningRef = useRef(false);

    const selectedCharacters = useMemo(
        () => characters.filter(name => selection[name]),
        [characters, selection]
    );

    useEffect(() => {
        const stored = loadStoredDriveToken();
        if (!stored) {
            return;
        }
        if (Date.now() < stored.expiresAt) {
            driveTokenRef.current = stored.token;
            driveTokenExpiryRef.current = stored.expiresAt;
            setDriveToken(stored.token);
        } else {
            clearStoredDriveToken();
        }
    }, []);

    useEffect(() => {
        if (window.google?.accounts?.oauth2) {
            setIsDriveScriptReady(true);
            return;
        }
        let isMounted = true;
        const existing = document.querySelector<HTMLScriptElement>('script[data-google-gis="true"]');
        const target = existing ?? document.createElement("script");

        const handleLoad = () => {
            target.dataset.googleGisLoaded = "true";
            if (!isMounted) return;
            setDriveError(null);
            setIsDriveScriptReady(true);
        };

        const handleError = () => {
            if (!isMounted) return;
            setDriveError("Nie udało się załadować integracji z Google Drive.");
        };

        target.addEventListener("load", handleLoad);
        target.addEventListener("error", handleError);

        if (!existing) {
            target.src = "https://accounts.google.com/gsi/client";
            target.async = true;
            target.defer = true;
            target.dataset.googleGis = "true";
            document.head.appendChild(target);
        } else if (existing.dataset.googleGisLoaded === "true" || window.google?.accounts?.oauth2) {
            handleLoad();
        }

        return () => {
            isMounted = false;
            target.removeEventListener("load", handleLoad);
            target.removeEventListener("error", handleError);
        };
    }, []);

    useEffect(() => {
        if (!isDriveScriptReady) return;
        const oauth2 = window.google?.accounts?.oauth2;
        if (!oauth2) {
            setDriveError("Nie udało się zainicjalizować integracji z Google Drive.");
            return;
        }
        tokenClientRef.current = oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: DRIVE_SCOPES.join(" "),
            callback: () => {
            },
            use_fedcm_for_prompt: true,
        });
    }, [isDriveScriptReady]);

    const requestNewToken = useCallback(
        (client: GoogleTokenClient, promptType: "" | "none" | "consent"): Promise<string> => {
            return new Promise<string>((resolve, reject) => {
                client.callback = (response: GoogleTokenResponse) => {
                    if (response?.error) {
                        reject(new Error(response.error === "access_denied"
                            ? "Dostęp do Google Drive został odrzucony."
                            : response.error));
                        return;
                    }
                    const token = response?.access_token;
                    if (!token) {
                        reject(new Error("Nie udało się uzyskać tokenu Google Drive."));
                        return;
                    }
                    const expiresRaw = response.expires_in;
                    const expiresIn =
                        typeof expiresRaw === "string" ? Number.parseInt(expiresRaw, 10) : Number(expiresRaw ?? 0);
                    const issuedAt = Date.now();
                    const buffer = Number.isFinite(expiresIn) ? Math.max(0, (expiresIn - 60) * 1000) : 0;
                    const expiresAt = buffer ? issuedAt + buffer : issuedAt + 5 * 60 * 1000;
                    driveTokenRef.current = token;
                    driveTokenExpiryRef.current = expiresAt;
                    setDriveToken(token);
                    saveStoredDriveToken(token, expiresAt);
                    resolve(token);
                };
                try {
                    client.requestAccessToken({prompt: promptType});
                } catch (err) {
                    reject(err instanceof Error ? err : new Error("Nie udało się uzyskać tokenu Google Drive."));
                }
            });
        },
        []
    );

    const ensureDriveToken = useCallback(
        async (forcePrompt = false): Promise<string> => {
            const client = tokenClientRef.current;
            if (!client) {
                throw new Error("Integracja z Google Drive nie jest dostępna.");
            }
            if (!forcePrompt) {
                const existingToken = driveTokenRef.current;
                const expiry = driveTokenExpiryRef.current;
                if (existingToken && expiry && Date.now() < expiry) {
                    return existingToken;
                }
            }

            // If we have a previously granted token (even if expired), try silent refresh first
            const hadPreviousToken = driveTokenRef.current !== null || loadStoredDriveToken() !== null;

            if (!forcePrompt && hadPreviousToken) {
                try {
                    // Try silent refresh with prompt: "none" - works if user's Google session is active
                    return await requestNewToken(client, "none");
                } catch {
                    // Silent refresh failed, fall through to consent prompt
                }
            }

            // Need user interaction - request with consent prompt
            return requestNewToken(client, forcePrompt ? "consent" : (hadPreviousToken ? "" : "consent"));
        },
        [requestNewToken]
    );

    const driveFetch = useCallback(
        async (url: string, init?: RequestInit, retry = true): Promise<Response> => {
            const token = await ensureDriveToken();
            const headers = new Headers(init?.headers as HeadersInit | undefined);
            headers.set("Authorization", `Bearer ${token}`);
            const requestInit: RequestInit = {...init, headers};
            const response = await fetch(url, requestInit);
            if (response.status === 401 && retry) {
                driveTokenRef.current = null;
                driveTokenExpiryRef.current = 0;
                setDriveToken(null);
                clearStoredDriveToken();
                return driveFetch(url, init, false);
            }
            return response;
        },
        [ensureDriveToken]
    );

    // Proactive token refresh - refresh token before it expires to maintain connection
    useEffect(() => {
        if (!driveToken || !tokenClientRef.current) {
            return;
        }

        const expiry = driveTokenExpiryRef.current;
        if (!expiry) {
            return;
        }

        const now = Date.now();
        const timeUntilExpiry = expiry - now;

        // Refresh when 50% of token lifetime has passed, or at least 5 minutes before expiry
        // This gives us plenty of buffer for the refresh to complete
        const refreshAt = Math.max(timeUntilExpiry / 2, Math.min(timeUntilExpiry - 5 * 60 * 1000, timeUntilExpiry * 0.8));

        if (refreshAt <= 0) {
            // Token is about to expire or already expired, try immediate refresh
            requestNewToken(tokenClientRef.current, "none").catch(() => {
                // Silent refresh failed - token will be refreshed on next API call
            });
            return;
        }

        const timerId = setTimeout(() => {
            const client = tokenClientRef.current;
            if (!client) return;

            // Try silent refresh
            requestNewToken(client, "none").catch(() => {
                // Silent refresh failed - token will be refreshed on next API call
                // This is fine, the user will be prompted when they try to use Drive
            });
        }, refreshAt);

        return () => clearTimeout(timerId);
    }, [driveToken, requestNewToken]);

    const refreshDriveFiles = useCallback(
        async (options?: { action?: "list" }) => {
            if (!tokenClientRef.current) {
                return;
            }
            if (options?.action === "list") {
                setDriveAction("list");
            }
            setDriveError(null);
            setIsDriveLoading(true);
            try {
                const params = new URLSearchParams({
                    spaces: "appDataFolder",
                    fields: "files(id,name,modifiedTime,size)",
                    orderBy: "modifiedTime desc",
                    pageSize: "20",
                });
                const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);
                if (!response.ok) {
                    throw new Error(`Failed to list files: ${response.status}`);
                }
                const data = await response.json();
                const list: DriveFileSummary[] = Array.isArray(data?.files)
                    ? data.files
                        .filter((file: any) => typeof file?.id === "string" && typeof file?.name === "string")
                        .map((file: any) => ({
                            id: file.id as string,
                            name: file.name as string,
                            modifiedTime: typeof file.modifiedTime === "string" ? file.modifiedTime : undefined,
                            size: typeof file.size === "string" ? file.size : undefined,
                        }))
                    : [];
                setDriveFiles(list);
            } catch (err) {
                console.error("Failed to list Google Drive files", err);
                setDriveError("Nie udało się pobrać listy plików z Google Drive.");
            } finally {
                setIsDriveLoading(false);
                if (options?.action === "list") {
                    setDriveAction(null);
                }
            }
        },
        [driveFetch]
    );

    const cleanupOldAutoBackups = useCallback(
        async (filesList?: DriveFileSummary[]) => {
            const files = filesList ?? driveFiles;
            const cutoffDate = Date.now() - AUTO_BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
            const oldAutoBackups = files.filter(file => {
                if (!file.name.startsWith(AUTO_BACKUP_PREFIX)) return false;
                if (!file.modifiedTime) return false;
                const fileTime = new Date(file.modifiedTime).getTime();
                return fileTime < cutoffDate;
            });

            for (const file of oldAutoBackups) {
                try {
                    const response = await driveFetch(
                        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`,
                        { method: "DELETE" }
                    );
                    if (response.ok) {
                        console.log(`Auto-backup cleanup: deleted old backup "${file.name}"`);
                    }
                } catch (err) {
                    console.error(`Failed to delete old auto-backup "${file.name}"`, err);
                }
            }
            return oldAutoBackups.length;
        },
        [driveFetch, driveFiles]
    );

    const performAutoBackup = useCallback(
        async () => {
            if (autoBackupRunningRef.current) return;
            if (!tokenClientRef.current || !driveTokenRef.current) return;

            autoBackupRunningRef.current = true;
            setIsAutoBackupRunning(true);

            try {
                // Get all characters for auto-backup
                const allCharacters = collectCharacters();
                const payload = await buildExport(allCharacters, DEFAULT_EXPORT_OPTIONS);
                const json = JSON.stringify(payload, null, 2);
                const timestamp = new Date().toISOString().replace(/[:T]/g, "-").split(".")[0];
                const metadata = {
                    name: `${AUTO_BACKUP_PREFIX}${timestamp}.json`,
                    parents: ["appDataFolder"],
                };
                const boundary = `-------arkadia-auto-${Date.now().toString(16)}`;
                const body = [
                    `--${boundary}`,
                    "Content-Type: application/json; charset=UTF-8",
                    "",
                    JSON.stringify(metadata),
                    `--${boundary}`,
                    "Content-Type: application/json",
                    "",
                    json,
                    `--${boundary}--`,
                    "",
                ].join("\r\n");

                const response = await driveFetch(
                    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
                    {
                        method: "POST",
                        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
                        body,
                    }
                );

                if (!response.ok) {
                    throw new Error(`Auto-backup upload failed with status ${response.status}`);
                }

                const now = Date.now();
                setLastAutoBackup(now);
                saveAutoBackupSettings({ enabled: autoBackupEnabled, lastBackupTime: now });
                console.log("Auto-backup completed successfully");

                // Refresh file list and cleanup old backups
                const params = new URLSearchParams({
                    spaces: "appDataFolder",
                    fields: "files(id,name,modifiedTime,size)",
                    orderBy: "modifiedTime desc",
                    pageSize: "50",
                });
                const listResponse = await driveFetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);
                if (listResponse.ok) {
                    const data = await listResponse.json();
                    const files: DriveFileSummary[] = Array.isArray(data?.files)
                        ? data.files
                            .filter((f: any) => typeof f?.id === "string" && typeof f?.name === "string")
                            .map((f: any) => ({
                                id: f.id as string,
                                name: f.name as string,
                                modifiedTime: typeof f.modifiedTime === "string" ? f.modifiedTime : undefined,
                                size: typeof f.size === "string" ? f.size : undefined,
                            }))
                        : [];
                    setDriveFiles(files);
                    await cleanupOldAutoBackups(files);
                }
            } catch (err) {
                console.error("Auto-backup failed", err);
            } finally {
                autoBackupRunningRef.current = false;
                setIsAutoBackupRunning(false);
            }
        },
        [driveFetch, autoBackupEnabled, cleanupOldAutoBackups]
    );

    // Auto-backup effect - runs when Drive is connected
    useEffect(() => {
        if (!driveToken || !autoBackupEnabled || !isDriveScriptReady) return;
        if (autoBackupRunningRef.current) return;

        const shouldBackup = !lastAutoBackup || (Date.now() - lastAutoBackup) > AUTO_BACKUP_INTERVAL_MS;
        if (!shouldBackup) return;

        // Delay auto-backup slightly to let the UI settle
        const timer = setTimeout(() => {
            void performAutoBackup();
        }, 2000);

        return () => clearTimeout(timer);
    }, [driveToken, autoBackupEnabled, lastAutoBackup, isDriveScriptReady, performAutoBackup]);

    // Save auto-backup enabled state when it changes
    useEffect(() => {
        saveAutoBackupSettings({ enabled: autoBackupEnabled, lastBackupTime: lastAutoBackup });
    }, [autoBackupEnabled, lastAutoBackup]);

    const refreshCharacters = useCallback(() => {
        const list = collectCharacters();
        setCharacters(list);
        setSelection(prev => {
            const next: Record<string, boolean> = {};
            if (list.length === 0) {
                return next;
            }
            list.forEach(name => {
                next[name] = prev[name] ?? true;
            });
            return next;
        });
    }, []);

    useEffect(() => {
        refreshCharacters();
        const handleChange = () => refreshCharacters();
        storage.onChanged?.addListener(handleChange);
        window.addEventListener("storage", handleChange);
        return () => {
            storage.onChanged?.removeListener?.(handleChange);
            window.removeEventListener("storage", handleChange);
        };
    }, [refreshCharacters]);

    useEffect(() => {
        const handleShow = () => {
            refreshCharacters();
            if (driveTokenRef.current && driveTokenExpiryRef.current && Date.now() < driveTokenExpiryRef.current) {
                void refreshDriveFiles();
            }
        };
        window.addEventListener("show-export-import", handleShow);
        return () => {
            window.removeEventListener("show-export-import", handleShow);
        };
    }, [refreshCharacters, refreshDriveFiles]);

    const handleToggleAll = (checked: boolean) => {
        setSelection(() => {
            const next: Record<string, boolean> = {};
            characters.forEach(name => {
                next[name] = checked;
            });
            return next;
        });
    };

    const applyImportedData = useCallback(async (payload: ExportPayload) => {
        applyLocalStorageImport(payload.localStorage);
        await replaceMultibinds(payload.indexedDB.multibinds ?? []);
        await importRecordings(payload.indexedDB.recordings ?? []);
        await importVisitedRooms(payload.indexedDB.visitedRooms ?? []);
    }, []);

    const handleExport = async () => {
        setError(null);
        setStatus(null);
        setIsProcessing(true);
        try {
            const payload = await buildExport(selectedCharacters, exportOptions);
            const json = JSON.stringify(payload, null, 2);
            const blob = new Blob([json], {type: "application/json"});
            const timestamp = new Date().toISOString().replace(/[:T]/g, "-").split(".")[0];
            const filename = `arkadia-backup-${timestamp}.json`;
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = filename;
            anchor.click();
            URL.revokeObjectURL(url);
            setStatus("Eksport zakończony sukcesem.");
        } catch (err) {
            console.error("Failed to export settings", err);
            setError("Nie udało się wyeksportować danych.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleImport = () => {
        setError(null);
        setStatus(null);
        fileInputRef.current?.click();
    };

    const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setIsProcessing(true);
        setError(null);
        setStatus(null);
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            if (!validatePayload(parsed)) {
                throw new Error("invalid");
            }
            await applyImportedData(parsed);
            setStatus("Import zakończony sukcesem. Niektóre ustawienia mogą wymagać odświeżenia strony.");
            refreshCharacters();
        } catch (err) {
            console.error("Failed to import settings", err);
            setError("Nie udało się zaimportować danych.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDriveConnect = async () => {
        if (!tokenClientRef.current) return;
        setDriveStatus(null);
        setDriveError(null);
        setDriveAction("connect");
        setIsDriveBusy(true);
        try {
            await ensureDriveToken(true);
            setDriveStatus("Połączono z Google Drive.");
            await refreshDriveFiles();
        } catch (err) {
            console.error("Failed to connect to Google Drive", err);
            setDriveError("Nie udało się połączyć z Google Drive.");
        } finally {
            setIsDriveBusy(false);
            setDriveAction(null);
        }
    };

    const handleDriveUpload = async () => {
        if (!tokenClientRef.current) return;
        setDriveError(null);
        setDriveStatus(null);
        setDriveAction("upload");
        setIsDriveBusy(true);
        try {
            const payload = await buildExport(selectedCharacters, exportOptions);
            const json = JSON.stringify(payload, null, 2);
            const timestamp = new Date().toISOString().replace(/[:T]/g, "-").split(".")[0];
            const metadata = {
                name: `arkadia-backup-${timestamp}.json`,
                parents: ["appDataFolder"],
            };
            const boundary = `-------arkadia-${Date.now().toString(16)}`;
            const body = [
                `--${boundary}`,
                "Content-Type: application/json; charset=UTF-8",
                "",
                JSON.stringify(metadata),
                `--${boundary}`,
                "Content-Type: application/json",
                "",
                json,
                `--${boundary}--`,
                "",
            ].join("\r\n");
            const response = await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
                method: "POST",
                headers: {
                    "Content-Type": `multipart/related; boundary=${boundary}`,
                },
                body,
            });
            if (!response.ok) {
                throw new Error(`Upload failed with status ${response.status}`);
            }
            setDriveStatus("Kopia została zapisana na Google Drive.");
            await refreshDriveFiles();
        } catch (err) {
            console.error("Failed to upload backup to Google Drive", err);
            setDriveError("Nie udało się wysłać kopii na Google Drive.");
        } finally {
            setIsDriveBusy(false);
            setDriveAction(null);
        }
    };

    const handleDriveImport = async (fileSummary: DriveFileSummary) => {
        if (!tokenClientRef.current) return;
        setDriveError(null);
        setDriveStatus(null);
        setError(null);
        setStatus(null);
        setDriveAction(`import:${fileSummary.id}`);
        setIsDriveBusy(true);
        try {
            const response = await driveFetch(
                `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileSummary.id)}?alt=media`
            );
            if (!response.ok) {
                throw new Error(`Download failed with status ${response.status}`);
            }
            const text = await response.text();
            const parsed = JSON.parse(text);
            if (!validatePayload(parsed)) {
                throw new Error("invalid");
            }
            await applyImportedData(parsed);
            refreshCharacters();
            setStatus("Import zakończony sukcesem. Niektóre ustawienia mogą wymagać odświeżenia strony.");
            setDriveStatus(`Zaimportowano plik "${fileSummary.name}" z Google Drive.`);
        } catch (err) {
            console.error("Failed to import backup from Google Drive", err);
            setDriveError("Nie udało się pobrać danych z Google Drive.");
        } finally {
            setIsDriveBusy(false);
            setDriveAction(null);
        }
    };

    const handleDriveDelete = async (fileSummary: DriveFileSummary) => {
        if (!tokenClientRef.current) return;
        const confirmed = window.confirm(`Czy na pewno chcesz usunąć kopię "${fileSummary.name}" z Google Drive?`);
        if (!confirmed) {
            return;
        }
        setDriveError(null);
        setDriveStatus(null);
        setDriveAction(`delete:${fileSummary.id}`);
        setIsDriveBusy(true);
        try {
            const response = await driveFetch(
                `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileSummary.id)}`,
                {
                    method: "DELETE",
                }
            );
            if (!response.ok) {
                throw new Error(`Delete failed with status ${response.status}`);
            }
            setDriveStatus(`Usunięto kopię "${fileSummary.name}" z Google Drive.`);
            await refreshDriveFiles();
        } catch (err) {
            console.error("Failed to delete backup from Google Drive", err);
            setDriveError("Nie udało się usunąć kopii z Google Drive.");
        } finally {
            setIsDriveBusy(false);
            setDriveAction(null);
        }
    };

    const handleDriveDisconnect = async () => {
        setDriveError(null);
        setDriveStatus(null);
        setDriveAction("disconnect");
        setIsDriveBusy(true);
        try {
            const token = driveTokenRef.current;
            if (token && window.google?.accounts?.oauth2?.revoke) {
                await new Promise<void>(resolve => {
                    window.google?.accounts?.oauth2?.revoke?.(token, () => resolve());
                });
            }
        } catch (err) {
            console.error("Failed to revoke Google Drive token", err);
        } finally {
            driveTokenRef.current = null;
            driveTokenExpiryRef.current = 0;
            setDriveToken(null);
            clearStoredDriveToken();
            setDriveFiles([]);
            setDriveStatus("Połączenie z Google Drive zostało zakończone.");
            setIsDriveBusy(false);
            setDriveAction(null);
        }
    };

    return (
        <div className="d-flex flex-column gap-3">
            <p className="mb-0">
                Wybierz postacie, które chcesz uwzględnić w eksporcie. Dane pobierane z internetu (mapy, zioła, magiki
                itp.) nie są dołączane.
            </p>
            <div className="border rounded p-3">
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <span className="fw-semibold">Postacie</span>
                    {characters.length > 0 && (
                        <div className="d-flex gap-2">
                            <Button
                                size="sm"
                                variant="outline-secondary"
                                className="py-0 px-2"
                                style={{fontSize: "0.75rem"}}
                                onClick={() => handleToggleAll(true)}
                            >
                                Wszystkie
                            </Button>
                            <Button
                                size="sm"
                                variant="outline-secondary"
                                className="py-0 px-2"
                                style={{fontSize: "0.75rem"}}
                                onClick={() => handleToggleAll(false)}
                            >
                                Żadna
                            </Button>
                        </div>
                    )}
                </div>
                {characters.length > 0 ? (
                    <div className="d-flex flex-wrap gap-3">
                        {characters.map(name => (
                            <Form.Check
                                key={name}
                                type="checkbox"
                                id={`export-character-${name}`}
                                label={name}
                                checked={!!selection[name]}
                                onChange={e => setSelection(prev => ({...prev, [name]: e.target.checked}))}
                            />
                        ))}
                    </div>
                ) : (
                    <p className="text-muted mb-0">Brak zapisanych postaci.</p>
                )}
            </div>
            <div className="border rounded p-3">
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <span className="fw-semibold">Dane do eksportu</span>
                    <div className="d-flex gap-2">
                        <Button
                            size="sm"
                            variant="outline-secondary"
                            className="py-0 px-2"
                            style={{fontSize: "0.75rem"}}
                            onClick={() => setExportOptions({...DEFAULT_EXPORT_OPTIONS})}
                        >
                            Wszystko
                        </Button>
                        <Button
                            size="sm"
                            variant="outline-secondary"
                            className="py-0 px-2"
                            style={{fontSize: "0.75rem"}}
                            onClick={() => setExportOptions({
                                globalSettings: false,
                                characterSettings: false,
                                triggers: false,
                                aliases: false,
                                buttons: false,
                                radial: false,
                                scripts: false,
                                multibinds: false,
                                recordings: false,
                                visitedRooms: false,
                            })}
                        >
                            Nic
                        </Button>
                    </div>
                </div>
                <div className="row g-3">
                    <div className="col-6 col-md-4">
                        <div className="text-muted small mb-1">Ustawienia</div>
                        <Form.Check
                            type="checkbox"
                            id="export-option-globalSettings"
                            label="Globalne"
                            checked={exportOptions.globalSettings}
                            onChange={e => setExportOptions(prev => ({...prev, globalSettings: e.target.checked}))}
                        />
                        <Form.Check
                            type="checkbox"
                            id="export-option-characterSettings"
                            label="Postaci"
                            checked={exportOptions.characterSettings}
                            onChange={e => setExportOptions(prev => ({...prev, characterSettings: e.target.checked}))}
                        />
                    </div>
                    <div className="col-6 col-md-4">
                        <div className="text-muted small mb-1">Automatyzacja</div>
                        <Form.Check
                            type="checkbox"
                            id="export-option-triggers"
                            label="Triggery"
                            checked={exportOptions.triggers}
                            onChange={e => setExportOptions(prev => ({...prev, triggers: e.target.checked}))}
                        />
                        <Form.Check
                            type="checkbox"
                            id="export-option-aliases"
                            label="Aliasy"
                            checked={exportOptions.aliases}
                            onChange={e => setExportOptions(prev => ({...prev, aliases: e.target.checked}))}
                        />
                        <Form.Check
                            type="checkbox"
                            id="export-option-multibinds"
                            label="Multibindy"
                            checked={exportOptions.multibinds}
                            onChange={e => setExportOptions(prev => ({...prev, multibinds: e.target.checked}))}
                        />
                        <Form.Check
                            type="checkbox"
                            id="export-option-scripts"
                            label="Skrypty"
                            checked={exportOptions.scripts}
                            onChange={e => setExportOptions(prev => ({...prev, scripts: e.target.checked}))}
                        />
                    </div>
                    <div className="col-6 col-md-4">
                        <div className="text-muted small mb-1">Interfejs</div>
                        <Form.Check
                            type="checkbox"
                            id="export-option-buttons"
                            label="Przyciski"
                            checked={exportOptions.buttons}
                            onChange={e => setExportOptions(prev => ({...prev, buttons: e.target.checked}))}
                        />
                        <Form.Check
                            type="checkbox"
                            id="export-option-radial"
                            label="Menu radialne"
                            checked={exportOptions.radial}
                            onChange={e => setExportOptions(prev => ({...prev, radial: e.target.checked}))}
                        />
                    </div>
                    <div className="col-6 col-md-4">
                        <div className="text-muted small mb-1">Dane</div>
                        <Form.Check
                            type="checkbox"
                            id="export-option-recordings"
                            label="Nagrania"
                            checked={exportOptions.recordings}
                            onChange={e => setExportOptions(prev => ({...prev, recordings: e.target.checked}))}
                        />
                        <Form.Check
                            type="checkbox"
                            id="export-option-visitedRooms"
                            label="Odwiedzone lokacje"
                            checked={exportOptions.visitedRooms}
                            onChange={e => setExportOptions(prev => ({...prev, visitedRooms: e.target.checked}))}
                        />
                    </div>
                </div>
            </div>
            <div className="d-flex flex-wrap gap-2 align-items-center">
                <Button onClick={handleExport} disabled={isProcessing}>
                    {isProcessing ? (
                        <span className="d-inline-flex align-items-center gap-2">
                            <Spinner animation="border" size="sm" role="status"/>
                            <span>Przetwarzanie…</span>
                        </span>
                    ) : (
                        "Eksportuj dane"
                    )}
                </Button>
                <Button variant="secondary" onClick={handleImport} disabled={isProcessing}>
                    Importuj dane…
                </Button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json"
                    style={{display: "none"}}
                    onChange={onFileChange}
                />
            </div>
            <div className="border-top pt-3 d-flex flex-column gap-3">
                <div>
                    <h6 className="mb-1">Google Drive</h6>
                    <p className="mb-0 text-muted">Połącz konto Google, aby zapisywać kopie zapasowe w chmurze.</p>
                </div>
                <div className="d-flex flex-wrap align-items-center gap-3">
                    <Form.Check
                        type="switch"
                        id="auto-backup-toggle"
                        label="Automatyczne kopie zapasowe"
                        checked={autoBackupEnabled}
                        onChange={e => setAutoBackupEnabled(e.target.checked)}
                    />
                    {driveToken && autoBackupEnabled && (
                        <span className="text-muted small">
                            {isAutoBackupRunning ? (
                                <span className="d-inline-flex align-items-center gap-1">
                                    <Spinner animation="border" size="sm" />
                                    <span>Tworzenie kopii…</span>
                                </span>
                            ) : lastAutoBackup ? (
                                `Ostatnia: ${new Date(lastAutoBackup).toLocaleString()}`
                            ) : (
                                "Oczekuje na pierwszy backup"
                            )}
                        </span>
                    )}
                </div>
                {autoBackupEnabled && (
                    <p className="text-muted small mb-0">
                        Kopie tworzone automatycznie raz dziennie, przechowywane przez 7 dni.
                    </p>
                )}
                <div className="d-flex flex-wrap gap-2 align-items-center">
                    {!isDriveScriptReady ? (
                        <div className="d-inline-flex align-items-center gap-2 text-muted">
                            <Spinner animation="border" size="sm" role="status"/>
                            <span>Ładowanie integracji z Google…</span>
                        </div>
                    ) : !driveToken ? (
                        <Button onClick={handleDriveConnect} disabled={isDriveBusy}>
                            {driveAction === "connect" ? (
                                <span className="d-inline-flex align-items-center gap-2">
                                    <Spinner animation="border" size="sm" role="status"/>
                                    <span>Łączenie…</span>
                                </span>
                            ) : (
                                "Połącz z Google Drive"
                            )}
                        </Button>
                    ) : (
                        <>
                            <Button
                                onClick={handleDriveUpload}
                                disabled={isDriveBusy || isProcessing || isDriveLoading}
                            >
                                {driveAction === "upload" ? (
                                    <span className="d-inline-flex align-items-center gap-2">
                                        <Spinner animation="border" size="sm" role="status"/>
                                        <span>Wysyłanie…</span>
                                    </span>
                                ) : (
                                    "Wyślij kopię na Google Drive"
                                )}
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => refreshDriveFiles({action: "list"})}
                                disabled={isDriveLoading || isDriveBusy}
                            >
                                {driveAction === "list" ? (
                                    <span className="d-inline-flex align-items-center gap-2">
                                        <Spinner animation="border" size="sm" role="status"/>
                                        <span>Odświeżanie…</span>
                                    </span>
                                ) : (
                                    "Odśwież listę"
                                )}
                            </Button>
                            <Button
                                variant="outline-secondary"
                                onClick={handleDriveDisconnect}
                                disabled={isDriveBusy || isDriveLoading}
                            >
                                {driveAction === "disconnect" ? (
                                    <span className="d-inline-flex align-items-center gap-2">
                                        <Spinner animation="border" size="sm" role="status"/>
                                        <span>Odłączanie…</span>
                                    </span>
                                ) : (
                                    "Odłącz"
                                )}
                            </Button>
                        </>
                    )}
                </div>
                {driveToken && (
                    <div className="d-flex flex-column gap-2">
                        {isDriveLoading ? (
                            <div className="d-inline-flex align-items-center gap-2 text-muted">
                                <Spinner animation="border" size="sm" role="status"/>
                                <span>Ładowanie listy plików…</span>
                            </div>
                        ) : driveFiles.length > 0 ? (
                            driveFiles.map(file => {
                                const sizeText = formatDriveSize(file.size);
                                const isAutoBackup = file.name.startsWith(AUTO_BACKUP_PREFIX);
                                const displayName = isAutoBackup
                                    ? file.name.replace(AUTO_BACKUP_PREFIX, "").replace(".json", "")
                                    : file.name.replace("arkadia-backup-", "").replace(".json", "");
                                return (
                                    <div
                                        key={file.id}
                                        className="d-flex flex-wrap align-items-center justify-content-between gap-2 border rounded px-2 py-2"
                                        style={isAutoBackup ? { borderColor: "var(--bs-secondary)" } : undefined}
                                    >
                                        <div className="me-auto">
                                            <div className="d-flex align-items-center gap-2">
                                                <span className="fw-semibold">{displayName}</span>
                                                {isAutoBackup && (
                                                    <span className="badge bg-secondary" style={{ fontSize: "0.65rem" }}>auto</span>
                                                )}
                                            </div>
                                            <div className="text-muted small">
                                                {formatDriveDate(file.modifiedTime)}
                                                {sizeText ? ` • ${sizeText}` : ""}
                                            </div>
                                        </div>
                                        <div className="d-flex flex-wrap align-items-center gap-2">
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                onClick={() => handleDriveImport(file)}
                                                disabled={isDriveBusy || isDriveLoading || isProcessing}
                                            >
                                                {driveAction === `import:${file.id}` ? (
                                                    <span className="d-inline-flex align-items-center gap-2">
                                                        <Spinner animation="border" size="sm" role="status"/>
                                                        <span>Importowanie…</span>
                                                    </span>
                                                ) : (
                                                    "Importuj"
                                                )}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline-danger"
                                                onClick={() => handleDriveDelete(file)}
                                                disabled={isDriveBusy || isDriveLoading}
                                            >
                                                {driveAction === `delete:${file.id}` ? (
                                                    <span className="d-inline-flex align-items-center gap-2">
                                                        <Spinner animation="border" size="sm" role="status"/>
                                                        <span>Usuwanie…</span>
                                                    </span>
                                                ) : (
                                                    "Usuń"
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <p className="text-muted mb-0">Brak kopii zapisanych przez Arkadię na Google Drive.</p>
                        )}
                    </div>
                )}
                {driveStatus && (
                    <Alert variant="success" className="mb-0">
                        {driveStatus}
                    </Alert>
                )}
                {driveError && (
                    <Alert variant="danger" className="mb-0">
                        {driveError}
                    </Alert>
                )}
            </div>
            {status && (
                <Alert variant="success" className="mb-0">
                    {status}
                </Alert>
            )}
            {error && (
                <Alert variant="danger" className="mb-0">
                    {error}
                </Alert>
            )}
        </div>
    );
}

export default ExportImport;
