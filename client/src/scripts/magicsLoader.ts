import { SubscriptionOptions } from '../dataStore/types';
import {
  getMagicsStore,
  MAGICS_URL,
  MagicsFile,
} from '../dataStores/magicsStore';

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
