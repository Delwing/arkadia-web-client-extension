import {useCallback, useEffect, useMemo, useState} from 'react';
import {loadPeople, subscribeMerged} from '@modules/data/peopleLoader';
import {getPeopleBrowserService} from './PeopleBrowserService';
import type {PageSize, PeopleBrowserResult} from './PeopleBrowserTypes';

interface UsePeopleBrowserDataOptions {
    isOpen: boolean;
}

export function usePeopleBrowserData({ isOpen }: UsePeopleBrowserDataOptions) {
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTermState] = useState('');
    const [guildFilter, setGuildFilterState] = useState('');
    const [localOnly, setLocalOnlyState] = useState(false);
    const [pageSize, setPageSizeState] = useState<PageSize>(20);
    const [page, setPage] = useState(0);
    const [result, setResult] = useState<PeopleBrowserResult | null>(null);
    const [availableGuilds, setAvailableGuilds] = useState<string[]>([]);
    const [dataVersion, setDataVersion] = useState(0);

    const service = useMemo(() => getPeopleBrowserService(), []);

    useEffect(() => {
        if (!isOpen) return;

        setIsLoading(true);

        loadPeople()
            .then(() => {
                setIsLoading(false);
            })
            .catch(() => {
                setIsLoading(false);
            });

        return subscribeMerged(
            (snapshot) => {
                service.setData(snapshot);
                setAvailableGuilds(service.getAvailableGuilds());
                setDataVersion((v) => v + 1);
            }
        );
    }, [isOpen, service]);

    useEffect(() => {
        if (!isOpen) return;

        const query = {
            searchTerm,
            guildFilter,
            localOnly,
            pageSize,
            page,
        };
        setResult(service.query(query));
    }, [isOpen, searchTerm, guildFilter, localOnly, pageSize, page, service, dataVersion]);

    const setSearchTerm = useCallback((value: string) => {
        setSearchTermState(value);
        setPage(0);
    }, []);

    const setGuildFilter = useCallback((value: string) => {
        setGuildFilterState(value);
        setPage(0);
    }, []);

    const setLocalOnly = useCallback((value: boolean) => {
        setLocalOnlyState(value);
        setPage(0);
    }, []);

    const setPageSize = useCallback((value: PageSize) => {
        setPageSizeState(value);
        setPage(0);
    }, []);

    return {
        isLoading,
        result,
        availableGuilds,
        searchTerm,
        guildFilter,
        localOnly,
        pageSize,
        page,
        setSearchTerm,
        setGuildFilter,
        setLocalOnly,
        setPageSize,
        setPage,
        service,
        dataVersion,
    };
}
