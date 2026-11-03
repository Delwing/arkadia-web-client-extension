export interface LogEntry {
    text: string;
    type?: string;
    timestamp: number;
}

/**
 * What a log can be exported as: `html` to read with its colours, `txt` as
 * plain timestamped lines, `json` to import back into Logi.
 */
export type ExportFormat = 'html' | 'txt' | 'json';

export const EXPORT_FORMATS: ExportFormat[] = ['html', 'txt', 'json'];

export interface LogsExportWorkerRequest {
    type: 'export';
    inlineStyles: string;
    /** The logs to export; every log with records when omitted. */
    sessionNames?: string[];
    /** At least one. Defaults to HTML, what the archive always was. */
    formats?: ExportFormat[];
}

export interface LogsExportProgressMessage {
    type: 'progress';
    current: number;
    total: number;
    sessionName: string;
}

export interface LogsExportSuccessMessage {
    type: 'success';
    blob: Blob;
    sessionCount: number;
    /** The logs that made it into the archive (one with no records is skipped). */
    exported: string[];
}

export interface LogsExportErrorMessage {
    type: 'error';
    message: string;
}

export type LogsExportWorkerResponse =
    | LogsExportProgressMessage
    | LogsExportSuccessMessage
    | LogsExportErrorMessage;

/** The importable shape: a `.json` export holds this, as does each JSON file of a ZIP. */
export interface LogExportData {
    version: 1;
    sessions: Record<string, LogEntry[]>;
}
