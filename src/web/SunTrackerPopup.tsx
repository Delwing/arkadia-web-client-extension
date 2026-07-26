import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

function predictRealTime(
    clock: ClockState,
    targetDayOfYear: number,
    targetHour: number,
    yearLength: number,
): Date | null {
    if (clock.dayOfYear === undefined) return null;

    let daysAhead = targetDayOfYear - clock.dayOfYear;
    if (daysAhead < 0) daysAhead += yearLength;

    let mudMinutesUntil = daysAhead * 24 * 60 + (targetHour * 60) - (clock.hours * 60 + clock.minutes);
    if (mudMinutesUntil < 0) mudMinutesUntil += yearLength * 24 * 60;

    const realSeconds = mudMinutesUntil * MUD_MINUTE_IN_SECONDS;
    return new Date(Date.now() + realSeconds * 1000);
}

function formatTime(date: Date): string {
    const now = new Date();
    const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    const time = date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return time;
    const day = date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
    return `${day} ${time}`;
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
    const [rangeStart, setRangeStart] = useState<number | null>(null);
    const [rangeEdit, setRangeEdit] = useState<{ from: number; to: number; x: number; y: number } | null>(null);
    const [rangeSunrise, setRangeSunrise] = useState('');
    const [rangeSunset, setRangeSunset] = useState('');
    const rangeRef = useRef<HTMLDivElement>(null);
    const [hoverDay, setHoverDay] = useState<{ dayOfYear: number; x: number; y: number } | null>(null);

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
        return eventBus.on("sunTracker.updated", (data) => {
            if (wrapperProps.isOpen) {
                if (data && typeof data === 'object' && 'domain' in data && data.domain) {
                    setActiveTab(data.domain);
                }
                needsScrollRef.current = true;
                setRefreshKey(k => k + 1);
            }
        });
    }, [wrapperProps.isOpen]);

    // Track clock data for next sun event display
    useEffect(() => {
        return eventBus.on("clock.update", (data) => {
            if (!wrapperProps.isOpen) return;
            setClockData(prev => ({
                ...prev,
                [data.domain]: { domain: data.domain as Domain, hours: data.hours, minutes: data.minutes, sunrise: data.sunrise, sunset: data.sunset, dayOfYear: data.dayOfYear },
            }));
        });
    }, [wrapperProps.isOpen]);

    // Track active domain from clock system
    useEffect(() => {
        const handler = (data: { domain: Domain }) => {
            lastDomainRef.current = data.domain;
        };
        eventBus.on("clock.domain.active", handler);
        return () => { eventBus.off("clock.domain.active", handler); };
    }, []);

    // Auto-select tab based on current domain when popup opens
    useEffect(() => {
        if (wrapperProps.isOpen && lastDomainRef.current) {
            setActiveTab(lastDomainRef.current);
        }
    }, [wrapperProps.isOpen]);

    // Handle domain from sunTracker.popup.open event (e.g. after czas confirmation)
    useEffect(() => {
        return eventBus.on("sunTracker.popup.open", (data) => {
            if (data && typeof data === 'object' && 'domain' in data && data.domain) {
                setActiveTab(data.domain);
                needsScrollRef.current = true;
            }
        });
    }, []);

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

    const handleDayClick = (ev: React.MouseEvent, dayOfYear: number) => {
        if (!ev.shiftKey) return;
        ev.preventDefault();
        if (rangeStart === null) {
            setRangeStart(dayOfYear);
            setRangeEdit(null);
        } else {
            const from = Math.min(rangeStart, dayOfYear);
            const to = Math.max(rangeStart, dayOfYear);
            if (from === to) {
                setRangeStart(null);
                return;
            }
            setRangeSunrise('');
            setRangeSunset('');
            setRangeEdit({ from, to, x: ev.clientX, y: ev.clientY });
            setRangeStart(null);
        }
    };

    const handleRangeFill = async () => {
        if (!rangeEdit) return;
        const sr = rangeSunrise.trim() !== '' ? parseInt(rangeSunrise, 10) : null;
        const ss = rangeSunset.trim() !== '' ? parseInt(rangeSunset, 10) : null;
        if ((sr === null || isNaN(sr)) && (ss === null || isNaN(ss))) return;
        const now = Date.now();
        for (let day = rangeEdit.from; day <= rangeEdit.to; day++) {
            if (sr !== null && !isNaN(sr)) {
                await storeConfirmedEvent({ domain: activeTab, type: 'sunrise', dayOfYear: day, observedHour: sr, confirmedAt: now });
            }
            if (ss !== null && !isNaN(ss)) {
                await storeConfirmedEvent({ domain: activeTab, type: 'sunset', dayOfYear: day, observedHour: ss, confirmedAt: now });
            }
        }
        setRangeEdit(null);
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

    // Close range popup on click outside
    useEffect(() => {
        if (!rangeEdit) return;
        const handler = (e: MouseEvent) => {
            if (rangeRef.current && !rangeRef.current.contains(e.target as Node)) {
                setRangeEdit(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [rangeEdit]);

    // Clear range selection on tab switch
    useEffect(() => {
        setRangeStart(null);
        setRangeEdit(null);
    }, [activeTab]);

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
            <div style={{ fontFamily: 'monospace', fontSize: 12, padding: 8, color: 'var(--popup-text)', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                    <button
                        type="button"
                        className={`popup-tab ${activeTab === 'Empire' ? 'popup-tab--active' : ''}`}
                        onClick={() => setActiveTab('Empire')}
                    >
                        Imperium
                    </button>
                    <button
                        type="button"
                        className={`popup-tab ${activeTab === 'Ishtar' ? 'popup-tab--active' : ''}`}
                        onClick={() => setActiveTab('Ishtar')}
                    >
                        Ishtar
                    </button>
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                        <button
                            type="button"
                            style={{
                                padding: '4px 10px',
                                border: '1px solid var(--popup-border-control)',
                                borderRadius: 4,
                                cursor: 'pointer',
                                fontSize: 11,
                                fontFamily: 'monospace',
                                background: 'var(--popup-control-bg)',
                                color: 'var(--popup-text-subtle)',
                            }}
                            onClick={handleExport}
                        >
                            Eksport
                        </button>
                        <button
                            type="button"
                            style={{
                                padding: '4px 10px',
                                border: '1px solid var(--popup-border-control)',
                                borderRadius: 4,
                                cursor: 'pointer',
                                fontSize: 11,
                                fontFamily: 'monospace',
                                background: 'var(--popup-control-bg)',
                                color: 'var(--popup-text-subtle)',
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
                                background: 'var(--popup-danger-subtle-bg)',
                                color: 'var(--popup-danger)',
                            }}
                            onClick={handleClear}
                        >
                            Wyczysc
                        </button>
                    </span>
                </div>
                <div style={{ color: 'var(--popup-text-dim)', fontSize: 11, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <span>
                        {`Potwierdzone: \u2600 ${sunriseCount}/${yearLength}  \u263E ${sunsetCount}/${yearLength}`}
                        {rangeStart !== null && (
                            <span style={{ color: 'var(--popup-data-gold)', marginLeft: 8 }}>
                                {`Kliknij dzien koncowy (od ${rangeStart})`}
                            </span>
                        )}
                    </span>
                    {nextSunLabel && <span>{`Nast: ${nextSunLabel}`}</span>}
                </div>
                <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: 6 }}>
                    {monthRanges.map(mr => (
                        <div key={mr.month} style={{ marginBottom: 14 }}>
                            <div style={{
                                fontWeight: 'bold',
                                color: 'var(--popup-text-bright)',
                                marginBottom: 4,
                                fontSize: 12,
                                display: 'flex',
                                justifyContent: 'space-between',
                            }}>
                                <span style={{ color: 'var(--popup-text-strong)' }}>{mr.month}</span>
                                <span style={{ color: 'var(--popup-text-dim)', fontSize: 11 }}>
                                    {`${mr.length}d  \u2600${mr.sunrise}  \u263E${mr.sunset}`}
                                </span>
                            </div>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(8, 1fr)',
                                gap: 2,
                                userSelect: 'none',
                            }}>
                                {Array.from({ length: mr.length }, (_, d) => {
                                    const dayOfYear = mr.startDay + d;
                                    const dayNum = d + 1;
                                    const dayData = eventIndex[dayOfYear];
                                    const hasSunrise = dayData?.sunrise !== undefined;
                                    const hasSunset = dayData?.sunset !== undefined;
                                    const hasAny = hasSunrise || hasSunset;
                                    const isToday = dayOfYear === todayDayOfYear;
                                    const isRangeSelected = rangeStart === dayOfYear;
                                    const isInRange = rangeEdit && dayOfYear >= rangeEdit.from && dayOfYear <= rangeEdit.to;
                                    const isEditing = editCell?.dayOfYear === dayOfYear;

                                    return (
                                        <div
                                            key={dayOfYear}
                                            ref={isToday ? todayRef : undefined}
                                            onClick={(ev) => handleDayClick(ev, dayOfYear)}
                                            onContextMenu={(ev) => openEditMenu(ev, dayOfYear, dayData?.sunrise, dayData?.sunset)}
                                            onMouseEnter={(ev) => {
                                                const rect = ev.currentTarget.getBoundingClientRect();
                                                setHoverDay({ dayOfYear, x: rect.left + rect.width / 2, y: rect.top });
                                            }}
                                            onMouseLeave={() => setHoverDay(null)}
                                            style={{
                                                padding: '2px 3px',
                                                textAlign: 'center',
                                                border: isEditing ? '1px solid var(--popup-data-gold)' : isRangeSelected ? '1px solid var(--popup-data-gold)' : isInRange ? '1px solid #996600' : isToday ? '1px solid #cc9900' : `1px solid ${hasAny ? '#444' : '#2a2a2a'}`,
                                                borderRadius: 3,
                                                fontSize: 10,
                                                lineHeight: 1.3,
                                                background: isEditing ? 'rgba(204, 153, 0, 0.3)' : isRangeSelected ? 'rgba(204, 153, 0, 0.3)' : isInRange ? 'rgba(204, 153, 0, 0.15)' : hasAny ? 'var(--popup-success-subtle-bg)' : 'var(--popup-subtle-bg)',
                                                minWidth: 0,
                                                cursor: 'context-menu',
                                            }}
                                        >
                                            <div style={{ color: 'var(--popup-text-dim)', fontSize: 9 }}>{dayNum}</div>
                                            {hasAny && (
                                                <div style={{ fontSize: 10 }}>
                                                    {hasSunrise && (
                                                        <span style={{ color: dayData!.sunrise === mr.sunrise ? 'var(--popup-data-gold)' : 'var(--popup-data-tomato)' }}>
                                                            {`\u2600${dayData!.sunrise}`}
                                                        </span>
                                                    )}
                                                    {hasSunrise && hasSunset && ' '}
                                                    {hasSunset && (
                                                        <span style={{ color: dayData!.sunset === mr.sunset ? 'var(--popup-data-blue)' : 'var(--popup-data-tomato)' }}>
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
                {/* The three overlays below are `position: fixed` at viewport
                    coordinates, so they must live at <body> level. An alternative
                    UI (forge) puts a `filter` on `.dockable-popup-body`, which
                    makes that element the containing block for fixed descendants:
                    rendered in place they'd be offset by the popup's own origin
                    AND — since the body scrolls (`overflow: auto`) — would inflate
                    its scroll area, toggling scrollbars that reflow the day grid
                    under the cursor (enter/leave/enter → visible flicker).
                    `data-popup-overlay` keeps a click inside them from closing the
                    popup (useDockablePopup's outside-click guard) and carries the
                    `--popup-*` theming outside the panel. */}
                {editCell && createPortal((
                    <div
                        ref={editRef}
                        data-popup-overlay
                        style={{
                            position: 'fixed',
                            left: editCell.x,
                            top: editCell.y,
                            background: 'var(--popup-bg)',
                            border: '1px solid var(--popup-border-strong)',
                            borderRadius: 4,
                            padding: 8,
                            zIndex: 10000,
                            fontSize: 11,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                        }}
                    >
                        <div style={{ color: 'var(--popup-text-subtle)', marginBottom: 2 }}>Dzien {editCell.dayOfYear}</div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--popup-data-gold)' }}>
                            {'\u2600'}
                            <input
                                type="number"
                                min={0}
                                max={23}
                                value={editSunrise}
                                onChange={e => setEditSunrise(e.target.value)}
                                placeholder="-"
                                style={{ width: 40, background: 'var(--popup-input-bg)', border: '1px solid var(--popup-border-control)', borderRadius: 3, color: 'var(--popup-input-text)', padding: '2px 4px', fontSize: 11 }}
                            />
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--popup-data-blue)' }}>
                            {'\u263E'}
                            <input
                                type="number"
                                min={0}
                                max={23}
                                value={editSunset}
                                onChange={e => setEditSunset(e.target.value)}
                                placeholder="-"
                                style={{ width: 40, background: 'var(--popup-input-bg)', border: '1px solid var(--popup-border-control)', borderRadius: 3, color: 'var(--popup-input-text)', padding: '2px 4px', fontSize: 11 }}
                            />
                        </label>
                        <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                            <button
                                type="button"
                                onClick={handleEditSave}
                                style={{ flex: 1, padding: '3px 8px', background: 'var(--popup-success-subtle-bg)', border: '1px solid var(--popup-success-border)', borderRadius: 3, color: 'var(--popup-success)', cursor: 'pointer', fontSize: 11, fontFamily: 'monospace' }}
                            >
                                Zapisz
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditCell(null)}
                                style={{ padding: '3px 8px', background: 'var(--popup-control-bg)', border: '1px solid var(--popup-border-control)', borderRadius: 3, color: 'var(--popup-text-dim)', cursor: 'pointer', fontSize: 11, fontFamily: 'monospace' }}
                            >
                                Anuluj
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={() => { setRangeStart(editCell.dayOfYear); setEditCell(null); }}
                            style={{ marginTop: 2, padding: '3px 8px', background: 'var(--popup-control-bg)', border: '1px solid var(--popup-border-control)', borderRadius: 3, color: 'var(--popup-data-gold)', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace', width: '100%' }}
                        >
                            Zakres od dnia {editCell.dayOfYear}...
                        </button>
                    </div>
                ), document.body)}
                {rangeEdit && createPortal((
                    <div
                        ref={rangeRef}
                        data-popup-overlay
                        style={{
                            position: 'fixed',
                            left: rangeEdit.x,
                            top: rangeEdit.y,
                            background: 'var(--popup-bg)',
                            border: '1px solid var(--popup-border-strong)',
                            borderRadius: 4,
                            padding: 8,
                            zIndex: 10000,
                            fontSize: 11,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                        }}
                    >
                        <div style={{ color: 'var(--popup-text-subtle)', marginBottom: 2 }}>Dni {rangeEdit.from} - {rangeEdit.to} ({rangeEdit.to - rangeEdit.from + 1})</div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--popup-data-gold)' }}>
                            {'\u2600'}
                            <input
                                type="number"
                                min={0}
                                max={23}
                                value={rangeSunrise}
                                onChange={e => setRangeSunrise(e.target.value)}
                                placeholder="-"
                                style={{ width: 40, background: 'var(--popup-input-bg)', border: '1px solid var(--popup-border-control)', borderRadius: 3, color: 'var(--popup-input-text)', padding: '2px 4px', fontSize: 11 }}
                            />
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--popup-data-blue)' }}>
                            {'\u263E'}
                            <input
                                type="number"
                                min={0}
                                max={23}
                                value={rangeSunset}
                                onChange={e => setRangeSunset(e.target.value)}
                                placeholder="-"
                                style={{ width: 40, background: 'var(--popup-input-bg)', border: '1px solid var(--popup-border-control)', borderRadius: 3, color: 'var(--popup-input-text)', padding: '2px 4px', fontSize: 11 }}
                            />
                        </label>
                        <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                            <button
                                type="button"
                                onClick={handleRangeFill}
                                style={{ flex: 1, padding: '3px 8px', background: 'var(--popup-success-subtle-bg)', border: '1px solid var(--popup-success-border)', borderRadius: 3, color: 'var(--popup-success)', cursor: 'pointer', fontSize: 11, fontFamily: 'monospace' }}
                            >
                                Wypelnij
                            </button>
                            <button
                                type="button"
                                onClick={() => setRangeEdit(null)}
                                style={{ padding: '3px 8px', background: 'var(--popup-control-bg)', border: '1px solid var(--popup-border-control)', borderRadius: 3, color: 'var(--popup-text-dim)', cursor: 'pointer', fontSize: 11, fontFamily: 'monospace' }}
                            >
                                Anuluj
                            </button>
                        </div>
                    </div>
                ), document.body)}
                {hoverDay && activeClock && (() => {
                    const dayData = eventIndex[hoverDay.dayOfYear];
                    const mr = monthRanges.find(m => hoverDay.dayOfYear >= m.startDay && hoverDay.dayOfYear < m.startDay + m.length);
                    if (!mr) return null;
                    const srHour = dayData?.sunrise ?? mr.sunrise;
                    const ssHour = dayData?.sunset ?? mr.sunset;
                    const srTime = predictRealTime(activeClock, hoverDay.dayOfYear, srHour, yearLength);
                    const ssTime = predictRealTime(activeClock, hoverDay.dayOfYear, ssHour, yearLength);
                    if (!srTime && !ssTime) return null;
                    return createPortal((
                        <div data-popup-overlay style={{
                            position: 'fixed',
                            left: hoverDay.x,
                            top: hoverDay.y - 4,
                            transform: 'translate(-50%, -100%)',
                            background: 'var(--popup-bg)',
                            border: '1px solid var(--popup-border-strong)',
                            borderRadius: 4,
                            padding: '4px 8px',
                            zIndex: 10001,
                            fontSize: 11,
                            fontFamily: 'monospace',
                            pointerEvents: 'none',
                            whiteSpace: 'nowrap',
                            color: 'var(--popup-text)',
                        }}>
                            {srTime && (
                                <div style={{ color: dayData?.sunrise !== undefined ? 'var(--popup-data-gold)' : 'var(--popup-text-dim)' }}>
                                    {`\u2600 ${srHour}:00 \u2192 ${formatTime(srTime)}`}
                                </div>
                            )}
                            {ssTime && (
                                <div style={{ color: dayData?.sunset !== undefined ? 'var(--popup-data-blue)' : 'var(--popup-text-dim)' }}>
                                    {`\u263E ${ssHour}:00 \u2192 ${formatTime(ssTime)}`}
                                </div>
                            )}
                        </div>
                    ), document.body);
                })()}
            </div>
        </DockablePopupWrapper>
    );
};

export default SunTrackerPopup;
