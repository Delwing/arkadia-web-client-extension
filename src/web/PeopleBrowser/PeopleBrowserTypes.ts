import type { PersonListEntry } from '@client/types/people';

export type StatusFilter = '' | 'enemy' | 'ally';

export interface PeopleBrowserQuery {
    searchTerm: string;
    guildFilter: string;
    statusFilter: StatusFilter;
    pageSize: PageSize;
    page: number;
    localOnly: boolean;
}

export interface PeopleBrowserResult {
    items: PersonListEntry[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
    query: PeopleBrowserQuery;
}

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
