import React, { useEffect, useState, useMemo, useCallback } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePopupSetting } from './hooks/usePopupSetting';
import {
    getLifetimeData,
    LifetimeEntry,
    formatCount,
} from '../client/scripts/improveCounter';
import { getCurrentCharacter } from '@modules/core/storage';

const POPUP_ID = 'popup:postepy2';

type TabType = 'daily' | 'monthly' | 'yearly' | 'noform' | 'graphs';

type MonthlyEntry = {
    year: number;
    month: number;
    count: number;
    noFormCount: number;
};

type YearlyEntry = {
    year: number;
    count: number;
    noFormCount: number;
};

function parseDate(dateStr: string): { year: number; month: number; day: number } | null {
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    return {
        year: parseInt(parts[0], 10),
        month: parseInt(parts[1], 10),
        day: parseInt(parts[2], 10),
    };
}

function formatDateLabel(dateStr: string): string {
    const parsed = parseDate(dateStr);
    if (!parsed) return dateStr;
    return `${parsed.day.toString().padStart(2, '0')}/${parsed.month.toString().padStart(2, '0')}/${parsed.year}`;
}

function getMonthName(month: number): string {
    const names = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paz', 'Lis', 'Gru'];
    return names[month - 1] || String(month);
}

function aggregateMonthly(entries: LifetimeEntry[]): MonthlyEntry[] {
    const map = new Map<string, MonthlyEntry>();

    for (const entry of entries) {
        const parsed = parseDate(entry.date);
        if (!parsed) continue;

        const key = `${parsed.year}/${parsed.month}`;
        const existing = map.get(key);
        if (existing) {
            existing.count += entry.count;
            existing.noFormCount += entry.noFormCount || 0;
        } else {
            map.set(key, { year: parsed.year, month: parsed.month, count: entry.count, noFormCount: entry.noFormCount || 0 });
        }
    }

    return Array.from(map.values()).sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.month - b.month;
    });
}

function aggregateYearly(entries: LifetimeEntry[]): YearlyEntry[] {
    const map = new Map<number, YearlyEntry>();

    for (const entry of entries) {
        const parsed = parseDate(entry.date);
        if (!parsed) continue;

        const existing = map.get(parsed.year);
        if (existing) {
            existing.count += entry.count;
            existing.noFormCount += entry.noFormCount || 0;
        } else {
            map.set(parsed.year, { year: parsed.year, count: entry.count, noFormCount: entry.noFormCount || 0 });
        }
    }

    return Array.from(map.values()).sort((a, b) => a.year - b.year);
}

// Simple bar chart component with stacked bars support
const SimpleBarChart: React.FC<{
    data: { label: string; value: number; noFormValue?: number }[];
    maxBars?: number;
}> = ({ data, maxBars = 30 }) => {
    const displayData = data.slice(-maxBars);
    const maxValue = Math.max(...displayData.map(d => d.value + (d.noFormValue || 0)), 1);
    const maxLabelLength = Math.max(...displayData.map(d => d.label.length));

    return (
        <div className="postepy2-chart">
            <div className="postepy2-chart__bars">
                {displayData.map((item, index) => {
                    const hasNoForm = !!(item.noFormValue && item.noFormValue > 0);
                    const normalHeightPct = (item.value / maxValue) * 100;
                    const noFormHeightPct = hasNoForm ? ((item.noFormValue || 0) / maxValue) * 100 : 0;
                    return (
                        <div key={index} className="postepy2-chart__bar-container">
                            <div
                                className="postepy2-chart__bar-wrapper"
                                title={hasNoForm ? `${item.label}: ${item.value} + ${item.noFormValue} bez formy` : `${item.label}: ${item.value}`}
                            >
                                {(item.value > 0 || hasNoForm) && (
                                    <span
                                        className="postepy2-chart__bar-value"
                                        style={{ bottom: `${normalHeightPct + noFormHeightPct}%` }}
                                    >
                                        {item.value}
                                    </span>
                                )}
                                {hasNoForm && (
                                    <div
                                        className="postepy2-chart__bar postepy2-chart__bar--noform"
                                        style={{ height: `${noFormHeightPct}%`, bottom: `${normalHeightPct}%` }}
                                    />
                                )}
                                {item.value > 0 && (
                                    <div
                                        className="postepy2-chart__bar"
                                        style={{ height: `${normalHeightPct}%` }}
                                    />
                                )}
                            </div>
                            <span className="postepy2-chart__bar-label">{item.label.padStart(maxLabelLength)}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const Postepy2Popup: React.FC = () => {
    const { wrapperProps, isOpen } = usePopup(POPUP_ID, {
        openEvent: 'postepy2.popup.open',
    });
    const [data, setData] = useState<LifetimeEntry[]>([]);
    const [activeTab, setActiveTab] = usePopupSetting<TabType>(POPUP_ID, 'activeTab', 'daily');

    // Load initial data when popup opens
    useEffect(() => {
        if (isOpen) {
            setData(getLifetimeData());
        }
    }, [isOpen]);

    // Listen for updates
    useEffect(() => {
        const handleUpdate = () => setData(getLifetimeData());

        const unsub = eventBus.on('postepy2.updated', handleUpdate);

        return () => {
            unsub();
        };
    }, []);

    const total = useMemo(() => data.reduce((sum, e) => sum + e.count, 0), [data]);
    const monthlyData = useMemo(() => aggregateMonthly(data), [data]);
    const yearlyData = useMemo(() => aggregateYearly(data), [data]);

    const characterName = getCurrentCharacter();

    const handleTabClick = useCallback((tab: TabType) => {
        setActiveTab(tab);
    }, [setActiveTab]);

    const renderDailyTab = () => (
        <div className="postepy2-entries">
            {data.length === 0 ? (
                <div className="postepy2-empty">Brak danych.</div>
            ) : (
                data.map((entry, index) => (
                    <div key={index} className="postepy2-entry postepy2-entry--with-noform">
                        <span className="postepy2-entry__num">[{(index + 1).toString().padStart(4, ' ')}]</span>
                        <span className="postepy2-entry__date">{formatDateLabel(entry.date)}</span>
                        <span className="postepy2-entry__counts">
                            <span className="postepy2-entry__count">{formatCount(entry.count)}</span>
                            {!!(entry.noFormCount && entry.noFormCount > 0) && (
                                <span className="postepy2-entry__count postepy2-entry__count--noform">{formatCount(entry.noFormCount)}</span>
                            )}
                        </span>
                    </div>
                ))
            )}
        </div>
    );

    const renderMonthlyTab = () => (
        <div className="postepy2-entries">
            {monthlyData.length === 0 ? (
                <div className="postepy2-empty">Brak danych.</div>
            ) : (
                monthlyData.map((entry, index) => (
                    <div key={index} className="postepy2-entry">
                        <span className="postepy2-entry__num">[{(index + 1).toString().padStart(4, ' ')}]</span>
                        <span className="postepy2-entry__date">{getMonthName(entry.month)} {entry.year}</span>
                        <span className="postepy2-entry__count">{formatCount(entry.count)}</span>
                    </div>
                ))
            )}
        </div>
    );

    const renderYearlyTab = () => (
        <div className="postepy2-entries">
            {yearlyData.length === 0 ? (
                <div className="postepy2-empty">Brak danych.</div>
            ) : (
                yearlyData.map((entry, index) => (
                    <div key={index} className="postepy2-entry">
                        <span className="postepy2-entry__num">[{(index + 1).toString().padStart(4, ' ')}]</span>
                        <span className="postepy2-entry__date">{entry.year}</span>
                        <span className="postepy2-entry__count">{formatCount(entry.count)}</span>
                    </div>
                ))
            )}
        </div>
    );

    const noFormData = useMemo(() => data.filter(e => e.noFormCount && e.noFormCount > 0), [data]);
    const totalNoForm = useMemo(() => data.reduce((sum, e) => sum + (e.noFormCount || 0), 0), [data]);

    const renderNoFormTab = () => (
        <div className="postepy2-entries">
            {noFormData.length === 0 ? (
                <div className="postepy2-empty">Brak postepow bez formy.</div>
            ) : (
                <>
                    {noFormData.map((entry, index) => (
                        <div key={index} className="postepy2-entry">
                            <span className="postepy2-entry__num">[{(index + 1).toString().padStart(4, ' ')}]</span>
                            <span className="postepy2-entry__date">{formatDateLabel(entry.date)}</span>
                            <span className="postepy2-entry__count postepy2-entry__count--noform">{formatCount(entry.noFormCount || 0)}</span>
                        </div>
                    ))}
                    <div className="postepy2-noform-total">
                        Lacznie bez formy: {totalNoForm}
                    </div>
                </>
            )}
        </div>
    );

    const renderGraphsTab = () => {
        const dailyChartData = data.slice(-30).map(e => ({
            label: e.date.split('/').slice(1).join('/'),
            value: e.count,
            noFormValue: e.noFormCount || 0,
        }));

        const monthlyChartData = monthlyData.slice(-12).map(e => ({
            label: `${getMonthName(e.month)}`,
            value: e.count,
            noFormValue: e.noFormCount || 0,
        }));

        return (
            <div className="postepy2-graphs">
                <div className="postepy2-graph-section">
                    <h4 className="postepy2-graph-title">Ostatnie 30 dni</h4>
                    {dailyChartData.length > 0 ? (
                        <SimpleBarChart data={dailyChartData} maxBars={30} />
                    ) : (
                        <div className="postepy2-empty">Brak danych.</div>
                    )}
                </div>
                <div className="postepy2-graph-section">
                    <h4 className="postepy2-graph-title">Ostatnie 12 miesiecy</h4>
                    {monthlyChartData.length > 0 ? (
                        <SimpleBarChart data={monthlyChartData} maxBars={12} />
                    ) : (
                        <div className="postepy2-empty">Brak danych.</div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="postepy2"
            title="Postepy 2"
            minWidth={280}
            minHeight={200}
            initialWidth={600}
            initialHeight={675}
            className="postepy2-popup"
            bodyClassName="postepy2-popup-body"
        >
            {characterName && (
                <div className="postepy2-header">
                    <span className="postepy2-header__label">Postac:</span>
                    <span className="postepy2-header__name">{characterName}</span>
                </div>
            )}

            <div className="postepy2-tabs">
                <button
                    type="button"
                    className={`postepy2-tab-button ${activeTab === 'daily' ? 'postepy2-tab-button--active' : ''}`}
                    onClick={() => handleTabClick('daily')}
                >
                    Dni
                </button>
                <button
                    type="button"
                    className={`postepy2-tab-button ${activeTab === 'monthly' ? 'postepy2-tab-button--active' : ''}`}
                    onClick={() => handleTabClick('monthly')}
                >
                    Miesiace
                </button>
                <button
                    type="button"
                    className={`postepy2-tab-button ${activeTab === 'yearly' ? 'postepy2-tab-button--active' : ''}`}
                    onClick={() => handleTabClick('yearly')}
                >
                    Lata
                </button>
                <button
                    type="button"
                    className={`postepy2-tab-button ${activeTab === 'noform' ? 'postepy2-tab-button--active' : ''}`}
                    onClick={() => handleTabClick('noform')}
                >
                    Bez formy
                </button>
                <button
                    type="button"
                    className={`postepy2-tab-button ${activeTab === 'graphs' ? 'postepy2-tab-button--active' : ''}`}
                    onClick={() => handleTabClick('graphs')}
                >
                    Wykresy
                </button>
            </div>

            <div className="postepy2-content">
                {activeTab === 'daily' && renderDailyTab()}
                {activeTab === 'monthly' && renderMonthlyTab()}
                {activeTab === 'yearly' && renderYearlyTab()}
                {activeTab === 'noform' && renderNoFormTab()}
                {activeTab === 'graphs' && renderGraphsTab()}
            </div>

            <div className="postepy2-footer">
                <span className="postepy2-footer__label">Lacznie:</span>
                <span className="postepy2-footer__total">{total} postepow</span>
                {totalNoForm > 0 && (
                    <span className="postepy2-footer__noform">+ {totalNoForm} bez formy</span>
                )}
                <span className="postepy2-footer__approx">(~{(total / 15).toFixed(2)} niebotycznych)</span>
            </div>
        </DockablePopupWrapper>
    );
};

export default Postepy2Popup;
