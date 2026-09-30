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
    it("turns text transformations into global multiline triggers, last rule first", () => {
        const json = JSON.stringify({
            patterns: [
                { Regexp: "wilk", Replacement: "WILK", Color: "#ff0000", Sound: 3 },
                { Regexp: "^Ktos", Color: "#0f0" },
                { Regexp: "brzeczy", Sound: 1 },
                { Regexp: "spam", Replacement: "" },
                { Regexp: "zwierz (\\w+) (\\w+)", Replacement: "potwor $1 $0 [%%]" },
                { Regexp: "slowa", Replacement: "%0/%1/%-1" },
                { Regexp: "reszta", Replacement: "[$$]" },
                { Regexp: "mowi: &quot;(.+)&quot; &amp; &lt;&gt;", Color: "#fff" },
                { Regexp: "(" , Color: "#fff" },
                { Regexp: "nic" },
            ],
        });
        expect(parseArkadiaPatterns(json)).toEqual({
            imported: [
                { type: "pattern", pattern: 'mowi: "(.+)" & <>', flags: "gm", macros: [{ type: "color", color: "#fff" }] },
                { type: "pattern", pattern: "reszta", flags: "gm", macros: [{ type: "replace", to: "[{rest}]" }] },
                { type: "pattern", pattern: "slowa", flags: "gm", macros: [{ type: "replace", to: "{word1}/{word2}/{word2+}" }] },
                {
                    type: "pattern", pattern: "zwierz (\\w+) (\\w+)", flags: "gm",
                    macros: [{ type: "replace", to: "potwor $2 $1 [$0]" }],
                },
                { type: "pattern", pattern: "spam", flags: "gm", macros: [{ type: "replace", to: "" }] },
                { type: "pattern", pattern: "brzeczy", flags: "gm", macros: [{ type: "beep", soundKey: "beep" }] },
                { type: "pattern", pattern: "^Ktos", flags: "gm", macros: [{ type: "color", color: "#0f0" }] },
                {
                    type: "pattern", pattern: "wilk", flags: "gm",
                    macros: [
                        { type: "replace", to: "WILK" },
                        { type: "color", color: "#ff0000" },
                        { type: "beep", soundKey: "beep" },
                    ],
                },
            ],
            skipped: ["("],
        });
    });

    it("returns nothing for a file without patterns", () => {
        expect(parseArkadiaPatterns("{}")).toEqual({ imported: [], skipped: [] });
        expect(parseArkadiaPatterns("not json")).toEqual({ imported: [], skipped: [] });
    });
});
