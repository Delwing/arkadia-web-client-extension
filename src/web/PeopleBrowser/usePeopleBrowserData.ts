import {useCallback, useEffect, useMemo, useState} from 'react';
import {loadPeople, subscribeMerged} from '@modules/data/peopleLoader';
import {getPeopleBrowserService, type StatusCounts} from './PeopleBrowserService';
import {subscribeEmbeddedMap} from '../embedRegistry';
import {describeRoom} from './personLocation';
import type {PageSize, PeopleBrowserResult, StatusFilter} from './PeopleBrowserTypes';

interface UsePeopleBrowserDataOptions {
    isOpen: boolean;
}

export function usePeopleBrowserData({ isOpen }: UsePeopleBrowserDataOptions) {
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTermState] = useState('');
    const [guildFilter, setGuildFilterState] = useState('');
    const [statusFilter, setStatusFilterState] = useState<StatusFilter>('');
    const [localOnly, setLocalOnlyState] = useState(false);
    const [pageSize, setPageSizeState] = useState<PageSize>(20);
    const [page, setPage] = useState(0);
    const [result, setResult] = useState<PeopleBrowserResult | null>(null);
    const [availableGuilds, setAvailableGuilds] = useState<string[]>([]);
    const [statusCounts, setStatusCounts] = useState<StatusCounts>({ all: 0, enemy: 0, ally: 0 });
    const [dataVersion, setDataVersion] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);

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
                setStatusCounts(service.getStatusCounts());
                setDataVersion((v) => v + 1);
            }
        );
    }, [isOpen, service]);

    // Room names come from the map, which may load after the people do.
    useEffect(() => {
        if (!isOpen) return;
        service.setLocationResolver((roomId) => describeRoom(roomId)?.name);
        return subscribeEmbeddedMap(() => setDataVersion((v) => v + 1));
    }, [isOpen, service]);

    useEffect(() => {
        if (!isOpen) return;

        const query = {
            searchTerm,
            guildFilter,
            statusFilter,
            localOnly,
            pageSize,
            page,
        };
        setResult(service.query(query));
    }, [isOpen, searchTerm, guildFilter, statusFilter, localOnly, pageSize, page, service, dataVersion]);

    const setSearchTerm = useCallback((value: string) => {
        setSearchTermState(value);
        setPage(0);
    }, []);

    const setGuildFilter = useCallback((value: string) => {
        setGuildFilterState(value);
        setPage(0);
    }, []);

    const setStatusFilter = useCallback((value: StatusFilter) => {
        setStatusFilterState(value);
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

    const refreshData = useCallback(() => {
        setIsRefreshing(true);
        loadPeople(true)
            .finally(() => {
                setIsRefreshing(false);
            });
    }, []);

    return {
        isLoading,
        result,
        availableGuilds,
        statusCounts,
        searchTerm,
        guildFilter,
        statusFilter,
        localOnly,
        pageSize,
        page,
        setSearchTerm,
        setGuildFilter,
        setStatusFilter,
        setLocalOnly,
        setPageSize,
        setPage,
        service,
        dataVersion,
        isRefreshing,
        refreshData,
    };
}
