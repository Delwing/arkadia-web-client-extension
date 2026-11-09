import {
  getWiedzaStore,
  KnowledgeDefinitions,
  WiedzaProcessedData,
} from '@modules/data/dataStores/wiedzaStore';
import { SubscriptionOptions } from '@modules/data/dataStore/types';

/**
 * Loads knowledge definitions from the API or cache.
 * Attempts to refresh data from the server first, falls back to cached data on error.
 * Data is already transformed and grouped by the store.
 *
 * @returns Promise resolving to knowledge definitions
 */
export default async function loadWiedza(): Promise<KnowledgeDefinitions> {
  const store = getWiedzaStore();

  try {
    const snapshot = await store.refresh();
    if (snapshot?.data?.definitions) {
      return snapshot.data.definitions;
    }
    return {} as KnowledgeDefinitions;
  } catch (error) {
    console.error('Failed to load wiedza data, using cached version:', error);
    const cachedSnapshot = await store.getSnapshot();
    if (cachedSnapshot?.data?.definitions) {
      return cachedSnapshot.data.definitions;
    }
    return {} as KnowledgeDefinitions;
  }
}

/**
 * Subscribes to wiedza data changes.
 * The listener will be called whenever the data is updated.
 *
 * @param listener - Callback function to receive knowledge definitions
 * @param options - Subscription options (e.g., notifyImmediately)
 * @returns Unsubscribe function to stop listening to changes
 */
export function subscribeToWiedza(
  listener: (definitions: KnowledgeDefinitions | undefined) => void,
  options?: SubscriptionOptions,
): () => void {
  const store = getWiedzaStore();
  return store.subscribe((snapshot) => {
    if (snapshot?.data?.definitions) {
      listener(snapshot.data.definitions);
    } else {
      listener(undefined);
    }
  }, options);
}

/**
 * Gets the full wiedza processed data including version.
 * Useful when you need access to the complete data structure.
 *
 * @returns Promise resolving to the full processed data or undefined
 */
export async function getWiedzaData(): Promise<
  WiedzaProcessedData | undefined
> {
  const store = getWiedzaStore();

  try {
    const snapshot = await store.refresh();
    return snapshot?.data;
  } catch (error) {
    console.error(
      'Failed to load wiedza data, using cached version:',
      error,
    );
    const cachedSnapshot = await store.getSnapshot();
    return cachedSnapshot?.data;
  }
}
