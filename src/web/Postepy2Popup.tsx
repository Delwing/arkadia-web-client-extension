import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePopupSetting } from './hooks/usePopupSetting';
import {
    getLifetimeData,
    mergeLifetimeData,
    editLifetimeEntry,
    deleteLifetimeEntry,
    LifetimeEntry,
    formatCount,
    MergeMode,
} from '../client/scripts/improveCounter';
import { characterStorage } from '@modules/core/storage';
import type { ImproveDbResult, ImproveDbWorkerRequest, ImproveDbWorkerResponse } from '@modules/data/improveDbImport.shared';

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

    // Import state
    const fileInputRef = useRef<HTMLInputElement>(null);
    const workerRef = useRef<Worker | null>(null);
    const [importState, setImportState] = useState<
        | { phase: 'idle' }
        | { phase: 'loading' }
        | { phase: 'preview'; parsed: ImproveDbResult; selectedCharacter: string; mergeMode: MergeMode }
        | { phase: 'done'; message: string }
        | { phase: 'error'; message: string }
    >({ phase: 'idle' });

    useEffect(() => {
        return () => {
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
        };
    }, []);

    async function parseInWorker(buffer: ArrayBuffer): Promise<ImproveDbResult> {
        if (!workerRef.current) {
            workerRef.current = new Worker(new URL('@modules/data/improveDbImport.worker.ts', import.meta.url), {
                type: 'module',
            });
        }

        const worker = workerRef.current;

        return new Promise((resolve, reject) => {
            const cleanup = () => {
                worker.removeEventListener('message', handleMessage);
                worker.removeEventListener('error', handleError);
            };

            const handleMessage = (event: MessageEvent) => {
                const data = event.data as ImproveDbWorkerResponse | undefined;
                if (!data) return;
                if (data.type === 'success') {
                    cleanup();
                    resolve(data.payload);
                }
                if (data.type === 'error') {
                    cleanup();
                    reject(new Error(data.message));
                }
            };

            const handleError = (event: ErrorEvent) => {
                cleanup();
                if (workerRef.current === worker) {
                    workerRef.current.terminate();
                    workerRef.current = null;
                }
                reject(event.error ?? new Error(event.message));
            };

            worker.addEventListener('message', handleMessage);
            worker.addEventListener('error', handleError);

            const request: ImproveDbWorkerRequest = { type: 'parse', buffer };
            worker.postMessage(request, [buffer]);
        });
    }

    const handleImportClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (e.target) e.target.value = '';
        if (!file) return;

        setImportState({ phase: 'loading' });
        try {
            const buffer = await file.arrayBuffer();
            const parsed = await parseInWorker(buffer);
            if (parsed.characters.length === 0) {
                setImportState({ phase: 'error', message: 'Baza nie zawiera zadnych danych.' });
                return;
            }
            const current = characterStorage.getCharacter()?.toLowerCase() ?? '';
            const preselected = parsed.characters.find(c => c.toLowerCase() === current)
                ?? parsed.characters[0];
            setImportState({ phase: 'preview', parsed, selectedCharacter: preselected, mergeMode: 'max' });
        } catch (err) {
            setImportState({ phase: 'error', message: err instanceof Error ? err.message : 'Nieznany blad.' });
        }
    }, []);

    const handleImportConfirm = useCallback(() => {
        if (importState.phase !== 'preview') return;
        const entries = importState.parsed.byCharacter[importState.selectedCharacter];
        if (!entries?.length) {
            setImportState({ phase: 'error', message: 'Brak danych dla wybranej postaci.' });
            return;
        }
        const ok = mergeLifetimeData(entries, importState.mergeMode);
        if (ok) {
            const total = entries.reduce((s, e) => s + e.count, 0);
            setImportState({ phase: 'done', message: `Zaimportowano ${entries.length} dni (${total} postepow).` });
        } else {
            setImportState({ phase: 'error', message: 'Licznik nie jest jeszcze zainicjalizowany.' });
        }
    }, [importState]);

    const handleImportCancel = useCallback(() => {
        setImportState({ phase: 'idle' });
    }, []);

    // Load initial data when popup opens
    useEffect(() => {
        if (isOpen) {
            setData(getLifetimeData() ?? []);
        }
    }, [isOpen]);

    // Listen for updates
    useEffect(() => {
        const handleUpdate = () => setData(getLifetimeData() ?? []);

        const unsub = eventBus.on('postepy2.updated', handleUpdate);

        return () => {
            unsub();
        };
    }, []);

    const total = useMemo(() => data.reduce((sum, e) => sum + e.count, 0), [data]);
    const monthlyData = useMemo(() => aggregateMonthly(data), [data]);
    const yearlyData = useMemo(() => aggregateYearly(data), [data]);

    const characterName = characterStorage.getCharacter();

    const handleTabClick = useCallback((tab: TabType) => {
        setActiveTab(tab);
    }, [setActiveTab]);

    // Daily entry editing
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editValue, setEditValue] = useState('');

    const handleEditStart = useCallback((index: number, count: number) => {
        setEditingIndex(index);
        setEditValue(String(count));
    }, []);

    const handleEditSave = useCallback(() => {
        if (editingIndex === null) return;
        const newCount = parseInt(editValue, 10);
        if (isNaN(newCount) || newCount < 0) return;
        if (newCount === 0) {
            deleteLifetimeEntry(editingIndex);
        } else {
            editLifetimeEntry(editingIndex, newCount);
        }
        setEditingIndex(null);
    }, [editingIndex, editValue]);

    const handleEditDelete = useCallback(() => {
        if (editingIndex === null) return;
        deleteLifetimeEntry(editingIndex);
        setEditingIndex(null);
    }, [editingIndex]);

    const handleEditCancel = useCallback(() => {
        setEditingIndex(null);
    }, []);

    const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleEditSave();
        if (e.key === 'Escape') handleEditCancel();
    }, [handleEditSave, handleEditCancel]);

    const renderDailyTab = () => (
        <div className="postepy2-entries">
            {data.length === 0 ? (
                <div className="popup-empty">Brak danych.</div>
            ) : (
                data.map((entry, index) => (
                    <div key={index} className="postepy2-entry postepy2-entry--with-noform">
                        <span className="postepy2-entry__num">[{(index + 1).toString().padStart(4, ' ')}]</span>
                        <span className="postepy2-entry__date">{formatDateLabel(entry.date)}</span>
                        {editingIndex === index ? (
                            <span className="postepy2-entry__edit">
                                <input
                                    type="number"
                                    className="postepy2-entry__edit-input"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={handleEditKeyDown}
                                    min={0}
                                    autoFocus
                                />
                                <button type="button" className="postepy2-entry__edit-btn postepy2-entry__edit-btn--save" onClick={handleEditSave} title="Zapisz">ok</button>
                                <button type="button" className="postepy2-entry__edit-btn postepy2-entry__edit-btn--delete" onClick={handleEditDelete} title="Usun">x</button>
                                <button type="button" className="postepy2-entry__edit-btn postepy2-entry__edit-btn--cancel" onClick={handleEditCancel}>Anuluj</button>
                            </span>
                        ) : (
                            <>
                                <span className="postepy2-entry__counts">
                                    <span className="postepy2-entry__count">{formatCount(entry.count)}</span>
                                    {!!(entry.noFormCount && entry.noFormCount > 0) && (
                                        <span className="postepy2-entry__count postepy2-entry__count--noform">{formatCount(entry.noFormCount)}</span>
                                    )}
                                </span>
                                <button
                                    type="button"
                                    className="postepy2-entry__edit-trigger"
                                    onClick={() => handleEditStart(index, entry.count)}
                                    title="Edytuj"
                                >
                                    &#9998;
                                </button>
                            </>
                        )}
                    </div>
                ))
            )}
        </div>
    );

    const renderMonthlyTab = () => (
        <div className="postepy2-entries">
            {monthlyData.length === 0 ? (
                <div className="popup-empty">Brak danych.</div>
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
                <div className="popup-empty">Brak danych.</div>
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
                <div className="popup-empty">Brak postepow bez formy.</div>
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
                        <div className="popup-empty">Brak danych.</div>
                    )}
                </div>
                <div className="postepy2-graph-section">
                    <h4 className="postepy2-graph-title">Ostatnie 12 miesiecy</h4>
                    {monthlyChartData.length > 0 ? (
                        <SimpleBarChart data={monthlyChartData} maxBars={12} />
                    ) : (
                        <div className="popup-empty">Brak danych.</div>
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
            <div className="postepy2-header">
                {characterName && (
                    <span>
                        <span className="postepy2-header__label">Postac:</span>
                        <span className="postepy2-header__name">{characterName}</span>
                    </span>
                )}
                <button
                    type="button"
                    className="popup-btn popup-btn--md postepy2-import-button"
                    onClick={handleImportClick}
                    disabled={importState.phase === 'loading'}
                >
                    Import z Mudleta
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".db"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                />
            </div>

            {importState.phase === 'loading' && (
                <div className="postepy2-import-panel">
                    Wczytywanie bazy danych...
                </div>
            )}

            {importState.phase === 'preview' && (
                <div className="postepy2-import-panel">
                    {importState.parsed.characters.length > 1 && (
                        <div className="postepy2-import-panel__row">
                            <label className="postepy2-import-panel__label">Postac:</label>
                            <select
                                className="postepy2-import-panel__select"
                                value={importState.selectedCharacter}
                                onChange={(e) => setImportState({ ...importState, selectedCharacter: e.target.value })}
                            >
                                {importState.parsed.characters.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div className="postepy2-import-panel__row">
                        <label className="postepy2-import-panel__label">Tryb:</label>
                        <select
                            className="postepy2-import-panel__select"
                            value={importState.mergeMode}
                            onChange={(e) => setImportState({ ...importState, mergeMode: e.target.value as MergeMode })}
                        >
                            <option value="max">Wez maksimum</option>
                            <option value="add">Dodaj wszystko</option>
                        </select>
                    </div>
                    <div className="postepy2-import-panel__info">
                        {(() => {
                            const entries = importState.parsed.byCharacter[importState.selectedCharacter] ?? [];
                            const totalCount = entries.reduce((s, e) => s + e.count, 0);
                            return `${entries.length} dni, ${totalCount} postepow`;
                        })()}
                    </div>
                    <div className="postepy2-import-panel__note">
                        {importState.mergeMode === 'max'
                            ? 'Dla kazdego dnia zostanie wziety wyzszy wynik.'
                            : 'Postepy z Mudleta zostana dodane do istniejacych.'}
                    </div>
                    <div className="postepy2-import-panel__actions">
                        <button type="button" className="postepy2-import-panel__btn postepy2-import-panel__btn--confirm" onClick={handleImportConfirm}>
                            Importuj
                        </button>
                        <button type="button" className="postepy2-import-panel__btn postepy2-import-panel__btn--cancel" onClick={handleImportCancel}>
                            Anuluj
                        </button>
                    </div>
                </div>
            )}

            {(importState.phase === 'done' || importState.phase === 'error') && (
                <div className={`postepy2-import-message ${importState.phase === 'error' ? 'postepy2-import-message--error' : 'postepy2-import-message--success'}`}>
                    <span>{importState.message}</span>
                    <button type="button" className="postepy2-import-message__close" onClick={handleImportCancel}>x</button>
                </div>
            )}

            <div className="popup-tabs postepy2-tabs">
                <button
                    type="button"
                    className={`popup-tab ${activeTab === 'daily' ? 'popup-tab--active' : ''}`}
                    onClick={() => handleTabClick('daily')}
                >
                    Dni
                </button>
                <button
                    type="button"
                    className={`popup-tab ${activeTab === 'monthly' ? 'popup-tab--active' : ''}`}
                    onClick={() => handleTabClick('monthly')}
                >
                    Miesiace
                </button>
                <button
                    type="button"
                    className={`popup-tab ${activeTab === 'yearly' ? 'popup-tab--active' : ''}`}
                    onClick={() => handleTabClick('yearly')}
                >
                    Lata
                </button>
                <button
                    type="button"
                    className={`popup-tab ${activeTab === 'noform' ? 'popup-tab--active' : ''}`}
                    onClick={() => handleTabClick('noform')}
                >
                    Bez formy
                </button>
                <button
                    type="button"
                    className={`popup-tab ${activeTab === 'graphs' ? 'popup-tab--active' : ''}`}
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
