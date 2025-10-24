import { SubscriptionOptions } from '../dataStore/types';
import {
  getMagicKeysStore,
  MAGIC_KEYS_URL,
  MagicKeysData,
} from '../dataStores/magicKeysStore';

export { MAGIC_KEYS_URL };
export type { MagicKeysData };

export default async function loadMagicKeys(): Promise<string[]> {
  const store = getMagicKeysStore();
  try {
    const snapshot = await store.refresh();
    const data = snapshot?.data;
    if (!data) {
      return [];
    }
    if (!Array.isArray(data.magic_keys)) {
      throw new Error('Invalid data format');
    }
    return data.magic_keys;
  } catch (error) {
    console.error('Failed to load magic keys:', error);
    const fallback = await store.getSnapshot();
    const data = fallback?.data;
    if (!data || !Array.isArray(data.magic_keys)) {
      return [];
    }
    return data.magic_keys;
  }
}

export function subscribeToMagicKeys(
  listener: (keys: string[] | undefined) => void,
  options?: SubscriptionOptions,
): () => void {
  const store = getMagicKeysStore();
  return store.subscribe(
    (snapshot) => {
      const data = snapshot?.data;
      if (!data || !Array.isArray(data.magic_keys)) {
        listener(undefined);
        return;
      }
      listener(data.magic_keys);
    },
    options,
  );
}
