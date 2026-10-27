import type { PersonListEntry } from '@client/types/people';
import type { PeopleBrowserQuery, PeopleBrowserResult } from './PeopleBrowserTypes';
import { makePersonKey } from '@modules/data/peopleLoader';

/** Anything the user did to the entry on this device: added, edited, ignored, marked, coloured, noted or located. */
function hasLocalChanges(person: PersonListEntry): boolean {
    return person.source !== 'remote'
        || person.ignored
        || person.isEnemy
        || person.isAlly
        || !!person.color
        || !!person.note
        || person.location !== undefined;
}

export interface StatusCounts {
    all: number;
    enemy: number;
    ally: number;
}

export class PeopleBrowserService {
    private people: PersonListEntry[] = [];
    private locationName: (roomId: number) => string | undefined = () => undefined;

    /** How a room id reads in search, so typing a room's name finds the people placed there. */
    setLocationResolver(resolver: (roomId: number) => string | undefined): void {
        this.locationName = resolver;
    }

    setData(people: PersonListEntry[] | undefined): void {
        this.people = people ?? [];
    }

    findByKey(key: string): PersonListEntry | undefined {
        return this.people.find(p => makePersonKey(p.name, p.description) === key);
    }

    getStatusCounts(): StatusCounts {
        let enemy = 0;
        let ally = 0;
        for (const person of this.people) {
            if (person.isEnemy) enemy++;
            if (person.isAlly) ally++;
        }
        return { all: this.people.length, enemy, ally };
    }

    getAvailableGuilds(): string[] {
        const guilds = new Set<string>();
        for (const person of this.people) {
            if (person.guild) {
                guilds.add(person.guild);
            }
        }
        return Array.from(guilds).sort();
    }

    query(query: PeopleBrowserQuery): PeopleBrowserResult {
        const { searchTerm, guildFilter, statusFilter, pageSize, page, localOnly } = query;
        const searchLower = searchTerm.toLowerCase().trim();

        const filtered = this.people.filter((person) => {
            if (localOnly && !hasLocalChanges(person)) {
                return false;
            }

            if (guildFilter && person.guild !== guildFilter) {
                return false;
            }

            if (statusFilter === 'enemy' && !person.isEnemy) {
                return false;
            }

            if (statusFilter === 'ally' && !person.isAlly) {
                return false;
            }

            if (searchLower) {
                const nameLower = person.name.toLowerCase();
                const descLower = person.description.toLowerCase();
                if (!nameLower.includes(searchLower) && !descLower.includes(searchLower)
                    && !this.matchesLocation(person, searchLower)) {
                    return false;
                }
            }

            return true;
        });

        filtered.sort((a, b) => {
            // Sort ignored entries to the end
            if (a.ignored !== b.ignored) {
                return a.ignored ? 1 : -1;
            }
            const nameCompare = a.name.localeCompare(b.name);
            if (nameCompare !== 0) return nameCompare;
            return a.description.localeCompare(b.description);
        });

        const totalCount = filtered.length;
        const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
        const safePage = Math.min(Math.max(0, page), totalPages - 1);
        const startIndex = safePage * pageSize;
        const items = filtered.slice(startIndex, startIndex + pageSize);

        return {
            items,
            totalCount,
            totalPages,
            currentPage: safePage,
            query: { ...query, page: safePage },
        };
    }

    private matchesLocation(person: PersonListEntry, searchLower: string): boolean {
        if (person.location === undefined) return false;
        if (String(person.location) === searchLower.replace(/^#/, '')) return true;
        return !!this.locationName(person.location)?.toLowerCase().includes(searchLower);
    }

    getTotalCount(): number {
        return this.people.length;
    }
}

let serviceInstance: PeopleBrowserService | null = null;

export function getPeopleBrowserService(): PeopleBrowserService {
    if (!serviceInstance) {
        serviceInstance = new PeopleBrowserService();
    }
    return serviceInstance;
}
