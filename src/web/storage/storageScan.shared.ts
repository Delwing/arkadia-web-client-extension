/** One IndexedDB database, measured with `approxSize`. */
export interface DatabaseSize {
    name: string;
    bytes: number;
    records: number;
    /** Set when it could not be read (another tab upgrading it, say); `bytes` is then what was counted before. */
    error?: string;
}

/** A log's size, kept with the record count it was measured at: a finished log never changes. */
export interface LogSize {
    count: number;
    bytes: number;
}

export interface StorageScanRequest {
    type: "scan";
    /** Only the log database: what the log manager needs, and far less to read. */
    logsOnly: boolean;
    /** Sizes measured before; a log whose record count still matches is not read again. */
    logSizes: Record<string, LogSize>;
}

export type StorageScanResponse =
    | { type: "progress"; database: string; done: number; total: number }
    | { type: "done"; databases: DatabaseSize[]; logSizes: Record<string, LogSize> }
    | { type: "error"; message: string };
