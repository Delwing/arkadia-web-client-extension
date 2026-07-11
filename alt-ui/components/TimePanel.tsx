import { useState } from 'react';
import { useClientEvent } from '../hooks/useClientEvent';
import Panel from './Panel';

type Domain = 'Empire' | 'Ishtar';

// Season index → Polish name + hue, matching the stock seasonPrint script.
const SEASONS = [
    { name: 'Wiosna', color: '#00ff7f' }, // wiosna (spring)
    { name: 'Lato', color: '#ffff00' },   // lato (summer)
    { name: 'Jesien', color: '#ff8c00' }, // jesien (autumn)
    { name: 'Zima', color: '#00bfff' },   // zima (winter)
];

interface ClockSnapshot {
    hours: number;
    minutes: number;
    season?: number;
    daylight?: boolean;
    dayLabel?: string;
    dayOfYear?: number;
}

function formatTime(hours: number, minutes: number): string {
    return `${hours.toString().padStart(2, '0')}:${Math.floor(minutes).toString().padStart(2, '0')}`;
}

/**
 * Sidebar panel (between Map and Objects) showing the in-game season, world date
 * and time of day.
 *
 * Season and daylight come straight from `gmcp.room.time` — authoritative for the
 * current location and available the moment you enter a room. The HH:MM clock and
 * world date come from the clock system's `clock.update` for the active domain;
 * those only appear once the clock has parsed a descriptive time, so until then
 * the panel shows the season/day-night it already has and a `--:--` placeholder.
 */
export default function TimePanel() {
    const [gmcpSeason, setGmcpSeason] = useState<number | undefined>();
    const [gmcpDaylight, setGmcpDaylight] = useState<boolean | undefined>();
    const [activeDomain, setActiveDomain] = useState<Domain | undefined>();
    const [clocks, setClocks] = useState<Partial<Record<Domain, ClockSnapshot>>>({});

    useClientEvent('gmcp.room.time', (payload) => {
        const daylight = payload?.daylight ?? payload?.time?.daylight;
        if (typeof daylight === 'boolean') setGmcpDaylight(daylight);
        if (typeof payload?.season === 'number') setGmcpSeason(payload.season);
    });

    useClientEvent('clock.domain.active', ({ domain }) => setActiveDomain(domain));

    useClientEvent('clock.update', (data) => {
        setClocks(prev => ({
            ...prev,
            [data.domain]: {
                hours: data.hours,
                minutes: data.minutes,
                season: data.season,
                daylight: data.daylight,
                dayLabel: data.dayLabel,
                dayOfYear: data.dayOfYear,
            },
        }));
    });

    const clock = activeDomain ? clocks[activeDomain] : undefined;
    const seasonIdx = clock?.season ?? gmcpSeason;
    const daylight = clock?.daylight ?? gmcpDaylight;
    const time = clock ? formatTime(clock.hours, clock.minutes) : undefined;
    const season = seasonIdx !== undefined ? SEASONS[seasonIdx] : undefined;

    const meta = season ? <span style={{ color: season.color }}>{season.name}</span> : undefined;

    return (
        <Panel title="Czas" className="panel--time" meta={meta} bodyClassName="timepane">
            <div className="tp-clock">
                {daylight !== undefined && (
                    <span className={`tp-sky ${daylight ? 'tp-day' : 'tp-night'}`}>
                        <svg viewBox="0 0 20 20">
                            <use href={daylight ? '#i-sun' : '#i-moon'} stroke="currentColor" />
                        </svg>
                    </span>
                )}
                <span className="tp-time">{time ?? '--:--'}</span>
                {daylight !== undefined && (
                    <span className="tp-phase">{daylight ? 'Dzien' : 'Noc'}</span>
                )}
            </div>
            {clock?.dayLabel && (
                <div className="tp-date">
                    {clock.dayLabel}
                    {clock.dayOfYear ? <span className="tp-doy"> &middot; dzien {clock.dayOfYear}</span> : null}
                </div>
            )}
        </Panel>
    );
}
