import { useState } from 'react';
import { useClientEvent } from '../hooks/useClientEvent';
import Panel from './Panel';

type Domain = 'Empire' | 'Ishtar';

// Season index → Polish name + hue. Muted, parchment-friendly tones (the stock
// seasonPrint script's pure colors are too saturated for the forged palette).
const SEASONS = [
    { name: 'Wiosna', color: '#8fbf94' }, // wiosna (spring) — muted sage
    { name: 'Lato', color: '#d6c06e' },   // lato (summer) — muted wheat gold
    { name: 'Jesien', color: '#cc8a55' }, // jesien (autumn) — muted amber
    { name: 'Zima', color: '#8fb2c9' },   // zima (winter) — muted slate blue
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
                {/* Sun/moon icon and time are one centered unit; the date hangs off
                    to the right, baseline-aligned to the clock. */}
                <span className="tp-now">
                    {daylight !== undefined && (
                        <span className={`tp-sky ${daylight ? 'tp-day' : 'tp-night'}`}>
                            <svg viewBox="0 0 20 20">
                                <use href={daylight ? '#i-sun' : '#i-moon'} stroke="currentColor" />
                            </svg>
                        </span>
                    )}
                    <span className="tp-time">{time ?? '--:--'}</span>
                </span>
                {/* Date sits to the right of the clock when the row is wide enough,
                    and wraps onto its own line below when it isn't. The day/night
                    phase word is intentionally dropped — the sun/moon icon already
                    conveys it. */}
                {clock?.dayLabel && (
                    <span className="tp-date">
                        {clock.dayLabel}
                        {clock.dayOfYear ? <span className="tp-doy"> &middot; dzien {clock.dayOfYear}</span> : null}
                    </span>
                )}
            </div>
        </Panel>
    );
}
