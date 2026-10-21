import { useSyncExternalStore } from 'react';
import eventBus from '@modules/core/eventBus';

export type Domain = 'Empire' | 'Ishtar';

export interface ClockSnapshot {
    hours: number;
    minutes: number;
    season?: number;
    daylight?: boolean;
    dayLabel?: string;
    dayOfYear?: number;
    sunrise?: number;
    sunset?: number;
}

export interface WorldClockState {
    /** The domain you stand in, once the clock knows it. */
    activeDomain?: Domain;
    clocks: Partial<Record<Domain, ClockSnapshot>>;
    /** Season / daylight of the room you stand in (`gmcp.room.time`). */
    gmcpSeason?: number;
    gmcpDaylight?: boolean;
}

/**
 * The last clock readings, kept from startup, so the Czas window and a clock
 * widget added mid-session both show the time at once instead of waiting for
 * the next `clock.update`.
 */
let state: WorldClockState = { clocks: {} };
const listeners = new Set<() => void>();

function set(changes: Partial<WorldClockState>): void {
    state = { ...state, ...changes };
    listeners.forEach(listener => listener());
}

eventBus.on('gmcp.room.time', (payload: any) => {
    const daylight = payload?.daylight ?? payload?.time?.daylight;
    const changes: Partial<WorldClockState> = {};
    if (typeof daylight === 'boolean') changes.gmcpDaylight = daylight;
    if (typeof payload?.season === 'number') changes.gmcpSeason = payload.season;
    set(changes);
});
eventBus.on('clock.domain.active', ({ domain }) => set({ activeDomain: domain }));
eventBus.on('clock.update', (data: any) => {
    set({
        clocks: {
            ...state.clocks,
            [data.domain]: {
                hours: data.hours,
                minutes: data.minutes,
                season: data.season,
                daylight: data.daylight,
                dayLabel: data.dayLabel,
                dayOfYear: data.dayOfYear,
                sunrise: data.sunrise,
                sunset: data.sunset,
            },
        },
    });
});

/** For openers that know the active domain before the clock has said so. */
export function setActiveDomain(domain: Domain): void {
    if (state.activeDomain !== domain) set({ activeDomain: domain });
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function useWorldClock(): WorldClockState {
    return useSyncExternalStore(subscribe, () => state);
}
