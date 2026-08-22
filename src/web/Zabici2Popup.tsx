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
} from '../client/scripts/lib/killLifetimeStorage';
import {characterStorage} from '@modules/core/storage';

const POPUP_ID = 'popup:zabici2';

type TabType = 'all' | 'daily' | 'yearly';

interface MobCount {
    mob: string;
    count: number;
}

function sortKillEntries<T extends {mob: string}>(entries: T[]): T[] {
    return [...entries].sort((a, b) => {
        const aUpper = /^[A-Z]/.test(a.mob);
        const bUpper = /^[A-Z]/.test(b.mob);
        if (aUpper !== bUpper) return aUpper ? -1 : 1;
        return a.mob.localeCompare(b.mob);
    });
}

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

    const loadAsyncData = useCallback(() => {
        const character = characterStorage.getCharacter();
        if (!character) return;
        getAllRecords(character).then(setAllRecords).catch(() => {});
        getDistinctDates(character).then(dates => {
            const sorted = dates.sort((a, b) => {
                if (a === 'unknown') return 1;
                if (b === 'unknown') return -1;
                return b.localeCompare(a);
            });
            setAvailableDates(sorted);
        }).catch(() => {});
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

    const sortedTotals = useMemo(() => {
        return sortKillEntries(lifetimeData?.totals ?? []);
    }, [lifetimeData]);

    const dailyKills = useMemo(() => {
        if (!selectedDate) return [];
        return sortKillEntries(
            allRecords
                .filter(r => r.date === selectedDate)
                .map(r => ({mob: r.mob, count: r.count}))
        );
    }, [allRecords, selectedDate]);

    const dailyTotal = useMemo(() => {
        return dailyKills.reduce((s, k) => s + k.count, 0);
    }, [dailyKills]);

    const availableYears = useMemo(() => {
        const years = new Set<string>();
        for (const r of allRecords) {
            years.add(r.date === 'unknown' ? 'unknown' : r.date.split('/')[0]);
        }
        return Array.from(years).sort((a, b) => {
            if (a === 'unknown') return 1;
            if (b === 'unknown') return -1;
            return b.localeCompare(a);
        });
    }, [allRecords]);

    const yearlyKills = useMemo((): MobCount[] => {
        if (!selectedYear) return [];
        const byMob: Record<string, number> = {};
        for (const r of allRecords) {
            const year = r.date === 'unknown' ? 'unknown' : r.date.split('/')[0];
            if (year !== selectedYear) continue;
            byMob[r.mob] = (byMob[r.mob] ?? 0) + r.count;
        }
        return sortKillEntries(
            Object.entries(byMob).map(([mob, count]) => ({mob, count}))
        );
    }, [allRecords, selectedYear]);

    const yearlyTotal = useMemo(() => {
        return yearlyKills.reduce((s, k) => s + k.count, 0);
    }, [yearlyKills]);

    const grandTotal = lifetimeData?.grandTotal ?? 0;

    const renderAllTab = () => (
        <div className="zabici2-popup__tab-content">
            {sortedTotals.length === 0 ? (
                <div className="zabici2-popup__empty">Brak danych o zabitych.</div>
            ) : (
                <>
                    {sortedTotals.map(({mob, total}) => (
                        <div key={mob} className="zabici-popup__kill-row">
                            <span className={`zabici2-popup__mob-name ${/^[A-Z]/.test(mob) ? 'zabici2-popup__mob-name--boss' : ''}`}>{mob}</span>
                            <span className="zabici-popup__kill-count">{total}</span>
                        </div>
                    ))}
                    <div className="zabici-popup__grand-total">
                        <span>Lacznie</span>
                        <span>{grandTotal}</span>
                    </div>
                </>
            )}
        </div>
    );

    const renderDailyTab = () => (
        <div className="zabici2-popup__tab-content">
            <div className="zabici2-popup__date-selector">
                <select
                    className="zabici2-popup__date-select"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                >
                    <option value="">-- wybierz date --</option>
                    {availableDates.map(date => (
                        <option key={date} value={date}>
                            {date === 'unknown' ? 'Nieznana data (migracja)' : date}
                        </option>
                    ))}
                </select>
            </div>
            {selectedDate && dailyKills.length === 0 && (
                <div className="zabici2-popup__empty">Brak zabitych w dniu {selectedDate}.</div>
            )}
            {dailyKills.length > 0 && (
                <>
                    {dailyKills.map(({mob, count}) => (
                        <div key={mob} className="zabici-popup__kill-row">
                            <span className={`zabici2-popup__mob-name ${/^[A-Z]/.test(mob) ? 'zabici2-popup__mob-name--boss' : ''}`}>{mob}</span>
                            <span className="zabici-popup__kill-count">{count}</span>
                        </div>
                    ))}
                    <div className="zabici-popup__grand-total">
                        <span>Lacznie</span>
                        <span>{dailyTotal}</span>
                    </div>
                </>
            )}
        </div>
    );

    const renderYearlyTab = () => (
        <div className="zabici2-popup__tab-content">
            <div className="zabici2-popup__date-selector">
                <select
                    className="zabici2-popup__date-select"
                    value={selectedYear}
                    onChange={e => setSelectedYear(e.target.value)}
                >
                    <option value="">-- wybierz rok --</option>
                    {availableYears.map(year => (
                        <option key={year} value={year}>
                            {year === 'unknown' ? 'Nieznana data (migracja)' : year}
                        </option>
                    ))}
                </select>
            </div>
            {selectedYear && yearlyKills.length === 0 && (
                <div className="zabici2-popup__empty">Brak zabitych w roku {selectedYear}.</div>
            )}
            {yearlyKills.length > 0 && (
                <>
                    {yearlyKills.map(({mob, count}) => (
                        <div key={mob} className="zabici-popup__kill-row">
                            <span className={`zabici2-popup__mob-name ${/^[A-Z]/.test(mob) ? 'zabici2-popup__mob-name--boss' : ''}`}>{mob}</span>
                            <span className="zabici-popup__kill-count">{count}</span>
                        </div>
                    ))}
                    <div className="zabici-popup__grand-total">
                        <span>Lacznie</span>
                        <span>{yearlyTotal}</span>
                    </div>
                </>
            )}
        </div>
    );

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="zabici2"
            title="Zabici - Lifetime"
            minWidth={280}
            minHeight={200}
            initialWidth={400}
            initialHeight={500}
            className="zabici2-popup"
            bodyClassName="zabici2-popup-body"
        >
            {characterName && (
                <div className="postepy2-header">
                    <span>
                        <span className="postepy2-header__label">Postac:</span>
                        <span className="postepy2-header__name">{characterName}</span>
                    </span>
                </div>
            )}
            <div className="postepy2-tabs">
                <button
                    type="button"
                    className={`popup-tab ${activeTab === 'all' ? 'popup-tab--active' : ''}`}
                    onClick={() => setActiveTab('all')}
                >
                    Wszystkie
                </button>
                <button
                    type="button"
                    className={`popup-tab ${activeTab === 'daily' ? 'popup-tab--active' : ''}`}
                    onClick={() => setActiveTab('daily')}
                >
                    Wg dnia
                </button>
                <button
                    type="button"
                    className={`popup-tab ${activeTab === 'yearly' ? 'popup-tab--active' : ''}`}
                    onClick={() => setActiveTab('yearly')}
                >
                    Lata
                </button>
            </div>

            <div className="zabici2-popup__content">
                {activeTab === 'all' && renderAllTab()}
                {activeTab === 'daily' && renderDailyTab()}
                {activeTab === 'yearly' && renderYearlyTab()}
            </div>
        </DockablePopupWrapper>
    );
};

export default Zabici2Popup;
