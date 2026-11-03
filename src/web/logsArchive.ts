/**
 * The pieces of Logi → Zarządzaj that are not screen: which logs a date range
 * takes, which formats each log has been downloaded as, and reading an export
 * file back in.
 */
import type { ExportFormat, LogEntry, LogExportData } from "./logsExport.shared";

// --- Date ranges -------------------------------------------------------------

export type RangePreset = "all" | "last7" | "last30" | "older30" | "older90" | "older365" | "custom";

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
    { value: "all", label: "Wszystkie" },
    { value: "last7", label: "Ostatnie 7 dni" },
    { value: "last30", label: "Ostatnie 30 dni" },
    { value: "older30", label: "Starsze niż 30 dni" },
    { value: "older90", label: "Starsze niż 3 miesiące" },
    { value: "older365", label: "Starsze niż rok" },
    { value: "custom", label: "Własny zakres" },
];

const DAY = 24 * 60 * 60 * 1000;

/** A span of start times, either end open. */
export interface DateRange {
    from?: number;
    to?: number;
}

/** The span a preset stands for, measured from `now`; `custom` is the player's own. */
export function presetRange(preset: RangePreset, now: number): DateRange {
    switch (preset) {
        case "last7":
            return { from: now - 7 * DAY };
        case "last30":
            return { from: now - 30 * DAY };
        case "older30":
            return { to: now - 30 * DAY };
        case "older90":
            return { to: now - 90 * DAY };
        case "older365":
            return { to: now - 365 * DAY };
        default:
            return {};
    }
}

/** `yyyy-mm-dd` (a date input's value) to the start of that local day; the end of it with `endOfDay`. */
export function dayToTime(day: string, endOfDay = false): number | undefined {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    if (!match) return undefined;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return endOfDay ? date.getTime() + DAY - 1 : date.getTime();
}

/** A time as a date input's value, in local time. */
export function timeToDay(time: number): string {
    const date = new Date(time);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The logs that started inside `range`, never the one being recorded: it is
 * still growing, so archiving it would take a part and leave the rest.
 */
export function sessionsInRange<T extends { id: string; startedAt: number }>(
    sessions: T[],
    range: DateRange,
    liveId?: string,
): T[] {
    return sessions.filter(
        (session) =>
            session.id !== liveId &&
            (range.from === undefined || session.startedAt >= range.from) &&
            (range.to === undefined || session.startedAt <= range.to),
    );
}

// --- Downloaded formats ---------------------------------------------------------

/** When each format of a log was last downloaded. */
export type DownloadedFormats = Partial<Record<ExportFormat, number>>;

const META_DB = "ArkadiaLogsMetaDB";
const META_VERSION = 3;
const DOWNLOADED = "downloaded";

/**
 * The meta database. Its stores are shared with the logger (which clears the
 * mark of the log it writes to: a log that grew is not downloaded any more)
 * and the file saver.
 */
function openMetaDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(META_DB, META_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(DOWNLOADED)) db.createObjectStore(DOWNLOADED);
            if (!db.objectStoreNames.contains("fileSaveDir")) db.createObjectStore("fileSaveDir");
            if (!db.objectStoreNames.contains("savedToDisk")) db.createObjectStore("savedToDisk");
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

interface DownloadedRecord {
    downloadedAt: number;
    formats?: DownloadedFormats;
}

/**
 * A stored mark as formats. A mark from before formats were recorded came from
 * the one archive there was, a ZIP of HTML.
 */
function formatsOf(record: DownloadedRecord | undefined): DownloadedFormats {
    if (!record) return {};
    return record.formats ?? { html: record.downloadedAt };
}

export async function getDownloadedFormats(): Promise<Map<string, DownloadedFormats>> {
    const db = await openMetaDb();
    return new Promise((resolve) => {
        const tx = db.transaction(DOWNLOADED, "readonly");
        const store = tx.objectStore(DOWNLOADED);
        const keys = store.getAllKeys();
        const values = store.getAll();
        const result = new Map<string, DownloadedFormats>();
        values.onsuccess = () => {
            (keys.result as string[]).forEach((key, index) => {
                result.set(key, formatsOf(values.result[index] as DownloadedRecord));
            });
        };
        tx.oncomplete = () => {
            db.close();
            resolve(result);
        };
        tx.onerror = () => {
            db.close();
            resolve(result);
        };
    });
}

/** Adds `formats` to what each of `names` has been downloaded as. */
export async function markDownloaded(names: string[], formats: ExportFormat[], now = Date.now()): Promise<void> {
    if (names.length === 0 || formats.length === 0) return;
    const db = await openMetaDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DOWNLOADED, "readwrite");
        const store = tx.objectStore(DOWNLOADED);
        for (const name of names) {
            const read = store.get(name);
            read.onsuccess = () => {
                const merged: DownloadedFormats = { ...formatsOf(read.result as DownloadedRecord | undefined) };
                for (const format of formats) merged[format] = now;
                store.put({ downloadedAt: now, formats: merged } satisfies DownloadedRecord, name);
            };
        }
        tx.oncomplete = () => {
            db.close();
            resolve();
        };
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    });
}

// --- Reading an export back -------------------------------------------------------

function isExportData(value: unknown): value is LogExportData {
    const data = value as LogExportData | null;
    return !!data && data.version === 1 && !!data.sessions && typeof data.sessions === "object";
}

/**
 * The logs in an export file: a `.json` export, or a ZIP from Zarządzaj whose
 * JSON files (one per log) hold them. A ZIP of only HTML or text has nothing
 * to import; that is an error with a message to show.
 */
export async function readExportFile(file: File): Promise<Record<string, LogEntry[]>> {
    // By its first bytes ("PK\x03\x04"), not only its name: a renamed or
    // extensionless download is still the archive it was.
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    const zipped =
        (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) ||
        /\.zip$/i.test(file.name) ||
        file.type === "application/zip";
    if (!zipped) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(await file.text());
        } catch {
            throw new ImportError("Niepoprawny plik JSON.");
        }
        if (!isExportData(parsed)) throw new ImportError("Niepoprawny format pliku eksportu.");
        return parsed.sessions;
    }

    const { default: JSZip } = await import("jszip");
    let zip: InstanceType<typeof JSZip>;
    try {
        zip = await JSZip.loadAsync(file);
    } catch {
        throw new ImportError("Niepoprawny plik ZIP.");
    }
    const sessions: Record<string, LogEntry[]> = {};
    const jsonFiles = Object.values(zip.files).filter((entry) => !entry.dir && /\.json$/i.test(entry.name));
    if (jsonFiles.length === 0) {
        throw new ImportError("W tym archiwum nie ma plików JSON, więc nie da się go zaimportować. Wczytać można archiwum z formatem JSON.");
    }
    for (const entry of jsonFiles) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(await entry.async("string"));
        } catch {
            continue;
        }
        if (isExportData(parsed)) Object.assign(sessions, parsed.sessions);
    }
    return sessions;
}

/** An import that failed for a reason the player can be told. */
export class ImportError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ImportError";
    }
}
