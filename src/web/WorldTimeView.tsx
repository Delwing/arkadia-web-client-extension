import React from 'react';
import { useWorldClock, type ClockSnapshot, type Domain } from './worldClockStore';
import './WorldTimePopup.css';

/** Which clocks to show, relative to the domain you stand in. */
export type WorldTimeView = 'current' | 'other' | 'both';

const DOMAIN_LABELS: Record<Domain, string> = { Empire: 'Imperium', Ishtar: 'Ishtar' };
const DOMAINS: Domain[] = ['Empire', 'Ishtar'];

// Season index → Polish name + hue. Muted, parchment-friendly tones.
const SEASONS = [
    { name: 'Wiosna', color: '#8fbf94' }, // spring — muted sage
    { name: 'Lato', color: '#d6c06e' },   // summer — muted wheat gold
    { name: 'Jesień', color: '#cc8a55' }, // autumn — muted amber
    { name: 'Zima', color: '#8fb2c9' },   // winter — muted slate blue
];

function formatTime(hours: number, minutes: number): string {
    return `${hours.toString().padStart(2, '0')}:${Math.floor(minutes).toString().padStart(2, '0')}`;
}

function formatSunHour(hour: number): string {
    return `${hour.toString().padStart(2, '0')}:00`;
}

/** Position of an hour of the day along the 24h day track, in percent. */
function dayPercent(hours: number): string {
    return `${(hours / 24) * 100}%`;
}

const IconSun = () => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="10" cy="10" r="3.4" />
        <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M15.7 4.3l-1.4 1.4M5.7 14.3l-1.4 1.4" />
    </svg>
);

const IconMoon = () => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15.5 11.5A6 6 0 1 1 8.5 4.5a4.6 4.6 0 0 0 7 7Z" />
    </svg>
);

interface DomainClockProps {
    clock?: ClockSnapshot;
    /** Season / daylight to fall back on before the clock has read a time. */
    fallbackSeason?: number;
    fallbackDaylight?: boolean;
    /** The domain's name, captioned over its clock. */
    label: string;
    /** The domain you stand in, marked on the caption. */
    here?: boolean;
    /** Leave out the 24h day line. */
    noDayBar?: boolean;
}

/** One domain's clock: sky, time and calendar, and the 24h day line under them. */
const DomainClock: React.FC<DomainClockProps> = ({ clock, fallbackSeason, fallbackDaylight, label, here, noDayBar }) => {
    const seasonIdx = clock?.season ?? fallbackSeason;
    const daylight = clock?.daylight ?? fallbackDaylight;
    const season = seasonIdx !== undefined ? SEASONS[seasonIdx] : undefined;
    const sunrise = clock?.sunrise;
    const sunset = clock?.sunset;
    const hasSun = sunrise !== undefined && sunset !== undefined;

    return (
        <div className="wt-domain">
            <div className={`wt-domain-label${here ? ' is-here' : ''}`} title={here ? 'Tu jesteś' : undefined}>
                {label}
            </div>
            <div className="wt-clock">
                {daylight !== undefined && (
                    <span className={`wt-sky ${daylight ? 'wt-day' : 'wt-night'}`}>
                        {daylight ? <IconSun /> : <IconMoon />}
                    </span>
                )}
                <span className="wt-time">{clock ? formatTime(clock.hours, clock.minutes) : '--:--'}</span>
                {(season || clock?.dayLabel) && (
                    <div className="wt-cal">
                        {(season || clock?.dayOfYear) && (
                            <span className="wt-season-line">
                                {season && <span className="wt-season" style={{ color: season.color }}>{season.name}</span>}
                                {season && clock?.dayOfYear ? ' · ' : null}
                                {clock?.dayOfYear ? <span className="wt-doy">dzień {clock.dayOfYear}</span> : null}
                            </span>
                        )}
                        {clock?.dayLabel && <span className="wt-date">{clock.dayLabel}</span>}
                    </div>
                )}
            </div>
            {/* 24h day: daylight band from sunrise to sunset, a tick at the current hour */}
            {!noDayBar && (
                <div className="wt-daybar">
                    <div className="wt-day-track">
                        {hasSun && (
                            <span
                                className="wt-daylight"
                                style={{ left: dayPercent(sunrise), width: dayPercent(sunset - sunrise) }}
                            />
                        )}
                        {clock && <span className="wt-now-mark" style={{ left: dayPercent(clock.hours + clock.minutes / 60) }} />}
                    </div>
                    <div className="wt-sun">
                        {hasSun && (
                            <>
                                <span className="wt-sun-time" style={{ left: dayPercent(sunrise) }} title="Wschód słońca">
                                    {formatSunHour(sunrise)}
                                </span>
                                <span className="wt-sun-time" style={{ left: dayPercent(sunset) }} title="Zachód słońca">
                                    {formatSunHour(sunset)}
                                </span>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

/**
 * The in-game season / world date / time of day, for the domain you stand in,
 * the other one, or both stacked — so the clocks follow you across the border
 * between Imperium and Ishtar. Shared by the Czas window and the clock widget.
 *
 * Season and daylight come from `gmcp.room.time` (authoritative for the current
 * location, available the moment you enter a room); the HH:MM clock and world
 * date come from `clock.update` for the active domain — those only appear once
 * the clock has parsed a descriptive time, so until then it shows the season it
 * has and a `--:--` placeholder.
 */
export const WorldTimeClocks: React.FC<{ view: WorldTimeView; noDayBar?: boolean }> = ({ view, noDayBar }) => {
    const { activeDomain, clocks, gmcpSeason, gmcpDaylight } = useWorldClock();

    // Before the clock knows where you are, "current" is whichever domain has a time.
    const current: Domain = activeDomain ?? (clocks.Empire || !clocks.Ishtar ? 'Empire' : 'Ishtar');
    const other: Domain = DOMAINS.find(d => d !== current)!;
    const shown: Domain[] = view === 'both' ? [current, other] : [view === 'other' ? other : current];

    return (
        <>
            {shown.map(domain => {
                // GMCP season/daylight describe the room you stand in, so they
                // only stand in for the domain you are actually in.
                const isHere = domain === current;
                return (
                    <DomainClock
                        key={domain}
                        clock={clocks[domain]}
                        fallbackSeason={isHere ? gmcpSeason : undefined}
                        fallbackDaylight={isHere ? gmcpDaylight : undefined}
                        label={DOMAIN_LABELS[domain]}
                        here={domain === activeDomain}
                        noDayBar={noDayBar}
                    />
                );
            })}
        </>
    );
};
