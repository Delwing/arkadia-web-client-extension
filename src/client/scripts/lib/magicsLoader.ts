import { SubscriptionOptions } from '@modules/data/dataStore/types';
import {
  getMagicsStore,
  MAGICS_URL,
  MagicsFile,
} from '@modules/data/dataStores/magicsStore';

export { MAGICS_URL };
export type { MagicsFile };

function extractMagics(data: MagicsFile | undefined): string[] {
  if (!data) {
    return [];
  }
  const magics: string[] = [];
  for (const value of Object.values(data.magics)) {
    if (value && Array.isArray(value.regexps)) {
      magics.push(...value.regexps);
    }
  }
  return magics;
}

export default async function loadMagics(): Promise<string[]> {
  const store = getMagicsStore();
  try {
    const snapshot = await store.refresh();
    return extractMagics(snapshot?.data);
  } catch (error) {
    console.error('Failed to load magics:', error);
    const fallback = await store.getSnapshot();
    return extractMagics(fallback?.data);
  }
}

export function subscribeToMagics(
  listener: (magics: string[] | undefined) => void,
  options?: SubscriptionOptions,
): () => void {
  const store = getMagicsStore();
  return store.subscribe(
    (snapshot) => listener(snapshot ? extractMagics(snapshot.data) : undefined),
    options,
  );
}

function extractMagicTypes(data: MagicsFile | undefined): string[] {
  if (!data) {
    return [];
  }
  const types = new Set<string>();
  for (const value of Object.values(data.magics)) {
    if (value && Array.isArray(value.type)) {
      value.type.forEach(t => types.add(t));
    }
  }
  return Array.from(types).sort();
}

export async function loadMagicTypes(): Promise<string[]> {
  const store = getMagicsStore();
  try {
    const snapshot = await store.refresh();
    return extractMagicTypes(snapshot?.data);
  } catch (error) {
    console.error('Failed to load magic types:', error);
    const fallback = await store.getSnapshot();
    return extractMagicTypes(fallback?.data);
  }
}

export function subscribeToMagicTypes(
  listener: (types: string[] | undefined) => void,
  options?: SubscriptionOptions,
): () => void {
  const store = getMagicsStore();
  return store.subscribe(
    (snapshot) => listener(snapshot ? extractMagicTypes(snapshot.data) : undefined),
    options,
  );
}

export function getMagicTypesForItem(data: MagicsFile | undefined, itemName: string): string[] {
  if (!data) {
    return [];
  }
  const types: string[] = [];
  for (const [, magic] of Object.entries(data.magics)) {
    if (magic && Array.isArray(magic.regexps)) {
      const matches = magic.regexps.some(pattern => {
        const regex = new RegExp("(^|\\s)" + pattern, "i");
        return regex.test(itemName);
      });
      if (matches && Array.isArray(magic.type)) {
        types.push(...magic.type);
      }
    }
  }
  return types;
}

function extractMagicKeys(data: MagicsFile | undefined): string[] {
  if (!data) {
    return [];
  }
  return Object.keys(data.magics).sort();
}

export async function loadMagicKeys(): Promise<string[]> {
  const store = getMagicsStore();
  try {
    const snapshot = await store.refresh();
    return extractMagicKeys(snapshot?.data);
  } catch (error) {
    console.error('Failed to load magic keys:', error);
    const fallback = await store.getSnapshot();
    return extractMagicKeys(fallback?.data);
  }
}

export function subscribeToMagicKeys(
  listener: (keys: string[] | undefined) => void,
  options?: SubscriptionOptions,
): () => void {
  const store = getMagicsStore();
  return store.subscribe(
    (snapshot) => listener(snapshot ? extractMagicKeys(snapshot.data) : undefined),
    options,
  );
}

export async function loadMagicsRaw(): Promise<MagicsFile | undefined> {
  const store = getMagicsStore();
  try {
    const snapshot = await store.refresh();
    return snapshot?.data;
  } catch (error) {
    console.error('Failed to load raw magics:', error);
    const fallback = await store.getSnapshot();
    return fallback?.data;
  }
}
