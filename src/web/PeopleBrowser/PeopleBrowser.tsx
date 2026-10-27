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
    setPersonLocation,
} from '@modules/data/peopleLoader';
import { PersonPanel, type PersonNote } from './PersonPanel';
import { PersonBadges } from './PersonBadges';
import { describeRoom } from './personLocation';
import { Button, Check, HeaderButton, Input, Segmented, Select } from '@web-ui/primitives';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MapPin, NotebookPen, Search, UserPlus, X } from 'lucide-react';

const POPUP_ID = 'popup:peopleBrowser';

const ALL_GUILD_CODES = Object.values(GUILD_CODES_BY_ID).sort();

type Selection = { mode: 'edit'; key: string } | { mode: 'add' } | null;

const keyOf = (person: { name: string; description: string }) => makePersonKey(person.name, person.description);

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
    } = usePeopleBrowserData({ isOpen });

    const [selection, setSelection] = useState<Selection>(null);
    const selectedKey = selection?.mode === 'edit' ? selection.key : undefined;

    // Derived from current data so the panel reflects live updates (marks, colours, sync).
    const selectedPerson = React.useMemo(() => {
        if (!selectedKey) return undefined;
        return service.findByKey(selectedKey);
    }, [selectedKey, service, dataVersion]);

    // An entry that disappears (deleted here, or by a sync) closes its panel.
    useEffect(() => {
        if (selectedKey && dataVersion > 0 && !selectedPerson) {
            setSelection(null);
        }
    }, [selectedKey, selectedPerson, dataVersion]);

    const closePanel = useCallback(() => setSelection(null), []);

    const handleSave = useCallback((entry: PersonEntry, note: PersonNote, location: number | null) => {
        const previous = selection?.mode === 'edit' ? selectedPerson : undefined;
        if (!previous) {
            addLocalPerson(entry);
        } else if (entry.name !== previous.name || entry.description !== previous.description || entry.guild !== previous.guild) {
            editPerson(keyOf(previous), entry);
        }
        // Keyed on the saved name and description, so it lands on the entry as it is after an edit.
        const savedKey = keyOf(entry);
        if (note.text !== (previous?.note ?? '') || (note.text && note.showOnMeet !== (previous?.showNoteOnMeet ?? false))) {
            setPersonNote(savedKey, note.text, note.showOnMeet);
        }
        if (location !== (previous?.location ?? null)) {
            setPersonLocation(savedKey, location);
        }
        setSelection({ mode: 'edit', key: savedKey });
    }, [selection, selectedPerson]);

    const handleIgnore = useCallback(() => {
        if (selectedKey) ignorePerson(selectedKey);
    }, [selectedKey]);

    const handleRestore = useCallback(() => {
        if (selectedKey) restorePerson(selectedKey);
    }, [selectedKey]);

    const handleDelete = useCallback(() => {
        if (selectedPerson?.eventId) deleteLocalPerson(selectedPerson.eventId);
        setSelection(null);
    }, [selectedPerson]);

    const handleRestoreOriginal = useCallback(() => {
        const original = selectedPerson?.originalEntry;
        if (!original) return;
        // The original entry's key finds and removes the replace event.
        const originalKey = keyOf(original);
        restorePerson(originalKey);
        setSelection({ mode: 'edit', key: originalKey });
    }, [selectedPerson]);

    const handleToggleEnemy = useCallback(() => {
        if (!selectedKey) return;
        if (selectedPerson?.isEnemy) unmarkAsEnemy(selectedKey);
        else markAsEnemy(selectedKey);
    }, [selectedKey, selectedPerson]);

    const handleToggleAlly = useCallback(() => {
        if (!selectedKey) return;
        if (selectedPerson?.isAlly) unmarkAsAlly(selectedKey);
        else markAsAlly(selectedKey);
    }, [selectedKey, selectedPerson]);

    const handleSetColor = useCallback((color: string) => {
        if (selectedKey) setPersonColor(selectedKey, color);
    }, [selectedKey]);

    const handleClearColor = useCallback(() => {
        if (selectedKey) clearPersonColor(selectedKey);
    }, [selectedKey]);

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
    const displayTitle = statusCounts.all > 0 ? `Baza postaci (${statusCounts.all})` : 'Baza postaci';

    const statusOptions: { value: StatusFilter; label: React.ReactNode }[] = [
        { value: '', label: <>Wszyscy <span className="people-browser__count">{statusCounts.all}</span></> },
        { value: 'enemy', label: <>Wrogowie <span className="people-browser__count">{statusCounts.enemy}</span></> },
        { value: 'ally', label: <>Sojusznicy <span className="people-browser__count">{statusCounts.ally}</span></> },
    ];

    const headerActions = (
        <HeaderButton onClick={refreshData} disabled={isRefreshing} title="Odśwież bazę postaci">
            {isRefreshing ? 'Odświeżanie...' : 'Odśwież'}
        </HeaderButton>
    );

    const panelOpen = selection?.mode === 'add' || !!selectedPerson;

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="peopleBrowser"
            title={displayTitle}
            headerActions={headerActions}
            minWidth={320}
            minHeight={300}
            initialWidth={820}
            initialHeight={520}
            className="people-browser"
            bodyClassName={panelOpen ? 'people-browser-body people-browser-body--panel-open' : 'people-browser-body'}
        >
            <div className="people-browser__controls">
                <div className="people-browser__search">
                    <Search className="people-browser__search-icon" size={14} strokeWidth={2} />
                    <Input
                        placeholder="Szukaj po imieniu, opisie lub lokacji..."
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
                        <Segmented size="sm" value={statusFilter} onChange={setStatusFilter} options={statusOptions} />
                    </div>

                    <Check
                        className="people-browser__local-only"
                        label="Tylko lokalne"
                        title="Tylko postacie zmienione na tym urządzeniu: dodane, edytowane, ignorowane, wróg, sojusznik, kolor, notatka, lokacja"
                        checked={localOnly}
                        onChange={(e) => setLocalOnly(e.target.checked)}
                    />
                </div>

                <Button
                    variant="solid"
                    className="people-browser__add"
                    onClick={() => setSelection({ mode: 'add' })}
                    title="Dodaj nową postać"
                >
                    <UserPlus size={15} strokeWidth={2} /> Dodaj
                </Button>
            </div>

            <div className="people-browser__main">
                <div className="people-browser__list-pane">
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
                                    <span>Lokacja</span>
                                    <span />
                                </div>
                                {result.items.map((person, index) => (
                                    <PersonRow
                                        key={`${person.name}-${person.guild}-${person.description}-${index}`}
                                        person={person}
                                        selected={selectedKey === keyOf(person)}
                                        onSelect={() => setSelection({ mode: 'edit', key: keyOf(person) })}
                                    />
                                ))}
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
                </div>

                <div className="people-browser__panel-pane">
                    {panelOpen ? (
                        <PersonPanel
                            key={selectedKey ?? 'new'}
                            mode={selection?.mode === 'add' ? 'add' : 'edit'}
                            person={selectedPerson}
                            onSave={handleSave}
                            onClose={closePanel}
                            onIgnore={handleIgnore}
                            onRestore={handleRestore}
                            onRestoreOriginal={handleRestoreOriginal}
                            onDelete={handleDelete}
                            onToggleEnemy={handleToggleEnemy}
                            onToggleAlly={handleToggleAlly}
                            onSetColor={handleSetColor}
                            onClearColor={handleClearColor}
                        />
                    ) : (
                        <div className="people-browser__panel-empty">
                            Wybierz postać z listy, żeby zobaczyć szczegóły, albo dodaj nową.
                        </div>
                    )}
                </div>
            </div>
        </DockablePopupWrapper>
    );
};

const PersonRow: React.FC<{ person: PersonListEntry; selected: boolean; onSelect: () => void }> = ({ person, selected, onSelect }) => {
    const isMarkedEnemy = person.isEnemy;
    const hasColor = !!person.color && !isMarkedEnemy;
    const room = person.location !== undefined ? describeRoom(person.location) : null;
    const locationLabel = person.location !== undefined ? (room?.name ?? `#${person.location}`) : null;
    const locationTitle = person.location !== undefined
        ? `${room ? `${room.name} (${room.area}) ` : ''}#${person.location}`
        : undefined;
    const itemClass = [
        'people-browser__item',
        selected && 'people-browser__item--selected',
        person.ignored && 'people-browser__item--ignored',
        isMarkedEnemy && 'people-browser__item--enemy',
        person.isAlly && 'people-browser__item--ally',
    ].filter(Boolean).join(' ');

    return (
        <div
            className={itemClass}
            tabIndex={0}
            onClick={onSelect}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect();
                }
            }}
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
                <span className="people-browser__guild people-browser__guild--inline">{person.guild}</span>
            </span>
            <span className="people-browser__item-guild">
                <span className="people-browser__guild">{person.guild}</span>
            </span>
            <span className="people-browser__item-desc">
                <span className="people-browser__item-desc-text">{person.description}</span>
                {locationLabel && (
                    <span className="people-browser__item-loc people-browser__item-loc--inline" title={locationTitle}>
                        <MapPin size={12} strokeWidth={2} />{locationLabel}
                    </span>
                )}
            </span>
            <span className="people-browser__item-location">
                {locationLabel && (
                    <span className="people-browser__item-loc" title={locationTitle}>
                        <MapPin size={12} strokeWidth={2} /><span>{locationLabel}</span>
                    </span>
                )}
            </span>
            <span className="people-browser__item-flags">
                {person.note && (
                    <span className="people-browser__note" title={person.note}>
                        <NotebookPen size={13} strokeWidth={2} />
                    </span>
                )}
                <PersonBadges person={person} />
            </span>
        </div>
    );
};

export default PeopleBrowser;
