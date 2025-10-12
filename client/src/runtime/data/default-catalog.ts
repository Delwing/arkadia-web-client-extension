import { Observable, ReplaySubject, Subject } from 'rxjs';
import { COLORS_DATASET_KEY, MAP_DATASET_KEY, NPC_DATASET_KEY, PEOPLE_DATASET_KEY } from './dataset-keys';
import type {
    DataCatalogEntryMetadata,
    DataCatalogReadyEvent,
    PeopleDataCatalog,
    DataLoader,
    DataLoaderContext,
    DataLoaderRegistration,
} from './catalog';
import type { NpcDefinition } from './types';
import type { DataPersistenceAdapter } from './persistence/types';
import type { PersonEntry } from '../../types/people';

interface CatalogEntry<T> {
    readonly key: string;
    readonly loader: DataLoader<T>;
    readonly persistence?: DataPersistenceAdapter<T>;
    data?: T;
    metadata: DataCatalogEntryMetadata;
    readonly ready$: ReplaySubject<DataCatalogReadyEvent<T>>;
}

export class DefaultDataCatalog implements PeopleDataCatalog {
    private readonly entries = new Map<string, CatalogEntry<unknown>>();

    private readonly globalReady$ = new Subject<DataCatalogReadyEvent<unknown>>();

    getMapData(): MapData.Map | undefined {
        return this.get<MapData.Map>(MAP_DATASET_KEY);
    }

    getNpcData(): readonly NpcDefinition[] | undefined {
        return this.get<NpcDefinition[]>(NPC_DATASET_KEY);
    }

    getColorPalettes(): MapData.Env[] | undefined {
        return this.get<MapData.Env[]>(COLORS_DATASET_KEY);
    }

    getPeopleData(): readonly PersonEntry[] | undefined {
        return this.get<readonly PersonEntry[]>(PEOPLE_DATASET_KEY);
    }

    getMapMetadata(): DataCatalogEntryMetadata | undefined {
        return this.metadataFor(MAP_DATASET_KEY);
    }

    getNpcMetadata(): DataCatalogEntryMetadata | undefined {
        return this.metadataFor(NPC_DATASET_KEY);
    }

    getColorMetadata(): DataCatalogEntryMetadata | undefined {
        return this.metadataFor(COLORS_DATASET_KEY);
    }

    getPeopleMetadata(): DataCatalogEntryMetadata | undefined {
        return this.metadataFor(PEOPLE_DATASET_KEY);
    }

    readyForMap$(): Observable<DataCatalogReadyEvent<MapData.Map>> {
        return this.ready$<MapData.Map>(MAP_DATASET_KEY);
    }

    readyForNpc$(): Observable<DataCatalogReadyEvent<readonly NpcDefinition[]>> {
        return this.ready$<readonly NpcDefinition[]>(NPC_DATASET_KEY);
    }

    readyForColors$(): Observable<DataCatalogReadyEvent<MapData.Env[]>> {
        return this.ready$<MapData.Env[]>(COLORS_DATASET_KEY);
    }

    readyForPeople$(): Observable<DataCatalogReadyEvent<readonly PersonEntry[]>> {
        return this.ready$<readonly PersonEntry[]>(PEOPLE_DATASET_KEY);
    }

    async loadMapData(): Promise<void> {
        await this.load(MAP_DATASET_KEY);
    }

    async loadNpcData(): Promise<void> {
        await this.load(NPC_DATASET_KEY);
    }

    async loadColorPalettes(): Promise<void> {
        await this.load(COLORS_DATASET_KEY);
    }

    async loadPeopleData(): Promise<void> {
        await this.load(PEOPLE_DATASET_KEY);
    }

    async clearNpcData(): Promise<void> {
        await this.clear(NPC_DATASET_KEY);
    }

    async setNpcData(value: readonly NpcDefinition[], source: DataCatalogEntryMetadata['source'] = 'loader'): Promise<void> {
        await this.set(NPC_DATASET_KEY, [...value], source);
    }

    async setPeopleData(value: readonly PersonEntry[], source: DataCatalogEntryMetadata['source'] = 'loader'): Promise<void> {
        await this.set(PEOPLE_DATASET_KEY, [...value], source);
    }

    register<T>(registration: DataLoaderRegistration<T>): void {
        if (this.entries.has(registration.key)) {
            throw new Error(`Data loader with key \"${registration.key}\" already registered.`);
        }

        const metadata: DataCatalogEntryMetadata = {
            key: registration.key,
            status: 'idle',
        };

        const ready$ = new ReplaySubject<DataCatalogReadyEvent<T>>(1);
        const entry: CatalogEntry<T> = {
            key: registration.key,
            loader: registration.loader,
            persistence: registration.persistence,
            metadata,
            ready$,
        };

        this.entries.set(registration.key, entry as CatalogEntry<unknown>);

        if (registration.persistence) {
            void this.restoreFromPersistence(entry);
        }

        if (registration.eager) {
            void this.load(registration.key);
        }
    }

    async load<T>(key: string): Promise<void> {
        const entry = this.getEntry<T>(key);

        entry.metadata = { ...entry.metadata, status: 'loading' };

        const persist = async (value: T): Promise<void> => {
            entry.data = value;
            if (entry.persistence) {
                await entry.persistence.write(value);
            }
        };

        const context: DataLoaderContext<T> = {
            cachedData: entry.data,
            metadata: entry.metadata,
            persist,
        };

        try {
            const result = await entry.loader(context);
            if (typeof result !== 'undefined') {
                await persist(result);
            }

            if (typeof entry.data === 'undefined') {
                throw new Error(`Loader for \"${key}\" did not provide any data.`);
            }

            entry.metadata = {
                key,
                status: 'ready',
                updatedAt: Date.now(),
                source: 'loader',
            };
            this.emitReady(entry);
        } catch (error) {
            entry.metadata = {
                key,
                status: 'error',
                updatedAt: Date.now(),
                error: error instanceof Error ? error.message : String(error),
            };
            throw error;
        }
    }

    async loadAll(): Promise<void> {
        await Promise.all(Array.from(this.entries.keys()).map((key) => this.load(key)));
    }

    async clear<T>(key: string): Promise<void> {
        const entry = this.getEntry<T>(key);

        entry.data = undefined;
        entry.metadata = {
            key,
            status: 'idle',
        };

        if (entry.persistence) {
            await entry.persistence.clear();
        }
    }

    async set<T>(key: string, value: T, source: DataCatalogEntryMetadata['source'] = 'loader'): Promise<void> {
        const entry = this.getEntry<T>(key);

        entry.data = value;

        if (entry.persistence) {
            await entry.persistence.write(value);
        }

        entry.metadata = {
            key,
            status: 'ready',
            updatedAt: Date.now(),
            source,
        };

        this.emitReady(entry);
    }

    get<T>(key: string): T | undefined {
        const entry = this.entries.get(key);
        return entry?.data as T | undefined;
    }

    metadataFor(key: string): DataCatalogEntryMetadata | undefined {
        return this.entries.get(key)?.metadata;
    }

    ready$<T = unknown>(key?: string): Observable<DataCatalogReadyEvent<T>> {
        if (key) {
            return this.ensureReadySubject<T>(key).asObservable();
        }

        return this.globalReady$.asObservable() as Observable<DataCatalogReadyEvent<T>>;
    }

    private ensureReadySubject<T>(key: string): ReplaySubject<DataCatalogReadyEvent<T>> {
        const entry = this.getEntry(key);
        return entry.ready$ as ReplaySubject<DataCatalogReadyEvent<T>>;
    }

    private emitReady<T>(entry: CatalogEntry<T>): void {
        const event: DataCatalogReadyEvent<T> = {
            key: entry.key,
            data: entry.data as T,
            metadata: entry.metadata,
        };

        entry.ready$.next(event);
        this.globalReady$.next(event as DataCatalogReadyEvent<unknown>);
    }

    private async restoreFromPersistence<T>(entry: CatalogEntry<T>): Promise<void> {
        if (!entry.persistence) {
            return;
        }

        try {
            const value = await entry.persistence.read();
            if (typeof value !== 'undefined') {
                entry.data = value;
                entry.metadata = {
                    key: entry.key,
                    status: 'ready',
                    updatedAt: Date.now(),
                    source: 'cache',
                };
                this.emitReady(entry);
            }
        } catch (error) {
            entry.metadata = {
                key: entry.key,
                status: 'error',
                updatedAt: Date.now(),
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    private getEntry<T>(key: string): CatalogEntry<T> {
        const entry = this.entries.get(key) as CatalogEntry<T> | undefined;
        if (!entry) {
            throw new Error(`Unknown data catalog key: ${key}`);
        }
        return entry;
    }
}
