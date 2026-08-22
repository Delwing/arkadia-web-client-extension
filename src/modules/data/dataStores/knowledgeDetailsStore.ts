import {createDataStoreSingleton, DataStore} from '@modules/data/dataStore/DataStore';
import {
  LoaderContext,
  LoaderResult,
  LoaderStrategy,
  RefreshMetadata,
  StorageStrategy,
} from '@modules/data/dataStore/types';
import {stripPolishCharacters} from '@client/stripPolishCharacters';
import {
  getBaseCategoryFromName,
  KNOWLEDGE_CATEGORY_ORDER,
  KnowledgeCategoryBaseName,
} from '@client/knowledgeCategories';
import loadWiedza from '@client/scripts/lib/wiedzaLoader';
import {
  KnowledgeDetailsType,
  KNOWLEDGE_DETAILS_TYPES,
  KnowledgeCategoryDefinition,
  KnowledgeDefinitions,
} from '@modules/data/dataStores/wiedzaStore';

// Re-export types from wiedzaStore for backwards compatibility
export type { KnowledgeDetailsType, KnowledgeCategoryDefinition, KnowledgeDefinitions };
export { KNOWLEDGE_DETAILS_TYPES };

export type KnowledgeLevelMap = Partial<Record<KnowledgeDetailsType, string>>;

export type KnowledgeEntriesMap = Record<KnowledgeDetailsType, string[]>;

export type KnowledgeCharacterGender = 'male' | 'female';

export interface KnowledgeCharacterMetadata {
  gender?: KnowledgeCharacterGender;
  updatedAt?: number;
}

export type KnowledgeCharacterMetadataMap = Record<string, KnowledgeCharacterMetadata>;

export interface KnowledgeCategoryProgress {
  entries: KnowledgeEntriesMap;
  unknownEntries: KnowledgeEntriesMap;
  levels: KnowledgeLevelMap;
  totalLevel?: string;
  updatedAt: number;
}

export type KnowledgeCharacterProgress = Partial<
  Record<KnowledgeCategoryBaseName, KnowledgeCategoryProgress>
>;

export type KnowledgeProgressByCharacter = Record<string, KnowledgeCharacterProgress>;

export interface KnowledgeDetailsSnapshotData {
  definitions: KnowledgeDefinitions;
  progress: KnowledgeProgressByCharacter;
  characters: KnowledgeCharacterMetadataMap;
  version?: number;
}

export interface KnowledgeDetailsSnapshot {
  data: KnowledgeDetailsSnapshotData;
  timestamp: number;
}

const MALE_TO_FEMALE_ENTRY_PREFIX = new Map<string, string>([
  ['Analizowales', 'Analizowalas'],
  ['Bladziles', 'Bladzilas'],
  ['Byles', 'Bylas'],
  ['Czytales', 'Czytalas'],
  ['Dales', 'Dalas'],
  ['Dostarczyles', 'Dostarczylas'],
  ['Doswiadczyles', 'Doswiadczylas'],
  ['Dotykales', 'Dotykalas'],
  ['Doznales', 'Doznalas'],
  ['Dowiedziales', 'Dowiedzialas'],
  ['dowiedziales', 'dowiedzialas'],
  ['Odbyles', 'Odbylas'],
  ['Odczules', 'Odczulas'],
  ['Odczytales', 'Odczytalas'],
  ['Odnalazles', 'Odnalazlas'],
  ['Odprawiles', 'Odprawilas'],
  ['Ogladales', 'Ogladalas'],
  ['ogladales', 'ogladalas'],
  ['Otworzyles', 'Otworzylas'],
  ['Podrozowales', 'Podrozowalas'],
  ['Poznales', 'Poznalas'],
  ['Probowales', 'Probowalas'],
  ['Przeczytales', 'Przeczytalas'],
  ['Przekonales', 'Przekonalas'],
  ['Przemierzales', 'Przemierzalas'],
  ['Przeszukales', 'Przeszukalas'],
  ['Przetrwales', 'Przetrwalas'],
  ['Przezyles', 'Przezylas'],
  ['Przygladales', 'Przygladalas'],
  ['Rozbiles', 'Rozbilas'],
  ['Rozerwales', 'Rozerwalas'],
  ['Rozmawiales', 'Rozmawialas'],
  ['Sluchales', 'Sluchalas'],
  ['Slyszales', 'Slyszalas'],
  ['slyszales', 'slyszalas'],
  ['Skosztowales', 'Skosztowalas'],
  ['Spotkales', 'Spotkalas'],
  ['Stales', 'Stalas'],
  ['Starles', 'Starlas'],
  ['Uzyles', 'Uzylas'],
  ['Widziales', 'Widzialas'],
  ['Wkroczyles', 'Wkroczylas'],
  ['Wpadles', 'Wpadlas'],
  ['Wyleczyles', 'Wyleczylas'],
  ['Wypiles', 'Wypilas'],
  ['Wysluchales', 'Wysluchalas'],
  ['Wyzwoliles', 'Wyzwolilas'],
  ['Wzbudziles', 'Wzbudzilas'],
  ['Zabezpieczyles', 'Zabezpieczylas'],
  ['Zabiles', 'Zabilas'],
  ['Zebrales', 'Zebralas'],
  ['Zglebiles', 'Zglebilas'],
  ['zyskales', 'zyskalas'],
]);

const FEMALE_TO_MALE_ENTRY_PREFIX = new Map<string, string>();

MALE_TO_FEMALE_ENTRY_PREFIX.forEach((female, male) => {
  FEMALE_TO_MALE_ENTRY_PREFIX.set(female, male);
});

function replaceGenderedPrefix(
  value: string,
  replacements: Map<string, string>,
): string | null {
  for (const [from, to] of replacements) {
    if (value === from) {
      return to;
    }
    if (value.startsWith(from + ' ') || value.startsWith(from + ',')) {
      return to + value.slice(from.length);
    }
    // Handle gendered word mid-string (preceded by space)
    const pos = value.indexOf(' ' + from, 0);
    if (pos !== -1) {
      const afterPos = pos + 1 + from.length;
      if (afterPos === value.length || value[afterPos] === ' ' || value[afterPos] === ',') {
        return value.slice(0, pos + 1) + to + value.slice(afterPos);
      }
    }
  }
  return null;
}

export function canonicalizeKnowledgeEntryGender(value: string): string {
  return replaceGenderedPrefix(value, FEMALE_TO_MALE_ENTRY_PREFIX) ?? value;
}

export function formatKnowledgeEntryForGender(
  value: string,
  gender: KnowledgeCharacterGender | null | undefined,
): string {
  if (gender === 'female') {
    return replaceGenderedPrefix(value, MALE_TO_FEMALE_ENTRY_PREFIX) ?? value;
  }
  return value;
}

export function parseKnowledgeGender(value: unknown): KnowledgeCharacterGender | null {
  const candidate =
    typeof value === 'string'
      ? value
      : value && typeof value === 'object'
      ? (value as Record<string, unknown>).gender
      : null;

  if (typeof candidate !== 'string') {
    return null;
  }

  const normalized = stripPolishCharacters(candidate.trim().toLowerCase());
  if (normalized === 'female') {
    return 'female';
  }
  if (normalized === 'male') {
    return 'male';
  }

  return null;
}

function createEmptyProgress(): KnowledgeEntriesMap {
  return {
    fight: [],
    books: [],
    exploration: [],
  };
}

function normalizeEntry(value: string): string {
  return stripPolishCharacters(value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/u, ''));
}

export type NormalizedKnowledgeDefinitions = Record<
  KnowledgeCategoryBaseName,
  Record<KnowledgeDetailsType, Map<string, string>>
>;

export function buildNormalizedDefinitions(
  definitions: KnowledgeDefinitions,
): NormalizedKnowledgeDefinitions {
  const result = {} as NormalizedKnowledgeDefinitions;
  for (const category of KNOWLEDGE_CATEGORY_ORDER) {
    const definition = definitions[category];
    const perType: Record<KnowledgeDetailsType, Map<string, string>> = {
      fight: new Map(),
      books: new Map(),
      exploration: new Map(),
    };
    if (definition) {
      for (const type of KNOWLEDGE_DETAILS_TYPES) {
        const entries = definition[type] ?? [];
        for (const entry of entries) {
          const canonical = canonicalizeKnowledgeEntryGender(entry);
          const normalizedCanonical = normalizeEntry(canonical);
          if (normalizedCanonical.length === 0) {
            continue;
          }

          if (!perType[type].has(normalizedCanonical)) {
            perType[type].set(normalizedCanonical, canonical);
          }

          const originalNormalized = normalizeEntry(entry);
          if (!perType[type].has(originalNormalized)) {
            perType[type].set(originalNormalized, canonical);
          }

          const femaleVariant = formatKnowledgeEntryForGender(canonical, 'female');
          if (femaleVariant !== canonical) {
            const normalizedFemale = normalizeEntry(femaleVariant);
            if (!perType[type].has(normalizedFemale)) {
              perType[type].set(normalizedFemale, canonical);
            }
          }
        }
      }
    }
    result[category] = perType;
  }
  return result;
}

function ensureProgressEntries(progress: KnowledgeEntriesMap | undefined): KnowledgeEntriesMap {
  if (!progress) {
    return createEmptyProgress();
  }
  return {
    fight: Array.isArray(progress.fight) ? [...progress.fight] : [],
    books: Array.isArray(progress.books) ? [...progress.books] : [],
    exploration: Array.isArray(progress.exploration) ? [...progress.exploration] : [],
  };
}

function ensureLevelMap(levels: KnowledgeLevelMap | undefined): KnowledgeLevelMap {
  const result: KnowledgeLevelMap = {};
  if (!levels || typeof levels !== 'object') {
    return result;
  }
  for (const type of KNOWLEDGE_DETAILS_TYPES) {
    const value = levels[type];
    if (typeof value === 'string' && value.trim().length > 0) {
      result[type] = value;
    }
  }
  return result;
}

function sanitizeProgress(
  previous: KnowledgeProgressByCharacter | undefined,
  definitions: KnowledgeDefinitions,
): KnowledgeProgressByCharacter {
  const result: KnowledgeProgressByCharacter = {};
  if (!previous || typeof previous !== 'object') {
    return result;
  }

  const normalized = buildNormalizedDefinitions(definitions);

  for (const [character, progress] of Object.entries(previous)) {
    if (!progress || typeof progress !== 'object') {
      continue;
    }

    const sanitizedCategories: KnowledgeCharacterProgress = {};

    for (const [categoryName, categoryProgress] of Object.entries(progress)) {
      if (!categoryProgress || typeof categoryProgress !== 'object') {
        continue;
      }
      const baseCategory = getBaseCategoryFromName(categoryName);

      if (!baseCategory) {
        continue;
      }

      const definition = definitions[baseCategory];
      if (!definition) {
        continue;
      }

      const normalizedDefinition = normalized[baseCategory];
      const sanitizedEntries: KnowledgeEntriesMap = createEmptyProgress();
      const unknownEntries: KnowledgeEntriesMap = createEmptyProgress();
      const entries = ensureProgressEntries(categoryProgress.entries);

      for (const type of KNOWLEDGE_DETAILS_TYPES) {
        const seen = new Set<string>();
        for (const entry of entries[type]) {
          const normalizedEntry = normalizeEntry(entry);
          if (normalizedEntry.length === 0 || seen.has(normalizedEntry)) {
            continue;
          }
          seen.add(normalizedEntry);
          const canonical = normalizedDefinition[type].get(normalizedEntry);
          if (canonical) {
            sanitizedEntries[type].push(canonical);
          } else {
            unknownEntries[type].push(entry);
          }
        }
      }

      const sanitized: KnowledgeCategoryProgress = {
        entries: sanitizedEntries,
        unknownEntries,
        levels: ensureLevelMap(categoryProgress.levels),
        updatedAt:
            typeof categoryProgress.updatedAt === 'number' && categoryProgress.updatedAt > 0
                ? categoryProgress.updatedAt
                : Date.now(),
      };

      if (typeof categoryProgress.totalLevel === 'string' && categoryProgress.totalLevel.trim().length > 0) {
        sanitized.totalLevel = categoryProgress.totalLevel.trim();
      }

      sanitizedCategories[baseCategory] = sanitized;
    }

    if (Object.keys(sanitizedCategories).length > 0) {
      result[character] = sanitizedCategories;
    }
  }

  return result;
}

function sanitizeCharacters(
  previous: KnowledgeCharacterMetadataMap | undefined,
): KnowledgeCharacterMetadataMap {
  const result: KnowledgeCharacterMetadataMap = {};
  if (!previous || typeof previous !== 'object') {
    return result;
  }

  for (const [character, metadata] of Object.entries(previous)) {
    if (!metadata || typeof metadata !== 'object') {
      continue;
    }

    const parsedGender =
      parseKnowledgeGender(metadata.gender) ??
      parseKnowledgeGender((metadata as Record<string, unknown>).sex);
    const updatedAt =
      typeof metadata.updatedAt === 'number' && metadata.updatedAt > 0
        ? metadata.updatedAt
        : undefined;

    if (!parsedGender && !updatedAt) {
      continue;
    }

    result[character] = {
      ...(parsedGender ? { gender: parsedGender } : {}),
      ...(updatedAt ? { updatedAt } : {}),
    };
  }

  return result;
}


const KNOWLEDGE_DB_NAME = 'ArkadiaKnowledgeDetailsDBv2';
const DEFINITIONS_STORE = 'knowledge_definitions';
const ENTRIES_STORE = 'knowledge_entries';
const PROGRESS_STORE = 'knowledge_progress';
const CHARACTERS_STORE = 'knowledge_characters';
const METADATA_STORE = 'knowledge_metadata';

let knowledgeDatabasePromise: Promise<IDBDatabase> | null = null;

function openKnowledgeDetailsDatabase(): Promise<IDBDatabase> {
  if (!knowledgeDatabasePromise) {
    knowledgeDatabasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(KNOWLEDGE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DEFINITIONS_STORE)) {
          db.createObjectStore(DEFINITIONS_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(ENTRIES_STORE)) {
          db.createObjectStore(ENTRIES_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(PROGRESS_STORE)) {
          db.createObjectStore(PROGRESS_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(CHARACTERS_STORE)) {
          db.createObjectStore(CHARACTERS_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          db.createObjectStore(METADATA_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Failed to open knowledge details database'));
    });
  }

  return knowledgeDatabasePromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

async function withKnowledgeTransaction<T>(
  storeNames: string[],
  mode: IDBTransactionMode,
  handler: (stores: Record<string, IDBObjectStore>) => Promise<T>,
): Promise<T> {
  const db = await openKnowledgeDetailsDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeNames, mode);
    transaction.onabort = () => reject(transaction.error ?? new Error('Knowledge details transaction aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('Knowledge details transaction error'));

    const stores: Record<string, IDBObjectStore> = {};
    for (const name of storeNames) {
      stores[name] = transaction.objectStore(name);
    }

    Promise.resolve(handler(stores))
      .then((result) => {
        transaction.oncomplete = () => resolve(result);
      })
      .catch((error) => {
        reject(error);
        try {
          transaction.abort();
        } catch {
          // ignore
        }
      });
  });
}

function sanitizeKnownEntriesMap(entries: KnowledgeEntriesMap): KnowledgeEntriesMap {
  const result = createEmptyProgress();
  for (const type of KNOWLEDGE_DETAILS_TYPES) {
    const seen = new Set<string>();
    const list = Array.isArray(entries[type]) ? entries[type] : [];
    for (const entry of list) {
      const canonical = canonicalizeKnowledgeEntryGender(entry);
      const normalized = normalizeEntry(canonical);
      if (normalized.length === 0 || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      result[type].push(canonical);
    }
    result[type].sort((a, b) => a.localeCompare(b));
  }
  return result;
}

function sanitizeUnknownEntriesMap(entries: KnowledgeEntriesMap): KnowledgeEntriesMap {
  const result = createEmptyProgress();
  for (const type of KNOWLEDGE_DETAILS_TYPES) {
    const seen = new Set<string>();
    const list = Array.isArray(entries[type]) ? entries[type] : [];
    for (const entry of list) {
      const trimmed = typeof entry === 'string' ? entry.trim() : '';
      if (trimmed.length === 0) {
        continue;
      }
      const normalized = normalizeEntry(trimmed);
      if (normalized.length === 0 || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      result[type].push(trimmed);
    }
    result[type].sort((a, b) => a.localeCompare(b));
  }
  return result;
}

interface KnowledgeDefinitionsRecord {
  id: 'definitions';
  definitions: KnowledgeDefinitions;
  version?: number;
  timestamp?: number;
}

interface KnowledgeEntryRecord {
  id: string;
  character: string;
  category: KnowledgeCategoryBaseName;
  type: KnowledgeDetailsType;
  canonical: string;
  updatedAt?: number;
}

interface KnowledgeProgressRecord {
  id: string;
  character: string;
  category: KnowledgeCategoryBaseName;
  unknownEntries: KnowledgeEntriesMap;
  levels: KnowledgeLevelMap;
  updatedAt: number;
}

interface KnowledgeCharacterRecord {
  id: string;
  character: string;
  metadata: KnowledgeCharacterMetadata;
}

interface KnowledgeMetadataRecord<TMeta> {
  id: string;
  value: TMeta;
}

class KnowledgeDetailsLoader
  implements LoaderStrategy<KnowledgeDetailsSnapshot, RefreshMetadata>
{
  async load(
    context: LoaderContext<KnowledgeDetailsSnapshot, RefreshMetadata>,
  ): Promise<LoaderResult<KnowledgeDetailsSnapshot, RefreshMetadata>> {
    // Load pre-structured definitions from wiedzaStore (single source of truth)
    const definitions = await loadWiedza();

    const progress = sanitizeProgress(context.previousSnapshot?.data.progress, definitions);
    const characters = sanitizeCharacters(context.previousSnapshot?.data.characters);

    return {
      snapshot: {
        data: {
          definitions,
          progress,
          characters,
          version: 2, // API version
        },
        timestamp: Date.now(),
      },
    };
  }
}

class KnowledgeDetailsIndexedDbStrategy<TMeta extends RefreshMetadata = RefreshMetadata>
  implements StorageStrategy<KnowledgeDetailsSnapshot, TMeta>
{
  private inMemorySnapshot: KnowledgeDetailsSnapshot | undefined;
  private inMemoryMetadata: TMeta | undefined;

  async readSnapshot(): Promise<KnowledgeDetailsSnapshot | undefined> {
    if (this.inMemorySnapshot) {
      return this.inMemorySnapshot;
    }

    try {
      const snapshot = await withKnowledgeTransaction(
        [DEFINITIONS_STORE, ENTRIES_STORE, PROGRESS_STORE, CHARACTERS_STORE],
        'readonly',
        async (stores) => {
          const definitionsRecord = (await requestToPromise(
            stores[DEFINITIONS_STORE].get('definitions'),
          )) as KnowledgeDefinitionsRecord | undefined;
          if (!definitionsRecord) {
            return undefined;
          }

          const [entryRecords, progressRecords, characterRecords] = await Promise.all([
            requestToPromise<KnowledgeEntryRecord[]>(stores[ENTRIES_STORE].getAll()),
            requestToPromise<KnowledgeProgressRecord[]>(stores[PROGRESS_STORE].getAll()),
            requestToPromise<KnowledgeCharacterRecord[]>(stores[CHARACTERS_STORE].getAll()),
          ]);

          const definitions = definitionsRecord.definitions ?? ({} as KnowledgeDefinitions);

          const progress: KnowledgeProgressByCharacter = {};

          for (const record of progressRecords) {
            const characterProgress = (progress[record.character] ??= {});
            const baseCategory = record.category;
            const unknownEntries = sanitizeUnknownEntriesMap(
              record.unknownEntries ?? createEmptyProgress(),
            );
            const levels = ensureLevelMap(record.levels);
            characterProgress[baseCategory] = {
              entries: createEmptyProgress(),
              unknownEntries,
              levels,
              updatedAt:
                typeof record.updatedAt === 'number' && record.updatedAt > 0
                  ? record.updatedAt
                  : Date.now(),
            };
          }

          for (const record of entryRecords) {
            const characterProgress = (progress[record.character] ??= {});
            const categoryProgress =
              (characterProgress[record.category] ??= {
                entries: createEmptyProgress(),
                unknownEntries: createEmptyProgress(),
                levels: {},
                updatedAt:
                  typeof record.updatedAt === 'number' && record.updatedAt > 0
                    ? record.updatedAt
                    : Date.now(),
              });

            const entries = categoryProgress.entries[record.type];
            const normalized = normalizeEntry(record.canonical);
            if (normalized.length === 0) {
              continue;
            }
            if (!entries.some((value) => normalizeEntry(value) === normalized)) {
              entries.push(record.canonical);
              entries.sort((a, b) => a.localeCompare(b));
            }
          }

          const characters: KnowledgeCharacterMetadataMap = {};
          for (const record of characterRecords) {
            characters[record.character] = record.metadata ?? {};
          }

          const sanitizedCharacters = sanitizeCharacters(characters);
          const sanitizedProgress = sanitizeProgress(progress, definitions);

          const snapshot: KnowledgeDetailsSnapshot = {
            data: {
              definitions,
              progress: sanitizedProgress,
              characters: sanitizedCharacters,
              version: definitionsRecord.version,
            },
            timestamp:
              typeof definitionsRecord.timestamp === 'number'
                ? definitionsRecord.timestamp
                : Date.now(),
          };

          return snapshot;
        },
      );

      if (snapshot) {
        this.inMemorySnapshot = snapshot;
      }

      return snapshot;
    } catch (error) {
      console.warn('Failed to read knowledge details snapshot from IndexedDB:', error);
      return undefined;
    }
  }

  async writeSnapshot(snapshot: KnowledgeDetailsSnapshot | undefined): Promise<void> {
    this.inMemorySnapshot = snapshot;

    try {
      await withKnowledgeTransaction(
        [DEFINITIONS_STORE, ENTRIES_STORE, PROGRESS_STORE, CHARACTERS_STORE],
        'readwrite',
        async (stores) => {
          await Promise.all([
            requestToPromise(stores[DEFINITIONS_STORE].clear()),
            requestToPromise(stores[ENTRIES_STORE].clear()),
            requestToPromise(stores[PROGRESS_STORE].clear()),
            requestToPromise(stores[CHARACTERS_STORE].clear()),
          ]);

          if (!snapshot) {
            return;
          }

          const definitionsRecord: KnowledgeDefinitionsRecord = {
            id: 'definitions',
            definitions: snapshot.data.definitions,
            version: snapshot.data.version,
            timestamp: snapshot.timestamp ?? Date.now(),
          };
          await requestToPromise(stores[DEFINITIONS_STORE].put(definitionsRecord));

          const characterEntries = Object.entries(snapshot.data.characters ?? {});
          if (characterEntries.length > 0) {
            await Promise.all(
              characterEntries.map(([character, metadata]) => {
                const record: KnowledgeCharacterRecord = {
                  id: character,
                  character,
                  metadata,
                };
                return requestToPromise(stores[CHARACTERS_STORE].put(record));
              }),
            );
          }

          const entryPromises: Promise<unknown>[] = [];
          const progressPromises: Promise<unknown>[] = [];

          for (const [character, categories] of Object.entries(
            snapshot.data.progress ?? {},
          )) {
            for (const [categoryName, categoryProgress] of Object.entries(categories)) {
              const category = categoryName as KnowledgeCategoryBaseName;
              const entriesMap = sanitizeKnownEntriesMap(
                categoryProgress.entries ?? createEmptyProgress(),
              );
              const unknownMap = sanitizeUnknownEntriesMap(
                categoryProgress.unknownEntries ?? createEmptyProgress(),
              );
              const levels = ensureLevelMap(categoryProgress.levels);
              const updatedAt =
                typeof categoryProgress.updatedAt === 'number' && categoryProgress.updatedAt > 0
                  ? categoryProgress.updatedAt
                  : Date.now();

              const progressRecord: KnowledgeProgressRecord = {
                id: `${character}::${category}`,
                character,
                category,
                unknownEntries: unknownMap,
                levels,
                updatedAt,
              };
              progressPromises.push(requestToPromise(stores[PROGRESS_STORE].put(progressRecord)));

              for (const type of KNOWLEDGE_DETAILS_TYPES) {
                for (const entry of entriesMap[type]) {
                  const normalized = normalizeEntry(entry);
                  if (normalized.length === 0) {
                    continue;
                  }
                  const entryRecord: KnowledgeEntryRecord = {
                    id: `${character}::${category}::${type}::${normalized}`,
                    character,
                    category,
                    type,
                    canonical: entry,
                    updatedAt,
                  };
                  entryPromises.push(requestToPromise(stores[ENTRIES_STORE].put(entryRecord)));
                }
              }
            }
          }

          if (progressPromises.length > 0) {
            await Promise.all(progressPromises);
          }
          if (entryPromises.length > 0) {
            await Promise.all(entryPromises);
          }
        },
      );
    } catch (error) {
      console.warn('Failed to store knowledge details in IndexedDB:', error);
    }
  }

  async readMetadata(): Promise<TMeta | undefined> {
    if (this.inMemoryMetadata) {
      return this.inMemoryMetadata;
    }

    try {
      const metadata = await withKnowledgeTransaction(
        [METADATA_STORE],
        'readonly',
        async (stores) => {
          const record = (await requestToPromise(
            stores[METADATA_STORE].get('metadata'),
          )) as KnowledgeMetadataRecord<TMeta> | undefined;
          return record?.value;
        },
      );

      if (metadata !== undefined) {
        this.inMemoryMetadata = metadata;
      }

      return metadata ?? undefined;
    } catch (error) {
      console.warn('Failed to read knowledge details metadata from IndexedDB:', error);
      return undefined;
    }
  }

  async writeMetadata(metadata: TMeta | undefined): Promise<void> {
    this.inMemoryMetadata = metadata;

    try {
      await withKnowledgeTransaction([METADATA_STORE], 'readwrite', async (stores) => {
        if (metadata === undefined) {
          await requestToPromise(stores[METADATA_STORE].clear());
          return;
        }

        const record: KnowledgeMetadataRecord<TMeta> = {
          id: 'metadata',
          value: metadata,
        };
        await requestToPromise(stores[METADATA_STORE].put(record));
      });
    } catch (error) {
      console.warn('Failed to store knowledge details metadata in IndexedDB:', error);
    }
  }

  async clear(): Promise<void> {
    this.inMemorySnapshot = undefined;
    this.inMemoryMetadata = undefined;

    try {
      await withKnowledgeTransaction(
        [DEFINITIONS_STORE, ENTRIES_STORE, PROGRESS_STORE, CHARACTERS_STORE],
        'readwrite',
        async (stores) => {
          await Promise.all([
            requestToPromise(stores[DEFINITIONS_STORE].clear()),
            requestToPromise(stores[ENTRIES_STORE].clear()),
            requestToPromise(stores[PROGRESS_STORE].clear()),
            requestToPromise(stores[CHARACTERS_STORE].clear()),
          ]);
        },
      );

      await withKnowledgeTransaction([METADATA_STORE], 'readwrite', async (stores) => {
        await requestToPromise(stores[METADATA_STORE].clear());
      });
    } catch (error) {
      console.warn('Failed to clear knowledge details from IndexedDB:', error);
    }
  }
}

const TTL = 24 * 60 * 60 * 1000;

export const getKnowledgeDetailsStore = createDataStoreSingleton(
  () =>
    new DataStore<KnowledgeDetailsSnapshot, RefreshMetadata>({
      loader: new KnowledgeDetailsLoader(),
      storage: new KnowledgeDetailsIndexedDbStrategy<RefreshMetadata>(),
      ttlMs: TTL,
    }),
);
