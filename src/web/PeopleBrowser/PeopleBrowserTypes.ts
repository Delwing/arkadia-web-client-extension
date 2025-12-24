import type { PersonEntry } from '@client/types/people';

export interface PeopleBrowserQuery {
    searchTerm: string;
    guildFilter: string;
    pageSize: PageSize;
    page: number;
}

export interface PeopleBrowserResult {
    items: PersonEntry[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
    query: PeopleBrowserQuery;
}

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
