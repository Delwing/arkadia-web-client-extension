import { DataStore, createDataStoreSingleton } from '../dataStore/DataStore';
import { LoaderContext, LoaderResult, LoaderStrategy, RefreshMetadata, StorageStrategy } from '../dataStore/types';
import {
  clearIndexedDB,
  getFromIndexedDB,
  IndexedDBConfig,
  storeInIndexedDB,
} from '../utils/dataCache';

export interface KnowledgeBookEntry {
  mianownik: string;
  dopelniacz: string;
  biernik: string;
  categories: string[];
}

export interface KnowledgeLibraryEntry {
  location_id: string;
  categories: string[];
  name: string;
}

export type KnowledgeCategoryStatus = 'not_started' | 'in_progress' | 'completed';

export type KnowledgeLibraryProgress = Record<string, KnowledgeCategoryStatus>;

export type KnowledgeProgress = Record<string, KnowledgeLibraryProgress>;

export type KnowledgeProgressByCharacter = Record<string, KnowledgeProgress>;

export const DEFAULT_KNOWLEDGE_CHARACTER_KEY = '__default__';

export interface KnowledgeFile {
  version?: number;
  books: Record<string, KnowledgeBookEntry>;
  libraries?: Record<string, KnowledgeLibraryEntry>;
}

export interface KnowledgeSnapshotData extends KnowledgeFile {
  libraries: Record<string, KnowledgeLibraryEntry>;
  progress: KnowledgeProgressByCharacter;
}

export interface KnowledgeSnapshot {
  data: KnowledgeSnapshotData;
  timestamp: number;
}

function sanitizeLibraryProgress(
  previous: KnowledgeProgress | undefined,
  libraries: Record<string, KnowledgeLibraryEntry>,
): KnowledgeProgress {
  const result: KnowledgeProgress = {};

  if (!previous) {
    return result;
  }

  for (const [libraryId, library] of Object.entries(libraries)) {
    const previousLibrary = previous[libraryId];
    if (!previousLibrary) {
      continue;
    }
    const filtered: KnowledgeLibraryProgress = {};
    const categories = new Set(library.categories.map((category) => category.toLowerCase()));
    for (const [category, status] of Object.entries(previousLibrary)) {
      if (!categories.has(category.toLowerCase())) {
        continue;
      }
      if (status === 'not_started' || status === 'in_progress' || status === 'completed') {
        filtered[category] = status;
      }
    }
    if (Object.keys(filtered).length > 0) {
      result[libraryId] = filtered;
    }
  }

  return result;
}

function shouldTreatAsSingleCharacterProgress(
  previous: KnowledgeProgressByCharacter | KnowledgeProgress | undefined,
  libraries: Record<string, KnowledgeLibraryEntry>,
): previous is KnowledgeProgress {
  if (!previous || typeof previous !== 'object') {
    return false;
  }

  const entries = Object.entries(previous as Record<string, unknown>);
  if (entries.length === 0) {
    return false;
  }

  const libraryIds = new Set(Object.keys(libraries));

  for (const [key, value] of entries) {
    if (libraryIds.has(key)) {
      return true;
    }
    if (!value || typeof value !== 'object') {
      return true;
    }
    for (const innerValue of Object.values(value as Record<string, unknown>)) {
      if (!innerValue || typeof innerValue !== 'object') {
        return true;
      }
    }
  }

  return false;
}

function sanitizeProgress(
  previous: KnowledgeProgressByCharacter | KnowledgeProgress | undefined,
  libraries: Record<string, KnowledgeLibraryEntry>,
): KnowledgeProgressByCharacter {
  const result: KnowledgeProgressByCharacter = {};

  if (!previous) {
    return result;
  }

  if (shouldTreatAsSingleCharacterProgress(previous, libraries)) {
    const sanitized = sanitizeLibraryProgress(previous, libraries);
    if (Object.keys(sanitized).length > 0) {
      result[DEFAULT_KNOWLEDGE_CHARACTER_KEY] = sanitized;
    }
    return result;
  }

  for (const [character, progress] of Object.entries(previous)) {
    if (!progress || typeof progress !== 'object') {
      continue;
    }
    const sanitized = sanitizeLibraryProgress(progress, libraries);
    if (Object.keys(sanitized).length > 0) {
      result[character] = sanitized;
    }
  }

  return result;
}

interface KnowledgeLoaderOptions {
  url: string;
  fetchImpl?: typeof fetch;
}

class KnowledgeLoader
  implements LoaderStrategy<KnowledgeSnapshot, RefreshMetadata>
{
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: KnowledgeLoaderOptions) {
    this.url = options.url;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  async load(
    context: LoaderContext<KnowledgeSnapshot, RefreshMetadata>,
  ): Promise<LoaderResult<KnowledgeSnapshot, RefreshMetadata>> {
    const response = await this.fetchImpl(this.url);
    const data = (await response.json()) as KnowledgeFile;

    const libraries = data.libraries ?? {};
    const progress = sanitizeProgress(context.previousSnapshot?.data.progress, libraries);

    return {
      snapshot: {
        data: {
          version: data.version,
          books: data.books ?? {},
          libraries,
          progress,
        },
        timestamp: Date.now(),
      },
    };
  }
}

interface KnowledgeIndexedDbStrategyOptions {
  books: IndexedDBConfig;
  libraries: IndexedDBConfig;
  metadata?: IndexedDBConfig;
}

type KnowledgeLibrariesPayload = {
  libraries: Record<string, KnowledgeLibraryEntry>;
  progress: KnowledgeProgressByCharacter | KnowledgeProgress;
  version?: number;
  timestamp?: number;
};

class KnowledgeIndexedDbStrategy<TMeta extends RefreshMetadata = RefreshMetadata>
  implements StorageStrategy<KnowledgeSnapshot, TMeta>
{
  private readonly booksConfig: IndexedDBConfig;
  private readonly librariesConfig: IndexedDBConfig;
  private readonly metadataConfig: IndexedDBConfig;
  private inMemorySnapshot: KnowledgeSnapshot | undefined;
  private inMemoryMetadata: TMeta | undefined;

  constructor(options: KnowledgeIndexedDbStrategyOptions) {
    this.booksConfig = options.books;
    this.librariesConfig = options.libraries;
    this.metadataConfig =
      options.metadata ?? {
        ...options.libraries,
        key: 'metadata',
      };
  }

  async readSnapshot(): Promise<KnowledgeSnapshot | undefined> {
    if (this.inMemorySnapshot) {
      return this.inMemorySnapshot;
    }

    try {
      const [books, librariesPayload] = await Promise.all([
        getFromIndexedDB<Record<string, KnowledgeBookEntry>>(this.booksConfig),
        getFromIndexedDB<KnowledgeLibrariesPayload>(this.librariesConfig),
      ]);

      if (books && librariesPayload) {
        const libraries = librariesPayload.libraries ?? {};
        this.inMemorySnapshot = {
          data: {
            version: librariesPayload.version,
            books,
            libraries,
            progress: sanitizeProgress(librariesPayload.progress, libraries),
          },
          timestamp: librariesPayload.timestamp ?? Date.now(),
        };
      }
    } catch (error) {
      console.warn('Failed to read knowledge snapshot from IndexedDB:', error);
    }

    return this.inMemorySnapshot;
  }

  async writeSnapshot(snapshot: KnowledgeSnapshot | undefined): Promise<void> {
    this.inMemorySnapshot = snapshot;

    if (!snapshot) {
      await Promise.all([
        this.safeClear(this.booksConfig),
        this.safeClear(this.librariesConfig),
      ]);
      return;
    }

    const payload: KnowledgeLibrariesPayload = {
      libraries: snapshot.data.libraries,
      progress: snapshot.data.progress,
      version: snapshot.data.version,
      timestamp: snapshot.timestamp,
    };

    await Promise.all([
      this.safeStore(this.booksConfig, snapshot.data.books),
      this.safeStore(this.librariesConfig, payload),
    ]);
  }

  async readMetadata(): Promise<TMeta | undefined> {
    if (this.inMemoryMetadata) {
      return this.inMemoryMetadata;
    }

    try {
      const value = await getFromIndexedDB<TMeta>(this.metadataConfig);
      if (value != null) {
        this.inMemoryMetadata = value;
      }
    } catch (error) {
      console.warn('Failed to read knowledge metadata from IndexedDB:', error);
    }

    return this.inMemoryMetadata;
  }

  async writeMetadata(metadata: TMeta | undefined): Promise<void> {
    this.inMemoryMetadata = metadata;

    if (metadata === undefined) {
      await this.safeClear(this.metadataConfig);
      return;
    }

    await this.safeStore(this.metadataConfig, metadata);
  }

  async clear(): Promise<void> {
    this.inMemorySnapshot = undefined;
    this.inMemoryMetadata = undefined;

    await Promise.all([
      this.safeClear(this.booksConfig),
      this.safeClear(this.librariesConfig),
      this.safeClear(this.metadataConfig),
    ]);
  }

  private async safeStore(config: IndexedDBConfig, data: unknown): Promise<void> {
    try {
      await storeInIndexedDB(config, data);
    } catch (error) {
      console.warn('Failed to store knowledge data in IndexedDB:', error);
    }
  }

  private async safeClear(config: IndexedDBConfig): Promise<void> {
    try {
      await clearIndexedDB(config);
    } catch (error) {
      console.warn('Failed to clear knowledge data in IndexedDB:', error);
    }
  }
}

export const KNOWLEDGE_URL =
  'https://raw.githubusercontent.com/tjurczyk/arkadia-data/refs/heads/master/knowledge_data.json';

const TTL = 24 * 60 * 60 * 1000;

export const getKnowledgeStore = createDataStoreSingleton(
  () =>
    new DataStore<KnowledgeSnapshot, RefreshMetadata>({
      loader: new KnowledgeLoader({
        url: KNOWLEDGE_URL,
      }),
      storage: new KnowledgeIndexedDbStrategy<RefreshMetadata>({
        books: { dbName: 'ArkadiaKnowledgeDB', storeName: 'knowledge_books', key: 'books' },
        libraries: {
          dbName: 'ArkadiaKnowledgeDB',
          storeName: 'knowledge_libraries',
          key: 'libraries',
        },
      }),
      ttlMs: TTL,
    }),
);

