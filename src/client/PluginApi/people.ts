import {
  addLocalPerson,
  editPerson,
  deleteLocalPerson,
  ignorePerson,
  restorePerson,
  markAsEnemy,
  unmarkAsEnemy,
  markAsAlly,
  unmarkAsAlly,
  setPersonColor,
  clearPersonColor,
  getMergedSnapshot,
  subscribeMerged,
  refresh as refreshPeople,
  makePersonKey,
  type PersonListEntry,
} from "@modules/data/peopleLoader";
import type { PluginApiContext } from "./context";

/**
 * People API - Manage people database entries
 */
export interface PeopleApi {
  add(entry: { name: string; description: string; guild: string }): void;
  edit(targetKey: string, entry: { name: string; description: string; guild: string }): void;
  remove(eventId: string): void;
  ignore(targetKey: string): void;
  restore(targetKey: string): void;
  markEnemy(targetKey: string): void;
  unmarkEnemy(targetKey: string): void;
  markAlly(targetKey: string): void;
  unmarkAlly(targetKey: string): void;
  setColor(targetKey: string, color: string): void;
  clearColor(targetKey: string): void;
  find(name: string, description: string): PersonListEntry | undefined;
  findByKey(key: string): PersonListEntry | undefined;
  getAll(): PersonListEntry[];
  makeKey(name: string, description: string): string;
  /**
   * Called with the merged people list now (if loaded) and on every change.
   * Returns an unsubscribe function; subscriptions end when the plugin unloads.
   */
  subscribe(listener: (people: PersonListEntry[]) => void): () => void;
  /** Loads the people database if nothing has yet, or refreshes a stale copy. */
  refresh(): Promise<void>;
}

export function createPeopleApi(ctx: PluginApiContext): PeopleApi {
  const peopleUnsubscribers = new Set<() => void>();
  ctx.onCleanup(() => {
    for (const unsubscribe of Array.from(peopleUnsubscribers)) unsubscribe();
  });
  return {
    add: (entry: { name: string; description: string; guild: string }): void => {
      addLocalPerson(entry);
    },

    edit: (targetKey: string, entry: { name: string; description: string; guild: string }): void => {
      editPerson(targetKey, entry);
    },

    remove: (eventId: string): void => {
      deleteLocalPerson(eventId);
    },

    ignore: (targetKey: string): void => {
      ignorePerson(targetKey);
    },

    restore: (targetKey: string): void => {
      restorePerson(targetKey);
    },

    markEnemy: (targetKey: string): void => {
      markAsEnemy(targetKey);
    },

    unmarkEnemy: (targetKey: string): void => {
      unmarkAsEnemy(targetKey);
    },

    markAlly: (targetKey: string): void => {
      markAsAlly(targetKey);
    },

    unmarkAlly: (targetKey: string): void => {
      unmarkAsAlly(targetKey);
    },

    setColor: (targetKey: string, color: string): void => {
      setPersonColor(targetKey, color);
    },

    clearColor: (targetKey: string): void => {
      clearPersonColor(targetKey);
    },

    find: (name: string, description: string): PersonListEntry | undefined => {
      const key = makePersonKey(name, description);
      const snapshot = getMergedSnapshot();
      if (!snapshot) return undefined;
      return snapshot.find((p) => makePersonKey(p.name, p.description) === key);
    },

    findByKey: (key: string): PersonListEntry | undefined => {
      const snapshot = getMergedSnapshot();
      if (!snapshot) return undefined;
      return snapshot.find((p) => makePersonKey(p.name, p.description) === key);
    },

    getAll: (): PersonListEntry[] => {
      return getMergedSnapshot() ?? [];
    },

    makeKey: (name: string, description: string): string => {
      return makePersonKey(name, description);
    },

    subscribe: (listener: (people: PersonListEntry[]) => void): (() => void) => {
      const off = subscribeMerged(people => listener(people ?? []));
      const unsubscribe = () => {
        off();
        peopleUnsubscribers.delete(unsubscribe);
      };
      peopleUnsubscribers.add(unsubscribe);
      return unsubscribe;
    },

    refresh: async (): Promise<void> => {
      await refreshPeople();
    }
  };
}
