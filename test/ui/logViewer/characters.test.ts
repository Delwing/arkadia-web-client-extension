import { describe, expect, it } from "vitest";
import {
    attributeCharacters,
    charactersLabel,
    findBannerMarks,
    loginBannerToken,
    matchCharacter,
    titleCase,
} from "@ui/logViewer/model/characters";
import type { LogLine } from "@ui/logViewer/model/types";

/** The characters this device would have settings for. */
const KNOWN = ["Dargoth", "Zgredek", "Kethra", "Dorn"];

function line(partial: Partial<LogLine> & { number: number }): LogLine {
    return {
        timestamp: partial.number * 1000,
        channel: "system",
        text: "",
        ...partial,
    };
}

/** A session of `count` lines, with logins at the given indices. */
function session(count: number, logins: number[] = []): LogLine[] {
    return Array.from({ length: count }, (_, index) =>
        line({
            number: index + 1,
            text: `linia ${index + 1}`,
            event: logins.includes(index) ? "login" : undefined,
        }),
    );
}

describe("loginBannerToken", () => {
    it("reads the name the banner greets", () => {
        expect(loginBannerToken("Witaj, Dargocie. Podaj swe haslo:")).toBe("Dargocie");
    });

    it("ignores anything that is not the banner", () => {
        expect(loginBannerToken("Witaj ponownie. Ostatnie logowanie: wczoraj o 21:40.")).toBeNull();
        expect(loginBannerToken("Brannoc mowi: witaj, Dargocie.")).toBeNull();
        expect(loginBannerToken("Rynek w Bandzie")).toBeNull();
    });
});

describe("matchCharacter", () => {
    it("recognises the vocative of every known character", () => {
        // The pairs from the spec: declension changes the ending, not the stem.
        expect(matchCharacter("Dargocie", KNOWN)).toBe("Dargoth");
        expect(matchCharacter("Zgredku", KNOWN)).toBe("Zgredek");
        expect(matchCharacter("Kethro", KNOWN)).toBe("Kethra");
        expect(matchCharacter("Dornie", KNOWN)).toBe("Dorn");
    });

    it("gives up when two candidates share the stem", () => {
        // A wrong name on a log is worse than no name.
        expect(matchCharacter("Dargocie", ["Dargoth", "Dargon"])).toBeNull();
    });

    it("gives up on a character never played on this device", () => {
        expect(matchCharacter("Dargocie", ["Kethra", "Dorn"])).toBeNull();
    });

    it("gives up on an empty candidate list without throwing", () => {
        expect(matchCharacter("Dargocie", [])).toBeNull();
    });

    it("ignores case on both sides and answers in titlecase", () => {
        // GMCP stores `dargoth`; the banner writes `Dargocie`.
        expect(matchCharacter("Dargocie", ["dargoth", "kethra"])).toBe("Dargoth");
        expect(matchCharacter("DARGOCIE", ["dargoth"])).toBe("Dargoth");
    });

    it("reads one character stored under two spellings as one character", () => {
        expect(matchCharacter("Dargocie", ["Dargoth", "dargoth"])).toBe("Dargoth");
    });

    it("needs the shared prefix to be a real part of the name", () => {
        // `Da` is not evidence of anything, and `Dargonissa` shares too little
        // of itself with the token to be the name being greeted.
        expect(matchCharacter("Damie", ["Dargoth"])).toBeNull();
        expect(matchCharacter("Do", ["Dorn"])).toBeNull();
        expect(matchCharacter("Dargocie", ["Dargonissa"])).toBeNull();
    });
});

describe("findBannerMarks", () => {
    it("marks the line the banner is on", () => {
        const lines = session(4);
        lines[2].text = "Witaj, Kethro. Podaj swe haslo:";
        expect(findBannerMarks(lines, KNOWN)).toEqual([{ line: 2, character: "Kethra" }]);
    });

    it("finds nothing in a log without a banner", () => {
        expect(findBannerMarks(session(3), KNOWN)).toEqual([]);
    });

    it("finds nothing when the device knows no characters", () => {
        const lines = session(2);
        lines[0].text = "Witaj, Kethro. Podaj swe haslo:";
        expect(findBannerMarks(lines, [])).toEqual([]);
    });
});

describe("attributeCharacters", () => {
    it("has no characters and no crash for a session with no marks", () => {
        const lines = session(3);
        expect(attributeCharacters(lines, [])).toEqual({ characters: [], byLine: [undefined, undefined, undefined] });
    });

    it("reaches back to the start of the log from the first mark", () => {
        // The lines before the mark are the login that produced it.
        const { characters, byLine } = attributeCharacters(session(4), [{ line: 2, character: "dargoth" }]);
        expect(characters).toEqual(["Dargoth"]);
        expect(byLine).toEqual(["Dargoth", "Dargoth", "Dargoth", "Dargoth"]);
    });

    it("lists two re-logins in the order they happened", () => {
        const lines = session(9);
        const { characters, byLine } = attributeCharacters(lines, [
            { line: 0, character: "Dargoth" },
            { line: 3, character: "Kethra" },
            { line: 6, character: "Dorn" },
        ]);
        expect(characters).toEqual(["Dargoth", "Kethra", "Dorn"]);
        expect(byLine).toEqual([
            "Dargoth",
            "Dargoth",
            "Dargoth",
            "Kethra",
            "Kethra",
            "Kethra",
            "Dorn",
            "Dorn",
            "Dorn",
        ]);
    });

    it("names a character coming back only once", () => {
        const { characters } = attributeCharacters(session(6), [
            { line: 0, character: "Dargoth" },
            { line: 2, character: "Kethra" },
            { line: 4, character: "Dargoth" },
        ]);
        expect(characters).toEqual(["Dargoth", "Kethra"]);
    });

    it("does not read a repeated name as a switch", () => {
        // A death and respawn re-announces the same character.
        const { characters, byLine } = attributeCharacters(session(4), [
            { line: 0, character: "Dargoth" },
            { line: 2, character: "dargoth" },
        ]);
        expect(characters).toEqual(["Dargoth"]);
        expect(new Set(byLine)).toEqual(new Set(["Dargoth"]));
    });

    it("moves a mark back onto the login it belongs to", () => {
        // GMCP names the character a moment after the banner the player sees,
        // so the marker on the timeline would otherwise stay anonymous.
        const lines = session(8, [1, 5]);
        const { byLine } = attributeCharacters(lines, [
            { line: 2, character: "Dargoth" },
            { line: 7, character: "Kethra" },
        ]);
        expect(byLine[5]).toBe("Kethra");
        expect(byLine[4]).toBe("Dargoth");
    });

    it("does not travel back across play into the previous login", () => {
        // Logins at 1 and 22, with play in between; the second mark lands at 24
        // and must not drag Dargoth's own login block along with it.
        const lines = session(26, [1, 2, 22, 23]);
        const { byLine } = attributeCharacters(lines, [
            { line: 3, character: "Dargoth" },
            { line: 24, character: "Kethra" },
        ]);
        expect(byLine[21]).toBe("Dargoth");
        expect(byLine[22]).toBe("Kethra");
    });

    it("leaves a mark where it is when the login is hours behind it", () => {
        const lines = session(6, [1]);
        lines[4].timestamp = lines[3].timestamp + 3_600_000;
        lines[5].timestamp = lines[4].timestamp + 1000;
        const { byLine } = attributeCharacters(lines, [
            { line: 2, character: "Dargoth" },
            { line: 4, character: "Kethra" },
        ]);
        expect(byLine[1]).toBe("Dargoth");
        expect(byLine[4]).toBe("Kethra");
    });

    it("ignores a mark pointing outside the log", () => {
        const { characters } = attributeCharacters(session(2), [
            { line: 9, character: "Dargoth" },
            { line: -1, character: "Kethra" },
        ]);
        expect(characters).toEqual([]);
    });
});

describe("charactersLabel", () => {
    it("falls back to the session's own label when nothing was recognised", () => {
        expect(charactersLabel([], "19 wrzesnia 2025")).toBe("19 wrzesnia 2025");
    });

    it("names every character the session spanned", () => {
        expect(charactersLabel(["Dargoth"], "x")).toBe("Dargoth");
        expect(charactersLabel(["Dargoth", "Kethra"], "x")).toBe("Dargoth, Kethra");
    });
});

describe("titleCase", () => {
    it("normalises the one thing GMCP and storage disagree about", () => {
        expect(titleCase("dargoth")).toBe("Dargoth");
        expect(titleCase("DARGOTH")).toBe("Dargoth");
        expect(titleCase("")).toBe("");
    });
});
