import {
  getWiedzaStore,
  WiedzaCategory,
  WiedzaApiResponse,
} from '@modules/data/dataStores/wiedzaStore';
import { SubscriptionOptions } from '@modules/data/dataStore/types';

/**
 * Loads wiedza categories from the API or cache.
 * Attempts to refresh data from the server first, falls back to cached data on error.
 *
 * @returns Promise resolving to an array of wiedza categories
 */
export default async function loadWiedza(): Promise<WiedzaCategory[]> {
  const store = getWiedzaStore();

  try {
    const snapshot = await store.refresh();
    if (snapshot?.data.success && snapshot.data.data?.data) {
      return snapshot.data.data.data;
    }
    return [];
  } catch (error) {
    console.error('Failed to load wiedza data, using cached version:', error);
    const cachedSnapshot = await store.getSnapshot();
    if (cachedSnapshot?.data.success && cachedSnapshot.data.data?.data) {
      return cachedSnapshot.data.data.data;
    }
    return [];
  }
}

/**
 * Subscribes to wiedza data changes.
 * The listener will be called whenever the data is updated.
 *
 * @param listener - Callback function to receive wiedza categories
 * @param options - Subscription options (e.g., notifyImmediately)
 * @returns Unsubscribe function to stop listening to changes
 */
export function subscribeToWiedza(
  listener: (categories: WiedzaCategory[] | undefined) => void,
  options?: SubscriptionOptions,
): () => void {
  const store = getWiedzaStore();
  return store.subscribe((snapshot) => {
    if (snapshot?.data.success && snapshot.data.data?.data) {
      listener(snapshot.data.data.data);
    } else {
      listener(undefined);
    }
  }, options);
}

/**
 * Gets the full wiedza API response including success status.
 * Useful when you need access to the complete response structure.
 *
 * @returns Promise resolving to the full API response or undefined
 */
export async function getWiedzaResponse(): Promise<
  WiedzaApiResponse | undefined
> {
  const store = getWiedzaStore();

  try {
    const snapshot = await store.refresh();
    return snapshot?.data;
  } catch (error) {
    console.error(
      'Failed to load wiedza response, using cached version:',
      error,
    );
    const cachedSnapshot = await store.getSnapshot();
    return cachedSnapshot?.data;
  }
}
