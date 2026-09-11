import {Trigger} from "@client/Triggers.ts";
import Client from "@client/Client.ts";
import eventBus from "@modules/core/eventBus.ts";
import {characterStorage} from "@modules/core/storage.ts";
import {gmcp} from "@client/gmcp.ts";
import {normalizeDay, sunHour, type SunEventType} from "@client/scripts/sunModel.ts";

type Domain = "Empire" | "Ishtar";

const GUESS_PATTERN =
    /^Zgadujesz, ze moze byc teraz (\w ?)*, ale nie jestes w stanie tego sprawdzic$/;

const DESCRIPTIVE_TIME: Record<string, number> = {
    "polnoc": 0,
    "pierwsza": 1,
    "druga": 2,
    "trzecia": 3,
    "czwarta": 4,
    "piata": 5,
    "szosta": 6,
    "siodma": 7,
    "osma": 8,
    "dziewiata": 9,
    "dziesiata": 10,
    "jedenasta": 11,
    "dwunasta": 12,
    "poludnie": 12
};

const DESCRIPTIVE_MONTH: Record<string, number> = {
    pierwszy: 1,
    drugi: 2,
    trzeci: 3,
    czwarty: 4,
    piaty: 5,
    szosty: 6,
    siodmy: 7,
    osmy: 8,
    dziewiaty: 9,
    dziesiaty: 10,
    jedenasty: 11,
    dwunasty: 12,
    trzynasty: 13,
    czternasty: 14,
    pietnasty: 15,
    szesnasty: 16,
    siedemnasty: 17,
    osiemnasty: 18,
    dziewietnasty: 19,
    dwudziesty: 20,
    "dwudziesty pierwszy": 21,
    "dwudziesty drugi": 22,
    "dwudziesty trzeci": 23,
    "dwudziesty czwarty": 24,
    "dwudziesty piaty": 25,
    "dwudziesty szosty": 26,
    "dwudziesty siodmy": 27,
    "dwudziesty osmy": 28,
    "dwudziesty dziewiaty": 29,
    trzydziesty: 30,
    "trzydziesty pierwszy": 31,
    "trzydziesty drugi": 32,
    "trzydziesty trzeci": 33,
    "trzydziesty czwarty": 34,
    "trzydziesty piaty": 35,
    "trzydziesty szosty": 36,
    "trzydziesty siodmy": 37,
    "trzydziesty osmy": 38,
    "trzydziesty dziewiaty": 39,
    czterdziesty: 40,
    "czterdziesty pierwszy": 41,
    "czterdziesty drugi": 42,
    "czterdziesty trzeci": 43,
    "czterdziesty czwarty": 44,
    "czterdziesty piaty": 45
};

const PM: Record<string, (hour: number) => boolean> = {
    poludniu: () => true,
    wieczorem: () => true,
    nocy: (hour) => hour >= 6
};

export interface MonthDefinition {
    length: number;
    new_moon?: number[];
    alt_name?: string;
}

/**
 * Calendar shape only. This table used to carry a sunrise and a sunset hour per
 * month; both are gone, because the game does not work that way and the figures
 * were wrong on a large part of the year - Ishtar's were not even self-consistent,
 * placing the latest sunset two months off the solstice. Sunrise and sunset come
 * from the fitted grids in `sunModel`, confirmed by the observations `/slonce`
 * records.
 */
export const MONTHS: Record<string, MonthDefinition> = {
    Hexenstag: { length: 1, alt_name: "Hexensnacht"},
    Nachhexen: { length: 32},
    Jahrdrung: { length: 33},
    Mitterfruhl: { length: 1},
    Pflugzeit: { length: 33},
    Sigmarszeit: { length: 33},
    Sommerzeit: { length: 33},
    Sonnenstill: { length: 1},
    Vorgeheim: { length: 33},
    Nachgeheim: { length: 33},
    Erntezeit: { length: 33},
    Mitterherbst: { length: 1},
    Brauzeit: { length: 33},
    Kaltezeit: { length: 33},
    Ulrichszeit: { length: 33},
    Mondstill: { length: 1},
    Vorhexen: { length: 33},
    Yule: { length: 45},
    Imbaelk: { length: 45},
    Birke: { length: 45},
    Blathe: { length: 45},
    Feainn: { length: 45},
    Lammas: { length: 45},
    Velen: { length: 45},
    Saovine: { length: 45}
};

export const MONTHS_ORDER: Record<Domain, string[]> = {
    Empire: [
        "Hexenstag",
        "Nachhexen",
        "Jahrdrung",
        "Mitterfruhl",
        "Pflugzeit",
        "Sigmarszeit",
        "Sommerzeit",
        "Sonnenstill",
        "Vorgeheim",
        "Nachgeheim",
        "Erntezeit",
        "Mitterherbst",
        "Brauzeit",
        "Kaltezeit",
        "Ulrichszeit",
        "Mondstill",
        "Vorhexen"
    ],
    Ishtar: ["Yule", "Imbaelk", "Birke", "Blathe", "Feainn", "Lammas", "Velen", "Saovine"]
};

const PATTERNS: Record<Domain, RegExp[]> = {
    Empire: [
        new RegExp(
            "^Jest w przyblizeniu (?<hour>\\w+)(?: (?:|w|po|przed|nad|poznym)\\s*(?<daytime>dzien|nocy|poludniu|poludniem|poludnie|rano|ranem|wieczorem))?.*?, ((?<prefix>dzien|noc) (?<holiday>\\w+)|(?<day>[\\w ]+?) dzien miesiaca (?<month>\\w+)) wedlug Kalendarza Imperialnego\\."
        )
    ],
    Ishtar: [
        // Three formats:
        // "..., pierwszy dzien pory Imbaelk wedlug rachuby czasu Starszego Ludu."   regular day
        // "..., Imbaelk - Dzien Kielkowania wedlug rachuby czasu Starszego Ludu."   festival day
        // "..., noc Imbaelk wedlug rachuby czasu Starszego Ludu."                   festival night
        // The description after the dash is ignored - the name is enough, so the
        // festivals whose description we have never seen still parse.
        new RegExp(
            "^Jest w przyblizeniu (?<hour>\\w+)(?: (?:|w|po|przed|nad|poznym)\\s*(?<daytime>dzien|nocy|poludniu|poludniem|poludnie|rano|ranem|wieczorem))?.*, (?:(?<prefix>noc) (?<holiday>\\w+)|(?<holiday2>\\w+) -[^.]+|(?<day>[\\w ]+?) dzien pory (?<month>\\w+)) wedlug rachuby czasu Starszego Ludu\\."
        )
    ]
};

/**
 * Days that announce themselves as a named festival rather than as "N dzien pory
 * X". Each Ishtar festival sits on day 1 of its month, and two of the eight are
 * not named after that month: Blathe's festival is Belleteyn and Feainn's is
 * Midaete, so no amount of month lookup will find them.
 *
 * Empire's Geheimnisnacht is deliberately absent. That night moves from year to
 * year, so there is no fixed day to map it to - better to resolve nothing and
 * leave the clock alone than to invent a day.
 */
const FESTIVAL_DAYS: Record<Domain, Record<string, number>> = {
    Empire: {
        Hexenstag: 1,
        Hexensnacht: 1,
        Mitterfruhl: 67,
        Sonnenstill: 167,
        Mitterherbst: 267,
        Mondstill: 367,
    },
    Ishtar: {
        Yule: 1,
        Imbaelk: 46,
        Birke: 91,
        Belleteyn: 136,
        Midaete: 181,
        Lammas: 226,
        Velen: 271,
        Saovine: 316,
    },
};

const YEAR_LENGTH: Record<Domain, number> = {
    Empire: 400,
    Ishtar: 360
};

// Season boundaries - day of year when each season starts (1-indexed)
const SEASON_BOUNDARIES: Record<Domain, number[]> = {
    Empire: [
        18,  // Spring starts day 18
        118, // Summer starts day 118
        218, // Autumn starts day 218
        319  // Winter starts day 319
    ],
    Ishtar: [
        91,  // Spring starts day 91
        181, // Summer starts day 181
        271, // Autumn starts day 271
        1    // Winter starts day 1
    ]
};

const MAIN_CALENDAR: Record<Domain, Record<string, string>> = {
    Empire: {},
    Ishtar: {}
};

const ONE_HOUR = 120; // seconds

interface StoredState {
    start_time: number | null;
    measured_at: number | null;
    start_hour: number | null;
    start_minutes: number | null;
    precision: number | null;
    start_day: number | null;
}

interface ClockSnapshot {
    hours: number;
    minutes: number;
    precision: number;
    /** Epoch ms of the most recent observation constraining the clock; 0 if none. */
    measuredAt: number;
    /** Hour of sunrise on this day, from the observed grids in `sunModel`. */
    sunrise: number;
    sunset: number;
    dayLabel: string;
    dayOfMonth: number
    dayOfYear: number;
    daylight?: boolean;
    season?: number;
}

class ClockDisplay {
    public activeDomain?: Domain;

    private snapshots: Partial<Record<Domain, ClockSnapshot>> = {};

    constructor() {
        eventBus.on("gmcp.room.info", (payload) => {
            if (payload?.map?.domain) {
                if (payload.map.domain === "Imperium") {
                    this.setActiveDomain("Empire");
                } else if (payload.map.domain === "Ishtar") {
                    this.setActiveDomain("Ishtar");
                }
            }
        })
    }

    public update(domain: Domain, data: ClockSnapshot): void {
        // Always update snapshot and emit event for both domains
        // This allows ClockPopup to show both domains
        this.snapshots[domain] = data;
        eventBus.emit("clock.update", {domain, ...data});
    }

    public getSnapshot(domain: Domain): ClockSnapshot | undefined {
        return this.snapshots[domain];
    }

    public setActiveDomain(domain: Domain): void {
        this.activeDomain = domain;
        eventBus.emit("clock.domain.active", { domain });
        this.saveActiveDomain(domain);
    }

    public getActiveDomain(): Domain | undefined {
        return this.activeDomain;
    }

    public restoreActiveDomain(): void {
        const saved = characterStorage.get("clock_active_domain");
        if (saved === "Empire" || saved === "Ishtar") {
            this.activeDomain = saved;
            eventBus.emit("clock.domain.active", { domain: saved });
        }
    }

    private saveActiveDomain(domain: Domain): void {
        characterStorage.set("clock_active_domain", domain);
    }
}

export class ArkadiaTime {
    private startTime: number | null = null;

    private startHour: number | null = null;

    private startMinutes: number | null = null;

    private lastHourCheck: number | null = null;

    private lastHour: number | null = null;

    private precision = 0;

    /**
     * Epoch seconds of the most recent observation that constrained the clock.
     * Not the same as startTime: confirming the hour narrows precision without
     * re-anchoring the extrapolation, and that is still fresh evidence.
     */
    private measuredAt: number | null = null;

    private timers: number[] = [];

    private triggers: Trigger[] = [];

    private monthsOrder: string[];

    private patterns: RegExp[];

    private yearLength: number;

    private mainCalendar: Record<string, string>;

    private currentMonth?: string;

    private currentMonthDay?: number;

    private lastMonthUpdateDay?: number;

    private display: ClockDisplay;

    private isDaylight?: boolean;

    private pendingDaylightTransition?: { type: "sunrise" | "sunset"; timestamp: number };

    private startDay?: number;

    constructor(private domain: Domain, private client: Client, display: ClockDisplay) {
        this.display = display;
        this.monthsOrder = MONTHS_ORDER[domain];
        this.patterns = PATTERNS[domain];
        this.yearLength = YEAR_LENGTH[domain];
        this.mainCalendar = MAIN_CALENDAR[domain];
        this.load();
    }

    public start(): void {
        this.initTriggers();
        if (this.startTime !== null && this.startHour !== null && this.startMinutes !== null && this.startDay) {
            this.startTimers();
            this.update();
        }
    }

    private initTriggers(): void {
        this.triggers.forEach((trigger) => this.client.Triggers.removeTrigger(trigger));
        this.triggers = [];

        this.patterns.forEach((pattern) => {
            const trigger = this.client.Triggers.registerTrigger(pattern, (line, matches) => {
                const groups = matches?.groups ?? {};
                this.checkHour(groups.hour ?? "", groups.daytime ?? "", groups);
                this.update()
                return line;
            });
            this.triggers.push(trigger);
        });

        const guessTrigger = this.client.Triggers.registerTrigger(GUESS_PATTERN, (line) => {
            //TODO do we need to do something on guess?
            return line;
        });
        this.triggers.push(guessTrigger);

        eventBus.on("gmcp.room.time", (payload) => {
            if (this.display.activeDomain !== this.domain) {
                return;
            }

            const daylight = payload.daylight ?? payload?.time?.daylight;
            if (daylight === undefined) {
                return;
            }

            this.handleGmcp(Boolean(daylight))
        })
    }

    private handleGmcp(daylight: boolean): void {
        if (this.isDaylight !== undefined && this.isDaylight !== daylight) {
            if (this.startTime !== null) {
                this.markObservedSunEvent(daylight ? "sunrise" : "sunset");
            } else {
                this.pendingDaylightTransition = {
                    type: daylight ? "sunrise" : "sunset",
                    timestamp: Date.now()
                };
            }
        }
        this.isDaylight = daylight;
    }

    private checkHour(
        stringHour: string,
        expression: string,
        groups: Record<string, string | undefined>
    ): void {
        this.display.setActiveDomain(this.domain);
        const daylight = gmcp?.room?.time?.daylight
        if (daylight !== undefined) {
            this.isDaylight = Boolean(daylight)
        }
        const intHour = this.calculateHour(stringHour, expression);
        // the hour has to be known first: a festival night straddles midnight, so
        // which day of the year it is depends on what time it is
        const startDay = this.resolveDayOfYear(groups, intHour);
        if (startDay === null) {
            // an unrecognised day name - leave the clock as it was rather than
            // accepting a wrong day
            return;
        }

        if (this.startTime === null || this.startHour === null || this.startMinutes === null || !this.startDay) {
            const pending = this.consumePendingTransition();
            this.init(intHour, 0, pending ? 0 : 60, startDay);
            if (pending) {
                eventBus.emit(pending === "sunrise" ? "clock.sunrise" : "clock.sunset", {
                    domain: this.domain,
                    dayOfYear: startDay,
                    observedHour: intHour,
                    observedMinutes: 0
                });
            }
        } else {
            this.handleMismatch(intHour, startDay);
        }

        if (this.precision > 0 && this.lastHourCheck && this.lastHour === intHour) {
            this.precision = this.calculatePrecision(false);
        }

        // Every parsed time line is evidence, including one that merely agrees
        // with the extrapolation - it re-confirms the hour as of now. Only
        // re-anchoring and narrowing the precision used to stamp this, so a clock
        // that was already right went on reporting the age of a far older
        // reading, and anything extrapolating from that stamp ran the time
        // forward a second time.
        this.measuredAt = this.getEpoch();
        // `init` persists when it re-anchors, but a line that only confirms the
        // clock never goes through it, and both the stamp above and a narrowed
        // precision would be lost on reload.
        this.save();

        this.lastHourCheck = this.getEpoch();
        this.lastHour = intHour;

        eventBus.emit("clock.parsedTime", { domain: this.domain, hour: intHour, dayOfYear: startDay });
    }

    private init(intHour: number, startMinutes: number, precision: number, startDay: number): void {
        this.setup(this.getEpoch(), intHour, startMinutes, precision, startDay);
        this.update();
        this.startTimers();
        this.save();
    }

    private startTimers(): void {
        if (this.timers.length > 0) {
            return;
        }
        this.timers.push(window.setInterval(() => this.update(), 500));
    }

    private setup(startTime: number, startHour: number, startMinutes: number, precision: number, startDay: number, measuredAt: number = startTime): void {
        this.startTime = startTime;
        this.startHour = startHour;
        this.startMinutes = startMinutes;
        this.precision = precision;
        this.startDay = startDay;
        this.measuredAt = measuredAt;
    }

    private save(): void {
        const state: StoredState = {
            start_time: this.startTime,
            measured_at: this.measuredAt,
            start_hour: this.startHour,
            start_minutes: this.startMinutes,
            precision: this.precision,
            start_day: this.startDay ?? null
        };
        try {
            localStorage.setItem(`${this.domain}.time`, JSON.stringify(state));
        } catch (error) {
            console.error("Nie udalo sie zapisac stanu zegara", error);
        }
    }

    private load(): void {
        try {
            const raw = localStorage.getItem(`${this.domain}.time`);
            if (!raw) {
                return;
            }
            const state = JSON.parse(raw) as StoredState;
            if (state.start_time !== null && state.start_hour !== null && state.start_minutes !== null && state.start_day !== null && state.precision !== null) {
                this.setup(state.start_time, state.start_hour, state.start_minutes, state.precision, state.start_day, state.measured_at ?? state.start_time);
            }
        } catch (error) {
            console.error("Nie udalo sie wczytac stanu zegara", error);
        }
    }

    private consumePendingTransition(): "sunrise" | "sunset" | undefined {
        if (!this.pendingDaylightTransition) return undefined;
        const elapsed = Date.now() - this.pendingDaylightTransition.timestamp;
        const type = this.pendingDaylightTransition.type;
        this.pendingDaylightTransition = undefined;
        if (elapsed > ONE_HOUR * 1000) return undefined;
        return type;
    }

    private calculateHour(hour: string, expression: string): number {
        let value = DESCRIPTIVE_TIME[hour] ?? 0;
        const pmFn = PM[expression];
        if (pmFn && pmFn(value)) {
            value += 12;
        }
        if (value > 23) {
            value = 0;
        }
        return value;
    }

    private handleMismatch(intHour: number, startDay: number): void {
        const currentHour = this.getCurrentTime()[0];
        const currentDay = this.getCurrentDayOfYear();
        if (currentHour !== intHour || startDay !== currentDay) {
            this.init(intHour, 0, this.calculatePrecision(true), startDay);
        }
    }

    private calculatePrecision(mismatch: boolean): number {
        const difference = (this.getEpoch() - (this.lastHourCheck ?? 0)) / 2;
        const [, minutes] = this.getCurrentTime();
        const newPrecision = mismatch ? difference : 60 - minutes;
        // Use 60 as baseline for calculation if precision was 0, but don't modify this.precision yet
        const currentPrecision = (mismatch && this.precision === 0) ? 60 : this.precision;
        return Math.min(currentPrecision, Math.round(newPrecision));
    }

    private getCurrentTime(): [number, number] {
        if (this.startHour === null || this.startMinutes === null || this.startTime === null) {
            return [0, 0];
        }
        const [hoursPassed, minutesPassed] = this.getTime();
        const currentMinutes = (this.startMinutes + minutesPassed) % 60;
        const currentHour = (this.startHour + hoursPassed) % 24;
        return [currentHour, currentMinutes];
    }

    private getCurrentPrecision(): number {
        return this.precision;
    }

    private getTime(): [number, number] {
        if (this.startTime === null) {
            return [0, 0];
        }
        const difference = this.getEpoch() - this.startTime;
        const hoursPassed = Math.floor(difference / ONE_HOUR);
        const minutesPassed = (difference % ONE_HOUR) * 0.5;
        return [hoursPassed, minutesPassed];
    }

    private getDaysPassed(): number {
        if (this.startTime === null || this.startHour === null) {
            return 0;
        }
        const difference = this.getEpoch() - this.startTime - ((24 - this.startHour) * ONE_HOUR);
        return Math.floor(difference / (ONE_HOUR * 24)) + 1;
    }

    private getDayFromString(stringDayOfMonth: string): number {
        if (!stringDayOfMonth) {
            return 1;
        }
        return DESCRIPTIVE_MONTH[stringDayOfMonth] ?? 1;
    }

    /**
     * Day of the year for a parsed time line, or null when the name means nothing
     * to us. Returning null matters: the old code fell out of the month loop with
     * the accumulated total, so an unknown festival silently became the last day
     * of the year and dragged the whole clock with it.
     */
    private resolveDayOfYear(
        groups: Record<string, string | undefined>,
        intHour: number
    ): number | null {
        const holiday = groups.holiday || groups.holiday2;
        if (holiday) {
            return groups.prefix === "noc"
                ? this.resolveFestivalNight(holiday, intHour)
                : this.resolveFestivalDay(holiday);
        }
        if (groups.month) {
            return this.getDayOfYear(this.getDayFromString(groups.day ?? ""), groups.month);
        }
        return null;
    }

    /** The festival day itself, which runs from its sunrise through to midnight. */
    private resolveFestivalDay(name: string): number | null {
        return FESTIVAL_DAYS[this.domain][name] ?? this.getDayOfYear(1, name);
    }

    /**
     * "noc X" is the night *before* festival X: it opens at sunset on the previous
     * day and closes at sunrise on the festival itself, so it spans midnight and
     * covers parts of two days. The hour says which of them we are in.
     */
    private resolveFestivalNight(name: string, intHour: number): number | null {
        const festival = FESTIVAL_DAYS[this.domain][name] ?? this.getDayOfYear(1, name);
        if (festival === null) {
            return null;
        }
        const sunrise = this.getSunriseHour(festival);
        if (sunrise !== null && intHour < sunrise) {
            return festival;
        }
        return 1 + ((festival - 2 + this.yearLength) % this.yearLength);
    }

    /** Sunrise hour for a day, from the observed grids rather than the month table. */
    private getSunriseHour(dayOfYear: number): number | null {
        return sunHour(this.domain, dayOfYear, "sunrise");
    }

    private getDayOfYear(day: number, month: string): number | null {
        let dayOfYear = 0;
        for (const monthName of this.monthsOrder) {
            const monthProperties = MONTHS[monthName];
            if (monthName !== month && monthProperties.alt_name !== month) {
                dayOfYear += monthProperties.length;
            } else {
                dayOfYear += day;
                return dayOfYear;
            }
        }
        return null;
    }

    private getCurrentDayOfYear(): number {
        if (!this.startDay) {
            return 1;
        }
        const day = this.startDay + this.getDaysPassed();
        return 1 + ((day - 1) % this.yearLength);
    }

    private getMonthDayFromDay(dayOfYear: number): [number, string] {
        let remaining = dayOfYear;
        for (const monthName of this.monthsOrder) {
            const monthProperties = MONTHS[monthName];
            if (remaining > monthProperties.length) {
                remaining -= monthProperties.length;
            } else {
                return [remaining, monthName];
            }
        }
        return [remaining, this.monthsOrder[0]];
    }

    private calculateSeason(dayOfYear: number): number {
        const boundaries = SEASON_BOUNDARIES[this.domain];
        // boundaries = [spring_start, summer_start, autumn_start, winter_start]
        const [springStart, summerStart, autumnStart, winterStart] = boundaries;

        // Handle winter wrap-around (Ishtar: winter_start < spring_start)
        if (winterStart < springStart) {
            // Winter wraps around the year (e.g., Ishtar: days 1-90)
            if (dayOfYear >= autumnStart) return 2; // Autumn
            if (dayOfYear >= summerStart) return 1; // Summer
            if (dayOfYear >= springStart) return 0; // Spring
            return 3; // Winter (before spring)
        } else {
            // Normal ordering (Empire: winter comes after autumn)
            if (dayOfYear >= winterStart) return 3; // Winter
            if (dayOfYear >= autumnStart) return 2; // Autumn
            if (dayOfYear >= summerStart) return 1; // Summer
            if (dayOfYear >= springStart) return 0; // Spring
            return 3; // Winter (wrap-around, before spring)
        }
    }

    private calculateDaylight(hour: number, sunrise: number, sunset: number): boolean {
        return hour >= sunrise && hour < sunset;
    }

    private update(): void {
        const dayOfYear = this.getCurrentDayOfYear();
        const [dayOfMonth, month] = this.getMonthDayFromDay(dayOfYear);
        if (this.lastMonthUpdateDay !== dayOfYear) {
            this.currentMonth = month;
            this.currentMonthDay = dayOfMonth;
            this.lastMonthUpdateDay = dayOfYear;
        }
        const [hours, minutes] = this.getCurrentTime();
        // Calculate current precision based on time elapsed since it was set
        const currentPrecision = this.getCurrentPrecision();
        // From the fitted grids, not the month table: sunrise and sunset run on
        // their own step schedules that do not line up with month boundaries, so a
        // per-month figure is simply wrong on a good part of the year.
        const sunrise = sunHour(this.domain, dayOfYear, "sunrise");
        const sunset = sunHour(this.domain, dayOfYear, "sunset");
        const season = this.calculateSeason(dayOfYear);
        const daylight = this.calculateDaylight(hours, sunrise, sunset);
        this.display.update(this.domain, {
            hours,
            minutes,
            precision: currentPrecision,
            measuredAt: this.measuredAt === null ? 0 : this.measuredAt * 1000,
            sunrise,
            sunset,
            dayLabel: `${dayOfMonth} ${(this.mainCalendar[this.currentMonth ?? ""] ?? this.currentMonth) ?? ""}`.trim(),
            dayOfMonth: this.currentMonthDay,
            dayOfYear,
            daylight,
            season
        });
    }

    /**
     * A sun transition is the one moment the game hands us an exact time. The hour
     * it happens at is not guessed from the clock - it is looked up in the observed
     * grids of `sunModel`, which are fitted against every confirmed observation the
     * sun tracker has recorded. The old code rounded the clock's own reading up to
     * the next full hour, so a clock running a single game minute ahead of the flip
     * (two real seconds of lag is enough) was "corrected" a whole hour forward.
     *
     * The day is resolved the same way. A sunset late in the evening or a sunrise
     * just after midnight straddles the day boundary, so the neighbouring days are
     * candidates too and the nearest one to the current reading wins - which also
     * repairs a clock that has not rolled over yet, or has rolled over too early.
     */
    private markObservedSunEvent(type: SunEventType): void {
        const [clockHour, clockMinutes] = this.getCurrentTime();
        const clockDay = this.getCurrentDayOfYear();
        const clockPosition = clockDay * 24 + clockHour + clockMinutes / 60;

        let bestDay = clockDay;
        let bestHour = sunHour(this.domain, clockDay, type);
        let bestDistance = Infinity;
        for (const offset of [-1, 0, 1]) {
            const day = clockDay + offset;
            const hour = sunHour(this.domain, normalizeDay(this.domain, day), type);
            const distance = Math.abs(day * 24 + hour - clockPosition);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestDay = day;
                bestHour = hour;
            }
        }
        const finalDay = normalizeDay(this.domain, bestDay);
        const indicatedHour = `${clockHour}:${Math.floor(clockMinutes).toString().padStart(2, "0")}`;

        // The tracker records what the following `czas` reply says, not what we set
        // here, so the observations that feed the grids stay independent of them.
        eventBus.emit(type === "sunrise" ? "clock.sunrise" : "clock.sunset", {
            domain: this.domain,
            dayOfYear: finalDay,
            observedHour: bestHour,
            observedMinutes: 0,
            indicatedHour
        });

        // How far the clock had drifted by the time the sun corrected it. This
        // comparison used to run against the month table in this file, which the
        // grids supersede - those tables never matched the game on many days.
        if (bestHour !== clockHour || finalDay !== clockDay) {
            console.log(`[${this.domain}] ${type} drift on day ${finalDay}: clock read ${indicatedHour}, corrected to ${bestHour}:00`);
            eventBus.emit("clock.mismatch", {
                domain: this.domain,
                type,
                dayOfYear: finalDay,
                expectedHour: bestHour,
                observedHour: clockHour,
                observedMinutes: Math.floor(clockMinutes),
                indicatedHour
            });
        }

        this.init(bestHour, 0, 0, finalDay);
    }

    public setTime(hour: number, minutes?: number, dayOfYear?: number): void {
        const day = dayOfYear ?? this.startDay ?? 1;
        this.init(hour, minutes ?? 0, 0, day);
    }

    private getEpoch(): number {
        return Math.floor(Date.now() / 1000);
    }
}

export class ClockManager {
    private display: ClockDisplay;

    private empireClock: ArkadiaTime;

    private ishtarClock: ArkadiaTime;

    constructor(client: Client) {
        this.display = new ClockDisplay();
        this.empireClock = new ArkadiaTime("Empire", client, this.display);
        this.ishtarClock = new ArkadiaTime("Ishtar", client, this.display);
    }

    public start(): void {
        // Restore last active domain before starting clocks
        this.display.restoreActiveDomain();
        this.empireClock.start();
        this.ishtarClock.start();
    }

    public getClocks(): { empire: ArkadiaTime; ishtar: ArkadiaTime } {
        return {empire: this.empireClock, ishtar: this.ishtarClock};
    }

    public getActiveDomain(): Domain | undefined {
        return this.display.getActiveDomain();
    }

    public restoreActiveDomain(): void {
        this.display.restoreActiveDomain();
    }

    public setTime(domain: Domain, hour: number, minutes?: number, dayOfYear?: number): void {
        // Re-emit current active domain so UI components receive it
        // (they may have missed the initial event due to mount timing)
        const currentDomain = this.display.getActiveDomain();
        if (currentDomain) {
            this.display.setActiveDomain(currentDomain);
        }
        if (domain === "Empire") {
            this.empireClock.setTime(hour, minutes, dayOfYear);
        } else {
            this.ishtarClock.setTime(hour, minutes, dayOfYear);
        }
    }
}

export function initClock(client: Client): ClockManager {
    const manager = new ClockManager(client);

    client.aliases.push({
        pattern: /^\/czas$/,
        callback: () => {
            const activeDomain = manager.getActiveDomain();
            eventBus.emit("clock.popup.open", { domain: activeDomain })
        }
    })

    // Compact "Czas" season/date/time-of-day widget (ported from forge-ui's
    // TimePanel) — distinct from the full clock/calendar popup ("Zegar") above.
    client.aliases.push({
        pattern: /^\/czasw$/,
        callback: () => eventBus.emit("worldTime.popup.open"),
    })

    client.aliases.push({
        pattern: /^\/czas\s+(imperium|ishtar)\s+(\d+)(?:\s+(\d+))?$/i,
        callback: (matches: RegExpMatchArray) => {
            const rawDomain = matches[1].toLowerCase();
            const domain: Domain = rawDomain === "imperium" ? "Empire" : "Ishtar";
            const hour = parseInt(matches[2], 10);
            if (hour < 0 || hour > 23) {
                client.println("Godzina musi byc w zakresie 0-23.");
                return;
            }
            const maxDay = domain === "Empire" ? 400 : 360;
            let dayOfYear: number | undefined;
            if (matches[3]) {
                dayOfYear = parseInt(matches[3], 10);
                if (dayOfYear < 1 || dayOfYear > maxDay) {
                    client.println(`Dzien roku musi byc w zakresie 1-${maxDay}.`);
                    return;
                }
            }
            manager.setTime(domain, hour, undefined, dayOfYear);
            const dayInfo = dayOfYear !== undefined ? `, dzien ${dayOfYear}` : "";
            client.println(`Ustawiono czas ${domain === "Empire" ? "Imperium" : "Ishtar"}: ${hour.toString().padStart(2, '0')}:00${dayInfo}`);
        }
    })

    eventBus.on("clock.setTime", (payload: { domain: "Empire" | "Ishtar"; hour: number; minutes?: number; dayOfYear?: number }) => {
        manager.setTime(payload.domain, payload.hour, payload.minutes, payload.dayOfYear);
    });

    // Restore active domain when character info arrives (after login)
    client.on('gmcp.char.info', (info) => {
        const detail = info as any;
        if (detail?.name) {
            manager.restoreActiveDomain();
        }
    });

    manager.start();
    return manager;
}

