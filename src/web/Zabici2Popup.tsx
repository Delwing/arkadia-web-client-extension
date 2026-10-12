import React, {useEffect, useState, useMemo, useCallback} from 'react';
import eventBus from '@modules/core/eventBus';
import {DockablePopupWrapper} from './layout/components/DockablePopupWrapper';
import {usePopup} from './hooks/usePopup';
import {usePopupSetting} from './hooks/usePopupSetting';
import {
    getLifetimeKillData,
    type LifetimeKillData,
    type KillRecord,
} from '../client/scripts/kill';
import {
    getAllRecords,
    getDistinctDates,
} from '../client/scripts/killLifetimeStorage';
import {characterStorage} from '@modules/core/storage';
import {Button, Input, Segmented, Select} from '@web-ui/primitives';
import {ChevronDown, ChevronLeft, ChevronRight, Search, X} from 'lucide-react';

const POPUP_ID = 'popup:zabici2';

type TabType = 'all' | 'daily' | 'yearly';
type SortType = 'name' | 'count';

interface MobCount {
    mob: string;
    count: number;
}

/** Named (capitalised) mobs are the unique ones. */
const isUnique = (mob: string) => /^[A-Z]/.test(mob);

function sortKillEntries(entries: MobCount[], sortBy: SortType): MobCount[] {
    return [...entries].sort((a, b) =>
        (sortBy === 'count' ? b.count - a.count : 0) || a.mob.localeCompare(b.mob));
}

function sumByMob(records: KillRecord[]): MobCount[] {
    const byMob: Record<string, number> = {};
    for (const r of records) byMob[r.mob] = (byMob[r.mob] ?? 0) + r.count;
    return Object.entries(byMob).map(([mob, count]) => ({mob, count}));
}

const yearOf = (date: string) => date === 'unknown' ? 'unknown' : date.split('/')[0];

/** Newest first, the pre-dates migration bucket last. */
function newestFirst(a: string, b: string): number {
    if (a === 'unknown') return 1;
    if (b === 'unknown') return -1;
    return b.localeCompare(a);
}

const periodLabel = (p: string) => p === 'unknown' ? 'Nieznana data (migracja)' : p;

const Zabici2Popup: React.FC = () => {
    const {wrapperProps, isOpen} = usePopup(POPUP_ID, {
        openEvent: 'zabici2.popup.open',
    });
    const [activeTab, setActiveTab] = usePopupSetting<TabType>(POPUP_ID, 'activeTab', 'all');
    const [lifetimeData, setLifetimeData] = useState<LifetimeKillData | null>(null);
    const [allRecords, setAllRecords] = useState<KillRecord[]>([]);
    const [selectedDate, setSelectedDate] = usePopupSetting<string>(POPUP_ID, 'selectedDate', '');
    const [availableDates, setAvailableDates] = useState<string[]>([]);
    const [selectedYear, setSelectedYear] = usePopupSetting<string>(POPUP_ID, 'selectedYear', '');
    const [sortBy, setSortBy] = usePopupSetting<SortType>(POPUP_ID, 'sortBy', 'name');
    const [search, setSearch] = useState('');

    const loadAsyncData = useCallback(() => {
        const character = characterStorage.getCharacter();
        if (!character) return;
        getAllRecords(character).then(setAllRecords).catch(() => {});
        getDistinctDates(character).then(dates => setAvailableDates(dates.sort(newestFirst))).catch(() => {});
    }, []);

    const characterName = characterStorage.getCharacter();

    useEffect(() => {
        if (!isOpen) return;
        setLifetimeData(getLifetimeKillData());
        loadAsyncData();
    }, [isOpen, loadAsyncData]);

    useEffect(() => {
        return eventBus.on('zabici2.updated', (data: unknown) => {
            setLifetimeData(data as LifetimeKillData);
            loadAsyncData();
        });
    }, [loadAsyncData]);

    const availableYears = useMemo(() => {
        const years = new Set(allRecords.map(r => yearOf(r.date)));
        return Array.from(years).sort(newestFirst);
    }, [allRecords]);

    // An unset or vanished day/year falls back to the newest one.
    const currentDate = availableDates.includes(selectedDate) ? selectedDate : (availableDates[0] ?? '');
    const currentYear = availableYears.includes(selectedYear) ? selectedYear : (availableYears[0] ?? '');

    const kills = useMemo((): MobCount[] => {
        if (activeTab === 'all') {
            return (lifetimeData?.totals ?? []).map(({mob, total}) => ({mob, count: total}));
        }
        if (activeTab === 'daily') {
            return currentDate ? sumByMob(allRecords.filter(r => r.date === currentDate)) : [];
        }
        return currentYear ? sumByMob(allRecords.filter(r => yearOf(r.date) === currentYear)) : [];
    }, [activeTab, lifetimeData, allRecords, currentDate, currentYear]);

    const total = activeTab === 'all'
        ? lifetimeData?.grandTotal ?? 0
        : kills.reduce((s, k) => s + k.count, 0);
    const uniqueCount = kills.filter(k => isUnique(k.mob)).length;

    const query = search.trim().toLowerCase();
    const shown = useMemo(() => {
        const filtered = query ? kills.filter(k => k.mob.toLowerCase().includes(query)) : kills;
        return sortKillEntries(filtered, sortBy);
    }, [kills, query, sortBy]);
    const shownTotal = shown.reduce((s, k) => s + k.count, 0);
    const uniqueShown = shown.filter(k => isUnique(k.mob));
    const othersShown = shown.filter(k => !isUnique(k.mob));

    const periods = activeTab === 'daily' ? availableDates : availableYears;
    const currentPeriod = activeTab === 'daily' ? currentDate : currentYear;
    const setPeriod = activeTab === 'daily' ? setSelectedDate : setSelectedYear;
    const periodIndex = periods.indexOf(currentPeriod);

    const headerActions = (
        <Segmented<TabType>
            size="sm"
            value={activeTab}
            onChange={setActiveTab}
            options={[
                {value: 'all', label: 'Wszystkie'},
                {value: 'daily', label: 'Dzień'},
                {value: 'yearly', label: 'Rok'},
            ]}
        />
    );

    const renderRows = (entries: MobCount[]) => entries.map(({mob, count}) => (
        <div key={mob} className={`zabici2-popup__row ${isUnique(mob) ? 'zabici2-popup__row--unique' : ''}`}>
            <span className="zabici2-popup__mob" title={mob}>{mob}</span>
            <span className="zabici2-popup__count">{count}</span>
        </div>
    ));

    const sortHeader = (key: SortType, label: string) => (
        <button
            type="button"
            className={`zabici2-popup__sort ${sortBy === key ? 'is-active' : ''}`}
            onClick={() => setSortBy(key)}
        >
            {label}
            {sortBy === key && <ChevronDown size={10} strokeWidth={3} />}
        </button>
    );

    let emptyText: string;
    if (query) emptyText = `Nic nie pasuje do „${search.trim()}”.`;
    else if (activeTab === 'all') emptyText = 'Brak danych o zabitych.';
    else if (!currentPeriod) emptyText = 'Brak zapisanych dni.';
    else emptyText = `Brak zabitych w ${activeTab === 'daily' ? 'dniu' : 'roku'} ${periodLabel(currentPeriod)}.`;

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="zabici2"
            title="Zabici"
            minWidth={280}
            minHeight={200}
            initialWidth={400}
            initialHeight={500}
            className="zabici2-popup"
            bodyClassName="popup-body zabici2-popup__body"
            headerActions={headerActions}
        >
            <div className="zabici2-popup__controls">
                {activeTab !== 'all' && (
                    <div className="zabici2-popup__period">
                        <Button
                            size="sm"
                            className="zabici2-popup__step"
                            disabled={periodIndex < 0 || periodIndex >= periods.length - 1}
                            onClick={() => setPeriod(periods[periodIndex + 1])}
                            title="Wcześniej"
                        >
                            <ChevronLeft size={14} strokeWidth={2.2} />
                        </Button>
                        <Select
                            value={currentPeriod}
                            onChange={e => setPeriod(e.target.value)}
                            disabled={periods.length === 0}
                        >
                            {periods.map(p => (
                                <option key={p} value={p}>{periodLabel(p)}</option>
                            ))}
                        </Select>
                        <Button
                            size="sm"
                            className="zabici2-popup__step"
                            disabled={periodIndex <= 0}
                            onClick={() => setPeriod(periods[periodIndex - 1])}
                            title="Później"
                        >
                            <ChevronRight size={14} strokeWidth={2.2} />
                        </Button>
                    </div>
                )}
                <div className="zabici2-popup__search">
                    <Search className="zabici2-popup__search-icon" size={14} strokeWidth={2} />
                    <Input
                        placeholder="Szukaj przeciwnika..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                        <button
                            type="button"
                            className="zabici2-popup__search-clear"
                            onClick={() => setSearch('')}
                            title="Wyczyść wyszukiwanie"
                        >
                            <X size={14} strokeWidth={2} />
                        </button>
                    )}
                </div>
            </div>

            <div className="zabici2-popup__stats">
                <div className="zabici2-popup__stat">
                    <span className="zabici2-popup__stat-value">{total}</span>
                    <span className="zabici2-popup__stat-label">Zabitych</span>
                </div>
                <div className="zabici2-popup__stat">
                    <span className="zabici2-popup__stat-value">{kills.length}</span>
                    <span className="zabici2-popup__stat-label">Rodzajów</span>
                </div>
                <div className="zabici2-popup__stat zabici2-popup__stat--unique">
                    <span className="zabici2-popup__stat-value">{uniqueCount}</span>
                    <span className="zabici2-popup__stat-label">Unikalnych</span>
                </div>
            </div>

            <div className="zabici2-popup__content">
                <div className="zabici2-popup__head">
                    {sortHeader('name', 'Przeciwnik')}
                    {sortHeader('count', 'Ilość')}
                </div>
                {shown.length === 0 && <div className="popup-empty">{emptyText}</div>}
                {uniqueShown.length > 0 && (
                    <>
                        <div className="zabici2-popup__group zabici2-popup__group--unique">
                            <span>Unikalni</span>
                            <span className="zabici2-popup__group-count">{uniqueShown.length}</span>
                        </div>
                        {renderRows(uniqueShown)}
                    </>
                )}
                {othersShown.length > 0 && (
                    <>
                        <div className="zabici2-popup__group">
                            <span>Pozostali</span>
                            <span className="zabici2-popup__group-count">{othersShown.length}</span>
                        </div>
                        {renderRows(othersShown)}
                    </>
                )}
            </div>

            <div className="zabici2-popup__footer">
                <span className="zabici2-popup__character">{characterName}</span>
                <span>
                    {query ? <>Pasujące <b>{shownTotal}</b> z {total}</> : <>Łącznie <b>{total}</b></>}
                </span>
            </div>
        </DockablePopupWrapper>
    );
};

export default Zabici2Popup;
