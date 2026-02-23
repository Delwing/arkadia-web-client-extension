import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import eventBus from '@modules/core/eventBus';
import {
    getEventsForDomain,
    clearEventsForDomain,
    getAllEvents,
    importEvents,
    storeConfirmedEvent,
    deleteEvent,
    MONTHS_ORDER,
    MONTHS,
    type ConfirmedSunEvent,
} from '@client/scripts/sunTracker';

type Domain = "Empire" | "Ishtar";

interface MonthRange {
    month: string;
    startDay: number;
    length: number;
    sunrise: number;
    sunset: number;
}

type EventIndex = Record<number, { sunrise?: number; sunset?: number }>;

function getMonthRanges(domain: Domain): MonthRange[] {
    const result: MonthRange[] = [];
    let dayCounter = 1;
    for (const month of MONTHS_ORDER[domain]) {
        const def = MONTHS[month];
        result.push({
            month,
            startDay: dayCounter,
            length: def.length,
            sunrise: def.sunrise,
            sunset: def.sunset,
        });
        dayCounter += def.length;
    }
    return result;
}

function indexEvents(events: ConfirmedSunEvent[]): EventIndex {
    const idx: EventIndex = {};
    for (const e of events) {
        if (!idx[e.dayOfYear]) idx[e.dayOfYear] = {};
        idx[e.dayOfYear][e.type] = e.observedHour;
    }
    return idx;
}

interface ClockState {
    domain: Domain;
    hours: number;
    minutes: number;
    sunrise: number | string | "?";
    sunset: number | string | "?";
    dayOfYear?: number;
}

const MUD_MINUTE_IN_SECONDS = 2; // 1 MUD hour = 120 real seconds, 1 MUD minute = 2 real seconds

function formatRealtime(realSeconds: number): string {
    const mins = Math.round(realSeconds / 60);
    if (mins < 60) return `~${mins}min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `~${h}h ${m}min` : `~${h}h`;
}

function getNextSunEvent(clock: ClockState): string | null {
    const sr = typeof clock.sunrise === 'number' ? clock.sunrise : (typeof clock.sunrise === 'string' ? parseInt(clock.sunrise, 10) : null);
    const ss = typeof clock.sunset === 'number' ? clock.sunset : (typeof clock.sunset === 'string' ? parseInt(clock.sunset, 10) : null);
    if (sr === null || ss === null || isNaN(sr) || isNaN(ss)) return null;

    let mudMinutesLeft: number;
    let icon: string;
    let hour: number;

    if (clock.hours < sr) {
        // Next event: sunrise today
        mudMinutesLeft = (sr - clock.hours) * 60 - clock.minutes;
        icon = "\u2600";
        hour = sr;
    } else if (clock.hours < ss) {
        // Next event: sunset today
        mudMinutesLeft = (ss - clock.hours) * 60 - clock.minutes;
        icon = "\u263E";
        hour = ss;
    } else {
        // Next event: sunrise tomorrow
        mudMinutesLeft = ((24 - clock.hours) + sr) * 60 - clock.minutes;
        icon = "\u2600";
        hour = sr;
    }

    const realSeconds = mudMinutesLeft * MUD_MINUTE_IN_SECONDS;
    return `${icon} ${hour}:00 (${formatRealtime(realSeconds)})`;
}

const POPUP_ID = 'popup:sunTracker';

const SunTrackerPopup: React.FC = () => {
    const { wrapperProps } = usePopup(POPUP_ID, {
        openEvent: 'sunTracker.popup.open',
    });
    const [activeTab, setActiveTab] = useState<Domain>("Empire");
    const [events, setEvents] = useState<ConfirmedSunEvent[]>([]);
    const [refreshKey, setRefreshKey] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [clockData, setClockData] = useState<Record<Domain, ClockState | null>>({ Empire: null, Ishtar: null });
    const lastDomainRef = useRef<Domain | null>(null);
    const [editCell, setEditCell] = useState<{ dayOfYear: number; x: number; y: number; sunrise?: number; sunset?: number } | null>(null);
    const [editSunrise, setEditSunrise] = useState('');
    const [editSunset, setEditSunset] = useState('');
    const editRef = useRef<HTMLDivElement>(null);
    const todayRef = useRef<HTMLDivElement>(null);
    const needsScrollRef = useRef(false);

    const loadEvents = useCallback(async (domain: Domain) => {
        const data = await getEventsForDomain(domain);
        setEvents(data);
    }, []);

    useEffect(() => {
        if (wrapperProps.isOpen) {
            loadEvents(activeTab);
        }
    }, [wrapperProps.isOpen, activeTab, refreshKey, loadEvents]);

    // Mark that we need to scroll when popup opens or tab changes
    useEffect(() => {
        if (wrapperProps.isOpen) {
            needsScrollRef.current = true;
        }
    }, [wrapperProps.isOpen, activeTab]);

    // Scroll to current day only on open/tab change, not on edits
    useEffect(() => {
        if (needsScrollRef.current && wrapperProps.isOpen && todayRef.current && scrollRef.current) {
            needsScrollRef.current = false;
            requestAnimationFrame(() => {
                todayRef.current?.scrollIntoView({ block: 'center' });
            });
        }
    }, [wrapperProps.isOpen, events]);

    // Refresh when a new observation is confirmed
    useEffect(() => {
        return eventBus.on("sunTracker.updated", () => {
            if (wrapperProps.isOpen) {
                setRefreshKey(k => k + 1);
            }
        });
    }, [wrapperProps.isOpen, activeTab]);

    // Track clock data for next sun event display
    useEffect(() => {
        return eventBus.on("clock.update", (data) => {
            lastDomainRef.current = data.domain as Domain;
            setClockData(prev => ({
                ...prev,
                [data.domain]: { domain: data.domain as Domain, hours: data.hours, minutes: data.minutes, sunrise: data.sunrise, sunset: data.sunset, dayOfYear: data.dayOfYear },
            }));
        });
    }, []);

    // Auto-select tab based on current domain when popup opens
    useEffect(() => {
        if (wrapperProps.isOpen && lastDomainRef.current) {
            setActiveTab(lastDomainRef.current);
        }
    }, [wrapperProps.isOpen]);

    const handleClear = async () => {
        await clearEventsForDomain(activeTab);
        setRefreshKey(k => k + 1);
    };

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleExport = async () => {
        const allEvents = await getAllEvents();
        const json = JSON.stringify(allEvents, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sun-tracker-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        const data = JSON.parse(text) as ConfirmedSunEvent[];
        if (!Array.isArray(data)) return;
        await importEvents(data);
        setRefreshKey(k => k + 1);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const openEditMenu = (ev: React.MouseEvent, dayOfYear: number, currentSunrise?: number, currentSunset?: number) => {
        ev.preventDefault();
        setEditSunrise(currentSunrise !== undefined ? String(currentSunrise) : '');
        setEditSunset(currentSunset !== undefined ? String(currentSunset) : '');
        setEditCell({ dayOfYear, x: ev.clientX, y: ev.clientY, sunrise: currentSunrise, sunset: currentSunset });
    };

    const handleEditSave = async () => {
        if (!editCell) return;
        const sr = editSunrise.trim() !== '' ? parseInt(editSunrise, 10) : null;
        const ss = editSunset.trim() !== '' ? parseInt(editSunset, 10) : null;

        // Delete removed values
        if (sr === null && editCell.sunrise !== undefined) {
            await deleteEvent(activeTab, editCell.dayOfYear, 'sunrise');
        }
        if (ss === null && editCell.sunset !== undefined) {
            await deleteEvent(activeTab, editCell.dayOfYear, 'sunset');
        }
        // Store new/updated values
        if (sr !== null && !isNaN(sr)) {
            await storeConfirmedEvent({ domain: activeTab, type: 'sunrise', dayOfYear: editCell.dayOfYear, observedHour: sr, confirmedAt: Date.now() });
        }
        if (ss !== null && !isNaN(ss)) {
            await storeConfirmedEvent({ domain: activeTab, type: 'sunset', dayOfYear: editCell.dayOfYear, observedHour: ss, confirmedAt: Date.now() });
        }

        setEditCell(null);
        setRefreshKey(k => k + 1);
    };

    // Close edit menu on click outside
    useEffect(() => {
        if (!editCell) return;
        const handler = (e: MouseEvent) => {
            if (editRef.current && !editRef.current.contains(e.target as Node)) {
                setEditCell(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [editCell]);

    const eventIndex = indexEvents(events);
    const monthRanges = getMonthRanges(activeTab);
    const sunriseCount = events.filter(e => e.type === "sunrise").length;
    const sunsetCount = events.filter(e => e.type === "sunset").length;
    const yearLength = activeTab === "Empire" ? 400 : 360;
    const activeClock = clockData[activeTab];
    const nextSunLabel = activeClock ? getNextSunEvent(activeClock) : null;
    const todayDayOfYear = activeClock?.dayOfYear;

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="sunTracker"
            title="Kalendarz"
            minWidth={340}
            minHeight={200}
            initialWidth={500}
            className="sun-tracker-window"
            bodyClassName="sun-tracker-window-body"
        >
            <div style={{ fontFamily: 'monospace', fontSize: 12, padding: 8, color: '#ddd', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                    <button
                        type="button"
                        className={`clock-tab-button ${activeTab === 'Empire' ? 'clock-tab-button--active' : ''}`}
                        onClick={() => setActiveTab('Empire')}
                    >
                        Imperium
                    </button>
                    <button
                        type="button"
                        className={`clock-tab-button ${activeTab === 'Ishtar' ? 'clock-tab-button--active' : ''}`}
                        onClick={() => setActiveTab('Ishtar')}
                    >
                        Ishtar
                    </button>
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                        <button
                            type="button"
                            style={{
                                padding: '4px 10px',
                                border: '1px solid #444',
                                borderRadius: 4,
                                cursor: 'pointer',
                                fontSize: 11,
                                fontFamily: 'monospace',
                                background: '#222',
                                color: '#aaa',
                            }}
                            onClick={handleExport}
                        >
                            Eksport
                        </button>
                        <button
                            type="button"
                            style={{
                                padding: '4px 10px',
                                border: '1px solid #444',
                                borderRadius: 4,
                                cursor: 'pointer',
                                fontSize: 11,
                                fontFamily: 'monospace',
                                background: '#222',
                                color: '#aaa',
                            }}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            Import
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json"
                            style={{ display: 'none' }}
                            onChange={handleImport}
                        />
                        <button
                            type="button"
                            style={{
                                padding: '4px 10px',
                                border: '1px solid #633',
                                borderRadius: 4,
                                cursor: 'pointer',
                                fontSize: 11,
                                fontFamily: 'monospace',
                                background: '#311',
                                color: '#c66',
                            }}
                            onClick={handleClear}
                        >
                            Wyczysc
                        </button>
                    </span>
                </div>
                <div style={{ color: '#666', fontSize: 11, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{`Potwierdzone: \u2600 ${sunriseCount}/${yearLength}  \u263E ${sunsetCount}/${yearLength}`}</span>
                    {nextSunLabel && <span>{`Nast: ${nextSunLabel}`}</span>}
                </div>
                <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: 6 }}>
                    {monthRanges.map(mr => (
                        <div key={mr.month} style={{ marginBottom: 14 }}>
                            <div style={{
                                fontWeight: 'bold',
                                color: '#ccc',
                                marginBottom: 4,
                                fontSize: 12,
                                display: 'flex',
                                justifyContent: 'space-between',
                            }}>
                                <span style={{ color: '#fff' }}>{mr.month}</span>
                                <span style={{ color: '#777', fontSize: 11 }}>
                                    {`${mr.length}d  \u2600${mr.sunrise}  \u263E${mr.sunset}`}
                                </span>
                            </div>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(8, 1fr)',
                                gap: 2,
                            }}>
                                {Array.from({ length: mr.length }, (_, d) => {
                                    const dayOfYear = mr.startDay + d;
                                    const dayNum = d + 1;
                                    const dayData = eventIndex[dayOfYear];
                                    const hasSunrise = dayData?.sunrise !== undefined;
                                    const hasSunset = dayData?.sunset !== undefined;
                                    const hasAny = hasSunrise || hasSunset;
                                    const isToday = dayOfYear === todayDayOfYear;

                                    return (
                                        <div
                                            key={dayOfYear}
                                            ref={isToday ? todayRef : undefined}
                                            onContextMenu={(ev) => openEditMenu(ev, dayOfYear, dayData?.sunrise, dayData?.sunset)}
                                            style={{
                                                padding: '2px 3px',
                                                textAlign: 'center',
                                                border: isToday ? '1px solid #cc9900' : `1px solid ${hasAny ? '#444' : '#2a2a2a'}`,
                                                borderRadius: 3,
                                                fontSize: 10,
                                                lineHeight: 1.3,
                                                background: hasAny ? '#1a2a1a' : '#111',
                                                minWidth: 0,
                                                cursor: 'context-menu',
                                            }}
                                        >
                                            <div style={{ color: '#666', fontSize: 9 }}>{dayNum}</div>
                                            {hasAny && (
                                                <div style={{ fontSize: 10 }}>
                                                    {hasSunrise && (
                                                        <span style={{ color: dayData!.sunrise === mr.sunrise ? '#ffd700' : '#ff6347' }}>
                                                            {`\u2600${dayData!.sunrise}`}
                                                        </span>
                                                    )}
                                                    {hasSunrise && hasSunset && ' '}
                                                    {hasSunset && (
                                                        <span style={{ color: dayData!.sunset === mr.sunset ? '#6495ed' : '#ff6347' }}>
                                                            {`\u263E${dayData!.sunset}`}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
                {editCell && (
                    <div
                        ref={editRef}
                        style={{
                            position: 'fixed',
                            left: editCell.x,
                            top: editCell.y,
                            background: '#1a1a2e',
                            border: '1px solid #555',
                            borderRadius: 4,
                            padding: 8,
                            zIndex: 10000,
                            fontSize: 11,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                        }}
                    >
                        <div style={{ color: '#aaa', marginBottom: 2 }}>Dzien {editCell.dayOfYear}</div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#ffd700' }}>
                            {'\u2600'}
                            <input
                                type="number"
                                min={0}
                                max={23}
                                value={editSunrise}
                                onChange={e => setEditSunrise(e.target.value)}
                                placeholder="-"
                                style={{ width: 40, background: '#111', border: '1px solid #444', borderRadius: 3, color: '#ddd', padding: '2px 4px', fontSize: 11 }}
                            />
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#6495ed' }}>
                            {'\u263E'}
                            <input
                                type="number"
                                min={0}
                                max={23}
                                value={editSunset}
                                onChange={e => setEditSunset(e.target.value)}
                                placeholder="-"
                                style={{ width: 40, background: '#111', border: '1px solid #444', borderRadius: 3, color: '#ddd', padding: '2px 4px', fontSize: 11 }}
                            />
                        </label>
                        <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                            <button
                                type="button"
                                onClick={handleEditSave}
                                style={{ flex: 1, padding: '3px 8px', background: '#1a3a1a', border: '1px solid #4a4', borderRadius: 3, color: '#8c8', cursor: 'pointer', fontSize: 11, fontFamily: 'monospace' }}
                            >
                                Zapisz
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditCell(null)}
                                style={{ padding: '3px 8px', background: '#222', border: '1px solid #444', borderRadius: 3, color: '#888', cursor: 'pointer', fontSize: 11, fontFamily: 'monospace' }}
                            >
                                Anuluj
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </DockablePopupWrapper>
    );
};

export default SunTrackerPopup;
