import type { PersonEntry } from './types/people';
import { clear, forceRefresh as forceRefreshStore, refresh as refreshStore, subscribe } from './peopleStore';

export async function loadPeople(forceRefresh = false): Promise<PersonEntry[]> {
  const snapshot = await (forceRefresh ? forceRefreshStore() : refreshStore());
  if (!snapshot) {
    throw new Error('People database is not available');
  }
  return snapshot;
}

export { subscribe, refreshStore as refresh, forceRefreshStore as forceRefresh, clear };
export type { PersonEntry } from './types/people';
