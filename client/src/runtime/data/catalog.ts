import type { Observable } from 'rxjs';
import type { DataPersistenceAdapter } from './persistence/types';

export type DataCatalogEntryStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface DataCatalogEntryMetadata {
    readonly key: string;
    readonly status: DataCatalogEntryStatus;
    readonly updatedAt?: number;
    readonly source?: 'loader' | 'cache';
    readonly error?: string;
}

export interface DataLoaderContext<T> {
    readonly cachedData?: T;
    readonly metadata: Readonly<DataCatalogEntryMetadata>;
    persist(data: T): Promise<void>;
}

export type DataLoader<T> = (context: DataLoaderContext<T>) => Promise<T | void>;

export interface DataLoaderRegistration<T> {
    readonly key: string;
    readonly loader: DataLoader<T>;
    readonly persistence?: DataPersistenceAdapter<T>;
    readonly eager?: boolean;
}

export interface DataCatalogReadyEvent<T = unknown> {
    readonly key: string;
    readonly data: T;
    readonly metadata: DataCatalogEntryMetadata;
}

export interface DataCatalog {
    register<T>(registration: DataLoaderRegistration<T>): void;
    load(key: string): Promise<void>;
    loadAll(): Promise<void>;
    clear(key: string): Promise<void>;
    set<T>(key: string, value: T, source?: DataCatalogEntryMetadata['source']): Promise<void>;
    get<T>(key: string): T | undefined;
    metadataFor(key: string): DataCatalogEntryMetadata | undefined;
    ready$<T = unknown>(key?: string): Observable<DataCatalogReadyEvent<T>>;
}
