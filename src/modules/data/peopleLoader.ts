import { clear, forceRefresh as forceRefreshStore, refresh as refreshStore, subscribe } from './peopleStore';
import type { PersonEntry } from '@client/types/people';

export async function loadPeople(forceRefresh = false): Promise<PersonEntry[]> {
  const snapshot = await (forceRefresh ? forceRefreshStore() : refreshStore());
  if (!snapshot) {
    throw new Error('People database is not available');
  }
  return snapshot as PersonEntry[];
}

export { subscribe, refreshStore as refresh, forceRefreshStore as forceRefresh, clear };
export type { PersonEntry };
