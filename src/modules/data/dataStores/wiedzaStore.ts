import { DataStore, createDataStoreSingleton } from '@modules/data/dataStore/DataStore';
import { FetchJsonLoader, JsonDatasetSnapshot } from '@modules/data/dataStore/strategies/FetchJsonLoader';
import { IndexedDbSingleRecordStrategy } from '@modules/data/dataStore/strategies/IndexedDbSingleRecordStrategy';
import { RefreshMetadata, LoaderContext, LoaderResult, LoaderStrategy } from '@modules/data/dataStore/types';
import {
  KnowledgeCategoryBaseName,
  KNOWLEDGE_CATEGORY_CONFIG,

} from '@client/knowledgeCategories';
import { stripPolishCharacters } from '@client/stripPolishCharacters';

// API endpoint for wiedza data
export const WIEDZA_URL =
  'https://ethel.pl/wp-admin/admin-ajax.php?action=wiedza_data';

// Data structure returned by the API
export interface WiedzaApiResponse {
  success: boolean;
  data: {
    data: WiedzaCategory[];
  };
}

// Individual wiedza category (raw from API)
export interface WiedzaCategory {
  [key: string]: any; // Flexible structure for category data
}

// Knowledge types
export type KnowledgeDetailsType = 'fight' | 'books' | 'exploration';

export const KNOWLEDGE_DETAILS_TYPES: KnowledgeDetailsType[] = [
  'fight',
  'books',
  'exploration',
];

// Knowledge category definition (grouped/structured)
export interface KnowledgeCategoryDefinition {
  fight: string[];
  books: string[];
  exploration: string[];
}

export type KnowledgeDefinitions = Record<KnowledgeCategoryBaseName, KnowledgeCategoryDefinition>;

// Processed data structure (single source of truth)
export interface WiedzaProcessedData {
  definitions: KnowledgeDefinitions;
  version: number;
}

// Snapshot stored in IndexedDB
export interface WiedzaSnapshot {
  data: WiedzaProcessedData;
  timestamp: number;
}

// Helper functions for parsing and transforming API data

function normalizeEntry(value: string): string {
  return stripPolishCharacters(value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/u, ''));
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

/**
 * Custom loader that fetches wiedza data from API and transforms it
 * into structured knowledge definitions
 */
class WiedzaTransformingLoader implements LoaderStrategy<WiedzaSnapshot, RefreshMetadata> {
  private readonly fetchLoader: FetchJsonLoader<WiedzaApiResponse>;

  constructor() {
    this.fetchLoader = new FetchJsonLoader<WiedzaApiResponse>({
      url: WIEDZA_URL,
    });
  }

  async load(
    context: LoaderContext<WiedzaSnapshot, RefreshMetadata>,
  ): Promise<LoaderResult<WiedzaSnapshot, RefreshMetadata>> {
    // Fetch raw data from API
    // Create a context for the fetch loader (without previousSnapshot since types differ)
    const fetchContext: LoaderContext<JsonDatasetSnapshot<WiedzaApiResponse>, RefreshMetadata> = {
      metadata: context.metadata,
      force: context.force,
      onProgress: context.onProgress,
    };
    const result = await this.fetchLoader.load(fetchContext);

    if (!result.snapshot) {
      return { snapshot: undefined } as LoaderResult<WiedzaSnapshot, RefreshMetadata>;
    }

    const apiResponse = result.snapshot.data;
    const categories = Array.isArray(apiResponse?.data?.data) ? apiResponse.data.data : [];

    // Transform raw data into structured definitions
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

    // Ensure all categories exist
    for (const config of KNOWLEDGE_CATEGORY_CONFIG) {
      ensureCategoryDefinition(definitions, config.base);
    }

    // Return transformed data as the snapshot
    return {
      snapshot: {
        data: {
          definitions,
          version: 2, // API version
        },
        timestamp: result.snapshot.timestamp,
      },
    };
  }
}

/**
 * Creates and returns a singleton DataStore instance for wiedza data.
 * The store uses:
 * - WiedzaTransformingLoader to fetch and transform data from ethel.pl API
 * - IndexedDbSingleRecordStrategy for local caching
 * - 24-hour TTL for automatic refresh
 * - Data is stored already grouped/normalized (single source of truth)
 */
export const getWiedzaStore = createDataStoreSingleton(() => {
  return new DataStore<WiedzaSnapshot, RefreshMetadata>({
    loader: new WiedzaTransformingLoader(),
    storage: new IndexedDbSingleRecordStrategy<WiedzaSnapshot>({
      snapshot: {
        dbName: 'ArkadiaWiedzaDB',
        storeName: 'wiedza',
        key: 'wiedza',
      },
    }),
    ttlMs: 24 * 60 * 60 * 1000, // 24 hours
  });
});
