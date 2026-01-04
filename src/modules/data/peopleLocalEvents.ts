import type {
    PersonEntry,
    PersonEditEvent,
    PersonListEntry,
    PeopleLocalEventsSnapshot,
} from '@client/types/people';

const STORAGE_KEY = 'peopleLocalEvents';

export function makePersonKey(name: string, description: string): string {
    return `${name.toLowerCase()}|${description.toLowerCase()}`;
}

export function generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function loadLocalEvents(): PeopleLocalEventsSnapshot {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.events)) {
                return parsed as PeopleLocalEventsSnapshot;
            }
        } catch {
            // Invalid data, return empty
        }
    }
    return { events: [], timestamp: 0 };
}

export function saveLocalEvents(snapshot: PeopleLocalEventsSnapshot): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

export function applyLocalEvents(
    remoteEntries: PersonEntry[],
    events: PersonEditEvent[]
): PersonListEntry[] {
    const result = new Map<string, PersonListEntry>();

    // Start with remote entries, marked as source: 'remote'
    for (const entry of remoteEntries) {
        const key = makePersonKey(entry.name, entry.description);
        result.set(key, {
            ...entry,
            source: 'remote',
            ignored: false,
        });
    }

    // Sort events by timestamp
    const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);

    for (const event of sortedEvents) {
        switch (event.type) {
            case 'add': {
                if (!event.entry) break;
                const addKey = makePersonKey(event.entry.name, event.entry.description);
                result.set(addKey, {
                    ...event.entry,
                    source: 'local',
                    ignored: false,
                    eventId: event.id,
                });
                break;
            }

            case 'replace': {
                if (!event.targetKey || !event.entry) break;
                const original = result.get(event.targetKey);
                result.delete(event.targetKey);
                const replaceKey = makePersonKey(event.entry.name, event.entry.description);
                result.set(replaceKey, {
                    ...event.entry,
                    source: 'edited',
                    ignored: false,
                    originalEntry: original
                        ? {
                              name: original.name,
                              description: original.description,
                              guild: original.guild,
                          }
                        : undefined,
                    eventId: event.id,
                });
                break;
            }

            case 'ignore': {
                if (!event.targetKey) break;
                const existing = result.get(event.targetKey);
                if (existing) {
                    result.set(event.targetKey, {
                        ...existing,
                        ignored: true,
                        eventId: event.id,
                    });
                }
                break;
            }
        }
    }

    return Array.from(result.values());
}

// Helper to create events
export function createAddEvent(entry: PersonEntry): PersonEditEvent {
    return {
        id: generateEventId(),
        type: 'add',
        timestamp: Date.now(),
        entry,
    };
}

export function createReplaceEvent(targetKey: string, entry: PersonEntry): PersonEditEvent {
    return {
        id: generateEventId(),
        type: 'replace',
        timestamp: Date.now(),
        targetKey,
        entry,
    };
}

export function createIgnoreEvent(targetKey: string): PersonEditEvent {
    return {
        id: generateEventId(),
        type: 'ignore',
        timestamp: Date.now(),
        targetKey,
    };
}
