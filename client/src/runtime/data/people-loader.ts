import type { DataLoader, PeopleDataCatalog } from './catalog';
import { PEOPLE_DATASET_KEY } from './dataset-keys';
import { PeopleDataCatalog as PeopleDataCatalogImpl } from './default-catalog';
import type { DataPersistenceAdapter } from './persistence/types';
import { IndexedDbPersistenceAdapter } from './persistence/indexeddb-adapter';
import type { PersonEntry } from '../../types/people';
import { downloadPeopleDatabase } from '../../peopleDownload';
import { parsePeopleDatabase } from '../../peopleParser';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface CreatePeopleLoaderOptions {
    readonly ttlMs?: number;
    readonly download?: () => Promise<ArrayBuffer>;
    readonly parse?: (buffer: ArrayBuffer) => Promise<readonly PersonEntry[]>;
    readonly now?: () => number;
}

export function createPeopleLoader(options: CreatePeopleLoaderOptions = {}): DataLoader<readonly PersonEntry[]> {
    const {
        ttlMs = ONE_DAY_MS,
        download = downloadPeopleDatabase,
        parse = parsePeopleDatabase,
        now = () => Date.now(),
    } = options;

    return async ({ cachedData, metadata }) => {
        if (cachedData && metadata.updatedAt && now() - metadata.updatedAt < ttlMs) {
            return cachedData;
        }

        const buffer = await download();
        return parse(buffer);
    };
}

export interface RegisterPeopleLoaderOptions extends CreatePeopleLoaderOptions {
    readonly catalog?: PeopleDataCatalog;
    readonly loader?: DataLoader<readonly PersonEntry[]>;
    readonly persistence?: DataPersistenceAdapter<readonly PersonEntry[]>;
}

export function registerPeopleLoader(options: RegisterPeopleLoaderOptions = {}): PeopleDataCatalog {
    const catalog = options.catalog ?? new PeopleDataCatalogImpl();
    const loader = options.loader ?? createPeopleLoader(options);
    const persistence = options.persistence ?? new IndexedDbPersistenceAdapter<readonly PersonEntry[]>(PEOPLE_DATASET_KEY);

    catalog.register({
        key: PEOPLE_DATASET_KEY,
        loader,
        persistence,
    });

    return catalog;
}
