import type { PersonEntry } from '@client/types/people';
import type { PeopleBrowserQuery, PeopleBrowserResult } from './PeopleBrowserTypes';

export class PeopleBrowserService {
    private people: PersonEntry[] = [];

    setData(people: PersonEntry[] | undefined): void {
        this.people = people ?? [];
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
        const { searchTerm, guildFilter, pageSize, page } = query;
        const searchLower = searchTerm.toLowerCase().trim();

        const filtered = this.people.filter((person) => {
            if (guildFilter && person.guild !== guildFilter) {
                return false;
            }

            if (searchLower) {
                const nameLower = person.name.toLowerCase();
                const descLower = person.description.toLowerCase();
                if (!nameLower.includes(searchLower) && !descLower.includes(searchLower)) {
                    return false;
                }
            }

            return true;
        });

        filtered.sort((a, b) => {
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
