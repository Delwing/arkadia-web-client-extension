export interface ImproveDbEntry {
    date: string;
    count: number;
}

export interface ImproveDbResult {
    characters: string[];
    byCharacter: Record<string, ImproveDbEntry[]>;
}

export interface ImproveDbWorkerRequest {
    type: 'parse';
    buffer: ArrayBuffer;
}

export interface ImproveDbWorkerSuccess {
    type: 'success';
    payload: ImproveDbResult;
}

export interface ImproveDbWorkerError {
    type: 'error';
    message: string;
}

export type ImproveDbWorkerResponse =
    | ImproveDbWorkerSuccess
    | ImproveDbWorkerError;
