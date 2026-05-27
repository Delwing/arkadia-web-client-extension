import { SubscriptionOptions } from '@modules/data/dataStore/types';
import {
  getHerbsStore,
  HERBS_URL,
  HerbsData,
  HerbForms,
  HerbUse,
  isHerbSmokable,
  getBindableUses,
} from '@modules/data/dataStores/herbsStore';

export { HERBS_URL, isHerbSmokable, getBindableUses };
export type { HerbForms, HerbUse, HerbsData };

export default async function loadHerbs(): Promise<HerbsData | null> {
  const store = getHerbsStore();
  try {
    const snapshot = await store.refresh();
    return snapshot?.data ?? null;
  } catch (error) {
    console.error('Failed to load herbs:', error);
    const fallback = await store.getSnapshot();
    return fallback?.data ?? null;
  }
}

export function subscribeToHerbs(
  listener: (data: HerbsData | undefined) => void,
  options?: SubscriptionOptions,
): () => void {
  const store = getHerbsStore();
  return store.subscribe((snapshot) => listener(snapshot?.data), options);
}
