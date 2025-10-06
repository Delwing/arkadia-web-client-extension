import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Form, Spinner } from "react-bootstrap";
import storage from "@client/src/storage";
import type { StoredMultibindRecord } from "../multibindStorage";
import { readMultibinds, replaceMultibinds } from "../multibindStorage";
import type { RecordedEvent } from "./recordingStorage";
import { getRecording, getRecordingNames } from "./recordingStorage";

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

const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.appdata"];
const CLIENT_ID = "717498712073-50tjdorsa6vk4mq0fj774u0rhqr5jkd4.apps.googleusercontent.com";
const GOOGLE_SCRIPT_ID = "google-identity-services";
const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

declare global {
    interface Window {
        google?: {
            accounts?: {
                oauth2?: {
                    initTokenClient?: (config: {
                        client_id: string;
                        scope: string;
                        callback: (response: GoogleTokenResponse) => void;
                    }) => GoogleTokenClient;
                };
            };
        };
    }
}

interface GoogleTokenResponse {
    access_token?: string;
    expires_in?: number | string;
    error?: string;
    error_description?: string;
}

interface GoogleTokenClient {
    requestAccessToken: (options?: { prompt?: string }) => void;
    callback?: (response: GoogleTokenResponse) => void;
}

interface DriveFileEntry {
    id: string;
    name: string;
    createdTime?: string;
    modifiedTime?: string;
    size?: string;
}

function loadScript(id: string, src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (document.getElementById(id)) {
            resolve();
            return;
        }
        const script = document.createElement("script");
        script.id = id;
        script.src = src;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
        document.head.appendChild(script);
    });
}

function formatDriveDate(value?: string): string {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "";
    }
    return date.toLocaleString();
}

function buildBackupFilename() {
    const timestamp = new Date().toISOString().replace(/[:T]/g, "-").split(".")[0];
    return `arkadia-backup-${timestamp}.json`;
}

function formatDriveSize(value?: string): string {
    if (!value) return "";
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return "";
    }
    if (numeric >= 1024 * 1024) {
        return `${(numeric / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(numeric / 1024).toFixed(1)} KB`;
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
    const [isDriveProcessing, setIsDriveProcessing] = useState(false);
    const [isDriveLoading, setIsDriveLoading] = useState(false);
    const [isConnectingDrive, setIsConnectingDrive] = useState(false);
    const [googleReady, setGoogleReady] = useState(false);
    const [driveFiles, setDriveFiles] = useState<DriveFileEntry[]>([]);
    const [tokenInfo, setTokenInfo] = useState<{ token: string; expiresAt: number } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const tokenClientRef = useRef<GoogleTokenClient | null>(null);
    const tokenInfoRef = useRef<{ token: string; expiresAt: number } | null>(null);
    const pendingTokenRequestsRef = useRef<
        Array<{ resolve: (token: string) => void; reject: (error: Error) => void }>
    >([]);
    const selectedCharacters = useMemo(
        () => characters.filter(name => selection[name]),
        [characters, selection]
    );
    const isDriveConnected = useMemo(() => {
        if (!tokenInfo) {
            return false;
        }
        return Date.now() < tokenInfo.expiresAt;
    }, [tokenInfo]);

    const clearTokenInfo = useCallback(() => {
        tokenInfoRef.current = null;
        setTokenInfo(null);
    }, []);

    useEffect(() => {
        tokenInfoRef.current = tokenInfo;
    }, [tokenInfo]);

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
        let isCancelled = false;
        const handleTokenResponse = (response: GoogleTokenResponse) => {
            const pending = pendingTokenRequestsRef.current.splice(0);
            if (response?.error) {
                const error = new Error(response.error_description ?? response.error ?? "Token request failed");
                (error as Error & { authError?: string }).authError = response.error ?? undefined;
                pending.forEach(entry => entry.reject(error));
                return;
            }
            const accessToken = typeof response?.access_token === "string" ? response.access_token : "";
            if (!accessToken) {
                const error = new Error("Brak tokena dostępu");
                pending.forEach(entry => entry.reject(error));
                return;
            }
            const expiresInSeconds = Number(response?.expires_in);
            const expiresAt = Number.isFinite(expiresInSeconds)
                ? Date.now() + expiresInSeconds * 1000
                : Date.now() + 5 * 60 * 1000;
            if (isCancelled) {
                return;
            }
            const info = { token: accessToken, expiresAt };
            tokenInfoRef.current = info;
            setTokenInfo(info);
            pending.forEach(entry => entry.resolve(accessToken));
        };

        const initialiseClient = () => {
            if (isCancelled) {
                return;
            }
            const initTokenClient = window.google?.accounts?.oauth2?.initTokenClient;
            if (!initTokenClient) {
                console.error("Google Identity Services not available");
                return;
            }
            const client = initTokenClient({
                client_id: CLIENT_ID,
                scope: DRIVE_SCOPES.join(" "),
                callback: handleTokenResponse,
            });
            tokenClientRef.current = client;
            setGoogleReady(true);
        };

        if (window.google?.accounts?.oauth2?.initTokenClient) {
            initialiseClient();
        } else {
            loadScript(GOOGLE_SCRIPT_ID, GOOGLE_SCRIPT_SRC)
                .then(() => {
                    initialiseClient();
                })
                .catch(err => {
                    console.error("Failed to load Google Identity Services", err);
                });
        }

        return () => {
            isCancelled = true;
            const pending = pendingTokenRequestsRef.current.splice(0);
            if (pending.length > 0) {
                const error = new Error("Token request cancelled");
                pending.forEach(entry => entry.reject(error));
            }
        };
    }, []);

    useEffect(() => {
        if (!tokenInfo) {
            return;
        }
        const remaining = tokenInfo.expiresAt - Date.now();
        if (remaining <= 0) {
            clearTokenInfo();
            return;
        }
        const timeout = window.setTimeout(() => {
            clearTokenInfo();
        }, remaining);
        return () => window.clearTimeout(timeout);
    }, [tokenInfo, clearTokenInfo]);

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
        };
        window.addEventListener("show-export-import", handleShow);
        return () => {
            window.removeEventListener("show-export-import", handleShow);
        };
    }, [refreshCharacters]);

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

    const ensureAccessToken = useCallback(
        (prompt: "" | "consent" = "") => {
            const info = tokenInfoRef.current;
            if (info && Date.now() < info.expiresAt - 60_000) {
                return Promise.resolve(info.token);
            }
            return new Promise<string>((resolve, reject) => {
                const client = tokenClientRef.current;
                if (!client) {
                    reject(new Error("Google OAuth nie jest jeszcze gotowe."));
                    return;
                }
                pendingTokenRequestsRef.current.push({ resolve, reject });
                if (pendingTokenRequestsRef.current.length > 1) {
                    return;
                }
                try {
                    client.requestAccessToken({ prompt });
                } catch (err) {
                    const error = err instanceof Error ? err : new Error(String(err));
                    const pending = pendingTokenRequestsRef.current.splice(0);
                    pending.forEach(entry => entry.reject(error));
                }
            });
        },
        []
    );

    const runWithToken = useCallback(
        async <T,>(
            action: (token: string) => Promise<T>,
            options?: { allowInteractive?: boolean }
        ): Promise<T> => {
            const allowInteractive = options?.allowInteractive ?? true;
            const attempt = async (prompt: "" | "consent") => {
                const token = await ensureAccessToken(prompt);
                return action(token);
            };
            try {
                return await attempt("");
            } catch (err) {
                const authError = (err as Error & { authError?: string }).authError;
                if (
                    allowInteractive &&
                    (authError === "interaction_required" || authError === "consent_required")
                ) {
                    return await attempt("consent");
                }
                if ((err as Error & { shouldRetryWithNewToken?: boolean }).shouldRetryWithNewToken) {
                    try {
                        return await attempt("");
                    } catch (retryErr) {
                        const retryAuthError = (retryErr as Error & { authError?: string }).authError;
                        if (
                            allowInteractive &&
                            (retryAuthError === "interaction_required" || retryAuthError === "consent_required")
                        ) {
                            return await attempt("consent");
                        }
                        throw retryErr;
                    }
                }
                throw err;
            }
        },
        [ensureAccessToken]
    );

    const driveFetch = useCallback(
        async (token: string, input: RequestInfo | URL, init?: RequestInit) => {
            const headers = new Headers(init?.headers ?? undefined);
            headers.set("Authorization", `Bearer ${token}`);
            const response = await fetch(input, { ...init, headers });
            if (response.status === 401) {
                clearTokenInfo();
                const error = new Error("Unauthorized");
                (error as Error & { shouldRetryWithNewToken?: boolean }).shouldRetryWithNewToken = true;
                throw error;
            }
            return response;
        },
        [clearTokenInfo]
    );

    const loadDriveExports = useCallback(async (options?: { allowInteractive?: boolean }) => {
        setIsDriveLoading(true);
        try {
            await runWithToken(async token => {
                const response = await driveFetch(
                    token,
                    `${DRIVE_API_BASE}/files?spaces=appDataFolder&fields=files(id,name,createdTime,modifiedTime,size)&orderBy=createdTime%20desc`
                );
                if (!response.ok) {
                    const message = await response.text().catch(() => "");
                    throw new Error(message || "Nie udało się pobrać listy kopii zapasowych z Google Drive.");
                }
                const data = await response.json();
                const files = Array.isArray(data?.files) ? data.files : [];
                setDriveFiles(
                    files
                        .filter((entry: any) => typeof entry?.id === "string")
                        .map((entry: any) => ({
                            id: entry.id as string,
                            name: typeof entry?.name === "string" ? entry.name : "",
                            createdTime: typeof entry?.createdTime === "string" ? entry.createdTime : undefined,
                            modifiedTime: typeof entry?.modifiedTime === "string" ? entry.modifiedTime : undefined,
                            size: typeof entry?.size === "string" ? entry.size : undefined,
                        }))
                );
            }, options);
        } catch (err) {
            console.error("Failed to list Google Drive exports", err);
            throw err;
        } finally {
            setIsDriveLoading(false);
        }
    }, [driveFetch, runWithToken]);

    useEffect(() => {
        if (!googleReady) {
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                await loadDriveExports({ allowInteractive: false });
            } catch (err) {
                const authError = (err as Error & { authError?: string }).authError;
                if (authError === "interaction_required" || authError === "consent_required") {
                    return;
                }
                if ((err as Error & { shouldRetryWithNewToken?: boolean }).shouldRetryWithNewToken) {
                    return;
                }
                if (!cancelled) {
                    console.error("Failed to synchronise Google Drive backups", err);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [googleReady, loadDriveExports]);

    const connectToDrive = useCallback(async () => {
        if (!googleReady) {
            return;
        }
        setError(null);
        setStatus(null);
        setIsConnectingDrive(true);
        try {
            await loadDriveExports();
            setStatus("Połączono z Google Drive.");
        } catch (err) {
            console.error("Failed to connect to Google Drive", err);
            const authError = (err as Error & { authError?: string }).authError;
            if (authError === "access_denied") {
                setError("Dostęp do Google Drive został odrzucony.");
            } else {
                setError("Nie udało się połączyć z Google Drive.");
            }
        } finally {
            setIsConnectingDrive(false);
        }
    }, [googleReady, loadDriveExports]);

    const handleDriveExport = useCallback(async () => {
        setError(null);
        setStatus(null);
        setIsDriveProcessing(true);
        try {
            const payload = await buildExport(selectedCharacters);
            await runWithToken(async token => {
                const metadata = {
                    name: buildBackupFilename(),
                    parents: ["appDataFolder"],
                    mimeType: "application/json",
                };
                const boundary = `boundary_${Math.random().toString(36).slice(2)}`;
                const body = [
                    `--${boundary}`,
                    "Content-Type: application/json; charset=UTF-8",
                    "",
                    JSON.stringify(metadata),
                    `--${boundary}`,
                    "Content-Type: application/json",
                    "",
                    JSON.stringify(payload, null, 2),
                    `--${boundary}--`,
                    "",
                ].join("\r\n");
                const response = await driveFetch(token, DRIVE_UPLOAD_URL, {
                    method: "POST",
                    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
                    body,
                });
                if (!response.ok) {
                    const message = await response.text().catch(() => "");
                    throw new Error(message || "Nie udało się zapisać kopii zapasowej w Google Drive.");
                }
            });
            setStatus("Eksport zapisany w Google Drive.");
            try {
                await loadDriveExports({ allowInteractive: false });
            } catch (err) {
                console.error("Failed to refresh Google Drive exports", err);
            }
        } catch (err) {
            console.error("Failed to export to Google Drive", err);
            const authError = (err as Error & { authError?: string }).authError;
            if (authError === "access_denied") {
                setError("Dostęp do Google Drive został odrzucony.");
            } else {
                setError("Nie udało się zapisać eksportu na Google Drive.");
            }
        } finally {
            setIsDriveProcessing(false);
        }
    }, [driveFetch, loadDriveExports, runWithToken, selectedCharacters]);

    const handleDriveImport = useCallback(
        async (file: DriveFileEntry) => {
            setError(null);
            setStatus(null);
            setIsDriveProcessing(true);
            try {
                await runWithToken(async token => {
                    const response = await driveFetch(
                        token,
                        `${DRIVE_API_BASE}/files/${encodeURIComponent(file.id)}?alt=media`
                    );
                    if (!response.ok) {
                        const message = await response.text().catch(() => "");
                        throw new Error(message || "Nie udało się pobrać kopii zapasowej z Google Drive.");
                    }
                    const text = await response.text();
                    const parsed = JSON.parse(text);
                    if (!validatePayload(parsed)) {
                        throw new Error("invalid");
                    }
                    await applyImportedData(parsed);
                });
                setStatus(
                    "Import z Google Drive zakończony sukcesem. Niektóre ustawienia mogą wymagać odświeżenia strony."
                );
                refreshCharacters();
            } catch (err) {
                console.error("Failed to import from Google Drive", err);
                const authError = (err as Error & { authError?: string }).authError;
                if (authError === "access_denied") {
                    setError("Dostęp do Google Drive został odrzucony.");
                } else {
                    setError("Nie udało się zaimportować danych z Google Drive.");
                }
            } finally {
                setIsDriveProcessing(false);
            }
        },
        [applyImportedData, driveFetch, refreshCharacters, runWithToken]
    );

    const handleDriveDelete = useCallback(
        async (file: DriveFileEntry) => {
            setError(null);
            setStatus(null);
            setIsDriveProcessing(true);
            try {
                await runWithToken(async token => {
                    const response = await driveFetch(token, `${DRIVE_API_BASE}/files/${encodeURIComponent(file.id)}`, {
                        method: "DELETE",
                    });
                    if (!response.ok && response.status !== 204) {
                        const message = await response.text().catch(() => "");
                        throw new Error(message || "Nie udało się usunąć kopii zapasowej z Google Drive.");
                    }
                });
                setStatus("Eksport został usunięty z Google Drive.");
                setDriveFiles(prev => prev.filter(entry => entry.id !== file.id));
            } catch (err) {
                console.error("Failed to delete Google Drive export", err);
                const authError = (err as Error & { authError?: string }).authError;
                if (authError === "access_denied") {
                    setError("Dostęp do Google Drive został odrzucony.");
                } else {
                    setError("Nie udało się usunąć eksportu z Google Drive.");
                }
            } finally {
                setIsDriveProcessing(false);
            }
        },
        [driveFetch, runWithToken]
    );

    const handleExport = async () => {
        setError(null);
        setStatus(null);
        setIsProcessing(true);
        try {
            const payload = await buildExport(selectedCharacters);
            const json = JSON.stringify(payload, null, 2);
            const blob = new Blob([json], { type: "application/json" });
            const filename = buildBackupFilename();
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
                    <h2 className="h6 mb-1">Google Drive</h2>
                    <p className="text-muted mb-0">
                        Połącz konto Google, aby przechowywać kopie zapasowe w przestrzeni aplikacji Google Drive.
                    </p>
                </div>
                <div className="d-flex flex-wrap gap-2 align-items-center">
                    <Button
                        variant="secondary"
                        onClick={connectToDrive}
                        disabled={!googleReady || isConnectingDrive || isDriveProcessing || isDriveLoading}
                    >
                        {isConnectingDrive ? (
                            <span className="d-inline-flex align-items-center gap-2">
                                <Spinner animation="border" size="sm" role="status" />
                                <span>Łączenie…</span>
                            </span>
                        ) : isDriveConnected ? (
                            "Odśwież połączenie z Google Drive"
                        ) : (
                            "Połącz z Google Drive"
                        )}
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={handleDriveExport}
                        disabled={!isDriveConnected || isDriveProcessing || isProcessing || isDriveLoading}
                    >
                        {isDriveProcessing ? (
                            <span className="d-inline-flex align-items-center gap-2">
                                <Spinner animation="border" size="sm" role="status" />
                                <span>Przetwarzanie…</span>
                            </span>
                        ) : (
                            "Eksportuj do Google Drive"
                        )}
                    </Button>
                    {!googleReady && (
                        <span className="text-muted small">Ładowanie obsługi Google…</span>
                    )}
                    {googleReady && isDriveConnected && !isConnectingDrive && !isDriveProcessing && !isDriveLoading && (
                        <span className="text-success small">Połączono z Google Drive</span>
                    )}
                </div>
                <div className="d-flex flex-column gap-2">
                    {isDriveLoading ? (
                        <div className="d-inline-flex align-items-center gap-2 text-muted">
                            <Spinner animation="border" size="sm" role="status" />
                            <span>Ładowanie kopii zapasowych…</span>
                        </div>
                    ) : isDriveConnected ? (
                        driveFiles.length > 0 ? (
                            <div className="d-flex flex-column gap-2">
                                {driveFiles.map(file => {
                                    const displayDate = formatDriveDate(file.modifiedTime ?? file.createdTime);
                                    const sizeText = formatDriveSize(file.size);
                                    return (
                                        <div
                                            key={file.id}
                                            className="d-flex flex-column flex-lg-row align-items-lg-center gap-2 border rounded px-3 py-2"
                                        >
                                            <div className="flex-grow-1">
                                                <div className="fw-semibold">{file.name || "arkadia-backup.json"}</div>
                                                <div className="text-muted small">
                                                    {displayDate || "Brak daty"}
                                                    {sizeText ? ` · ${sizeText}` : ""}
                                                </div>
                                            </div>
                                            <div className="d-flex gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={() => handleDriveImport(file)}
                                                    disabled={isDriveProcessing}
                                                >
                                                    Importuj
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="danger"
                                                    onClick={() => handleDriveDelete(file)}
                                                    disabled={isDriveProcessing}
                                                >
                                                    Usuń
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-muted mb-0">Brak kopii zapasowych w Google Drive.</p>
                        )
                    ) : (
                        <p className="text-muted mb-0">Połącz konto Google, aby wyświetlić kopie zapasowe.</p>
                    )}
                </div>
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
