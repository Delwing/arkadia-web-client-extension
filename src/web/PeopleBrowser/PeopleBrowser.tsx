import React, { useCallback, useEffect, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from '../layout/components/DockablePopupWrapper';
import { usePopup } from '../hooks/usePopup';
import { usePopupSetting } from '../hooks/usePopupSetting';
import { usePeopleBrowserData } from './usePeopleBrowserData';
import { PAGE_SIZE_OPTIONS, type PageSize, type StatusFilter } from './PeopleBrowserTypes';
import { GUILD_CODES_BY_ID } from '@modules/data/peopleGuilds';
import type { PersonEntry, PersonListEntry } from '@client/types/people';
import {
    addLocalPerson,
    editPerson,
    ignorePerson,
    restorePerson,
    deleteLocalPerson,
    makePersonKey,
    markAsEnemy,
    unmarkAsEnemy,
    markAsAlly,
    unmarkAsAlly,
    setPersonColor,
    clearPersonColor,
} from '@modules/data/peopleLoader';
import PersonEditModal from './PersonEditModal';

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
    } = usePeopleBrowserData({ isOpen });

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
    const [selectedPersonKey, setSelectedPersonKey] = useState<string | undefined>();

    // Derive selectedPerson from current data so it reflects live updates (e.g., color changes)
    const selectedPerson = React.useMemo(() => {
        if (!selectedPersonKey) return undefined;
        return service.findByKey(selectedPersonKey);
    }, [selectedPersonKey, service, dataVersion]);

    const handleAddClick = useCallback(() => {
        setSelectedPersonKey(undefined);
        setModalMode('add');
        setShowModal(true);
    }, []);

    const handleEditClick = useCallback((person: PersonListEntry) => {
        setSelectedPersonKey(makePersonKey(person.name, person.description));
        setModalMode('edit');
        setShowModal(true);
    }, []);

    const handleModalClose = useCallback(() => {
        setShowModal(false);
        setSelectedPersonKey(undefined);
    }, []);

    const handleModalSave = useCallback((entry: PersonEntry) => {
        if (modalMode === 'add') {
            addLocalPerson(entry);
        } else if (selectedPerson) {
            const changed = entry.name !== selectedPerson.name
                || entry.description !== selectedPerson.description
                || entry.guild !== selectedPerson.guild;
            if (changed) {
                const targetKey = makePersonKey(selectedPerson.name, selectedPerson.description);
                editPerson(targetKey, entry);
            }
        }
        handleModalClose();
    }, [modalMode, selectedPerson, handleModalClose]);

    const handleIgnore = useCallback(() => {
        if (selectedPerson) {
            const targetKey = makePersonKey(selectedPerson.name, selectedPerson.description);
            ignorePerson(targetKey);
        }
        handleModalClose();
    }, [selectedPerson, handleModalClose]);

    const handleRestore = useCallback(() => {
        if (selectedPerson) {
            const targetKey = makePersonKey(selectedPerson.name, selectedPerson.description);
            restorePerson(targetKey);
        }
        handleModalClose();
    }, [selectedPerson, handleModalClose]);

    const handleDelete = useCallback(() => {
        if (selectedPerson?.eventId) {
            deleteLocalPerson(selectedPerson.eventId);
        }
        handleModalClose();
    }, [selectedPerson, handleModalClose]);

    const handleRestoreOriginal = useCallback(() => {
        if (selectedPerson?.originalEntry) {
            // Use the original entry's key to find and remove the replace event
            const originalKey = makePersonKey(
                selectedPerson.originalEntry.name,
                selectedPerson.originalEntry.description
            );
            restorePerson(originalKey);
        }
        handleModalClose();
    }, [selectedPerson, handleModalClose]);

    const handleMarkEnemy = useCallback(() => {
        if (selectedPersonKey) {
            markAsEnemy(selectedPersonKey);
        }
    }, [selectedPersonKey]);

    const handleUnmarkEnemy = useCallback(() => {
        if (selectedPersonKey) {
            unmarkAsEnemy(selectedPersonKey);
        }
    }, [selectedPersonKey]);

    const handleMarkAlly = useCallback(() => {
        if (selectedPersonKey) {
            markAsAlly(selectedPersonKey);
        }
    }, [selectedPersonKey]);

    const handleUnmarkAlly = useCallback(() => {
        if (selectedPersonKey) {
            unmarkAsAlly(selectedPersonKey);
        }
    }, [selectedPersonKey]);

    const handleSetColor = useCallback((color: string) => {
        if (selectedPersonKey) {
            setPersonColor(selectedPersonKey, color);
        }
    }, [selectedPersonKey]);

    const handleClearColor = useCallback(() => {
        if (selectedPersonKey) {
            clearPersonColor(selectedPersonKey);
        }
    }, [selectedPersonKey]);

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

    const headerActions = (
        <button
            type="button"
            className={`people-browser__refresh${isRefreshing ? ' people-browser__refresh--active' : ''}`}
            onClick={refreshData}
            disabled={isRefreshing}
            title="Odswiez baze postaci"
        >
            {isRefreshing ? 'Odswiezanie...' : 'Odswiez'}
        </button>
    );

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="peopleBrowser"
            title={displayTitle}
            headerActions={headerActions}
            minWidth={400}
            minHeight={300}
            initialWidth={550}
            initialHeight={500}
            className="people-browser"
            bodyClassName="people-browser-body"
        >
            <div className="people-browser__controls">
                <button
                    type="button"
                    className="popup-btn popup-btn--success"
                    onClick={handleAddClick}
                    title="Dodaj nowa postac"
                >
                    + Dodaj
                </button>

                <div className="people-browser__search">
                    <input
                        type="text"
                        className="popup-input"
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
                        className="popup-input"
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

                <div className="people-browser__status-filter">
                    <select
                        className="popup-input"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    >
                        <option value="">Wszyscy</option>
                        <option value="enemy">Wrogowie</option>
                        <option value="ally">Sojusznicy</option>
                    </select>
                </div>

                <div className="people-browser__local-only">
                    <label className="people-browser__local-only-label">
                        <input
                            type="checkbox"
                            checked={localOnly}
                            onChange={(e) => setLocalOnly(e.target.checked)}
                        />
                        <span>Tylko lokalne</span>
                    </label>
                </div>

                <div className="people-browser__page-size">
                    <select
                        className="popup-input"
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
                        {searchTerm || guildFilter || statusFilter
                            ? 'Brak wynikow pasujacych do filtrow.'
                            : 'Brak danych o ludziach.'}
                    </div>
                ) : (
                    <div className="people-browser__list">
                        {result.items.map((person, index) => {
                            const isIgnored = person.ignored;
                            const isLocal = person.source === 'local';
                            const isEdited = person.source === 'edited';
                            const isMarkedEnemy = person.isEnemy;
                            const isMarkedAlly = person.isAlly;
                            const hasColor = !!person.color;

                            return (
                                <div
                                    key={`${person.name}-${person.guild}-${person.description}-${index}`}
                                    className={`people-browser__item ${isIgnored ? 'people-browser__item--ignored' : ''} ${isMarkedEnemy ? 'people-browser__item--enemy' : ''} ${isMarkedAlly ? 'people-browser__item--ally' : ''}`}
                                >
                                    <span className="people-browser__item-name" style={hasColor && !isMarkedEnemy ? { color: person.color } : undefined}>
                                        {person.name}
                                        {isMarkedEnemy && (
                                            <span
                                                className="people-browser__badge people-browser__badge--enemy"
                                                title="Oznaczony jako wrog"
                                            >
                                                !
                                            </span>
                                        )}
                                        {isMarkedAlly && !isMarkedEnemy && (
                                            <span
                                                className="people-browser__badge people-browser__badge--ally"
                                                title="Oznaczony jako sojusznik"
                                            >
                                                ♦
                                            </span>
                                        )}
                                        {hasColor && !isMarkedEnemy && (
                                            <span
                                                className="people-browser__badge people-browser__badge--color"
                                                style={{ backgroundColor: person.color }}
                                                title={`Kolor indywidualny: ${person.color}`}
                                            />
                                        )}
                                        {isLocal && (
                                            <span
                                                className="people-browser__badge people-browser__badge--local"
                                                title="Dodano lokalnie"
                                            >
                                                +
                                            </span>
                                        )}
                                        {isEdited && (
                                            <span
                                                className="people-browser__badge people-browser__badge--edited"
                                                title={person.originalEntry
                                                    ? `Oryginal: ${person.originalEntry.name} (${person.originalEntry.guild}) - ${person.originalEntry.description}`
                                                    : 'Edytowano lokalnie'}
                                            >
                                                *
                                            </span>
                                        )}
                                    </span>
                                    <span className="people-browser__item-guild">{person.guild}</span>
                                    <span className="people-browser__item-desc">{person.description}</span>
                                    <span className="people-browser__item-actions">
                                        <button
                                            type="button"
                                            className="people-browser__item-edit"
                                            onClick={() => handleEditClick(person)}
                                            title={isIgnored ? 'Przywroc/Edytuj' : 'Edytuj'}
                                        >
                                            {isIgnored ? '↩' : '✎'}
                                        </button>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {result && result.totalPages > 1 && (
                <div className="people-browser__pagination">
                    <button
                        type="button"
                        className="people-browser__page-btn"
                        onClick={goToFirstPage}
                        disabled={page === 0}
                        title="Pierwsza strona"
                    >
                        &laquo;
                    </button>
                    <button
                        type="button"
                        className="people-browser__page-btn"
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
                        className="people-browser__page-btn"
                        onClick={goToNextPage}
                        disabled={page >= result.totalPages - 1}
                        title="Nastepna strona"
                    >
                        &rsaquo;
                    </button>
                    <button
                        type="button"
                        className="people-browser__page-btn"
                        onClick={goToLastPage}
                        disabled={page >= result.totalPages - 1}
                        title="Ostatnia strona"
                    >
                        &raquo;
                    </button>
                </div>
            )}

            <PersonEditModal
                show={showModal}
                onClose={handleModalClose}
                onSave={handleModalSave}
                onIgnore={handleIgnore}
                onRestore={handleRestore}
                onRestoreOriginal={handleRestoreOriginal}
                onDelete={handleDelete}
                onMarkEnemy={handleMarkEnemy}
                onUnmarkEnemy={handleUnmarkEnemy}
                onMarkAlly={handleMarkAlly}
                onUnmarkAlly={handleUnmarkAlly}
                onSetColor={handleSetColor}
                onClearColor={handleClearColor}
                person={selectedPerson}
                mode={modalMode}
            />
        </DockablePopupWrapper>
    );
};

export default PeopleBrowser;
