export interface MultibindImportRow {
    uniqness: string;
    roomId: number;
    index: number;
    action: string;
}

export interface ParsedMultibindDatabase {
    rows: MultibindImportRow[];
    totalRows: number;
    invalidRows: number;
}

export interface MultibindImportWorkerRequest {
    type: 'parse';
    buffer: ArrayBuffer;
}

export interface MultibindImportWorkerSuccess {
    type: 'success';
    payload: ParsedMultibindDatabase;
}

export interface MultibindImportWorkerError {
    type: 'error';
    message: string;
}

export type MultibindImportWorkerResponse =
    | MultibindImportWorkerSuccess
    | MultibindImportWorkerError;
