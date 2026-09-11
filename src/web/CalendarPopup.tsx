import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import eventBus from '@modules/core/eventBus';
import {
    type ClockAnchor,
    type Domain,
    type MoonPhase,
    MONTH_LENGTHS,
    MONTH_ORDER,
    SEASON_NAMES,
    YEAR_LENGTH,
    dayLengthHours,
    formatDay,
    geheimnisnachtForYear,
    moonPhasesForYear,
    nightLengthHours,
    realTimeInYear,
    seasonOf,
    sunHour,
} from '@client/scripts/sunModel.ts';

const POPUP_ID = 'popup:calendar';

const SUN = '☀';
const MOON = '☾';
const FULL_MOON = '●';
const NEW_MOON = '○';

// matching ClockPopup / ClockDisplay
const SEASON_COLORS = [
    'var(--popup-data-spring-green)',
    'var(--popup-data-yellow)',
    'var(--popup-data-orange)',
    'var(--popup-data-blue)',
];

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

function formatRealClock(ms: number): string {
    const d = new Date(ms);
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const dimStyle: React.CSSProperties = { color: 'var(--popup-text-dim)' };

/** Real-world clock, with the date dropped when it is today. */
function formatRealShort(ms: number): string {
    const d = new Date(ms);
    const now = new Date();
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const sameDay = d.getDate() === now.getDate()
        && d.getMonth() === now.getMonth()
        && d.getFullYear() === now.getFullYear();
    return sameDay ? time : `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${time}`;
}

interface DayCell {
    dayOfYear: number;
    dayOfMonth: number;
    sunrise: number;
    sunset: number;
    season: number;
    moon?: MoonPhase;
    isToday: boolean;
    isGeheimnisnacht: boolean;
}

interface MonthSection {
    month: string;
    days: DayCell[];
    /** Distinct sunrise hours across the month, ascending. */
    sunrises: number[];
    sunsets: number[];
    seasons: number[];
}

const CalendarPopup: React.FC = () => {
    const { wrapperProps } = usePopup(POPUP_ID, { openEvent: 'calendar.popup.open' });
    const [activeTab, setActiveTab] = useState<Domain>('Empire');
    const [anchors, setAnchors] = useState<Partial<Record<Domain, ClockAnchor>>>({});
    const [hovered, setHovered] = useState<DayCell | null>(null);
    const [yearOffset, setYearOffset] = useState(0);
    const lastDomainRef = useRef<Domain | null>(null);
    const todayRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        return eventBus.on('clock.update', (data) => {
            if (!wrapperProps.isOpen) return;
            const domain = data.domain as Domain;
            setAnchors(prev => ({
                ...prev,
                [domain]: {
                    domain,
                    dayOfYear: data.dayOfYear,
                    hours: data.hours,
                    minutes: data.minutes,
                    realMs: Date.now(),
                },
            }));
        });
    }, [wrapperProps.isOpen]);

    useEffect(() => {
        const handler = (data: { domain: Domain }) => { lastDomainRef.current = data.domain; };
        eventBus.on('clock.domain.active', handler);
        return () => { eventBus.off('clock.domain.active', handler); };
    }, []);

    useEffect(() => {
        if (!wrapperProps.isOpen) return;
        if (lastDomainRef.current) setActiveTab(lastDomainRef.current);
        setYearOffset(0);
    }, [wrapperProps.isOpen]);

    const anchor = anchors[activeTab];
    const today = anchor?.dayOfYear;

    // Geheimnisnacht is Empire-only and fixed for the in-game year, so it only
    // needs recomputing when the day turns rather than on every clock tick.
    const empireAnchor = anchors.Empire;
    const geheimnisnacht = useMemo(() => {
        if (!empireAnchor) return null;
        return geheimnisnachtForYear(empireAnchor, yearOffset).winner?.night ?? null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [empireAnchor?.dayOfYear, yearOffset]);

    const moons = useMemo(() => moonPhasesForYear(activeTab), [activeTab]);

    const months: MonthSection[] = useMemo(() => {
        let startDay = 1;
        return MONTH_ORDER[activeTab].map(month => {
            const days: DayCell[] = [];
            for (let i = 0; i < MONTH_LENGTHS[month]; i++) {
                const dayOfYear = startDay + i;
                days.push({
                    dayOfYear,
                    dayOfMonth: i + 1,
                    sunrise: sunHour(activeTab, dayOfYear, 'sunrise'),
                    sunset: sunHour(activeTab, dayOfYear, 'sunset'),
                    season: seasonOf(activeTab, dayOfYear),
                    moon: moons.get(dayOfYear),
                    isToday: yearOffset === 0 && dayOfYear === today,
                    isGeheimnisnacht: activeTab === 'Empire'
                        && geheimnisnacht?.dayOfYear === dayOfYear,
                });
            }
            startDay += MONTH_LENGTHS[month];
            const uniq = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);
            return {
                month,
                days,
                sunrises: uniq(days.map(d => d.sunrise)),
                sunsets: uniq(days.map(d => d.sunset)),
                // in the order they occur, so a month spanning a boundary reads
                // the way it is lived rather than by season index
                seasons: [...new Set(days.map(d => d.season))],
            };
        });
    }, [activeTab, moons, today, geheimnisnacht, yearOffset]);

    useEffect(() => {
        if (!wrapperProps.isOpen) return;
        requestAnimationFrame(() => todayRef.current?.scrollIntoView({ block: 'center' }));
    }, [wrapperProps.isOpen, activeTab, yearOffset]);

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="calendar"
            title="Kalendarz roku"
            minWidth={340}
            minHeight={260}
            initialWidth={520}
        >
            <div style={{
                fontFamily: 'monospace',
                fontSize: 12,
                padding: 8,
                color: 'var(--popup-text)',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                overflow: 'hidden',
            }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
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
                    <div style={{ flex: 1 }} />
                    <button
                        type="button"
                        className="popup-tab"
                        title="Poprzedni rok IG"
                        disabled={yearOffset === 0}
                        onClick={() => setYearOffset(y => Math.max(0, y - 1))}
                        style={{ flex: 'none', padding: '0 8px', opacity: yearOffset === 0 ? 0.4 : 1 }}
                    >
                        &lt;
                    </button>
                    <span style={{
                        ...dimStyle,
                        alignSelf: 'center',
                        fontSize: 11,
                        minWidth: 58,
                        textAlign: 'center',
                    }}>
                        {yearOffset === 0 ? 'ten rok' : `rok +${yearOffset}`}
                    </span>
                    <button
                        type="button"
                        className="popup-tab"
                        title="Nastepny rok IG"
                        onClick={() => setYearOffset(y => y + 1)}
                        style={{ flex: 'none', padding: '0 8px' }}
                    >
                        &gt;
                    </button>
                </div>

                {!anchor ? (
                    <div style={{ ...dimStyle, padding: 4 }}>
                        Czekam na odczyt zegara. Wpisz <strong>czas</strong> aby zsynchronizowac.
                    </div>
                ) : (
                    <>
                        <Summary
                            domain={activeTab}
                            anchor={anchor}
                            geheimnisnacht={geheimnisnacht}
                            hovered={hovered}
                            yearOffset={yearOffset}
                        />
                        <div ref={scrollRef} style={{
                            flex: 1,
                            overflowY: 'auto',
                            minHeight: 0,
                            marginTop: 8,
                            paddingRight: 6,
                        }}>
                            {months.map(section => (
                                <Month
                                    key={section.month}
                                    section={section}
                                    domain={activeTab}
                                    todayRef={todayRef}
                                    onHover={setHovered}
                                />
                            ))}
                        </div>
                        <Legend domain={activeTab} />
                    </>
                )}
            </div>
        </DockablePopupWrapper>
    );
};

const Month: React.FC<{
    section: MonthSection;
    domain: Domain;
    todayRef: React.RefObject<HTMLDivElement | null>;
    onHover: (day: DayCell | null) => void;
}> = ({ section, domain, todayRef, onHover }) => {
    const range = (xs: number[]) => (xs.length === 1 ? `${xs[0]}` : `${xs[0]}-${xs[xs.length - 1]}`);
    return (
        <div style={{ marginBottom: 14 }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 4,
                fontSize: 12,
            }}>
                <span style={{ fontWeight: 'bold', color: 'var(--popup-text-strong)' }}>
                    {section.month}
                </span>
                <span style={{ ...dimStyle, fontSize: 11 }}>
                    {section.seasons.map(s => (
                        <span key={s} style={{ color: SEASON_COLORS[s], marginRight: 6 }}>
                            {SEASON_NAMES[s]}
                        </span>
                    ))}
                    {section.days.length}d
                    <span style={{ color: 'var(--popup-data-gold)', marginLeft: 6 }}>
                        {SUN}{range(section.sunrises)}
                    </span>
                    <span style={{ color: 'var(--popup-data-blue)', marginLeft: 4 }}>
                        {MOON}{range(section.sunsets)}
                    </span>
                </span>
            </div>
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(8, 1fr)',
                gap: 2,
                userSelect: 'none',
            }}>
                {section.days.map(day => (
                    <Day
                        key={day.dayOfYear}
                        day={day}
                        domain={domain}
                        cellRef={day.isToday ? todayRef : undefined}
                        onHover={onHover}
                    />
                ))}
            </div>
        </div>
    );
};

const Day: React.FC<{
    day: DayCell;
    domain: Domain;
    cellRef?: React.RefObject<HTMLDivElement | null>;
    onHover: (day: DayCell | null) => void;
}> = ({ day, domain, cellRef, onHover }) => {
    const moonLabel = day.moon === 'full' ? ', pelnia' : day.moon === 'new' ? ', now' : '';
    const title = `${formatDay(domain, day.dayOfYear)} - ${SUN} ${day.sunrise}:00, `
        + `${MOON} ${day.sunset}:00${moonLabel}`
        + (day.isGeheimnisnacht ? ', Geheimnisnacht' : '');

    const border = day.isGeheimnisnacht
        ? '1px solid var(--popup-data-tomato)'
        : day.isToday
            ? '1px solid #cc9900'
            : '1px solid #2a2a2a';

    return (
        <div
            ref={cellRef}
            title={title}
            onMouseEnter={() => onHover(day)}
            onMouseLeave={() => onHover(null)}
            style={{
                padding: '2px 3px',
                textAlign: 'center',
                border,
                borderRadius: 3,
                fontSize: 10,
                lineHeight: 1.3,
                minWidth: 0,
                cursor: 'default',
                // season tint, faint enough to leave the hours legible
                background: day.isGeheimnisnacht
                    ? 'var(--popup-danger-subtle-bg)'
                    : `color-mix(in srgb, ${SEASON_COLORS[day.season]} 9%, transparent)`,
            }}
        >
            <div style={{
                ...dimStyle,
                fontSize: 9,
                display: 'flex',
                justifyContent: 'center',
                gap: 2,
            }}>
                <span>{day.dayOfMonth}</span>
                {day.moon && (
                    <span style={{
                        color: day.moon === 'full'
                            ? 'var(--popup-data-yellow)'
                            : 'var(--popup-text-subtle)',
                    }}>
                        {day.moon === 'full' ? FULL_MOON : NEW_MOON}
                    </span>
                )}
            </div>
            <div style={{ fontSize: 10 }}>
                <span style={{ color: 'var(--popup-data-gold)' }}>{SUN}{day.sunrise}</span>
                {' '}
                <span style={{ color: 'var(--popup-data-blue)' }}>{MOON}{day.sunset}</span>
            </div>
        </div>
    );
};

const Summary: React.FC<{
    domain: Domain;
    anchor: ClockAnchor;
    geheimnisnacht: {
        dayOfYear: number;
        startMs: number;
        endMs: number;
        igHours: number;
        offsetMinutes: number;
        fromFullMoon: number;
    } | null;
    hovered: DayCell | null;
    yearOffset: number;
}> = ({ domain, anchor, geheimnisnacht, hovered, yearOffset }) => {
    const day = hovered?.dayOfYear ?? (yearOffset === 0 ? anchor.dayOfYear : 1);
    const season = seasonOf(domain, day);
    // where this in-game day actually falls on the wall clock; an in-game day is
    // 48 real minutes, so the whole thing fits inside one real-world evening
    const sunriseMs = realTimeInYear(anchor, yearOffset, day, sunHour(domain, day, 'sunrise'));
    const sunsetMs = realTimeInYear(anchor, yearOffset, day, sunHour(domain, day, 'sunset'));
    const dayStartMs = realTimeInYear(anchor, yearOffset, day, 0);
    return (
        <div style={{ fontSize: 11, lineHeight: '17px' }}>
            <div>
                <span style={dimStyle}>
                    {hovered ? 'Wybrany' : yearOffset === 0 ? 'Dzis' : 'Poczatek roku'}:{' '}
                </span>
                <strong>{formatDay(domain, day)}</strong>
                <span style={dimStyle}> (dzien {day}/{YEAR_LENGTH[domain]}), </span>
                <span style={{ color: SEASON_COLORS[season] }}>{SEASON_NAMES[season]}</span>
                <span style={dimStyle}>
                    , dzien {dayLengthHours(domain, day) * 2} min,
                    noc {nightLengthHours(domain, day) * 2} min
                </span>
            </div>
            <div>
                <span style={dimStyle}>Czas RL: </span>
                <span style={{ color: 'var(--popup-data-gold)' }}>
                    {SUN} {formatRealShort(sunriseMs)}
                </span>
                <span style={{ color: 'var(--popup-data-blue)', marginLeft: 8 }}>
                    {MOON} {formatRealShort(sunsetMs)}
                </span>
                <span style={dimStyle}>
                    {' '}(caly dzien IG od {formatRealShort(dayStartMs)}, 48 min RL)
                </span>
            </div>
            {domain === 'Empire' && geheimnisnacht && (
                <div>
                    <span style={dimStyle}>Geheimnisnacht: </span>
                    <span style={{ color: 'var(--popup-data-tomato)' }}>
                        {formatDay('Empire', geheimnisnacht.dayOfYear)}
                    </span>
                    <span style={dimStyle}>
                        {' '}(pelnia {geheimnisnacht.fromFullMoon >= 0 ? '+' : ''}
                        {geheimnisnacht.fromFullMoon})
                        {' '}- {formatRealClock(geheimnisnacht.startMs)}-
                        {formatRealClock(geheimnisnacht.endMs).slice(-5)}
                        {' '}({geheimnisnacht.igHours * 2} min RL)
                        {/* how close the night lands to the target - a fact about this
                            night, not a hedge: the rule yields exactly one per year */}
                        {' '}- {Math.abs(geheimnisnacht.offsetMinutes)} min przed 21:00
                    </span>
                </div>
            )}
        </div>
    );
};

const Legend: React.FC<{ domain: Domain }> = ({ domain }) => (
    <div style={{
        ...dimStyle,
        fontSize: 10,
        marginTop: 6,
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap',
    }}>
        <span style={{ color: 'var(--popup-data-gold)' }}>{SUN} wschod</span>
        <span style={{ color: 'var(--popup-data-blue)' }}>{MOON} zachod</span>
        <span style={{ color: 'var(--popup-data-yellow)' }}>{FULL_MOON} pelnia</span>
        {domain === 'Empire' && <span>{NEW_MOON} now</span>}
        {domain === 'Empire' && (
            <span style={{ color: 'var(--popup-data-tomato)' }}>Geheimnisnacht</span>
        )}
    </div>
);

export default CalendarPopup;
