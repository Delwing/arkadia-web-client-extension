import { describe, expect, it } from "vitest";
import {
    formatClock,
    formatDateLong,
    formatDayLabel,
    formatDuration,
    pluralLines,
    pluralSessions,
} from "@ui/logViewer/model/format";

const at = (hours: number, minutes: number, seconds: number) =>
    new Date(2026, 8, 19, hours, minutes, seconds).getTime();

describe("formatClock", () => {
    it("pads to HH:MM:SS", () => {
        expect(formatClock(at(9, 5, 3))).toBe("09:05:03");
    });

    it("drops seconds when short", () => {
        expect(formatClock(at(20, 41, 3), true)).toBe("20:41");
    });
});

describe("formatDuration", () => {
    it("uses the coarsest unit that still says something", () => {
        expect(formatDuration(40_000)).toBe("40s");
        expect(formatDuration(38 * 60_000)).toBe("38m");
        expect(formatDuration((60 + 38) * 60_000)).toBe("1h 38m");
    });

    it("never goes negative", () => {
        expect(formatDuration(-5000)).toBe("0s");
    });
});

describe("formatDayLabel", () => {
    const now = new Date(2026, 8, 19, 12, 0, 0).getTime();

    it("names today and yesterday", () => {
        expect(formatDayLabel(at(19, 0, 0), now)).toContain("Dzisiaj");
        expect(formatDayLabel(new Date(2026, 8, 18, 21, 0, 0).getTime(), now)).toContain("Wczoraj");
    });

    it("falls back to the date further back", () => {
        const label = formatDayLabel(new Date(2026, 8, 13, 21, 0, 0).getTime(), now);
        expect(label).not.toContain("Dzisiaj");
        expect(label).toContain("2026");
    });

    it("stays ASCII, like the rest of the client's Polish", () => {
        expect(formatDateLong(at(19, 0, 0))).toMatch(/^[\x20-\x7e]+$/);
    });
});

describe("Polish plurals", () => {
    it("declines line counts", () => {
        expect(pluralLines(1)).toBe("linia");
        expect(pluralLines(3)).toBe("linie");
        expect(pluralLines(5)).toBe("linii");
        // The teens are the trap: 12 takes the same form as 5, not as 2.
        expect(pluralLines(12)).toBe("linii");
        expect(pluralLines(22)).toBe("linie");
        expect(pluralLines(112)).toBe("linii");
    });

    it("declines session counts", () => {
        expect(pluralSessions(1)).toBe("sesja");
        expect(pluralSessions(2)).toBe("sesje");
        expect(pluralSessions(6)).toBe("sesji");
        expect(pluralSessions(13)).toBe("sesji");
    });
});
