import { DataStore, createDataStoreSingleton } from './dataStore/DataStore';
import type { ProgressListener, RefreshMetadata, SubscriptionOptions } from './dataStore/types';
import { WorkerLoader, type WorkerLoaderMetadata } from './dataStore/strategies/WorkerLoader';
import { IndexedDbCollectionStrategy } from './indexedDbCollectionStrategy';
import type { PersonEntry } from '@client/types/people';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type PeopleSnapshot = PersonEntry[];
export type PeopleMetadata = RefreshMetadata & WorkerLoaderMetadata;

const getPeopleStore = createDataStoreSingleton(() => {
  const loader = new WorkerLoader({
    createWorker: () => new Worker(new URL('./peopleWorker.ts', import.meta.url), { type: 'module' }),
  });

  const storage = new IndexedDbCollectionStrategy<PersonEntry, PeopleMetadata>({
    dbName: 'ArkadiaPeopleDB',
    entriesStore: 'peopleEntries',
    metadataStore: 'peopleMetadata',
    metadataKey: 'metadata',
    version: 2,
    buildEntryId: (person) =>
      `${person.name.toLowerCase()}|${person.guild.toLowerCase()}|${person.description.toLowerCase()}`,
  });

  return new DataStore<PeopleSnapshot, PeopleMetadata>({
    loader,
    storage,
    ttlMs: ONE_DAY_MS,
  });
});

export function subscribe(
  listener: (snapshot: PeopleSnapshot | undefined) => void,
  options?: SubscriptionOptions,
): () => void {
  return getPeopleStore().subscribe(listener, options);
}

export async function getMetadata(): Promise<PeopleMetadata | undefined> {
  return getPeopleStore().getMetadata();
}

export async function getSnapshot(): Promise<PeopleSnapshot | undefined> {
  return getPeopleStore().getSnapshot();
}

export async function refresh(options: { onProgress?: ProgressListener } = {}) {
  return await getPeopleStore().refresh({ onProgress: options.onProgress });
}

export async function forceRefresh(options: { onProgress?: ProgressListener } = {}) {
  return await getPeopleStore().refresh({ force: true, onProgress: options.onProgress });
}

export async function clear() {
  await getPeopleStore().clear();
}
