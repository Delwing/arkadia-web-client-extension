import { parseArkadia } from "../src/options/importArkadia";

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

