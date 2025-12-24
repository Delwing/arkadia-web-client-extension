import React, { useCallback, useEffect } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from '../layout/components/DockablePopupWrapper';
import { usePopup } from '../hooks/usePopup';
import { usePopupSetting } from '../hooks/usePopupSetting';
import { usePeopleBrowserData } from './usePeopleBrowserData';
import { PAGE_SIZE_OPTIONS, type PageSize } from './PeopleBrowserTypes';
import { GUILD_CODES_BY_ID } from '@modules/data/peopleGuilds';

const POPUP_ID = 'popup:peopleBrowser';

const ALL_GUILD_CODES = Object.values(GUILD_CODES_BY_ID).sort();

const PeopleBrowser: React.FC = () => {
    const { wrapperProps, setIsOpen, isOpen } = usePopup(POPUP_ID);

    const [persistedPageSize, setPersistedPageSize] = usePopupSetting<PageSize>(
        POPUP_ID,
        'pageSize',
        20
    );

    const {
        isLoading,
        result,
        searchTerm,
        guildFilter,
        pageSize,
        page,
        setSearchTerm,
        setGuildFilter,
        setPageSize,
        setPage,
    } = usePeopleBrowserData({ isOpen });

    useEffect(() => {
        if (isOpen) {
            setPageSize(persistedPageSize);
        }
    }, [isOpen, persistedPageSize, setPageSize]);

    const handlePageSizeChange = useCallback(
        (newSize: PageSize) => {
            setPageSize(newSize);
            setPersistedPageSize(newSize);
        },
        [setPageSize, setPersistedPageSize]
    );

    useEffect(() => {
        const handleOpen = () => {
            setIsOpen(true);
        };

        eventBus.on('peopleBrowser.popup.open', handleOpen);

        return () => {
            eventBus.off('peopleBrowser.popup.open', handleOpen);
        };
    }, [setIsOpen]);

    const goToFirstPage = useCallback(() => setPage(0), [setPage]);
    const goToPrevPage = useCallback(() => setPage(Math.max(0, page - 1)), [setPage, page]);
    const goToNextPage = useCallback(() => {
        if (result) {
            setPage(Math.min(result.totalPages - 1, page + 1));
        }
    }, [setPage, page, result]);
    const goToLastPage = useCallback(() => {
        if (result) {
            setPage(result.totalPages - 1);
        }
    }, [setPage, result]);

    const totalCount = result?.totalCount ?? 0;
    const displayTitle = totalCount > 0 ? `Baza postaci (${totalCount})` : 'Baza postaci';

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="peopleBrowser"
            title={displayTitle}
            minWidth={400}
            minHeight={300}
            initialWidth={550}
            initialHeight={500}
            className="people-browser"
            bodyClassName="people-browser-body"
        >
            <div className="people-browser__controls">
                <div className="people-browser__search">
                    <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder="Szukaj po nazwie lub opisie..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <button
                            type="button"
                            className="people-browser__search-clear"
                            onClick={() => setSearchTerm('')}
                        >
                            X
                        </button>
                    )}
                </div>

                <div className="people-browser__guild-filter">
                    <select
                        className="form-select form-select-sm"
                        value={guildFilter}
                        onChange={(e) => setGuildFilter(e.target.value)}
                    >
                        <option value="">Wszystkie gildie</option>
                        {ALL_GUILD_CODES.map((guild) => (
                            <option key={guild} value={guild}>
                                {guild}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="people-browser__page-size">
                    <select
                        className="form-select form-select-sm"
                        value={pageSize}
                        onChange={(e) => handlePageSizeChange(Number(e.target.value) as PageSize)}
                    >
                        {PAGE_SIZE_OPTIONS.map((size) => (
                            <option key={size} value={size}>
                                {size} na strone
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="people-browser__content">
                {isLoading ? (
                    <div className="people-browser__loading">Ladowanie...</div>
                ) : !result || result.items.length === 0 ? (
                    <div className="people-browser__empty">
                        {searchTerm || guildFilter
                            ? 'Brak wynikow pasujacych do filtrow.'
                            : 'Brak danych o ludziach.'}
                    </div>
                ) : (
                    <div className="people-browser__list">
                        {result.items.map((person, index) => (
                            <div
                                key={`${person.name}-${person.guild}-${person.description}-${index}`}
                                className="people-browser__item"
                            >
                                <span className="people-browser__item-name">{person.name}</span>
                                <span className="people-browser__item-guild">{person.guild}</span>
                                <span className="people-browser__item-desc">{person.description}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {result && result.totalPages > 1 && (
                <div className="people-browser__pagination">
                    <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={goToFirstPage}
                        disabled={page === 0}
                        title="Pierwsza strona"
                    >
                        &laquo;
                    </button>
                    <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={goToPrevPage}
                        disabled={page === 0}
                        title="Poprzednia strona"
                    >
                        &lsaquo;
                    </button>
                    <span className="people-browser__pagination-info">
                        Strona {result.currentPage + 1} z {result.totalPages}
                    </span>
                    <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={goToNextPage}
                        disabled={page >= result.totalPages - 1}
                        title="Nastepna strona"
                    >
                        &rsaquo;
                    </button>
                    <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={goToLastPage}
                        disabled={page >= result.totalPages - 1}
                        title="Ostatnia strona"
                    >
                        &raquo;
                    </button>
                </div>
            )}
        </DockablePopupWrapper>
    );
};

export default PeopleBrowser;
