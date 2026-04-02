import type { KnowledgeCategoryBaseName } from '@client/knowledgeCategories';

export interface WiedzaDbEvent {
    category: KnowledgeCategoryBaseName;
    categoryDative: string;
    type: 'tick';
    locationId: number;
    timestamp: number;
}

export interface WiedzaDbLibrary {
    locationId: number;
    categoryDative: string;
    timestamp: number;
}

export interface WiedzaDbBook {
    bookName: string;
    categoryDative: string;
    timestamp: number;
}

export interface WiedzaDbTotalLevel {
    categoryName: string;
    level: string;
    timestamp: number;
}

export interface WiedzaDbResult {
    characters: string[];
    byCharacter: Record<string, {
        events: WiedzaDbEvent[];
        libraries: WiedzaDbLibrary[];
        books: WiedzaDbBook[];
        totalLevels: WiedzaDbTotalLevel[];
    }>;
}

export interface WiedzaDbWorkerRequest {
    type: 'parse';
    buffer: ArrayBuffer;
}

export interface WiedzaDbWorkerSuccess {
    type: 'success';
    payload: WiedzaDbResult;
}

export interface WiedzaDbWorkerError {
    type: 'error';
    message: string;
}

export type WiedzaDbWorkerResponse =
    | WiedzaDbWorkerSuccess
    | WiedzaDbWorkerError;
