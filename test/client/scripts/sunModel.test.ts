import {
    type ClockAnchor,
    GEHEIMNISNACHT_CYCLES,
    MONTH_LENGTHS,
    MONTH_ORDER,
    MOON_CYCLES_PER_YEAR,
    REAL_MS_PER_IG_HOUR,
    YEAR_LENGTH,
    dayLengthHours,
    formatDay,
    fullMoonDay,
    fullMoonNights,
    geheimnisnachtForecast,
    geheimnisnachtForYear,
    moonPhasesForYear,
    SEASON_NAMES,
    seasonOf,
    newMoonDay,
    nextSunEvents,
    nightLengthHours,
    normalizeDay,
    realTimeInYear,
    realTimeOf,
    sunHour,
} from '@client/scripts/sunModel.ts';
import { MONTHS, MONTHS_ORDER } from '@client/scripts/clock';

const MINUTE = 60_000;

describe('calendar', () => {
    it('month lengths sum to the year length in both domains', () => {
        for (const domain of ['Empire', 'Ishtar'] as const) {
            const total = MONTH_ORDER[domain].reduce((sum, m) => sum + MONTH_LENGTHS[m], 0);
            expect(total).toBe(YEAR_LENGTH[domain]);
        }
    });

    it('does not drift from the month table in clock.ts', () => {
        for (const domain of ['Empire', 'Ishtar'] as const) {
            expect(MONTH_ORDER[domain]).toEqual(MONTHS_ORDER[domain]);
            for (const month of MONTH_ORDER[domain]) {
                expect(MONTH_LENGTHS[month]).toBe(MONTHS[month].length);
            }
        }
    });

    it('wraps days outside the year', () => {
        expect(normalizeDay('Empire', 401)).toBe(1);
        expect(normalizeDay('Empire', 0)).toBe(400);
        expect(normalizeDay('Ishtar', 361)).toBe(1);
    });

    it('labels single-day festival months without a day number', () => {
        expect(formatDay('Empire', 167)).toBe('Sonnenstill');
        expect(formatDay('Empire', 291)).toBe('24 Brauzeit');
        expect(formatDay('Ishtar', 251)).toBe('26 Lammas');
    });
});

describe('sun grids', () => {
    it('places the Empire solstice on day 167', () => {
        expect(sunHour('Empire', 167, 'sunrise')).toBe(4);
        expect(sunHour('Empire', 167, 'sunset')).toBe(22);
        expect(sunHour('Empire', 166, 'sunrise')).toBe(5);
        expect(sunHour('Empire', 166, 'sunset')).toBe(21);
    });

    it('places the Ishtar solstice on day 181', () => {
        expect(sunHour('Ishtar', 181, 'sunrise')).toBe(4);
        expect(sunHour('Ishtar', 181, 'sunset')).toBe(22);
    });

    it('flips Empire sunrise mid-month, where the month table cannot', () => {
        // doy 17 is Nachhexen 16 - the table says 8, the game says 7
        expect(sunHour('Empire', 16, 'sunrise')).toBe(8);
        expect(sunHour('Empire', 17, 'sunrise')).toBe(7);
    });

    it('keeps Velen and Saovine unswapped for Ishtar sunrise', () => {
        expect(sunHour('Ishtar', 271, 'sunrise')).toBe(6); // Velen
        expect(sunHour('Ishtar', 316, 'sunrise')).toBe(7); // Saovine
    });

    it('holds the sunset value across the whole block', () => {
        for (let day = 234; day <= 266; day++) {
            expect(sunHour('Empire', day, 'sunset')).toBe(20);
        }
        expect(sunHour('Empire', 233, 'sunset')).toBe(21);
        expect(sunHour('Empire', 267, 'sunset')).toBe(19);
    });

    it('computes day and night lengths', () => {
        // 18 Erntezeit: sunset 20, next sunrise 5
        expect(nightLengthHours('Empire', 251)).toBe(9);
        expect(dayLengthHours('Empire', 251)).toBe(15);
        // longest day of the Empire year
        expect(dayLengthHours('Empire', 167)).toBe(18);
    });

    it('wraps the night that crosses the new year', () => {
        expect(nightLengthHours('Empire', 400)).toBe(16);
    });
});

describe('in-game to real time', () => {
    // 24 Brauzeit (doy 291) 19:00 IG <-> 2026-08-14 19:53 local
    const anchor: ClockAnchor = {
        domain: 'Empire',
        dayOfYear: 291,
        hours: 19,
        minutes: 0,
        realMs: new Date(2026, 7, 14, 19, 53).getTime(),
    };

    it('converts one in-game hour to two real minutes', () => {
        expect(realTimeOf(anchor, 291, 20) - anchor.realMs).toBe(2 * MINUTE);
        expect(REAL_MS_PER_IG_HOUR).toBe(2 * MINUTE);
    });

    it('makes 30 in-game days exactly one real day', () => {
        const later = realTimeOf(anchor, normalizeDay('Empire', 291 + 30), 19);
        expect(later - anchor.realMs).toBe(24 * 60 * MINUTE);
    });

    it('reproduces the worked example for 18 Erntezeit', () => {
        // 360 in-game days ahead = exactly 12 real days; sunset that day is 20:00 IG
        const sunset = realTimeOf(anchor, 251, sunHour('Empire', 251, 'sunset'));
        const at = new Date(sunset);
        expect(at.getDate()).toBe(26);
        expect(at.getMonth()).toBe(7); // August
        expect(at.getHours()).toBe(19);
        expect(at.getMinutes()).toBe(55);
    });

    it('advances the sunset by 48 real minutes per in-game day inside a block', () => {
        const first = realTimeOf(anchor, 251, sunHour('Empire', 251, 'sunset'));
        const second = realTimeOf(anchor, 252, sunHour('Empire', 252, 'sunset'));
        expect(second - first).toBe(48 * MINUTE);
    });

    it('advances by only 46 minutes across a sunset block boundary', () => {
        // doy 200 -> 201 drops sunset from 22 to 21
        const before = realTimeOf(anchor, 200, sunHour('Empire', 200, 'sunset'));
        const after = realTimeOf(anchor, 201, sunHour('Empire', 201, 'sunset'));
        expect(after - before).toBe(46 * MINUTE);
    });

    it('returns tomorrow rather than next year once an event has passed', () => {
        // at 19:00 on doy 291 the sunrise (6:00) is already behind us
        const [first] = nextSunEvents(anchor);
        expect(first.type).toBe('sunset');
        expect(first.dayOfYear).toBe(291);
        const sunriseEvent = nextSunEvents(anchor).find(e => e.type === 'sunrise')!;
        expect(sunriseEvent.dayOfYear).toBe(292);
        expect(sunriseEvent.realMs - anchor.realMs).toBeLessThan(24 * 2 * MINUTE);
    });
});

describe('moon', () => {
    it('puts new moons on a 25 day grid', () => {
        expect(MOON_CYCLES_PER_YEAR).toBe(16);
        expect(newMoonDay(0)).toBe(14);
        expect(newMoonDay(1)).toBe(39);
        expect(newMoonDay(15)).toBe(389);
        // the sixteenth cycle wraps back onto the first
        expect(newMoonDay(16)).toBe(14);
    });

    it('matches the full moons recorded in the arkadia-mc-js calendar', () => {
        // days taken from that project's events.json full_moon spans
        const known: Record<number, number> = {
            0: 26, 1: 51, 2: 76, 4: 126, 5: 151, 6: 176, 12: 326, 13: 351, 14: 376,
        };
        for (const [cycle, day] of Object.entries(known)) {
            expect(fullMoonDay(Number(cycle))).toBe(day);
        }
    });

    it('offers the nominal night plus its two neighbours', () => {
        expect(fullMoonNights(7)).toEqual([200, 201, 202]);
        expect(fullMoonNights(11)).toEqual([300, 301, 302]);
    });

    it('anchors the first Geheimnisnacht window on the Geheimnistag slot', () => {
        expect(GEHEIMNISNACHT_CYCLES).toEqual([7, 8, 9, 10, 11]);
        expect(fullMoonNights(7)).toContain(201);
    });
});

describe('geheimnisnacht forecast', () => {
    const anchor: ClockAnchor = {
        domain: 'Empire',
        dayOfYear: 291,
        hours: 19,
        minutes: 0,
        realMs: new Date(2026, 7, 14, 19, 53).getTime(),
    };

    it('covers every candidate cycle', () => {
        const { cycles } = geheimnisnachtForecast(anchor);
        expect(cycles.map(c => c.cycle).sort()).toEqual([...GEHEIMNISNACHT_CYCLES].sort());
    });

    it('carries the three selectable nights', () => {
        const { cycles } = geheimnisnachtForecast(anchor);
        for (const cycle of cycles) {
            expect(cycle.nights.map(n => n.fromFullMoon)).toEqual([0, 1, 2]);
        }
    });

    it('moves each full moon 20 real hours on, i.e. 4 hours earlier on the local clock', () => {
        // This is what sweeps Geheimnisnacht across autumn and what makes the
        // winning cycle unique: only one full moon can sit near the target hour.
        for (const cycle of GEHEIMNISNACHT_CYCLES.slice(0, -1)) {
            const from = realTimeOf(anchor, fullMoonDay(cycle), 21);
            const to = realTimeOf(anchor, fullMoonDay(cycle + 1), 21);
            const yearMs = 400 * 24 * REAL_MS_PER_IG_HOUR;
            expect(((to - from) % yearMs + yearMs) % yearMs).toBe(25 * 24 * REAL_MS_PER_IG_HOUR);
        }
    });

    describe('the chosen night', () => {
        it('starts at or before the target hour, never after', () => {
            const { night } = geheimnisnachtForecast(anchor);
            expect(night!.offsetMinutes).toBeLessThanOrEqual(0);
        });

        it('starts within one in-game day of the target', () => {
            // nights step 48 minutes, so the closest one below can never be further
            const { night } = geheimnisnachtForecast(anchor);
            expect(night!.offsetMinutes).toBeGreaterThan(-48);
        });

        it('is the latest night at or before the target within its cycle', () => {
            const { cycles, night } = geheimnisnachtForecast(anchor);
            const own = cycles.find(c => c.cycle === night!.cycle)!;
            for (const other of own.nights) {
                if (other.offsetMinutes <= 0) {
                    expect(other.offsetMinutes).toBeLessThanOrEqual(night!.offsetMinutes);
                }
            }
        });

        it('spans sunset to the following sunrise', () => {
            const { night } = geheimnisnachtForecast(anchor);
            expect(night!.endMs - night!.startMs).toBe(night!.igHours * REAL_MS_PER_IG_HOUR);
            expect(night!.igHours).toBe(nightLengthHours('Empire', night!.dayOfYear));
        });
    });

    it('weighs all candidates inside one in-game year', () => {
        // Full moons are 25 in-game days apart, which is 1200 real minutes at a
        // fixed hour. The night starts at sunset, so each step also picks up the
        // change in sunset hour - two real minutes per in-game hour. Mixing years
        // would break this and compare nights from different Geheimnisnachts.
        const { cycles } = geheimnisnachtForecast(anchor);
        for (let i = 1; i < cycles.length; i++) {
            const prev = cycles[i - 1].fullMoon;
            const curr = cycles[i].fullMoon;
            const expected = 25 * 24 * REAL_MS_PER_IG_HOUR
                + (curr.sunsetHour - prev.sunsetHour) * REAL_MS_PER_IG_HOUR;
            expect(curr.startMs - prev.startMs).toBe(expected);
        }
    });

    it('picks the full moon nearest the target, and the night just below it', () => {
        // The anchor sits on day 291, so this year's winner (day 202) is already
        // behind us and the forecast rolls to the next in-game year, where cycle 9
        // - 18 Erntezeit - is the full moon closest to 21:00 local.
        const { night, yearOffset } = geheimnisnachtForecast(anchor);
        expect(yearOffset).toBe(1);
        expect(night!.cycle).toBe(9);
        expect(night!.dayOfYear).toBe(252);
        expect(night!.fromFullMoon).toBe(1);
        expect(night!.offsetMinutes).toBe(-17);
    });

    it('rotates the winning full moon on a three year cycle', () => {
        // Each in-game year is 400 days = 13 1/3 real days, so local times shift
        // 8 hours a year. Full moons sit 4 hours apart, so the winner moves two
        // cycles on each year and returns after three.
        const seen: number[] = [];
        let current = anchor;
        for (let i = 0; i < 4; i++) {
            const { night } = geheimnisnachtForecast(current);
            seen.push(night!.cycle);
            // step the clock to the morning after that night and ask again
            current = {
                ...current,
                dayOfYear: normalizeDay('Empire', night!.dayOfYear + 1),
                hours: night!.sunriseHour,
                minutes: 0,
                realMs: night!.endMs,
            };
        }
        expect(seen).toEqual([9, 11, 7, 9]);
    });

    it('never returns a night that has already passed', () => {
        const { night } = geheimnisnachtForecast(anchor);
        expect(night!.startMs).toBeGreaterThanOrEqual(anchor.realMs);
    });
});

describe('seasons', () => {
    it('matches the boundaries the clock uses', () => {
        expect(seasonOf('Empire', 17)).toBe(3);  // still winter
        expect(seasonOf('Empire', 18)).toBe(0);  // wiosna
        expect(seasonOf('Empire', 117)).toBe(0);
        expect(seasonOf('Empire', 118)).toBe(1); // lato
        expect(seasonOf('Empire', 218)).toBe(2); // jesien
        expect(seasonOf('Empire', 319)).toBe(3); // zima
        expect(seasonOf('Empire', 400)).toBe(3);
    });

    it('wraps Ishtar winter around the turn of the year', () => {
        expect(seasonOf('Ishtar', 1)).toBe(3);
        expect(seasonOf('Ishtar', 90)).toBe(3);
        expect(seasonOf('Ishtar', 91)).toBe(0);
        expect(seasonOf('Ishtar', 181)).toBe(1);
        expect(seasonOf('Ishtar', 271)).toBe(2);
        expect(seasonOf('Ishtar', 360)).toBe(2);
    });

    it('covers every day of both years', () => {
        for (const domain of ['Empire', 'Ishtar'] as const) {
            for (let day = 1; day <= YEAR_LENGTH[domain]; day++) {
                expect(seasonOf(domain, day)).toBeGreaterThanOrEqual(0);
                expect(seasonOf(domain, day)).toBeLessThan(SEASON_NAMES.length);
            }
        }
    });
});

describe('moon phases for the calendar', () => {
    it('gives the Empire year 16 new moons and 16 full moons', () => {
        const phases = moonPhasesForYear('Empire');
        const values = [...phases.values()];
        expect(values.filter(p => p === 'new')).toHaveLength(16);
        expect(values.filter(p => p === 'full')).toHaveLength(16);
        expect(phases.get(14)).toBe('new');
        expect(phases.get(26)).toBe('full');
    });

    it('gives Ishtar 15 full moons on a 24 day cycle and no new moons', () => {
        const phases = moonPhasesForYear('Ishtar');
        const days = [...phases.keys()].sort((a, b) => a - b);
        expect(days).toHaveLength(15);
        expect(days[0]).toBe(4);
        for (let i = 1; i < days.length; i++) {
            expect(days[i] - days[i - 1]).toBe(24);
        }
        expect([...phases.values()].every(p => p === 'full')).toBe(true);
    });

    it('never places a moon outside the year', () => {
        for (const domain of ['Empire', 'Ishtar'] as const) {
            for (const day of moonPhasesForYear(domain).keys()) {
                expect(day).toBeGreaterThanOrEqual(1);
                expect(day).toBeLessThanOrEqual(YEAR_LENGTH[domain]);
            }
        }
    });
});

describe('geheimnisnachtForYear', () => {
    const anchor: ClockAnchor = {
        domain: 'Empire',
        dayOfYear: 291,
        hours: 19,
        minutes: 0,
        realMs: new Date(2026, 7, 14, 19, 53).getTime(),
    };

    it('reports this year even when the night has already passed', () => {
        // the anchor is on day 291, past this year's night on day 202
        const { winner } = geheimnisnachtForYear(anchor, 0);
        expect(winner!.night!.dayOfYear).toBe(202);
        expect(winner!.night!.startMs).toBeLessThan(anchor.realMs);
    });

    it('agrees with the rolling forecast once the year matches', () => {
        const rolling = geheimnisnachtForecast(anchor);
        const { winner } = geheimnisnachtForYear(anchor, rolling.yearOffset);
        expect(winner!.night!.dayOfYear).toBe(rolling.night!.dayOfYear);
        expect(winner!.night!.startMs).toBe(rolling.night!.startMs);
    });

    it('lands inside a month the calendar can render', () => {
        const { winner } = geheimnisnachtForYear(anchor, 0);
        expect(winner!.night!.dayOfYear).toBeGreaterThanOrEqual(1);
        expect(winner!.night!.dayOfYear).toBeLessThanOrEqual(YEAR_LENGTH.Empire);
    });
});

describe('which nights may be chosen', () => {
    const anchor: ClockAnchor = {
        domain: 'Empire',
        dayOfYear: 291,
        hours: 19,
        minutes: 0,
        realMs: new Date(2026, 7, 14, 19, 53).getTime(),
    };

    it('only ever picks the full moon or one of the two nights after it', () => {
        // eldr: "wypada w pelnie lub w ten dzien zaraz po pelni". Widening the
        // search past that let the model choose nights two days before the full
        // moon, which the rule does not allow.
        for (let year = 0; year < 6; year++) {
            const { winner } = geheimnisnachtForYear(anchor, year);
            if (!winner?.night) continue;
            expect([0, 1, 2]).toContain(winner.night.fromFullMoon);
        }
    });

    it('never returns a night past the target, in any year', () => {
        // The rule is closest to 21:00 and always before it, so there is no
        // fallback to the other side - a night past the target is simply not it.
        for (let year = 0; year < 6; year++) {
            const { winner } = geheimnisnachtForYear(anchor, year);
            if (!winner?.night) continue;
            expect(winner.night.offsetMinutes).toBeLessThanOrEqual(0);
        }
    });
});

describe('how well the rule actually fits', () => {
    const now = new Date(2026, 7, 14, 19, 53).getTime();

    /** Gap below the target for the chosen night, swept across in-game phases. */
    function gaps(): number[] {
        const out: number[] = [];
        for (let day = 1; day <= 400; day++) {
            const anchor: ClockAnchor = {
                domain: 'Empire', dayOfYear: day, hours: 12, minutes: 0, realMs: now,
            };
            const { night } = geheimnisnachtForecast(anchor);
            if (night) out.push(Math.abs(night.offsetMinutes));
        }
        return out.sort((a, b) => a - b);
    }

    it('usually lands within minutes of the target', () => {
        // Three selectable nights per cycle put the median gap in single digits.
        // With only two it was 55 minutes, which did not look like a rule at all -
        // this is what justifies the width of SELECTABLE_NIGHTS.
        const sorted = gaps();
        const median = sorted[Math.floor(sorted.length / 2)];
        expect(median).toBeLessThanOrEqual(10);
    });

    it('still has a tail that has to be reported, not hidden', () => {
        // Five cycles four hours apart cover only five of the six slots the local
        // clock offers, so some phases have nothing near the target at all.
        const sorted = gaps();
        expect(sorted[sorted.length - 1]).toBeGreaterThan(48);
    });

    it('never returns a night after the target hour', () => {
        for (let day = 1; day <= 400; day += 3) {
            const anchor: ClockAnchor = {
                domain: 'Empire', dayOfYear: day, hours: 12, minutes: 0, realMs: now,
            };
            const { night } = geheimnisnachtForecast(anchor);
            if (night) expect(night.offsetMinutes).toBeLessThanOrEqual(0);
        }
    });
});

describe('against live client output', () => {
    // Captured from the running popup: 26 Ulrichszeit (day 359), 03:44 in-game,
    // 17:54 local on 11.09.2026. Real observed state, so it pins the whole chain -
    // sun grids, in-game/real conversion, moon cycle and the Geheimnisnacht rule.
    // Wall-clock expectations assume no DST shift between 11.09 and 19.09, which
    // holds for both UTC (CI) and Europe/Warsaw.
    const anchor: ClockAnchor = {
        domain: 'Empire',
        dayOfYear: 359,
        hours: 3,
        minutes: 44,
        realMs: new Date(2026, 8, 11, 17, 54).getTime(),
    };

    it('reproduces the sun hours and lengths for the day', () => {
        expect(sunHour('Empire', 359, 'sunrise')).toBe(7);
        expect(sunHour('Empire', 359, 'sunset')).toBe(17);
        expect(dayLengthHours('Empire', 359) * 2).toBe(20);
        expect(nightLengthHours('Empire', 359) * 2).toBe(28);
    });

    it('reproduces the countdown to the next sunrise and sunset', () => {
        const [first, second] = nextSunEvents(anchor);
        // 03:44 -> 07:00 is 196 in-game minutes, which is 6m32s of real time
        expect(first.type).toBe('sunrise');
        expect(first.realMs - anchor.realMs).toBe(196 * 2 * 1000);
        // 03:44 -> 17:00 is 796 in-game minutes, 26m32s
        expect(second.type).toBe('sunset');
        expect(second.realMs - anchor.realMs).toBe(796 * 2 * 1000);
    });

    it('reproduces the five full moons and their offsets', () => {
        const { cycles } = geheimnisnachtForecast(anchor);
        const seen = cycles.map(c => ({
            day: c.fullMoonDay,
            offset: c.fullMoon.offsetMinutes,
        }));
        expect(seen).toEqual([
            { day: 201, offset: -56 },
            { day: 226, offset: -296 },
            { day: 251, offset: -538 },
            { day: 276, offset: 660 },
            { day: 301, offset: 418 },
        ]);
    });

    it('picks 2 Nachgeheim, eight minutes before the target', () => {
        const { night, yearOffset } = geheimnisnachtForecast(anchor);
        expect(yearOffset).toBe(1);
        expect(night!.dayOfYear).toBe(202);
        expect(night!.fromFullMoon).toBe(1);
        expect(night!.offsetMinutes).toBe(-8);
        expect(night!.igHours * 2).toBe(14);

        const start = new Date(night!.startMs);
        expect(start.getDate()).toBe(19);
        expect(start.getMonth()).toBe(8);
        expect(start.getHours()).toBe(20);
        expect(start.getMinutes()).toBe(52);

    });

    it('is a tight fit, so the rule is not being stretched', () => {
        // this is the number that says the model is right: the real server phase
        // puts the night within minutes of 21:00, not hours
        const { night } = geheimnisnachtForecast(anchor);
        expect(Math.abs(night!.offsetMinutes)).toBeLessThanOrEqual(48);
    });
});

describe('placing a day on the wall clock', () => {
    // the live capture again: day 359, 03:44 in-game, 17:54 local on 11.09.2026
    const anchor: ClockAnchor = {
        domain: 'Empire',
        dayOfYear: 359,
        hours: 3,
        minutes: 44,
        realMs: new Date(2026, 8, 11, 17, 54).getTime(),
    };

    it('spans a whole in-game day across 48 real minutes', () => {
        const start = realTimeInYear(anchor, 0, 200, 0);
        const nextStart = realTimeInYear(anchor, 0, 201, 0);
        expect(nextStart - start).toBe(48 * 60_000);
    });

    it('places the current day around the anchor itself', () => {
        // 03:44 in-game is 224 minutes into the day, i.e. 7m28s of real time
        const start = realTimeInYear(anchor, 0, 359, 0);
        expect(anchor.realMs - start).toBe(224 * 2 * 1000);
    });

    it('looks backwards for a day the year has already passed', () => {
        // day 200 is long behind day 359, so it must land in the past
        expect(realTimeInYear(anchor, 0, 200, 12)).toBeLessThan(anchor.realMs);
    });

    it('shifts a whole in-game year when previewing the next one', () => {
        const thisYear = realTimeInYear(anchor, 0, 200, 12);
        const nextYear = realTimeInYear(anchor, 1, 200, 12);
        expect(nextYear - thisYear).toBe(400 * 24 * REAL_MS_PER_IG_HOUR);
        expect(nextYear).toBeGreaterThan(anchor.realMs);
    });

    it('agrees with the Geheimnisnacht night it computes', () => {
        const { night, yearOffset } = geheimnisnachtForecast(anchor);
        const viaHelper = realTimeInYear(anchor, yearOffset, night!.dayOfYear, night!.sunsetHour);
        expect(viaHelper).toBe(night!.startMs);
    });
});
