export interface PersonEntry {
    name: string;
    description: string;
    guild: string;
}

// Local edit event types
export type PersonEditEventType = 'add' | 'replace' | 'ignore' | 'mark-enemy' | 'set-color';

export interface PersonEditEvent {
    id: string;
    type: PersonEditEventType;
    timestamp: number;
    targetKey?: string; // For 'ignore', 'replace', 'mark-enemy', 'set-color': `${name}|${description}`
    entry?: PersonEntry; // For 'add' and 'replace': the new entry data
    color?: string; // For 'set-color': hex color value (e.g., '#ff0000')
}

export interface PeopleLocalEventsSnapshot {
    events: PersonEditEvent[];
    timestamp: number;
}

// Extended entry with source tracking
export interface PersonListEntry extends PersonEntry {
    source: 'remote' | 'local' | 'edited';
    ignored: boolean;
    isEnemy: boolean;
    color?: string; // Individual color override (hex value)
    originalEntry?: PersonEntry;
    eventId?: string;
}
