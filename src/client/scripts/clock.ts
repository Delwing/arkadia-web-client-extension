import {Trigger} from "@client/Triggers.ts";
import Client from "@client/Client.ts";
import eventBus from "@modules/core/eventBus.ts";
import {characterStorage} from "@modules/core/storage.ts";
import {gmcp} from "@client/gmcp.ts";

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
    sunrise: number | "?" | string;
    sunset: number | "?" | string;
    length: number;
    new_moon?: number[];
    alt_name?: string;
}

export const MONTHS: Record<string, MonthDefinition> = {
    Hexenstag: {sunrise: 8, sunset: 17, length: 1, alt_name: "Hexensnacht"},
    Nachhexen: {sunrise: 8, sunset: 17, length: 32},
    Jahrdrung: {sunrise: 7, sunset: 18, length: 33},
    Mitterfruhl: {sunrise: 7, sunset: 18, length: 1},
    Pflugzeit: {sunrise: 6, sunset: 19, length: 33},
    Sigmarszeit: {sunrise: 5, sunset: 20, length: 33},
    Sommerzeit: {sunrise: 5, sunset: 21, length: 33},
    Sonnenstill: {sunrise: 5, sunset: 22, length: 1},
    Vorgeheim: {sunrise: 4, sunset: 22, length: 33},
    Nachgeheim: {sunrise: 5, sunset: 21, length: 33},
    Erntezeit: {sunrise: 5, sunset: 20, length: 33},
    Mitterherbst: {sunrise: 5, sunset: 20, length: 1},
    Brauzeit: {sunrise: 6, sunset: 19, length: 33},
    Kaltezeit: {sunrise: 6, sunset: 18, length: 33},
    Ulrichszeit: {sunrise: 7, sunset: 17, length: 33},
    Mondstill: {sunrise: 8, sunset: 16, length: 1},
    Vorhexen: {sunrise: 8, sunset: 16, length: 33},
    Yule: {sunrise: "8", sunset: "16", length: 45},
    Imbaelk: {sunrise: "7", sunset: "18", length: 45},
    Birke: {sunrise: "6", sunset: "19", length: 45},
    Blathe: {sunrise: "5", sunset: "21", length: 45},
    Feainn: {sunrise: "4", sunset: "20", length: 45},
    Lammas: {sunrise: "5", sunset: "20", length: 45},
    Velen: {sunrise: "7", sunset: "18", length: 45},
    Saovine: {sunrise: "6", sunset: "17", length: 45}
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
            "^Jest w przyblizeniu (?<hour>\\w+)(?: (?:|w|po|przed|nad|poznym)\\s*(?<daytime>dzien|nocy|poludniu|poludniem|poludnie|rano|ranem|wieczorem))?.*?, ((?:dzien|noc) (?<holiday>\\w+)|(?<day>[\\w ]+?) dzien miesiaca (?<month>\\w+)) wedlug Kalendarza Imperialnego\\."
        )
    ],
    Ishtar: [
        // Matches both formats:
        // "Jest w przyblizeniu X w nocy, pierwszy dzien pory Imbaelk wedlug rachuby czasu Starszego Ludu."
        // "Jest w przyblizeniu X w nocy, Imbaelk - Dzien Kielkowania wedlug rachuby czasu Starszego Ludu."
        new RegExp(
            "^Jest w przyblizeniu (?<hour>\\w+)(?: (?:|w|po|przed|nad|poznym)\\s*(?<daytime>dzien|nocy|poludniu|poludniem|poludnie|rano|ranem|wieczorem))?.*, (?:(?<day>[\\w ]+?) dzien pory )?(?<month>\\w+)(?: -[^.]+)? wedlug rachuby czasu Starszego Ludu\\."
        )
    ]
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
    start_hour: number | null;
    start_minutes: number | null;
    precision: number | null;
    start_day: number | null;
}

interface ClockSnapshot {
    hours: number;
    minutes: number;
    precision: number;
    sunrise: number | string | "?";
    sunset: number | string | "?";
    dayLabel: string;
    dayOfMonth: number
    dayOfYear: number;
    daylight?: boolean;
    season?: number;
}

class ClockDisplay {
    public activeDomain?: Domain;

    private snapshots: Partial<Record<Domain, ClockSnapshot>> = {};

    constructor(private readonly client: Client) {
        this.client.on("gmcp.room.info", (payload) => {
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
                const month = groups.month && groups.month !== "" ? groups.month : groups.holiday ?? "";
                this.checkHour(groups.hour ?? "", groups.daytime ?? "", groups.day ?? "", month);
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

        this.client.on("gmcp.room.time", (payload) => {
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
                if (daylight) {
                    this.markObservedSunrise();
                } else {
                    this.markObservedSunset();
                }
            } else {
                this.pendingDaylightTransition = {
                    type: daylight ? "sunrise" : "sunset",
                    timestamp: Date.now()
                };
            }
        }
        this.isDaylight = daylight;
    }

    private checkHour(stringHour: string, expression: string, stringDayOfMonth: string, month: string): void {
        this.display.setActiveDomain(this.domain);
        const daylight = gmcp?.room?.time?.daylight
        if (daylight !== undefined) {
            this.isDaylight = Boolean(daylight)
        }
        const intHour = this.calculateHour(stringHour, expression);
        const startDay = this.getDayOfYear(this.getDayFromString(stringDayOfMonth), month);

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
        this.timers.push(this.client.scope.interval(() => this.update(), 500));
    }

    private setup(startTime: number, startHour: number, startMinutes: number, precision: number, startDay: number): void {
        this.startTime = startTime;
        this.startHour = startHour;
        this.startMinutes = startMinutes;
        this.precision = precision;
        this.startDay = startDay;
    }

    private save(): void {
        const state: StoredState = {
            start_time: this.startTime,
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
                this.setup(state.start_time, state.start_hour, state.start_minutes, state.precision, state.start_day);
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

    private getDayOfYear(day: number, month: string): number {
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
        return dayOfYear;
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

    private calculateDaylight(hour: number, sunrise: number | string | "?", sunset: number | string | "?"): boolean | undefined {
        if (sunrise === "?" || sunrise === "" || sunset === "?" || sunset === "") {
            return undefined;
        }
        const sunriseHour = typeof sunrise === "number" ? sunrise : parseInt(sunrise, 10);
        const sunsetHour = typeof sunset === "number" ? sunset : parseInt(sunset, 10);
        if (isNaN(sunriseHour) || isNaN(sunsetHour)) {
            return undefined;
        }
        return hour >= sunriseHour && hour < sunsetHour;
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
        const monthDef = this.currentMonth ? MONTHS[this.currentMonth] : undefined;
        const sunrise = monthDef?.sunrise ?? "?";
        const sunset = monthDef?.sunset ?? "?";
        const season = this.calculateSeason(dayOfYear);
        const daylight = this.calculateDaylight(hours, sunrise, sunset);
        this.display.update(this.domain, {
            hours,
            minutes,
            precision: currentPrecision,
            sunrise,
            sunset,
            dayLabel: `${dayOfMonth} ${(this.mainCalendar[this.currentMonth ?? ""] ?? this.currentMonth) ?? ""}`.trim(),
            dayOfMonth: this.currentMonthDay,
            dayOfYear,
            daylight,
            season
        });
    }

    private markObservedSunrise(): void {
        // Use current calculated time as the observed sunrise time
        const [observedHour, observedMinutes] = this.getCurrentTime();
        const currentDay = this.getCurrentDayOfYear();

        // If observed time is not exactly on the hour, round up to next full hour
        // e.g., 4:59 should become 5:00
        const finalHour = Math.floor(observedMinutes) > 0 ? observedHour + 1 : observedHour;

        // Emit sunrise event for calendar building with BOTH:
        // - observedHour/observedMinutes: the corrected hour (what clock is set to)
        // - indicatedHour: the raw observed hour with precision before correction
        eventBus.emit("clock.sunrise", {
            domain: this.domain,
            dayOfYear: currentDay,
            observedHour: finalHour,
            observedMinutes: 0,
            indicatedHour: `${observedHour}:${Math.floor(observedMinutes).toString().padStart(2, '0')}`
        });

        // Compare with month table expectations for mismatch detection
        if (this.currentMonth) {
            const expectedSunrise = MONTHS[this.currentMonth].sunrise;
            const expectedHour = typeof expectedSunrise === "number" ? expectedSunrise :
                               (typeof expectedSunrise === "string" ? parseInt(expectedSunrise, 10) : null);

            if (expectedHour !== null && !isNaN(expectedHour)) {
                if (finalHour !== expectedHour) {
                    console.log(`[${this.domain}] Sunrise mismatch on day ${currentDay}: expected ${expectedHour}:00, observed ${observedHour}:${Math.floor(observedMinutes).toString().padStart(2, '0')}`);
                    eventBus.emit("clock.mismatch", {
                        domain: this.domain,
                        type: "sunrise",
                        dayOfYear: currentDay,
                        expectedHour,
                        observedHour: finalHour,
                        observedMinutes: 0,
                        indicatedHour: `${observedHour}:${Math.floor(observedMinutes).toString().padStart(2, '0')}`
                    });
                }
            }
        }

        // Set clock to the rounded hour with precision 0
        this.init(finalHour, 0, 0, currentDay);
    }

    private markObservedSunset(): void {
        // Use current calculated time as the observed sunset time
        const [observedHour, observedMinutes] = this.getCurrentTime();
        const currentDay = this.getCurrentDayOfYear();

        // If observed time is not exactly on the hour, round up to next full hour
        // e.g., 20:59 should become 21:00
        const finalHour = Math.floor(observedMinutes) > 0 ? observedHour + 1 : observedHour;

        // Emit sunset event for calendar building with BOTH:
        // - observedHour/observedMinutes: the corrected hour (what clock is set to)
        // - indicatedHour: the raw observed hour with precision before correction
        eventBus.emit("clock.sunset", {
            domain: this.domain,
            dayOfYear: currentDay,
            observedHour: finalHour,
            observedMinutes: 0,
            indicatedHour: `${observedHour}:${Math.floor(observedMinutes).toString().padStart(2, '0')}`
        });

        // Compare with month table expectations for mismatch detection
        if (this.currentMonth) {
            const expectedSunset = MONTHS[this.currentMonth].sunset;
            const expectedHour = typeof expectedSunset === "number" ? expectedSunset :
                               (typeof expectedSunset === "string" ? parseInt(expectedSunset, 10) : null);

            if (expectedHour !== null && !isNaN(expectedHour)) {
                if (finalHour !== expectedHour) {
                    console.log(`[${this.domain}] Sunset mismatch on day ${currentDay}: expected ${expectedHour}:00, observed ${observedHour}:${Math.floor(observedMinutes).toString().padStart(2, '0')}`);
                    eventBus.emit("clock.mismatch", {
                        domain: this.domain,
                        type: "sunset",
                        dayOfYear: currentDay,
                        expectedHour,
                        observedHour: finalHour,
                        observedMinutes: 0,
                        indicatedHour: `${observedHour}:${Math.floor(observedMinutes).toString().padStart(2, '0')}`
                    });
                }
            }
        }

        // Set clock to the rounded hour with precision 0
        this.init(finalHour, 0, 0, currentDay);
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
        this.display = new ClockDisplay(client);
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

    client.on("clock.setTime", (payload: { domain: "Empire" | "Ishtar"; hour: number; minutes?: number; dayOfYear?: number }) => {
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

