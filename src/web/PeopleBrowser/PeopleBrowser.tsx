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
    setPersonNote,
} from '@modules/data/peopleLoader';
import PersonEditModal, { type PersonNote } from './PersonEditModal';
import { Button, Check, HeaderButton, Input, Segmented, Select } from '@web-ui/primitives';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, NotebookPen, Pencil, Search, Undo2, UserPlus, X } from 'lucide-react';

const POPUP_ID = 'popup:peopleBrowser';

const ALL_GUILD_CODES = Object.values(GUILD_CODES_BY_ID).sort();

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
    { value: '', label: 'Wszyscy' },
    { value: 'enemy', label: 'Wrogowie' },
    { value: 'ally', label: 'Sojusznicy' },
];

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

    const handleModalSave = useCallback((entry: PersonEntry, note: PersonNote) => {
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
        // Keyed on the saved name and description, so it lands on the entry as it is after an edit.
        const previousNote = modalMode === 'edit' ? selectedPerson?.note ?? '' : '';
        const previousShow = modalMode === 'edit' ? selectedPerson?.showNoteOnMeet ?? false : false;
        if (note.text !== previousNote || (note.text && note.showOnMeet !== previousShow)) {
            setPersonNote(makePersonKey(entry.name, entry.description), note.text, note.showOnMeet);
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
    const hasFilters = !!(searchTerm || guildFilter || statusFilter || localOnly);
    const resetFilters = useCallback(() => {
        setSearchTerm('');
        setGuildFilter('');
        setStatusFilter('');
        setLocalOnly(false);
    }, [setSearchTerm, setGuildFilter, setStatusFilter, setLocalOnly]);
    const displayTitle = totalCount > 0 ? `Baza postaci (${totalCount})` : 'Baza postaci';

    const headerActions = (
        <HeaderButton onClick={refreshData} disabled={isRefreshing} title="Odśwież bazę postaci">
            {isRefreshing ? 'Odświeżanie...' : 'Odśwież'}
        </HeaderButton>
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
                <div className="people-browser__toolbar">
                    <div className="people-browser__search">
                        <Search className="people-browser__search-icon" size={14} strokeWidth={2} />
                        <Input
                            placeholder="Szukaj po imieniu lub opisie..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                className="people-browser__search-clear"
                                onClick={() => setSearchTerm('')}
                                title="Wyczyść wyszukiwanie"
                            >
                                <X size={14} strokeWidth={2} />
                            </button>
                        )}
                    </div>
                    <Button variant="solid" onClick={handleAddClick} title="Dodaj nową postać">
                        <UserPlus size={15} strokeWidth={2} /> Dodaj
                    </Button>
                </div>

                <div className="people-browser__filters">
                    <div className="people-browser__guild-filter">
                        <Select value={guildFilter} onChange={(e) => setGuildFilter(e.target.value)} title="Gildia">
                            <option value="">Wszystkie gildie</option>
                            {ALL_GUILD_CODES.map((guild) => (
                                <option key={guild} value={guild}>
                                    {guild}
                                </option>
                            ))}
                        </Select>
                    </div>

                    <div className="people-browser__status-filter">
                        <Segmented value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} />
                    </div>

                    <Check
                        className="people-browser__local-only"
                        label="Tylko lokalne"
                        title="Tylko postacie zmienione na tym urządzeniu: dodane, edytowane, ignorowane, wróg, sojusznik, kolor, notatka"
                        checked={localOnly}
                        onChange={(e) => setLocalOnly(e.target.checked)}
                    />
                </div>
            </div>

            <div className="people-browser__content">
                {isLoading ? (
                    <div className="people-browser__loading">Ładowanie...</div>
                ) : !result || result.items.length === 0 ? (
                    <div className="people-browser__empty">
                        {hasFilters ? (
                            <>
                                <span>Brak wyników pasujących do filtrów.</span>
                                <Button size="sm" onClick={resetFilters}>Wyczyść filtry</Button>
                            </>
                        ) : (
                            <span>Brak danych o ludziach.</span>
                        )}
                    </div>
                ) : (
                    <div className="people-browser__list">
                        <div className="people-browser__head">
                            <span>Imię</span>
                            <span>Gildia</span>
                            <span>Opis</span>
                        </div>
                        {result.items.map((person, index) => {
                            const isIgnored = person.ignored;
                            const isLocal = person.source === 'local';
                            const isEdited = person.source === 'edited';
                            const isMarkedEnemy = person.isEnemy;
                            const isMarkedAlly = person.isAlly && !isMarkedEnemy;
                            const hasColor = !!person.color && !isMarkedEnemy;
                            const itemClass = [
                                'people-browser__item',
                                isIgnored && 'people-browser__item--ignored',
                                isMarkedEnemy && 'people-browser__item--enemy',
                                person.isAlly && 'people-browser__item--ally',
                            ].filter(Boolean).join(' ');

                            return (
                                <div
                                    key={`${person.name}-${person.guild}-${person.description}-${index}`}
                                    className={itemClass}
                                    onClick={() => handleEditClick(person)}
                                >
                                    <span className="people-browser__item-name">
                                        {hasColor && (
                                            <span
                                                className="people-browser__swatch"
                                                style={{ backgroundColor: person.color }}
                                                title={`Kolor indywidualny: ${person.color}`}
                                            />
                                        )}
                                        <span
                                            className="people-browser__item-name-text"
                                            style={hasColor ? { color: person.color } : undefined}
                                        >
                                            {person.name}
                                        </span>
                                    </span>
                                    <span className="people-browser__item-guild">{person.guild}</span>
                                    <span className="people-browser__item-desc">
                                        <span className="people-browser__item-desc-text">{person.description}</span>
                                        {person.note && (
                                            <span className="people-browser__note" title={person.note}>
                                                <NotebookPen size={13} strokeWidth={2} />
                                            </span>
                                        )}
                                        {isMarkedEnemy && (
                                            <span className="people-browser__badge people-browser__badge--enemy" title="Oznaczony jako wróg">
                                                wróg
                                            </span>
                                        )}
                                        {isMarkedAlly && (
                                            <span className="people-browser__badge people-browser__badge--ally" title="Oznaczony jako sojusznik">
                                                sojusznik
                                            </span>
                                        )}
                                        {isLocal && (
                                            <span className="people-browser__badge people-browser__badge--local" title="Dodano lokalnie">
                                                lokalna
                                            </span>
                                        )}
                                        {isEdited && (
                                            <span
                                                className="people-browser__badge people-browser__badge--edited"
                                                title={person.originalEntry
                                                    ? `Oryginał: ${person.originalEntry.name} (${person.originalEntry.guild}) - ${person.originalEntry.description}`
                                                    : 'Edytowano lokalnie'}
                                            >
                                                zmieniona
                                            </span>
                                        )}
                                        {isIgnored && (
                                            <span className="people-browser__badge people-browser__badge--ignored" title="Ignorowana: nie tworzy triggerów">
                                                ignorowana
                                            </span>
                                        )}
                                    </span>
                                    <button
                                        type="button"
                                        className="people-browser__item-edit"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleEditClick(person);
                                        }}
                                        title={isIgnored ? 'Przywróć/Edytuj' : 'Edytuj'}
                                    >
                                        {isIgnored ? <Undo2 size={14} strokeWidth={2} /> : <Pencil size={14} strokeWidth={2} />}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="people-browser__footer">
                <span className="people-browser__range">
                    {result && totalCount > 0
                        ? `${result.currentPage * pageSize + 1}–${Math.min(totalCount, (result.currentPage + 1) * pageSize)} z ${totalCount}`
                        : '0 wyników'}
                </span>

                {result && result.totalPages > 1 && (
                    <div className="people-browser__pagination">
                        <Button size="sm" variant="ghost" className="popup-btn--icon" onClick={goToFirstPage} disabled={page === 0} title="Pierwsza strona">
                            <ChevronsLeft size={15} strokeWidth={2} />
                        </Button>
                        <Button size="sm" variant="ghost" className="popup-btn--icon" onClick={goToPrevPage} disabled={page === 0} title="Poprzednia strona">
                            <ChevronLeft size={15} strokeWidth={2} />
                        </Button>
                        <span className="people-browser__pagination-info">
                            Strona {result.currentPage + 1} z {result.totalPages}
                        </span>
                        <Button size="sm" variant="ghost" className="popup-btn--icon" onClick={goToNextPage} disabled={page >= result.totalPages - 1} title="Następna strona">
                            <ChevronRight size={15} strokeWidth={2} />
                        </Button>
                        <Button size="sm" variant="ghost" className="popup-btn--icon" onClick={goToLastPage} disabled={page >= result.totalPages - 1} title="Ostatnia strona">
                            <ChevronsRight size={15} strokeWidth={2} />
                        </Button>
                    </div>
                )}

                <div className="people-browser__page-size">
                    <Select
                        value={pageSize}
                        onChange={(e) => handlePageSizeChange(Number(e.target.value) as PageSize)}
                        title="Liczba postaci na stronie"
                    >
                        {PAGE_SIZE_OPTIONS.map((size) => (
                            <option key={size} value={size}>
                                {size} na stronę
                            </option>
                        ))}
                    </Select>
                </div>
            </div>

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
