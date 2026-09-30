import {parseArkadia, parseArkadiaPatterns} from "../../src/web/options/importArkadia";

describe("parseArkadia", () => {
    it("parses aliases and reports skipped ones", () => {
        const json = JSON.stringify({
            aliases: {
                a: "cmd",
                b: "do $1",
                c: "say %1 %2",
                d: "test %0",
                e: "test %-1",
                f: "test %%"
            }
        });
        const res = parseArkadia(json);
        expect(res).toEqual({
            imported: [
                { pattern: "^a$", command: "cmd" },
                { pattern: "^b$", command: "do @1" },
                { pattern: "^c\\s+(\\w+)\\s+(\\w+)$", command: "say $1 $2" }
            ],
            skipped: ["d", "e", "f"]
        });
    });
});


describe("parseArkadiaPatterns", () => {
    it("turns text transformations into global pattern triggers", () => {
        const json = JSON.stringify({
            patterns: [
                { Regexp: "wilk", Replacement: "WILK", Color: "#ff0000", Sound: 3 },
                { Regexp: "^Ktos", Color: "#0f0" },
                { Regexp: "brzeczy", Sound: 1 },
                { Regexp: "spam", Replacement: "" },
                { Regexp: "zwierz (\\w+) (\\w+)", Replacement: "potwor $1 $0 [%%]" },
                { Regexp: "slowa", Replacement: "%0/%1/%-1" },
                { Regexp: "reszta", Replacement: "[$$]" },
                { Regexp: "(" , Color: "#fff" },
                { Regexp: "nic" },
            ],
        });
        expect(parseArkadiaPatterns(json)).toEqual({
            imported: [
                {
                    type: "pattern", pattern: "wilk", flags: "g",
                    macros: [
                        { type: "replace", to: "WILK" },
                        { type: "color", color: "#ff0000" },
                        { type: "beep", soundKey: "beep" },
                    ],
                },
                { type: "pattern", pattern: "^Ktos", flags: "g", macros: [{ type: "color", color: "#0f0" }] },
                { type: "pattern", pattern: "brzeczy", flags: "g", macros: [{ type: "beep", soundKey: "beep" }] },
                { type: "pattern", pattern: "spam", flags: "g", macros: [{ type: "replace", to: "" }] },
                {
                    type: "pattern", pattern: "zwierz (\\w+) (\\w+)", flags: "g",
                    macros: [{ type: "replace", to: "potwor $2 $1 [$0]" }],
                },
                { type: "pattern", pattern: "slowa", flags: "g", macros: [{ type: "replace", to: "{word1}/{word2}/{word2+}" }] },
                { type: "pattern", pattern: "reszta", flags: "g", macros: [{ type: "replace", to: "[{line}]" }] },
            ],
            skipped: ["("],
        });
    });

    it("returns nothing for a file without patterns", () => {
        expect(parseArkadiaPatterns("{}")).toEqual({ imported: [], skipped: [] });
        expect(parseArkadiaPatterns("not json")).toEqual({ imported: [], skipped: [] });
    });
});
