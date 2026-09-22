import { describe, expect, it } from "vitest";
import {
    MAX_MATCHES_PER_LINE,
    countMatches,
    findLineHits,
    makeMatcher,
    normalizeMatchIndex,
    splitMatches,
} from "@ui/logViewer/model/search";

describe("makeMatcher", () => {
    it("treats a plain query literally", () => {
        const { regex } = makeMatcher("a.b", { regex: false, caseSensitive: false });
        expect(regex!.test("axb")).toBe(false);
        regex!.lastIndex = 0;
        expect(regex!.test("a.b")).toBe(true);
    });

    it("is case-insensitive unless asked otherwise", () => {
        expect(makeMatcher("troll", { regex: false, caseSensitive: false }).regex!.flags).toContain("i");
        expect(makeMatcher("troll", { regex: false, caseSensitive: true }).regex!.flags).not.toContain("i");
    });

    it("reports an invalid pattern instead of throwing", () => {
        const matcher = makeMatcher("[a-", { regex: true, caseSensitive: false });
        expect(matcher.invalid).toBe(true);
        expect(matcher.regex).toBeNull();
    });

    it("has no matcher for an empty query", () => {
        expect(makeMatcher("", { regex: false, caseSensitive: false })).toEqual({ regex: null, invalid: false });
    });
});

describe("splitMatches", () => {
    it("splits a line into plain and matched segments", () => {
        const { segments, count } = splitMatches("troll bije trolla", /troll/g);
        expect(count).toBe(2);
        expect(segments.map((segment) => segment.text).join("")).toBe("troll bije trolla");
        expect(segments.filter((segment) => segment.match)).toHaveLength(2);
    });

    it("returns the whole line as one plain segment when nothing matches", () => {
        const { segments, count } = splitMatches("cisza", /troll/g);
        expect(count).toBe(0);
        expect(segments).toEqual([{ text: "cisza", match: false }]);
    });

    it("steps over zero-length matches instead of looping forever", () => {
        // `a*` matches the empty string at every position; without the guard in
        // splitMatches this never terminates.
        const { count, segments } = splitMatches("bbb", /a*/g);
        expect(count).toBe(0);
        expect(segments.map((segment) => segment.text).join("")).toBe("bbb");
    });

    it("caps how many matches one line contributes", () => {
        const { count } = splitMatches("x".repeat(500), /x/g);
        expect(count).toBe(MAX_MATCHES_PER_LINE);
    });

    it("counts the same way it splits", () => {
        const line = "troll, troll i jeszcze troll";
        expect(countMatches(line, /troll/g)).toBe(splitMatches(line, /troll/g).count);
    });

    it("counts zero-length patterns as nothing", () => {
        expect(countMatches("bbb", /a*/g)).toBe(0);
    });
});

describe("normalizeMatchIndex", () => {
    it("wraps past the end", () => {
        expect(normalizeMatchIndex(5, 5)).toBe(0);
        expect(normalizeMatchIndex(6, 5)).toBe(1);
    });

    it("wraps before the start, so -1 means the last match", () => {
        expect(normalizeMatchIndex(-1, 5)).toBe(4);
        expect(normalizeMatchIndex(-6, 5)).toBe(4);
    });

    it("is zero when there is nothing to point at", () => {
        expect(normalizeMatchIndex(3, 0)).toBe(0);
    });
});

describe("findLineHits", () => {
    const lines = (...texts: string[]) =>
        texts.map((text, index) => ({ number: index + 1, timestamp: 0, channel: "other" as const, text }));

    it("finds a plain query on the lines holding it, counted per line", () => {
        const log = lines("Krasnolud mowi", "nic", "krasnolud i KRASNOLUD");
        const matcher = makeMatcher("krasnolud", { regex: false, caseSensitive: false });
        expect(findLineHits(log, "krasnolud", { regex: false, caseSensitive: false }, matcher.regex!)).toEqual([
            { line: 0, count: 1 },
            { line: 2, count: 2 },
        ]);
    });

    it("respects case when asked, and never matches across a line break", () => {
        const log = lines("ab", "cAB");
        const sensitive = makeMatcher("AB", { regex: false, caseSensitive: true });
        expect(findLineHits(log, "AB", { regex: false, caseSensitive: true }, sensitive.regex!)).toEqual([{ line: 1, count: 1 }]);
        const across = makeMatcher("bc", { regex: false, caseSensitive: false });
        expect(findLineHits(log, "bc", { regex: false, caseSensitive: false }, across.regex!)).toEqual([]);
    });

    it("runs a regular expression line by line, so ^ is the start of a line", () => {
        const log = lines("ala ma kota", "ma ala");
        const matcher = makeMatcher("^ma", { regex: true, caseSensitive: false });
        expect(findLineHits(log, "^ma", { regex: true, caseSensitive: false }, matcher.regex!)).toEqual([{ line: 1, count: 1 }]);
    });

    it("agrees with countMatches on the same log", () => {
        const log = lines("x".repeat(5), "xx yy xx", "");
        const matcher = makeMatcher("xx", { regex: false, caseSensitive: false });
        const hits = findLineHits(log, "xx", { regex: false, caseSensitive: false }, matcher.regex!);
        expect(hits).toEqual(
            log.flatMap((line, index) => {
                const count = countMatches(line.text, matcher.regex!);
                return count ? [{ line: index, count }] : [];
            }),
        );
    });
});
