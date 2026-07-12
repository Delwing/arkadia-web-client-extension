import React, { useEffect, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import './WorldTimePopup.css';

const POPUP_ID = 'popup:worldTime';

type Domain = 'Empire' | 'Ishtar';

// Season index → Polish name + hue. Muted, parchment-friendly tones.
const SEASONS = [
    { name: 'Wiosna', color: '#8fbf94' }, // spring — muted sage
    { name: 'Lato', color: '#d6c06e' },   // summer — muted wheat gold
    { name: 'Jesien', color: '#cc8a55' }, // autumn — muted amber
    { name: 'Zima', color: '#8fb2c9' },   // winter — muted slate blue
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

/**
 * "Czas" — the in-game season / world-date / time-of-day widget ported from
 * forge-ui's TimePanel into a shared dockable popup.
 *
 * Season and daylight come from `gmcp.room.time` (authoritative for the current
 * location, available the moment you enter a room); the HH:MM clock and world
 * date come from `clock.update` for the active domain — those only appear once
 * the clock has parsed a descriptive time, so until then the widget shows the
 * season it has and a `--:--` placeholder.
 *
 * Distinct from the full clock/calendar popup ("Zegar", popup:clock).
 */
const WorldTimePopup: React.FC = () => {
    const { wrapperProps } = usePopup(POPUP_ID, { openEvent: 'worldTime.popup.open' });

    const [gmcpSeason, setGmcpSeason] = useState<number | undefined>();
    const [gmcpDaylight, setGmcpDaylight] = useState<boolean | undefined>();
    const [activeDomain, setActiveDomain] = useState<Domain | undefined>();
    const [clocks, setClocks] = useState<Partial<Record<Domain, ClockSnapshot>>>({});

    useEffect(() => {
        const onRoomTime = (payload: any) => {
            const daylight = payload?.daylight ?? payload?.time?.daylight;
            if (typeof daylight === 'boolean') setGmcpDaylight(daylight);
            if (typeof payload?.season === 'number') setGmcpSeason(payload.season);
        };
        const onDomain = (p: { domain: Domain }) => setActiveDomain(p.domain);
        const onUpdate = (data: any) => {
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
        };
        eventBus.on('gmcp.room.time', onRoomTime);
        eventBus.on('clock.domain.active', onDomain);
        eventBus.on('clock.update', onUpdate);
        return () => {
            eventBus.off('gmcp.room.time', onRoomTime);
            eventBus.off('clock.domain.active', onDomain);
            eventBus.off('clock.update', onUpdate);
        };
    }, []);

    const clock = activeDomain ? clocks[activeDomain] : undefined;
    const seasonIdx = clock?.season ?? gmcpSeason;
    const daylight = clock?.daylight ?? gmcpDaylight;
    const time = clock ? formatTime(clock.hours, clock.minutes) : undefined;
    const season = seasonIdx !== undefined ? SEASONS[seasonIdx] : undefined;

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="worldTime"
            title="Czas"
            minWidth={190}
            initialWidth={240}
            bodyClassName="world-time-popup"
        >
            <div className="wt-clock">
                <span className="wt-now">
                    {daylight !== undefined && (
                        <span className={`wt-sky ${daylight ? 'wt-day' : 'wt-night'}`}>
                            {daylight ? <IconSun /> : <IconMoon />}
                        </span>
                    )}
                    <span className="wt-time">{time ?? '--:--'}</span>
                </span>
                {(season || clock?.dayLabel) && (
                    <div className="wt-cal">
                        {season && (
                            <span className="wt-season" style={{ color: season.color }}>{season.name}</span>
                        )}
                        {clock?.dayLabel && (
                            <span className="wt-date">
                                {clock.dayLabel}
                                {clock.dayOfYear ? <span className="wt-doy"> &middot; dzien {clock.dayOfYear}</span> : null}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </DockablePopupWrapper>
    );
};

export default WorldTimePopup;
