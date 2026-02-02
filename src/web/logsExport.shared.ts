export interface LogEntry {
    text: string;
    type?: string;
    timestamp: number;
}

export interface LogsExportWorkerRequest {
    type: 'export';
    inlineStyles: string;
    sessionNames?: string[];
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
}

export interface LogsExportErrorMessage {
    type: 'error';
    message: string;
}

export type LogsExportWorkerResponse =
    | LogsExportProgressMessage
    | LogsExportSuccessMessage
    | LogsExportErrorMessage;
