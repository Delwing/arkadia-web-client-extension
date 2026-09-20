/** Time and duration formatting shared by the header, sidebar and timeline. */

const pad = (value: number) => String(value).padStart(2, "0");

/** `20:41:03`, or `20:41` when `short`. */
export function formatClock(timestamp: number, short = false): string {
    const date = new Date(timestamp);
    const hhmm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    return short ? hhmm : `${hhmm}:${pad(date.getSeconds())}`;
}

/**
 * Axis label for a session of a given length. A four-minute session labelled
 * `20:14 20:14 20:15 …` tells the player nothing, so short spans get seconds.
 */
export function formatAxisLabel(timestamp: number, spanMs: number): string {
    return formatClock(timestamp, spanMs >= 30 * 60_000);
}

/** `1h 38m` / `38m` / `40s` — the coarsest unit that still says something. */
export function formatDuration(milliseconds: number): string {
    const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.round((totalSeconds % 3600) / 60);
    return hours ? `${hours}h ${pad(minutes)}m` : `${minutes}m`;
}

const WEEKDAYS = ["niedz", "pon", "wt", "sr", "czw", "pt", "sob"];
const MONTHS = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paz", "lis", "gru"];

/** `sob 19 wrz 2026`. ASCII-only, to match the rest of the client's Polish. */
export function formatDateLong(timestamp: number): string {
    const date = new Date(timestamp);
    return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** `Dzisiaj · sob 19 wrz`, `Wczoraj · …`, else the date. */
export function formatDayLabel(timestamp: number, now: number = Date.now()): string {
    const date = new Date(timestamp);
    const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
    const dayDelta = Math.round((startOfDay(new Date(now)) - startOfDay(date)) / 86_400_000);
    const short = `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
    if (dayDelta === 0) return `Dzisiaj · ${short}`;
    if (dayDelta === 1) return `Wczoraj · ${short}`;
    return `${short} ${date.getFullYear()}`;
}

/** Polish plural for counts: 1 linia / 2-4 linie / 5+ linii. */
export function pluralLines(count: number): string {
    const lastTwo = count % 100;
    const last = count % 10;
    if (count === 1) return "linia";
    if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return "linie";
    return "linii";
}

export function pluralSessions(count: number): string {
    const lastTwo = count % 100;
    const last = count % 10;
    if (count === 1) return "sesja";
    if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return "sesje";
    return "sesji";
}

export function pluralLogs(count: number): string {
    const lastTwo = count % 100;
    const last = count % 10;
    if (count === 1) return "logu";
    if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return "logach";
    return "logach";
}
