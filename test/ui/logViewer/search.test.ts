import { describe, expect, it } from "vitest";
import {
    MAX_MATCHES_PER_LINE,
    countMatches,
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
