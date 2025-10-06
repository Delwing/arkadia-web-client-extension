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
    const fileInputRef = useRef<HTMLInputElement>(null);
    const selectedCharacters = useMemo(
        () => characters.filter(name => selection[name]),
        [characters, selection]
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
            <div className="border-top pt-3">
                <Alert variant="warning" className="mb-0">
                    Integracja z Google Drive jest obecnie niedostępna. Użyj eksportu do pliku, aby tworzyć kopie zapasowe.
                </Alert>
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
