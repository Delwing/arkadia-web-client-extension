export interface PersonEntry {
    name: string;
    description: string;
    guild: string;
}

// Local edit event types
export type PersonEditEventType = 'add' | 'replace' | 'ignore';

export interface PersonEditEvent {
    id: string;
    type: PersonEditEventType;
    timestamp: number;
    targetKey?: string; // For 'ignore' and 'replace': `${name}|${description}`
    entry?: PersonEntry; // For 'add' and 'replace': the new entry data
}

export interface PeopleLocalEventsSnapshot {
    events: PersonEditEvent[];
    timestamp: number;
}

// Extended entry with source tracking
export interface PersonListEntry extends PersonEntry {
    source: 'remote' | 'local' | 'edited';
    ignored: boolean;
    originalEntry?: PersonEntry;
    eventId?: string;
}
