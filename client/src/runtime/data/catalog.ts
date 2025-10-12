import type { Observable } from 'rxjs';
import type { DataPersistenceAdapter } from './persistence/types';
import type { PersonEntry } from '../../types/people';
import type { HerbsData, NpcDefinition } from './types';

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

export interface MapDataCatalog extends DataCatalog {
    getMapData(): MapData.Map | undefined;
    getMapMetadata(): DataCatalogEntryMetadata | undefined;
    readyForMap$(): Observable<DataCatalogReadyEvent<MapData.Map>>;
    loadMapData(): Promise<void>;
    getColorPalettes(): MapData.Env[] | undefined;
    getColorMetadata(): DataCatalogEntryMetadata | undefined;
    readyForColors$(): Observable<DataCatalogReadyEvent<MapData.Env[]>>;
    loadColorPalettes(): Promise<void>;
}

export interface NpcDataCatalog extends DataCatalog {
    getNpcData(): readonly NpcDefinition[] | undefined;
    getNpcMetadata(): DataCatalogEntryMetadata | undefined;
    readyForNpc$(): Observable<DataCatalogReadyEvent<readonly NpcDefinition[]>>;
    loadNpcData(): Promise<void>;
    clearNpcData(): Promise<void>;
    setNpcData(value: readonly NpcDefinition[], source?: DataCatalogEntryMetadata['source']): Promise<void>;
}

export interface PeopleDataCatalog extends DataCatalog {
    getPeopleData(): readonly PersonEntry[] | undefined;
    getPeopleMetadata(): DataCatalogEntryMetadata | undefined;
    readyForPeople$(): Observable<DataCatalogReadyEvent<readonly PersonEntry[]>>;
    loadPeopleData(): Promise<void>;
    setPeopleData(value: readonly PersonEntry[], source?: DataCatalogEntryMetadata['source']): Promise<void>;
}

export interface MagicDataCatalog extends DataCatalog {
    getMagicPatterns(): readonly string[] | undefined;
    getMagicMetadata(): DataCatalogEntryMetadata | undefined;
    readyForMagic$(): Observable<DataCatalogReadyEvent<readonly string[]>>;
    loadMagicData(): Promise<void>;
    setMagicPatterns(value: readonly string[], source?: DataCatalogEntryMetadata['source']): Promise<void>;
}

export interface MagicKeysDataCatalog extends DataCatalog {
    getMagicKeys(): readonly string[] | undefined;
    getMagicKeysMetadata(): DataCatalogEntryMetadata | undefined;
    readyForMagicKeys$(): Observable<DataCatalogReadyEvent<readonly string[]>>;
    loadMagicKeys(): Promise<void>;
    setMagicKeys(value: readonly string[], source?: DataCatalogEntryMetadata['source']): Promise<void>;
}

export interface HerbsDataCatalog extends DataCatalog {
    getHerbsData(): HerbsData | undefined;
    getHerbsMetadata(): DataCatalogEntryMetadata | undefined;
    readyForHerbs$(): Observable<DataCatalogReadyEvent<HerbsData>>;
    loadHerbsData(): Promise<void>;
    setHerbsData(value: HerbsData, source?: DataCatalogEntryMetadata['source']): Promise<void>;
}
