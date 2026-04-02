import {
  getBaseCategoryFromName,
  KnowledgeCategoryBaseName,
} from '@client/knowledgeCategories';
import { stripPolishCharacters } from '@client/stripPolishCharacters';

export interface KnowledgeEvent {
  category: KnowledgeCategoryBaseName;
  categoryDative: string;
  type: 'tick' | 'level_change';
  locationId: number;
  timestamp: number;
  level?: string;
}

export interface KnowledgeEventsData {
  events: KnowledgeEvent[];
}

export type KnowledgeEventsByCharacter = Record<string, KnowledgeEventsData>;

const DB_NAME = 'ArkadiaKnowledgeEventsDB';
const STORE_NAME = 'knowledge_events';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Failed to open knowledge events database'));
    });
  }
  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

interface StoredRecord {
  id: string;
  character: string;
  events: KnowledgeEvent[];
}

let inMemoryCache: KnowledgeEventsByCharacter | null = null;

export async function loadKnowledgeEvents(): Promise<KnowledgeEventsByCharacter> {
  if (inMemoryCache) {
    return inMemoryCache;
  }

  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const records = await requestToPromise<StoredRecord[]>(store.getAll());

    const result: KnowledgeEventsByCharacter = {};
    for (const record of records) {
      if (record.character && Array.isArray(record.events)) {
        result[record.character] = { events: record.events };
      }
    }

    inMemoryCache = result;
    return result;
  } catch (error) {
    console.warn('Failed to load knowledge events:', error);
    return {};
  }
}

export async function saveKnowledgeEvents(
  character: string,
  data: KnowledgeEventsData,
): Promise<void> {
  if (!inMemoryCache) {
    inMemoryCache = {};
  }
  inMemoryCache[character] = data;

  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const record: StoredRecord = {
      id: character,
      character,
      events: data.events,
    };
    await requestToPromise(store.put(record));
  } catch (error) {
    console.warn('Failed to save knowledge events:', error);
  }
}

export async function addKnowledgeEvent(
  character: string,
  event: KnowledgeEvent,
): Promise<void> {
  const allEvents = await loadKnowledgeEvents();
  const characterData = allEvents[character] ?? { events: [] };
  characterData.events.push(event);
  await saveKnowledgeEvents(character, characterData);
}

export async function getKnowledgeEventsForCharacter(
  character: string,
): Promise<KnowledgeEvent[]> {
  const allEvents = await loadKnowledgeEvents();
  return allEvents[character]?.events ?? [];
}

export async function getTickCountSinceTimestamp(
  character: string,
  category: KnowledgeCategoryBaseName,
  sinceTimestamp: number,
): Promise<number> {
  const events = await getKnowledgeEventsForCharacter(character);
  return events.filter(
    (e) =>
      e.type === 'tick' &&
      e.category === category &&
      e.timestamp > sinceTimestamp,
  ).length;
}

export function parseDativeCategory(dativeText: string): KnowledgeCategoryBaseName | null {
  const trimmed = stripPolishCharacters(dativeText.trim().toLowerCase());
  return getBaseCategoryFromName(trimmed);
}

export async function mergeKnowledgeEvents(
  character: string,
  newEvents: KnowledgeEvent[],
): Promise<number> {
  const allEvents = await loadKnowledgeEvents();
  const characterData = allEvents[character] ?? { events: [] };
  const existing = characterData.events;

  let added = 0;
  for (const event of newEvents) {
    const isDuplicate = existing.some(
      (e) =>
        e.type === event.type &&
        e.category === event.category &&
        Math.abs(e.timestamp - event.timestamp) < 1000,
    );
    if (!isDuplicate) {
      existing.push(event);
      added++;
    }
  }

  if (added > 0) {
    existing.sort((a, b) => a.timestamp - b.timestamp);
    await saveKnowledgeEvents(character, characterData);
  }

  return added;
}
