import { DataStore, createDataStoreSingleton } from '../dataStore/DataStore';
import {
  LoaderContext,
  LoaderResult,
  LoaderStrategy,
  RefreshMetadata,
  StorageStrategy,
} from '../dataStore/types';
import {
  clearIndexedDB,
  getFromIndexedDB,
  IndexedDBConfig,
  storeInIndexedDB,
} from '../utils/dataCache';
import { KNOWLEDGE_DETAILS_DATA } from '../data/knowledgeDetailsData';
import { stripPolishCharacters } from '../stripPolishCharacters';
import {
  getBaseCategoryFromName,
  KnowledgeCategoryBaseName,
  KNOWLEDGE_CATEGORY_CONFIG,
  KNOWLEDGE_CATEGORY_ORDER,
} from '../knowledgeCategories';

export type KnowledgeDetailsType = 'fight' | 'books' | 'exploration';

export const KNOWLEDGE_DETAILS_TYPES: KnowledgeDetailsType[] = [
  'fight',
  'books',
  'exploration',
];

export interface KnowledgeCategoryDefinition {
  fight: string[];
  books: string[];
  exploration: string[];
}

export type KnowledgeDefinitions = Record<KnowledgeCategoryBaseName, KnowledgeCategoryDefinition>;

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
  updatedAt: number;
}

export type KnowledgeCharacterProgress = Record<KnowledgeCategoryBaseName, KnowledgeCategoryProgress>;

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

interface KnowledgeDetailsFile {
  version?: number;
  categories: unknown;
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
  ['Rozerwales', 'Rozerwalas'],
  ['Rozmawiales', 'Rozmawialas'],
  ['Sluchales', 'Sluchalas'],
  ['slyszales', 'slyszalas'],
  ['Skosztowales', 'Skosztowalas'],
  ['Spotkales', 'Spotkalas'],
  ['Stales', 'Stalas'],
  ['Starles', 'Starlas'],
  ['Widziales', 'Widzialas'],
  ['Wkroczyles', 'Wkroczylas'],
  ['Wpadles', 'Wpadlas'],
  ['Wyleczyles', 'Wyleczylas'],
  ['Wypiles', 'Wypilas'],
  ['Wysluchales', 'Wysluchalas'],
  ['Wyzwoliles', 'Wyzwolilas'],
  ['Wzbudziles', 'Wzbudzilas'],
  ['Zabiles', 'Zabilas'],
  ['Zebrales', 'Zebralas'],
  ['Zglebiles', 'Zglebilas'],
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
    if (value.startsWith(from + ' ')) {
      return to + value.slice(from.length);
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

function ensureCategoryDefinition(
  data: KnowledgeDefinitions,
  category: KnowledgeCategoryBaseName,
): KnowledgeCategoryDefinition {
  let definition = data[category];
  if (!definition) {
    definition = {
      fight: [],
      books: [],
      exploration: [],
    };
    data[category] = definition;
  }
  return definition;
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

      const sanitizedCategory: KnowledgeCategoryProgress = {
        entries: sanitizedEntries,
        unknownEntries,
        levels: ensureLevelMap(categoryProgress.levels),
        updatedAt:
          typeof categoryProgress.updatedAt === 'number' && categoryProgress.updatedAt > 0
            ? categoryProgress.updatedAt
            : Date.now(),
      };

      sanitizedCategories[baseCategory] = sanitizedCategory;
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

function assignStrings(
  target: KnowledgeCategoryDefinition,
  type: KnowledgeDetailsType,
  strings: string[],
) {
  const seen = new Set(target[type].map(normalizeEntry));
  for (const entry of strings) {
    const normalized = normalizeEntry(entry);
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }
    target[type].push(entry.trim());
    seen.add(normalized);
  }
}

function extractStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    const result: string[] = [];
    for (const entry of value) {
      result.push(...extractStrings(entry));
    }
    return result;
  }
  if (value && typeof value === 'object') {
    const result: string[] = [];
    for (const entry of Object.values(value as Record<string, unknown>)) {
      result.push(...extractStrings(entry));
    }
    return result;
  }
  return [];
}

function parseCategoryDefinition(raw: unknown): KnowledgeCategoryDefinition {
  const definition: KnowledgeCategoryDefinition = {
    fight: [],
    books: [],
    exploration: [],
  };

  assignStrings(definition, 'exploration', extractStrings(raw));
  return definition;
}

class KnowledgeDetailsLoader
  implements LoaderStrategy<KnowledgeDetailsSnapshot, RefreshMetadata>
{
  async load(
    context: LoaderContext<KnowledgeDetailsSnapshot, RefreshMetadata>,
  ): Promise<LoaderResult<KnowledgeDetailsSnapshot, RefreshMetadata>> {
    const data = KNOWLEDGE_DETAILS_DATA as KnowledgeDetailsFile;
    const categories = Array.isArray(data.categories) ? data.categories : [];

    const definitions: KnowledgeDefinitions = {} as KnowledgeDefinitions;

    categories.forEach((category, index) => {
      const config = KNOWLEDGE_CATEGORY_CONFIG[index];
      if (!config) {
        return;
      }
      const definition = parseCategoryDefinition(category);
      ensureCategoryDefinition(definitions, config.base);
      definitions[config.base] = definition;
    });

    for (const config of KNOWLEDGE_CATEGORY_CONFIG) {
      ensureCategoryDefinition(definitions, config.base);
    }

    const progress = sanitizeProgress(context.previousSnapshot?.data.progress, definitions);
    const characters = sanitizeCharacters(context.previousSnapshot?.data.characters);

    return {
      snapshot: {
        data: {
          definitions,
          progress,
          characters,
          version: data.version,
        },
        timestamp: Date.now(),
      },
    };
  }
}

interface KnowledgeDetailsIndexedDbStrategyOptions {
  data: IndexedDBConfig;
  metadata?: IndexedDBConfig;
}

class KnowledgeDetailsIndexedDbStrategy<TMeta extends RefreshMetadata = RefreshMetadata>
  implements StorageStrategy<KnowledgeDetailsSnapshot, TMeta>
{
  private readonly dataConfig: IndexedDBConfig;
  private readonly metadataConfig: IndexedDBConfig;
  private inMemorySnapshot: KnowledgeDetailsSnapshot | undefined;
  private inMemoryMetadata: TMeta | undefined;

  constructor(options: KnowledgeDetailsIndexedDbStrategyOptions) {
    this.dataConfig = options.data;
    this.metadataConfig =
      options.metadata ?? {
        ...options.data,
        key: 'metadata',
      };
  }

  async readSnapshot(): Promise<KnowledgeDetailsSnapshot | undefined> {
    if (this.inMemorySnapshot) {
      return this.inMemorySnapshot;
    }

    try {
      const value = await getFromIndexedDB<KnowledgeDetailsSnapshot>(this.dataConfig);
      if (value) {
        const definitions = value.data?.definitions ?? ({} as KnowledgeDefinitions);
        this.inMemorySnapshot = {
          data: {
            definitions,
            progress: sanitizeProgress(value.data?.progress, definitions),
            characters: sanitizeCharacters(value.data?.characters),
            version: value.data?.version,
          },
          timestamp: value.timestamp ?? Date.now(),
        };
      }
    } catch (error) {
      console.warn('Failed to read knowledge details snapshot from IndexedDB:', error);
    }

    return this.inMemorySnapshot;
  }

  async writeSnapshot(snapshot: KnowledgeDetailsSnapshot | undefined): Promise<void> {
    this.inMemorySnapshot = snapshot;

    if (!snapshot) {
      await this.safeClear(this.dataConfig);
      return;
    }

    await this.safeStore(this.dataConfig, snapshot);
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
      console.warn('Failed to read knowledge details metadata from IndexedDB:', error);
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
      this.safeClear(this.dataConfig),
      this.safeClear(this.metadataConfig),
    ]);
  }

  private async safeStore(config: IndexedDBConfig, data: unknown): Promise<void> {
    try {
      await storeInIndexedDB(config, data);
    } catch (error) {
      console.warn('Failed to store knowledge details in IndexedDB:', error);
    }
  }

  private async safeClear(config: IndexedDBConfig): Promise<void> {
    try {
      await clearIndexedDB(config);
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
      storage: new KnowledgeDetailsIndexedDbStrategy<RefreshMetadata>({
        data: {
          dbName: 'ArkadiaKnowledgeDetailsDB',
          storeName: 'knowledge_details',
          key: 'knowledge_details',
        },
      }),
      ttlMs: TTL,
    }),
);
