/**
 * Empirical sun/moon model for both domains.
 *
 * The month tables in `clock.ts` describe sunrise/sunset per month. That is not how
 * the game actually behaves: sunrise and sunset run on two independent step grids
 * that do not line up with month boundaries. This module encodes the grids fitted
 * against ~1150 confirmed observations from the sun tracker (every one matches).
 *
 * Shape is identical in both domains - 8 sunrise steps and 12 sunset steps per year,
 * anchored on the solstice (Empire doy 167 / Ishtar doy 181):
 *
 *   sunrise  8, 7, 6, 5, 4, 5, 6, 7
 *   sunset   16, 17, 18, 19, 20, 21, 22, 21, 20, 19, 18, 17
 *
 * Only the block lengths differ: Empire 8x50 / 12x33.33 over a 400 day year,
 * Ishtar 8x45 / 12x30 over a 360 day year.
 */

export type Domain = "Empire" | "Ishtar";
export type SunEventType = "sunrise" | "sunset";

export const YEAR_LENGTH: Record<Domain, number> = {
    Empire: 400,
    Ishtar: 360,
};

interface Grid {
    /** First dayOfYear of each block, ascending. */
    boundaries: number[];
    /** Hour held by the block starting at the matching boundary. */
    values: number[];
}

export const SUN_GRIDS: Record<Domain, Record<SunEventType, Grid>> = {
    Empire: {
        sunrise: {
            boundaries: [17, 67, 117, 167, 217, 267, 317, 367],
            values: [7, 6, 5, 4, 5, 6, 7, 8],
        },
        sunset: {
            // floor(1 + k * 400 / 12) - these coincide with the 12 "real" month starts
            boundaries: [1, 34, 67, 101, 134, 167, 201, 234, 267, 301, 334, 367],
            values: [17, 18, 19, 20, 21, 22, 21, 20, 19, 18, 17, 16],
        },
    },
    Ishtar: {
        sunrise: {
            // exactly the eight month boundaries
            boundaries: [1, 46, 91, 136, 181, 226, 271, 316],
            values: [8, 7, 6, 5, 4, 5, 6, 7],
        },
        sunset: {
            // 2 + 30k, except the peak block starts a day early on Feainn 1 (the
            // solstice), leaving 29 days before it and 31 in it
            boundaries: [2, 32, 62, 92, 122, 152, 181, 212, 242, 272, 302, 332],
            values: [16, 17, 18, 19, 20, 21, 22, 21, 20, 19, 18, 17],
        },
    },
};

/** Month lengths, mirroring `clock.ts` MONTHS/MONTHS_ORDER. Verified by unit test. */
export const MONTH_LENGTHS: Record<string, number> = {
    Hexenstag: 1, Nachhexen: 32, Jahrdrung: 33, Mitterfruhl: 1, Pflugzeit: 33,
    Sigmarszeit: 33, Sommerzeit: 33, Sonnenstill: 1, Vorgeheim: 33, Nachgeheim: 33,
    Erntezeit: 33, Mitterherbst: 1, Brauzeit: 33, Kaltezeit: 33, Ulrichszeit: 33,
    Mondstill: 1, Vorhexen: 33,
    Yule: 45, Imbaelk: 45, Birke: 45, Blathe: 45, Feainn: 45, Lammas: 45,
    Velen: 45, Saovine: 45,
};

export const MONTH_ORDER: Record<Domain, string[]> = {
    Empire: [
        "Hexenstag", "Nachhexen", "Jahrdrung", "Mitterfruhl", "Pflugzeit",
        "Sigmarszeit", "Sommerzeit", "Sonnenstill", "Vorgeheim", "Nachgeheim",
        "Erntezeit", "Mitterherbst", "Brauzeit", "Kaltezeit", "Ulrichszeit",
        "Mondstill", "Vorhexen",
    ],
    Ishtar: ["Yule", "Imbaelk", "Birke", "Blathe", "Feainn", "Lammas", "Velen", "Saovine"],
};

/** Wrap any integer day into 1..yearLength. */
export function normalizeDay(domain: Domain, dayOfYear: number): number {
    const len = YEAR_LENGTH[domain];
    return ((Math.round(dayOfYear) - 1) % len + len) % len + 1;
}

export function monthOf(domain: Domain, dayOfYear: number): { month: string; dayOfMonth: number } {
    let remaining = normalizeDay(domain, dayOfYear);
    for (const month of MONTH_ORDER[domain]) {
        const length = MONTH_LENGTHS[month];
        if (remaining > length) {
            remaining -= length;
        } else {
            return { month, dayOfMonth: remaining };
        }
    }
    // unreachable while MONTH_LENGTHS sums to YEAR_LENGTH
    return { month: MONTH_ORDER[domain][0], dayOfMonth: 1 };
}

export function formatDay(domain: Domain, dayOfYear: number): string {
    const { month, dayOfMonth } = monthOf(domain, dayOfYear);
    return MONTH_LENGTHS[month] === 1 ? month : `${dayOfMonth} ${month}`;
}

/** Observed hour of sunrise/sunset on a given day. */
export function sunHour(domain: Domain, dayOfYear: number, type: SunEventType): number {
    const day = normalizeDay(domain, dayOfYear);
    const grid = SUN_GRIDS[domain][type];
    let index = -1;
    for (let i = 0; i < grid.boundaries.length; i++) {
        if (day >= grid.boundaries[i]) index = i;
    }
    // before the first boundary we are still inside the previous year's last block
    return grid.values[index < 0 ? grid.values.length - 1 : index];
}

/** Hours of daylight on a given day. */
export function dayLengthHours(domain: Domain, dayOfYear: number): number {
    return sunHour(domain, dayOfYear, "sunset") - sunHour(domain, dayOfYear, "sunrise");
}

/** Hours between sunset and the following sunrise. */
export function nightLengthHours(domain: Domain, dayOfYear: number): number {
    const day = normalizeDay(domain, dayOfYear);
    return 24 - sunHour(domain, day, "sunset") + sunHour(domain, day + 1, "sunrise");
}

// ---------------------------------------------------------------------------
// In-game <-> real time
// ---------------------------------------------------------------------------

/** One in-game hour is 120s of real time (`ONE_HOUR` in clock.ts). */
export const REAL_MS_PER_IG_HOUR = 120_000;
export const REAL_MS_PER_IG_MINUTE = REAL_MS_PER_IG_HOUR / 60;
/** One in-game day is 48 real minutes; 30 in-game days are exactly 24 real hours. */
export const REAL_MS_PER_IG_DAY = REAL_MS_PER_IG_HOUR * 24;

export interface ClockAnchor {
    domain: Domain;
    dayOfYear: number;
    hours: number;
    minutes: number;
    /** Real-world epoch ms at which the above in-game time was current. */
    realMs: number;
}

/**
 * Real-world time of the next occurrence of an in-game moment, at or after the anchor.
 * Because the calendar repeats, "next" means within the following in-game year.
 */
export function realTimeOf(
    anchor: ClockAnchor,
    dayOfYear: number,
    igHour: number,
    igMinute = 0,
): number {
    const yearMinutes = YEAR_LENGTH[anchor.domain] * 24 * 60;
    const target = (normalizeDay(anchor.domain, dayOfYear) - 1) * 24 * 60 + igHour * 60 + igMinute;
    const current = (normalizeDay(anchor.domain, anchor.dayOfYear) - 1) * 24 * 60
        + anchor.hours * 60 + anchor.minutes;
    const delta = ((target - current) % yearMinutes + yearMinutes) % yearMinutes;
    return anchor.realMs + delta * REAL_MS_PER_IG_MINUTE;
}

export interface SunOccurrence {
    type: SunEventType;
    dayOfYear: number;
    igHour: number;
    realMs: number;
}

/** Next sunrise and next sunset after the anchor, in chronological order. */
export function nextSunEvents(anchor: ClockAnchor): SunOccurrence[] {
    const out: SunOccurrence[] = [];
    for (const type of ["sunrise", "sunset"] as SunEventType[]) {
        // The event either still lies ahead today or falls on the following day.
        // realTimeOf wraps a moment that has already passed to the next in-game
        // year, so the nearer of the two candidates is the real next occurrence.
        const candidates = [0, 1].map(offset => {
            const dayOfYear = normalizeDay(anchor.domain, anchor.dayOfYear + offset);
            const igHour = sunHour(anchor.domain, dayOfYear, type);
            return { type, dayOfYear, igHour, realMs: realTimeOf(anchor, dayOfYear, igHour) };
        });
        out.push(candidates.reduce((a, b) => (b.realMs < a.realMs ? b : a)));
    }
    return out.sort((a, b) => a.realMs - b.realMs);
}

// ---------------------------------------------------------------------------
// Moon
// ---------------------------------------------------------------------------

/**
 * Lunar cycle, extracted from the events table in arkadia-mc-js. New moons sit
 * exactly on day 14 + 25k, so the year holds 16 cycles of 25 days. The full moon
 * falls half a cycle later, on day 26.5 + 25k - which lands between two days, so
 * the night is either day 26 + 25k or the one after.
 */
export const MOON_CYCLE_DAYS = 25;
export const MOON_CYCLES_PER_YEAR = YEAR_LENGTH.Empire / MOON_CYCLE_DAYS; // 16
const NEW_MOON_FIRST_DAY = 14;

export function newMoonDay(cycle: number): number {
    return normalizeDay("Empire", NEW_MOON_FIRST_DAY + MOON_CYCLE_DAYS * cycle);
}

/** Nominal full-moon day; the true moment is half a day later, hence `fullMoonNights`. */
export function fullMoonDay(cycle: number): number {
    return normalizeDay("Empire", NEW_MOON_FIRST_DAY + MOON_CYCLE_DAYS * cycle + 12);
}

/**
 * Nights that can carry a given full moon: the nominal day, the one before and the
 * one after. Matches the three `checkNights` used by the arkadia-mc-js calendar.
 */
export function fullMoonNights(cycle: number): number[] {
    const day = fullMoonDay(cycle);
    return [-1, 0, 1].map(offset => normalizeDay("Empire", day + offset));
}

/**
 * Cycles whose full moon can host Geheimnisnacht - the five that fall between
 * Vorgeheim and early Kaltezeit (doy ~200-302). Cycle 7 lands on doy 201, the slot
 * Geheimnistag occupies; the later ones are where it drifts when that night falls
 * at an unusable real-world hour.
 */
export const GEHEIMNISNACHT_CYCLES = [7, 8, 9, 10, 11];

/** Real-world hour the night is expected to start at, in the player's local time. */
export const GEHEIMNISNACHT_TARGET_HOUR = 21;export interface NightCandidate {
    cycle: number;
    dayOfYear: number;
    /** Days after the nominal full moon; 0 is the full moon night itself. */
    fromFullMoon: number;
    sunsetHour: number;
    sunriseHour: number;
    /** Real-world epoch ms of sunset, i.e. when the night begins. */
    startMs: number;
    /** Real-world epoch ms of the following sunrise. */
    endMs: number;
    /** Night length in in-game hours. */
    igHours: number;
    /**
     * Minutes between the night's start and the target hour on the local clock,
     * wrapped into +/-12h. Negative means the night starts before the target.
     */
    offsetMinutes: number;
}

/**
 * Geheimnisnacht falls within three nights of the full moon - the moon itself or
 * the two after it.
 *
 * The width matters: with just the moon and the night after, the closest candidate
 * below 21:00 sits a median 55 minutes away, which does not look like a rule. With
 * the third night that drops to 7 minutes.
 */
const NIGHT_SEARCH_RANGE = [0, 1, 2];

function localMinutesOfDay(ms: number): number {
    const d = new Date(ms);
    return d.getHours() * 60 + d.getMinutes();
}

/**
 * Real-world time of an in-game moment, counted forwards or backwards from the
 * anchor without wrapping. `yearOffset` selects which in-game year, so candidates
 * from the same year can be compared against each other, and a calendar showing a
 * future year can place its days rather than falling back to the next occurrence.
 * The result may be in the past for a day the current year has already passed.
 */
export function realTimeInYear(
    anchor: ClockAnchor,
    yearOffset: number,
    dayOfYear: number,
    igHour: number,
): number {
    const absoluteDay = yearOffset * YEAR_LENGTH[anchor.domain] + dayOfYear;
    const target = (absoluteDay - 1) * 24 * 60 + igHour * 60;
    const current = (normalizeDay(anchor.domain, anchor.dayOfYear) - 1) * 24 * 60
        + anchor.hours * 60 + anchor.minutes;
    return anchor.realMs + (target - current) * REAL_MS_PER_IG_MINUTE;
}

/** Every night that could carry the full moon of a cycle, in one in-game year. */
export function moonNights(
    anchor: ClockAnchor,
    cycle: number,
    yearOffset = 0,
    targetHour = GEHEIMNISNACHT_TARGET_HOUR,
): NightCandidate[] {
    const nominal = fullMoonDay(cycle);
    const empireAnchor: ClockAnchor = { ...anchor, domain: "Empire" };
    return NIGHT_SEARCH_RANGE.map(fromFullMoon => {
        const dayOfYear = normalizeDay("Empire", nominal + fromFullMoon);
        const sunsetHour = sunHour("Empire", dayOfYear, "sunset");
        const sunriseHour = sunHour("Empire", dayOfYear + 1, "sunrise");
        const igHours = nightLengthHours("Empire", dayOfYear);
        // nominal + fromFullMoon can fall off either end of the year; keep the
        // night in step with the year it belongs to rather than wrapping it
        const dayShift = Math.floor((nominal + fromFullMoon - 1) / YEAR_LENGTH.Empire);
        const startMs = realTimeInYear(empireAnchor, yearOffset + dayShift, dayOfYear, sunsetHour);
        let offsetMinutes = localMinutesOfDay(startMs) - targetHour * 60;
        if (offsetMinutes > 720) offsetMinutes -= 1440;
        if (offsetMinutes < -720) offsetMinutes += 1440;
        return {
            cycle, dayOfYear, fromFullMoon, sunsetHour, sunriseHour,
            startMs, endMs: startMs + igHours * REAL_MS_PER_IG_HOUR,
            igHours, offsetMinutes,
        };
    });
}

/**
 * The night starting closest to the target hour without going past it - the last
 * night of the cycle whose sunset still falls at or before 21:00 local.
 */
export function closestBefore(nights: NightCandidate[]): NightCandidate | null {
    const before = nights.filter(n =>
        n.offsetMinutes <= 0);
    if (!before.length) return null;
    return before.reduce((a, b) => (b.offsetMinutes > a.offsetMinutes ? b : a));
}

export interface CycleForecast {
    cycle: number;
    fullMoonDay: number;
    /** Real-world time of the full moon night itself. */
    fullMoon: NightCandidate;
    nights: NightCandidate[];
    /** The night this cycle would contribute: closest to the target from below. */
    night: NightCandidate | null;
}

export interface GeheimnisnachtForecast {
    /** In-game year the winner was drawn from, relative to the anchor's own year. */
    yearOffset: number;
    cycles: CycleForecast[];
    /** The predicted night: closest to the target hour without ever passing it. */
    night: NightCandidate | null;
}

export interface YearForecast {
    cycles: CycleForecast[];
    /** Winning cycle for that year, or null if no candidate reaches the target. */
    winner: CycleForecast | null;
}

/**
 * Geheimnisnacht for one specific in-game year, whether or not it has already
 * passed. A calendar of the current year wants this; `geheimnisnachtForecast`
 * rolls forward to the next one instead.
 */
export function geheimnisnachtForYear(
    anchor: ClockAnchor,
    yearOffset = 0,
    targetHour = GEHEIMNISNACHT_TARGET_HOUR,
): YearForecast {
    return forecastYear(anchor, yearOffset, targetHour);
}

function forecastYear(anchor: ClockAnchor, yearOffset: number, targetHour: number): YearForecast {
    const cycles: CycleForecast[] = GEHEIMNISNACHT_CYCLES.map(cycle => {
        const nights = moonNights(anchor, cycle, yearOffset, targetHour);
        return {
            cycle,
            fullMoonDay: fullMoonDay(cycle),
            fullMoon: nights.find(n => n.fromFullMoon === 0)!,
            nights,
            night: closestBefore(nights),
        };
    }).sort((a, b) => a.fullMoon.startMs - b.fullMoon.startMs);

    const picks = cycles.filter(c => c.night !== null);
    if (!picks.length) return { cycles, winner: null };
    // closest below the target wins, i.e. the least negative offset
    const winner = picks.reduce((a, b) =>
        (b.night!.offsetMinutes > a.night!.offsetMinutes ? b : a));
    return { cycles, winner };
}

/**
 * Geheimnisnacht happens once per in-game year, so every candidate is weighed
 * inside the same year. The winning cycle is the one whose night gets nearest the
 * target hour from below; with full moons four hours apart on the local clock,
 * only one of them ever lands close. If that night has already passed, the next
 * in-game year is evaluated instead.
 */
export function geheimnisnachtForecast(
    anchor: ClockAnchor,
    targetHour = GEHEIMNISNACHT_TARGET_HOUR,
): GeheimnisnachtForecast {
    let last = forecastYear(anchor, 0, targetHour);
    let yearOffset = 0;
    // the winner drifts about 12 minutes per year, so it can only be a year or
    // two before the same cycle stops being the closest one
    for (let offset = 0; offset <= 2; offset++) {
        const attempt = forecastYear(anchor, offset, targetHour);
        last = attempt;
        yearOffset = offset;
        if (attempt.winner && attempt.winner.night!.startMs >= anchor.realMs) break;
    }
    return {
        yearOffset,
        cycles: last.cycles,
        night: last.winner?.night ?? null,
    };
}

// ---------------------------------------------------------------------------
// Seasons
// ---------------------------------------------------------------------------

/** Day each season starts, as [spring, summer, autumn, winter]. Mirrors clock.ts. */
export const SEASON_BOUNDARIES: Record<Domain, [number, number, number, number]> = {
    Empire: [18, 118, 218, 319],
    Ishtar: [91, 181, 271, 1],
};

export const SEASON_NAMES = ["Wiosna", "Lato", "Jesien", "Zima"] as const;

/** Season index for a day: 0 spring, 1 summer, 2 autumn, 3 winter. */
export function seasonOf(domain: Domain, dayOfYear: number): number {
    const day = normalizeDay(domain, dayOfYear);
    const [spring, summer, autumn, winter] = SEASON_BOUNDARIES[domain];
    if (winter < spring) {
        // winter wraps the turn of the year, as it does for Ishtar
        if (day >= autumn) return 2;
        if (day >= summer) return 1;
        if (day >= spring) return 0;
        return 3;
    }
    if (day >= winter) return 3;
    if (day >= autumn) return 2;
    if (day >= summer) return 1;
    if (day >= spring) return 0;
    return 3;
}

// ---------------------------------------------------------------------------
// Moon phases per day
// ---------------------------------------------------------------------------

/**
 * Ishtar tracks only full moons, on a 24 day cycle from day 4 - a different
 * scheme from the Empire's 25 day new/full pairing.
 */
const ISHTAR_FULL_MOON_FIRST_DAY = 4;
const ISHTAR_MOON_CYCLE_DAYS = 24;

export type MoonPhase = "new" | "full";

/** Days of the year carrying a moon phase, for calendar rendering. */
export function moonPhasesForYear(domain: Domain): Map<number, MoonPhase> {
    const out = new Map<number, MoonPhase>();
    if (domain === "Ishtar") {
        for (let k = 0; k * ISHTAR_MOON_CYCLE_DAYS < YEAR_LENGTH.Ishtar; k++) {
            out.set(normalizeDay("Ishtar", ISHTAR_FULL_MOON_FIRST_DAY + ISHTAR_MOON_CYCLE_DAYS * k), "full");
        }
        return out;
    }
    for (let cycle = 0; cycle < MOON_CYCLES_PER_YEAR; cycle++) {
        out.set(newMoonDay(cycle), "new");
        out.set(fullMoonDay(cycle), "full");
    }
    return out;
}
