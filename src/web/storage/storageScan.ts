/**
 * What the client keeps in the browser and how much room each part takes.
 *
 * The browser reports a total for the site (and, in Chromium, a split into
 * IndexedDB / Cache Storage / service workers); the per-database and per-log
 * figures are measured in a worker (`storageMeasure.ts`). Log sizes are kept
 * between scans: a finished log never changes, so only new ones are read.
 */
import StorageScanWorker from "./storageScan.worker?worker";
import type { DatabaseSize, LogSize, StorageScanResponse } from "./storageScan.shared";

export type { DatabaseSize, LogSize } from "./storageScan.shared";

/** The browser's own figures for the site. */
export interface StorageEstimate {
    usage: number;
    quota: number;
    persisted: boolean;
    /** Chromium only: the usage split by kind of storage. */
    details?: Partial<Record<"indexedDB" | "caches" | "serviceWorkerRegistrations" | "fileSystem", number>>;
}

export async function readStorageEstimate(): Promise<StorageEstimate | null> {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
    try {
        const [estimate, persisted] = await Promise.all([
            navigator.storage.estimate(),
            navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false),
        ]);
        if (!estimate.quota) return null;
        const details = (estimate as StorageEstimate & { usageDetails?: StorageEstimate["details"] }).usageDetails;
        return { usage: estimate.usage ?? 0, quota: estimate.quota, persisted, details };
    } catch {
        return null;
    }
}

/** localStorage, in characters of its keys and values (its own limit is about 5 million of them). */
export function measureLocalStorage(): { bytes: number; keys: number } {
    let bytes = 0;
    let keys = 0;
    try {
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key === null) continue;
            bytes += key.length + (localStorage.getItem(key)?.length ?? 0);
            keys += 1;
        }
    } catch {
        // Blocked storage: nothing to count.
    }
    return { bytes, keys };
}

const LOG_SIZES_KEY = "arkadia.storage.logSizes";

function readLogSizes(): Record<string, LogSize> {
    try {
        const parsed = JSON.parse(localStorage.getItem(LOG_SIZES_KEY) ?? "null");
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function writeLogSizes(sizes: Record<string, LogSize>): void {
    try {
        localStorage.setItem(LOG_SIZES_KEY, JSON.stringify(sizes));
    } catch {
        // A full quota costs the next scan a re-read, nothing more.
    }
}

/** The log sizes the last scan left, without scanning: for a first paint. */
export function knownLogSizes(): Record<string, LogSize> {
    return readLogSizes();
}

export interface ScanProgress {
    database: string;
    done: number;
    total: number;
}

export interface ScanResult {
    databases: DatabaseSize[];
    logSizes: Record<string, LogSize>;
    /** Bytes on disk per measured byte (see `diskFactor`); null when not known. */
    diskFactor: number | null;
}

// --- From measured data to room on disk ----------------------------------------

const DISK_FACTOR_KEY = "arkadia.storage.diskFactor";

/**
 * How much room on disk one measured byte takes. The scan counts the data as
 * it is (every character of every line); the browser stores it compressed,
 * and log HTML, repetitive as it is, compresses well, so the measured sizes
 * add up to more than the browser reports. Scaled by this, each part is its
 * share of the room IndexedDB really takes, and the parts add up to it.
 *
 * Taken over every database at once (a full scan), so it is an average: the
 * logs may compress better than the map data, but no browser says by how much.
 */
export function diskFactor(databases: DatabaseSize[], estimate: StorageEstimate | null): number | null {
    const measured = databases.reduce((sum, database) => sum + database.bytes, 0);
    const onDisk = estimate?.details?.indexedDB ?? estimate?.usage;
    if (!onDisk || measured <= 0) return null;
    return onDisk / measured;
}

/** The factor the last full scan found, for a scan of the logs alone. */
export function knownDiskFactor(): number | null {
    try {
        const value = Number(localStorage.getItem(DISK_FACTOR_KEY));
        return Number.isFinite(value) && value > 0 ? value : null;
    } catch {
        return null;
    }
}

function rememberDiskFactor(factor: number): void {
    try {
        localStorage.setItem(DISK_FACTOR_KEY, String(factor));
    } catch {
        // Measured again on the next full scan.
    }
}

/**
 * Measures the databases (or only the logs) in a worker. Stops, and rejects
 * with an AbortError, once `signal` aborts.
 */
export function scanStorage(options: {
    logsOnly?: boolean;
    onProgress?: (progress: ScanProgress) => void;
    signal?: AbortSignal;
} = {}): Promise<ScanResult> {
    return new Promise((resolve, reject) => {
        if (options.signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const worker = new StorageScanWorker();
        const finish = () => {
            worker.terminate();
            options.signal?.removeEventListener("abort", abort);
        };
        const abort = () => {
            finish();
            reject(new DOMException("Aborted", "AbortError"));
        };
        options.signal?.addEventListener("abort", abort);
        worker.onmessage = (event: MessageEvent<StorageScanResponse>) => {
            const message = event.data;
            if (message.type === "progress") {
                options.onProgress?.(message);
            } else if (message.type === "done") {
                finish();
                // Only what is still there: deleted logs leave the cache.
                writeLogSizes(message.logSizes);
                const logsOnly = options.logsOnly ?? false;
                // A full scan measures what the browser's IndexedDB figure covers;
                // a scan of the logs alone keeps the factor the last full one found.
                void (logsOnly ? Promise.resolve(null) : readStorageEstimate()).then((estimate) => {
                    let factor = logsOnly ? knownDiskFactor() : diskFactor(message.databases, estimate);
                    if (!logsOnly && factor !== null) rememberDiskFactor(factor);
                    if (factor === null && !logsOnly) factor = knownDiskFactor();
                    resolve({ databases: message.databases, logSizes: message.logSizes, diskFactor: factor });
                });
            } else {
                finish();
                reject(new Error(message.message));
            }
        };
        worker.onerror = (event) => {
            finish();
            reject(new Error(event.message || "Storage scan failed"));
        };
        worker.postMessage({ type: "scan", logsOnly: options.logsOnly ?? false, logSizes: readLogSizes() });
    });
}

/**
 * Whether a database is one the client keeps. The site's address can host
 * other apps (every project of a github.io account shares one), and they share
 * its storage and quota; their databases, and those of plugins, are not on
 * this list.
 */
export function isClientDatabase(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(DATABASE_LABELS, name);
}

/** Names a database for a player: what it holds, in their words. */
export function databaseLabel(name: string): string {
    return DATABASE_LABELS[name] ?? name;
}

const DATABASE_LABELS: Record<string, string> = {
    ArkadiaLogsDB: "Logi",
    ArkadiaLogSearchDB: "Logi: indeks wyszukiwania",
    ArkadiaLogsMetaDB: "Logi: pobrane i zapisane",
    ArkadiaMessagesDB: "Logi: stara baza (przenoszona)",
    ArkadiaRecordingsDB: "Nagrania",
    ArkadiaMapDB: "Mapa",
    ArkadiaVisitedRoomsDB: "Mapa: odwiedzone lokacje",
    ArkadiaLocationNotesDB: "Mapa: notatki lokacji",
    ArkadiaNpcDB: "NPC",
    ArkadiaPeopleDB: "Baza postaci",
    ArkadiaHerbsDB: "Zioła",
    ArkadiaMagicsDB: "Magie",
    ArkadiaMagicKeysDB: "Magiczne klucze",
    ArkadiaKnowledgeDB: "Wiedza",
    ArkadiaKnowledgeDetailsDBv2: "Wiedza: szczegóły",
    ArkadiaKnowledgeEventsDB: "Wiedza: zdarzenia",
    ArkadiaWiedzaDB: "Wiedza (import)",
    ArkadiaEnemyResistances: "Odporności wrogów",
    ArkadiaZlom: "Złom",
    ArkadiaOdmiana: "Odmiana",
    ArkadiaCrowd: "Wspólny spis złomu",
    ArkadiaMultibindsDB: "Multibindy",
    ArkadiaKillsDB: "Zabici",
    ArkadiaDeliveryStats: "Statystyki paczek",
    ArkadiaTransportStatsDB: "Statystyki transportu",
    ArkadiaPluginsDB: "Wtyczki",
    ArkadiaPluginEditorDB: "Edytor wtyczek",
    ArkadiaCustomSounds: "Własne dźwięki",
    ArkadiaCustomFonts: "Własne czcionki",
    ArkadiaCustomImages: "Własne obrazki",
    ArkadiaUserData: "Dane użytkownika (synchronizacja)",
    ArkadiaPreSyncV2Backup: "Kopia sprzed synchronizacji v2",
    oswajanie: "Oswajanie",
    "arkadia-sun-tracker": "Słońce i pory dnia",
};
