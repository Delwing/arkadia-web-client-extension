import {
    clear,
    forceRefresh as forceRefreshStore,
    refresh as refreshStore,
    subscribe as subscribeRemote,
} from './peopleStore';
import type {
    PersonEntry,
    PersonListEntry,
    PersonEditEvent,
    PeopleLocalEventsSnapshot,
} from '@client/types/people';
import {
    applyLocalEvents,
    loadLocalEvents,
    saveLocalEvents,
    makePersonKey,
    createAddEvent,
    createReplaceEvent,
    createIgnoreEvent,
} from './peopleLocalEvents';

type MergedListener = (snapshot: PersonListEntry[] | undefined) => void;

// In-memory state
let remoteData: PersonEntry[] | undefined;
let localEventsSnapshot: PeopleLocalEventsSnapshot = loadLocalEvents();
let mergedData: PersonListEntry[] | undefined;
const mergedListeners = new Set<MergedListener>();

function recomputeMerged() {
    if (remoteData) {
        mergedData = applyLocalEvents(remoteData, localEventsSnapshot.events);
    } else {
        mergedData = undefined;
    }
    notifyMergedListeners();
}

function notifyMergedListeners() {
    mergedListeners.forEach((listener) => listener(mergedData));
}

// Subscribe to remote store changes
let remoteUnsubscribe: (() => void) | undefined;

function ensureRemoteSubscription() {
    if (remoteUnsubscribe) return;
    remoteUnsubscribe = subscribeRemote((snapshot) => {
        remoteData = snapshot;
        recomputeMerged();
    });
}

// Listen for localStorage changes from other tabs
if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
        if (event.key === 'peopleLocalEvents') {
            localEventsSnapshot = loadLocalEvents();
            recomputeMerged();
        }
    });
}

// --- Public API ---

export async function loadPeople(forceRefresh = false): Promise<PersonEntry[]> {
    const snapshot = await (forceRefresh ? forceRefreshStore() : refreshStore());
    if (!snapshot) {
        throw new Error('People database is not available');
    }
    return snapshot as PersonEntry[];
}

/**
 * Subscribe to merged people data (remote + local edits applied)
 */
export function subscribeMerged(listener: MergedListener): () => void {
    ensureRemoteSubscription();
    mergedListeners.add(listener);

    // Immediately notify with current state
    if (mergedData !== undefined) {
        listener(mergedData);
    }

    return () => {
        mergedListeners.delete(listener);
    };
}

/**
 * Get current merged data synchronously (may be undefined if not loaded)
 */
export function getMergedSnapshot(): PersonListEntry[] | undefined {
    return mergedData;
}

/**
 * Get all local edit events
 */
export function getLocalEvents(): PersonEditEvent[] {
    return localEventsSnapshot.events;
}

/**
 * Add a new person entry locally
 */
export function addLocalPerson(entry: PersonEntry): void {
    const event = createAddEvent(entry);
    localEventsSnapshot = {
        events: [...localEventsSnapshot.events, event],
        timestamp: Date.now(),
    };
    saveLocalEvents(localEventsSnapshot);
    recomputeMerged();
}

/**
 * Edit an existing person entry (creates a replace event)
 */
export function editPerson(targetKey: string, newEntry: PersonEntry): void {
    // Remove any existing events for this target (to allow re-editing)
    const filteredEvents = localEventsSnapshot.events.filter(
        (e) => e.targetKey !== targetKey || e.type === 'add'
    );
    const event = createReplaceEvent(targetKey, newEntry);
    localEventsSnapshot = {
        events: [...filteredEvents, event],
        timestamp: Date.now(),
    };
    saveLocalEvents(localEventsSnapshot);
    recomputeMerged();
}

/**
 * Mark a person entry as ignored (no triggers created)
 */
export function ignorePerson(targetKey: string): void {
    // Remove any existing non-add events for this target
    const filteredEvents = localEventsSnapshot.events.filter(
        (e) => e.targetKey !== targetKey || e.type === 'add'
    );
    const event = createIgnoreEvent(targetKey);
    localEventsSnapshot = {
        events: [...filteredEvents, event],
        timestamp: Date.now(),
    };
    saveLocalEvents(localEventsSnapshot);
    recomputeMerged();
}

/**
 * Restore a person entry (remove ignore/replace events for it)
 */
export function restorePerson(targetKey: string): void {
    const filteredEvents = localEventsSnapshot.events.filter(
        (e) => e.targetKey !== targetKey
    );
    if (filteredEvents.length === localEventsSnapshot.events.length) {
        return; // No changes
    }
    localEventsSnapshot = {
        events: filteredEvents,
        timestamp: Date.now(),
    };
    saveLocalEvents(localEventsSnapshot);
    recomputeMerged();
}

/**
 * Remove a local event by ID (reverts that specific change)
 */
export function removeLocalEvent(eventId: string): void {
    const filteredEvents = localEventsSnapshot.events.filter((e) => e.id !== eventId);
    if (filteredEvents.length === localEventsSnapshot.events.length) {
        return; // No changes
    }
    localEventsSnapshot = {
        events: filteredEvents,
        timestamp: Date.now(),
    };
    saveLocalEvents(localEventsSnapshot);
    recomputeMerged();
}

/**
 * Delete a locally added person (removes the add event)
 */
export function deleteLocalPerson(eventId: string): void {
    removeLocalEvent(eventId);
}

/**
 * Clear all local events
 */
export function clearLocalEvents(): void {
    localEventsSnapshot = { events: [], timestamp: Date.now() };
    saveLocalEvents(localEventsSnapshot);
    recomputeMerged();
}

// Re-export from store
export { subscribeRemote as subscribe, refreshStore as refresh, forceRefreshStore as forceRefresh, clear };
export type { PersonEntry, PersonListEntry };
export { makePersonKey };
