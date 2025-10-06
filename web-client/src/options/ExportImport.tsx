import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Form, Spinner } from "react-bootstrap";
import storage from "@client/src/storage";
import type { StoredMultibindRecord } from "../multibindStorage";
import { readMultibinds, replaceMultibinds } from "../multibindStorage";
import type { RecordedEvent } from "./recordingStorage";
import { getRecording, getRecordingNames } from "./recordingStorage";

const GOOGLE_CLIENT_ID = "717498712073-50tjdorsa6vk4mq0fj774u0rhqr5jkd4.apps.googleusercontent.com";
const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.appdata"];
const DRIVE_TOKEN_STORAGE_KEY = "arkadia.googleDriveToken";

interface StoredDriveToken {
    token: string;
    expiry: number;
}

function loadStoredDriveToken(): StoredDriveToken | null {
    if (typeof sessionStorage === "undefined") {
        return null;
    }
    try {
        const raw = sessionStorage.getItem(DRIVE_TOKEN_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (typeof parsed?.token === "string" && typeof parsed?.expiry === "number") {
            return parsed;
        }
    } catch (err) {
        console.error("Failed to read stored Google Drive token", err);
    }
    sessionStorage.removeItem(DRIVE_TOKEN_STORAGE_KEY);
    return null;
}

function storeDriveToken(token: string, expiry: number) {
    if (typeof sessionStorage === "undefined") {
        return;
    }
    try {
        const payload: StoredDriveToken = { token, expiry };
        sessionStorage.setItem(DRIVE_TOKEN_STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
        console.error("Failed to store Google Drive token", err);
    }
}

function clearStoredDriveToken() {
    if (typeof sessionStorage === "undefined") {
        return;
    }
    sessionStorage.removeItem(DRIVE_TOKEN_STORAGE_KEY);
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

interface ExportPayload {
    version: 1;
    createdAt: string;
    characters: string[];
    localStorage: ExportedLocalStorage;
    indexedDB: {
        multibinds: StoredMultibindRecord[];
        recordings: ExportedRecording[];
        visitedRooms: ExportedVisitedRoomsEntry[];
    };
}

const EXCLUDED_LOCAL_STORAGE_KEYS = new Set([
    "cachedMapData",
    "cachedColors",
    "magics",
    "magic_keys",
    "herbs_data",
]);

const EXCLUDED_LOCAL_STORAGE_PREFIXES = ["http://", "https://"];
const IGNORED_CHARACTER_KEY_PREFIXES = new Set(["firebase"]);

function parseCharacterStorageKey(key: string): { name: string; baseKey: string } | null {
    if (!key) return null;
    if (key.includes("://")) return null;
    const firstColon = key.indexOf(":");
    if (firstColon <= 0) return null;
    const prefix = key.slice(0, firstColon);
    if (IGNORED_CHARACTER_KEY_PREFIXES.has(prefix)) {
        return null;
    }
    if (prefix === "Player") {
        const remainder = key.slice(firstColon + 1);
        if (!remainder) return null;
        const secondColon = remainder.indexOf(":");
        if (secondColon === -1) {
            const name = remainder.trim();
            return name ? { name, baseKey: "" } : null;
        }
        const name = remainder.slice(0, secondColon).trim();
        const baseKey = remainder.slice(secondColon + 1);
        return name ? { name, baseKey } : null;
    }
    const name = prefix.trim();
    const baseKey = key.slice(firstColon + 1);
    return name ? { name, baseKey } : null;
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
    return Array.from(names).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function exportLocalStorage(selectedCharacters: string[]): ExportedLocalStorage {
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
        global[key] = raw;
    }

    return { global, characters };
}

async function exportRecordings(): Promise<ExportedRecording[]> {
    try {
        const ids = await getRecordingNames();
        const entries: ExportedRecording[] = [];
        for (const id of ids) {
            const events = await getRecording(id);
            if (events) {
                entries.push({ id, events });
            }
        }
        return entries;
    } catch (err) {
        console.error("Failed to export recordings", err);
        return [];
    }
}

async function openRecordingsDb(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined") {
        throw new Error("IndexedDB is not supported");
    }
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

async function importRecordings(records: ExportedRecording[]): Promise<void> {
    if (typeof indexedDB === "undefined") {
        return;
    }
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
    if (typeof indexedDB === "undefined") {
        throw new Error("IndexedDB is not supported");
    }
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

async function exportVisitedRooms(selectedCharacters: string[]): Promise<ExportedVisitedRoomsEntry[]> {
    if (typeof indexedDB === "undefined") {
        return [];
    }
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

async function importVisitedRooms(entries: ExportedVisitedRoomsEntry[]): Promise<void> {
    if (!Array.isArray(entries)) return;
    if (entries.length === 0) return;
    if (typeof indexedDB === "undefined") {
        return;
    }
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

async function buildExport(selectedCharacters: string[]): Promise<ExportPayload> {
    const [multibinds, recordings, visitedRooms] = await Promise.all([
        readMultibinds().catch(err => {
            console.error("Failed to export multibinds", err);
            return [] as StoredMultibindRecord[];
        }),
        exportRecordings(),
        exportVisitedRooms(selectedCharacters),
    ]);

    return {
        version: 1,
        createdAt: new Date().toISOString(),
        characters: selectedCharacters,
        localStorage: exportLocalStorage(selectedCharacters),
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
    if (!payload.indexedDB || typeof payload.indexedDB !== "object") return false;
    return true;
}

function ExportImport() {
    const [characters, setCharacters] = useState<string[]>([]);
    const [selection, setSelection] = useState<Record<string, boolean>>({});
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

    const selectedCharacters = useMemo(
        () => characters.filter(name => selection[name]),
        [characters, selection]
    );

    useEffect(() => {
        const stored = loadStoredDriveToken();
        if (!stored) {
            return;
        }
        if (Date.now() >= stored.expiry) {
            clearStoredDriveToken();
            return;
        }
        driveTokenRef.current = stored.token;
        driveTokenExpiryRef.current = stored.expiry;
        setDriveToken(stored.token);
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
            callback: () => {},
            use_fedcm_for_prompt: true,
        });
    }, [isDriveScriptReady]);

    const ensureDriveToken = useCallback(
        async (forcePrompt = false): Promise<string> => {
            const client = tokenClientRef.current;
            if (!client) {
                throw new Error("Integracja z Google Drive nie jest dostępna.");
            }
            const now = Date.now();
            if (!forcePrompt) {
                const existingToken = driveTokenRef.current;
                const expiry = driveTokenExpiryRef.current;
                if (existingToken && expiry && now < expiry) {
                    return existingToken;
                }
            }
            return new Promise<string>((resolve, reject) => {
                client.callback = (response: GoogleTokenResponse) => {
                    if (response?.error) {
                        reject(new Error("Dostęp do Google Drive został odrzucony."));
                        return;
                    }
                    const token = response?.access_token;
                    if (!token) {
                        reject(new Error("Nie udało się uzyskać tokenu Google Drive."));
                        return;
                    }
                    const now = Date.now();
                    const expiresRaw = response.expires_in;
                    const expiresIn =
                        typeof expiresRaw === "string" ? Number.parseInt(expiresRaw, 10) : Number(expiresRaw ?? 0);
                    const buffer = Number.isFinite(expiresIn) ? Math.max(0, (expiresIn - 60) * 1000) : 0;
                    driveTokenRef.current = token;
                    driveTokenExpiryRef.current = buffer ? now + buffer : now + 5 * 60 * 1000;
                    setDriveToken(token);
                    storeDriveToken(token, driveTokenExpiryRef.current);
                    resolve(token);
                };
                try {
                    client.requestAccessToken({ prompt: forcePrompt || !driveTokenRef.current ? "consent" : "" });
                } catch (err) {
                    reject(err instanceof Error ? err : new Error("Nie udało się uzyskać tokenu Google Drive."));
                }
            });
        },
        []
    );

    const driveFetch = useCallback(
        async (url: string, init?: RequestInit, retry = true): Promise<Response> => {
            const token = await ensureDriveToken();
            const headers = new Headers(init?.headers as HeadersInit | undefined);
            headers.set("Authorization", `Bearer ${token}`);
            const requestInit: RequestInit = { ...init, headers };
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
        if (!driveToken) return;
        if (!tokenClientRef.current) return;
        if (!driveTokenExpiryRef.current || Date.now() >= driveTokenExpiryRef.current) return;
        void refreshDriveFiles();
    }, [driveToken, refreshDriveFiles]);

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
        setSelection(prev => {
            const next: Record<string, boolean> = {};
            characters.forEach(name => {
                next[name] = checked;
            });
            return next;
        });
    };

    const applyImportedData = useCallback(async (payload: ExportPayload) => {
        applyLocalStorageImport(payload.localStorage);
        if (typeof indexedDB !== "undefined") {
            await replaceMultibinds(payload.indexedDB.multibinds ?? []);
        }
        await importRecordings(payload.indexedDB.recordings ?? []);
        await importVisitedRooms(payload.indexedDB.visitedRooms ?? []);
    }, []);

    const handleExport = async () => {
        setError(null);
        setStatus(null);
        setIsProcessing(true);
        try {
            const payload = await buildExport(selectedCharacters);
            const json = JSON.stringify(payload, null, 2);
            const blob = new Blob([json], { type: "application/json" });
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
            const payload = await buildExport(selectedCharacters);
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
                Wybierz postacie, które chcesz uwzględnić w eksporcie. Dane pobierane z internetu (mapy, zioła, magiki itp.) nie są dołączane.
            </p>
            {characters.length > 0 ? (
                <div className="d-flex flex-column gap-2">
                    <div className="d-flex flex-wrap gap-3 align-items-center">
                        {characters.map(name => (
                            <Form.Check
                                key={name}
                                type="checkbox"
                                id={`export-character-${name}`}
                                label={name}
                                checked={!!selection[name]}
                                onChange={e => setSelection(prev => ({ ...prev, [name]: e.target.checked }))}
                            />
                        ))}
                    </div>
                    <div className="d-flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => handleToggleAll(true)}>Zaznacz wszystkie</Button>
                        <Button size="sm" variant="secondary" onClick={() => handleToggleAll(false)}>Odznacz wszystkie</Button>
                    </div>
                </div>
            ) : (
                <p className="text-muted mb-0">Brak zapisanych postaci.</p>
            )}
            <div className="d-flex flex-wrap gap-2 align-items-center">
                <Button onClick={handleExport} disabled={isProcessing}>
                    {isProcessing ? (
                        <span className="d-inline-flex align-items-center gap-2">
                            <Spinner animation="border" size="sm" role="status" />
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
                    style={{ display: "none" }}
                    onChange={onFileChange}
                />
            </div>
            <div className="border-top pt-3 d-flex flex-column gap-3">
                <div>
                    <h6 className="mb-1">Google Drive</h6>
                    <p className="mb-2 text-muted">Połącz konto Google, aby zapisywać kopie zapasowe w chmurze.</p>
                </div>
                <div className="d-flex flex-wrap gap-2 align-items-center">
                    {!isDriveScriptReady ? (
                        <div className="d-inline-flex align-items-center gap-2 text-muted">
                            <Spinner animation="border" size="sm" role="status" />
                            <span>Ładowanie integracji z Google…</span>
                        </div>
                    ) : !driveToken ? (
                        <Button onClick={handleDriveConnect} disabled={isDriveBusy}>
                            {driveAction === "connect" ? (
                                <span className="d-inline-flex align-items-center gap-2">
                                    <Spinner animation="border" size="sm" role="status" />
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
                                        <Spinner animation="border" size="sm" role="status" />
                                        <span>Wysyłanie…</span>
                                    </span>
                                ) : (
                                    "Wyślij kopię na Google Drive"
                                )}
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => refreshDriveFiles({ action: "list" })}
                                disabled={isDriveLoading || isDriveBusy}
                            >
                                {driveAction === "list" ? (
                                    <span className="d-inline-flex align-items-center gap-2">
                                        <Spinner animation="border" size="sm" role="status" />
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
                                        <Spinner animation="border" size="sm" role="status" />
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
                                <Spinner animation="border" size="sm" role="status" />
                                <span>Ładowanie listy plików…</span>
                            </div>
                        ) : driveFiles.length > 0 ? (
                            driveFiles.map(file => {
                                const sizeText = formatDriveSize(file.size);
                                return (
                                    <div
                                        key={file.id}
                                        className="d-flex flex-wrap align-items-center justify-content-between gap-2 border rounded px-2 py-2"
                                    >
                                        <div className="me-auto">
                                            <div className="fw-semibold">{file.name}</div>
                                            <div className="text-muted small">
                                                {formatDriveDate(file.modifiedTime)}
                                                {sizeText ? ` • ${sizeText}` : ""}
                                            </div>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => handleDriveImport(file)}
                                            disabled={isDriveBusy || isDriveLoading || isProcessing}
                                        >
                                            {driveAction === `import:${file.id}` ? (
                                                <span className="d-inline-flex align-items-center gap-2">
                                                    <Spinner animation="border" size="sm" role="status" />
                                                    <span>Importowanie…</span>
                                                </span>
                                            ) : (
                                                "Importuj"
                                            )}
                                        </Button>
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
