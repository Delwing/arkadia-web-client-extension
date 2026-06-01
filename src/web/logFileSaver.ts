import { globalStorage } from "@modules/core/storage";
import { AnsiAwareBuffer } from "@client/ansi/FormatState";
import eventBus from "@modules/core/eventBus";
import type { CombatEntry } from "@client/scripts/combatWindow";
import { currentSessionName } from "./sessionLogger";
import { formatSessionFileName, formatDateTime, splitLines, collectLogStyles } from "./logBrowserUtils";

const CLICK_TAG_REG = /\{clickOpen:\d+(?::[^}]+)?}|\{clickClose}/g;
const FLUSH_INTERVAL_MS = 3000;
const DIR_HANDLE_STORE = "fileSaveDir";
const SAVED_TO_DISK_STORE = "savedToDisk";

type StatusCallback = (active: boolean, dirName: string | null) => void;

let dirHandle: FileSystemDirectoryHandle | null = null;
let fileHandle: FileSystemFileHandle | null = null;
let fileOffset = 0;
let buffer: string[] = [];
let flushTimer: number | null = null;
let active = false;
let pendingResume = false;
let headerWritten = false;
let sessionMarked = false;
let statusListeners: StatusCallback[] = [];
let stylesCollected = false;
let cachedStyles = "";

// --- Public API ---

export function isFileSaveSupported(): boolean {
    return typeof window.showDirectoryPicker === "function";
}

export function isFileSaveActive(): boolean {
    return active || pendingResume;
}

export function getDirectoryName(): string | null {
    return dirHandle?.name ?? null;
}

export function onStatusChange(cb: StatusCallback): () => void {
    statusListeners.push(cb);
    return () => {
        statusListeners = statusListeners.filter(l => l !== cb);
    };
}

export async function enableFileSave(): Promise<{ dirName: string } | null> {
    if (!isFileSaveSupported()) return null;

    try {
        const handle = await window.showDirectoryPicker!({ mode: "readwrite", id: "arkadia-logs" });
        dirHandle = handle;
        await storeDirHandle(handle);
        globalStorage.set("logFileSaveEnabled", true);
        await startSaving();
        return { dirName: handle.name };
    } catch (err) {
        // User cancelled the picker or permission denied
        console.error("[LogFileSaver] Failed to enable:", err);
        return null;
    }
}

export function disableFileSave(): void {
    globalStorage.set("logFileSaveEnabled", false);
    pendingResume = false;
    stopSaving();
    dirHandle = null;
    fileHandle = null;
    fileOffset = 0;
    headerWritten = false;
}

// --- Initialization ---

interface SessionClient {
    on(event: "message", handler: (text?: string | AnsiAwareBuffer, type?: string, timestamp?: number) => void): void;
}

export default async function initLogFileSaver(client: SessionClient) {
    if (!isFileSaveSupported()) return;

    // Ensure meta DB is upgraded to latest version early
    try {
        const db = await openMetaDb();
        db.close();
    } catch { /* ignore */ }

    // Listen to client messages
    client.on("message", (text?: string | AnsiAwareBuffer, type?: string, timestamp?: number) => {
        if (!active) return;
        if (!text) return;

        let htmlText: string;
        if (text instanceof AnsiAwareBuffer) {
            htmlText = text.toHtml();
        } else {
            htmlText = text;
        }

        if (htmlText === "\n") htmlText = "";

        const cleanedText = htmlText.replace(CLICK_TAG_REG, "");
        const ts = timestamp ?? Date.now();
        addEntry(cleanedText, type, ts);
    });

    // Listen to combat messages
    eventBus.on("combat.newMessage", (entry: CombatEntry) => {
        if (!active) return;
        if (entry.type === "separator") return;
        const htmlText = entry.buffer.toHtml();
        const cleanedText = htmlText.replace(CLICK_TAG_REG, "");
        addEntry(cleanedText, entry.type, Date.now());
    });

    // Flush on page unload
    window.addEventListener("beforeunload", () => {
        if (active && buffer.length > 0) {
            flushSync();
        }
    });

    // Auto-resume if previously enabled
    const wasEnabled = globalStorage.get("logFileSaveEnabled");
    if (wasEnabled) {
        try {
            const handle = await loadDirHandle();
            if (handle) {
                dirHandle = handle;
                // Check if we already have permission (no user gesture needed)
                const existingPerm = await handle.queryPermission({ mode: "readwrite" });
                if (existingPerm === "granted") {
                    await startSaving();
                } else {
                    // Permission needs user gesture to re-grant.
                    // Keep setting enabled, defer request to first user interaction.
                    pendingResume = true;
                    notifyListeners();
                    const onInteraction = async () => {
                        document.removeEventListener("click", onInteraction);
                        document.removeEventListener("keydown", onInteraction);
                        if (!pendingResume || !dirHandle) return;
                        pendingResume = false;
                        try {
                            const perm = await dirHandle.requestPermission({ mode: "readwrite" });
                            if (perm === "granted") {
                                await startSaving();
                            } else {
                                dirHandle = null;
                                globalStorage.set("logFileSaveEnabled", false);
                                notifyListeners();
                            }
                        } catch {
                            dirHandle = null;
                            globalStorage.set("logFileSaveEnabled", false);
                            notifyListeners();
                        }
                    };
                    document.addEventListener("click", onInteraction, { once: true });
                    document.addEventListener("keydown", onInteraction, { once: true });
                }
            } else {
                globalStorage.set("logFileSaveEnabled", false);
            }
        } catch {
            globalStorage.set("logFileSaveEnabled", false);
        }
    }
}

// --- Internal ---

function notifyListeners() {
    const dirName = getDirectoryName();
    for (const cb of statusListeners) {
        try { cb(active, dirName); } catch { /* ignore */ }
    }
}

async function startSaving() {
    active = true;
    headerWritten = false;
    sessionMarked = false;
    fileHandle = null;
    fileOffset = 0;
    buffer = [];
    notifyListeners();
    startFlushTimer();
}

function stopSaving() {
    active = false;
    if (flushTimer !== null) {
        clearInterval(flushTimer);
        flushTimer = null;
    }
    notifyListeners();
}

function startFlushTimer() {
    if (flushTimer !== null) return;
    flushTimer = window.setInterval(() => {
        if (buffer.length > 0) {
            flush();
        }
    }, FLUSH_INTERVAL_MS);
}

function collectStyles(): string {
    if (stylesCollected) return cachedStyles;
    cachedStyles = collectLogStyles();
    stylesCollected = true;
    return cachedStyles;
}

function buildHtmlHeader(): string {
    const styles = collectStyles();
    const allStyles = styles + "\nhtml, body { overflow: auto; } #logs-preview { height: auto; }";
    return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><style>${allStyles}</style></head><body><div id="logs-preview">\n`;
}

function buildEntryHtml(text: string, type: string | undefined, timestamp: number): string {
    const time = formatDateTime(timestamp);
    const parts = splitLines(text);
    const lines: string[] = [];
    for (const part of parts) {
        const classes = ["output_msg"];
        if (type) classes.push(type);
        lines.push(`<div class="${classes.join(" ")}"><div class="output_msg_text"><span class="log-time">${time}</span><span>${part}</span></div></div>`);
    }
    return lines.join("\n") + "\n";
}

function addEntry(text: string, type: string | undefined, timestamp: number) {
    const html = buildEntryHtml(text, type, timestamp);
    buffer.push(html);
}

async function ensureFile(): Promise<boolean> {
    if (!dirHandle) return false;

    if (!fileHandle) {
        const fileName = `${formatSessionFileName(currentSessionName)}.html`;
        try {
            fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        } catch (err) {
            console.error("[LogFileSaver] Failed to create file:", err);
            stopSaving();
            globalStorage.set("logFileSaveEnabled", false);
            return false;
        }
    }

    if (!headerWritten) {
        try {
            const header = buildHtmlHeader();
            const writable = await fileHandle.createWritable();
            await writable.write(header);
            await writable.close();
            fileOffset = new Blob([header]).size;
            headerWritten = true;
        } catch (err) {
            console.error("[LogFileSaver] Failed to write header:", err);
            stopSaving();
            globalStorage.set("logFileSaveEnabled", false);
            return false;
        }
    }

    return true;
}

async function flush() {
    if (buffer.length === 0) return;
    if (!fileHandle && !dirHandle) return;

    const entries = buffer.splice(0);
    const content = entries.join("");

    try {
        if (!(await ensureFile())) return;

        const writable = await fileHandle!.createWritable({ keepExistingData: true });
        await writable.seek(fileOffset);
        await writable.write(content);
        await writable.close();
        fileOffset += new Blob([content]).size;

        if (!sessionMarked) {
            sessionMarked = true;
            markSessionSavedToDisk(currentSessionName);
        }
    } catch (err) {
        console.error("[LogFileSaver] Failed to write entries:", err);
        // Put entries back in buffer for retry
        buffer.unshift(...entries);
        // If permission was revoked, stop
        if (dirHandle) {
            try {
                const perm = await dirHandle.queryPermission({ mode: "readwrite" });
                if (perm !== "granted") {
                    stopSaving();
                    globalStorage.set("logFileSaveEnabled", false);
                }
            } catch {
                stopSaving();
                globalStorage.set("logFileSaveEnabled", false);
            }
        }
    }
}

function flushSync() {
    // Best-effort synchronous flush using sendBeacon is not feasible for file system writes.
    // Instead, we trigger an async flush and hope it completes before unload.
    flush();
}

// --- IndexedDB persistence for directory handle ---

function openMetaDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open("ArkadiaLogsMetaDB", 3);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains("downloaded")) {
                db.createObjectStore("downloaded");
            }
            if (!db.objectStoreNames.contains(DIR_HANDLE_STORE)) {
                db.createObjectStore(DIR_HANDLE_STORE);
            }
            if (!db.objectStoreNames.contains(SAVED_TO_DISK_STORE)) {
                db.createObjectStore(SAVED_TO_DISK_STORE);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function storeDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
    const db = await openMetaDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DIR_HANDLE_STORE, "readwrite");
        tx.objectStore(DIR_HANDLE_STORE).put(handle, "dirHandle");
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

async function loadDirHandle(): Promise<FileSystemDirectoryHandle | null> {
    try {
        const db = await openMetaDb();
        return new Promise((resolve) => {
            const tx = db.transaction(DIR_HANDLE_STORE, "readonly");
            const req = tx.objectStore(DIR_HANDLE_STORE).get("dirHandle");
            req.onsuccess = () => {
                db.close();
                resolve(req.result ?? null);
            };
            req.onerror = () => {
                db.close();
                resolve(null);
            };
        });
    } catch {
        return null;
    }
}

async function markSessionSavedToDisk(sessionName: string): Promise<void> {
    try {
        const db = await openMetaDb();
        return new Promise((resolve) => {
            const tx = db.transaction(SAVED_TO_DISK_STORE, "readwrite");
            tx.objectStore(SAVED_TO_DISK_STORE).put({ savedAt: Date.now() }, sessionName);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); console.error("[LogFileSaver] Failed to mark session:", tx.error); resolve(); };
        });
    } catch (err) {
        console.error("[LogFileSaver] Failed to mark session saved to disk:", err);
    }
}

export async function getSavedToDiskSessions(): Promise<Set<string>> {
    try {
        const db = await openMetaDb();
        return new Promise((resolve) => {
            const tx = db.transaction(SAVED_TO_DISK_STORE, "readonly");
            const req = tx.objectStore(SAVED_TO_DISK_STORE).getAllKeys();
            req.onsuccess = () => resolve(new Set(req.result as string[]));
            req.onerror = () => resolve(new Set());
            tx.oncomplete = () => db.close();
        });
    } catch {
        return new Set();
    }
}
