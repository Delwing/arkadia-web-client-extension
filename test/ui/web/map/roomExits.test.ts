import { describe, expect, it } from "vitest";
import { combineExits, mapSpecialExits, splitGameExits } from "@web-ui/map/roomExits.ts";

describe("roomExits", () => {
    it("splits the game's exits into directions and special exits", () => {
        const { standard, special } = splitGameExits({ exits: ["polnoc", "gora", "wyjscie", 3] });
        expect([...standard]).toEqual(["n", "u"]);
        expect(special).toEqual(["wyjscie"]);
    });

    it("leaves out map special exits that are not commands", () => {
        expect(mapSpecialExits({ specialExits: { "wejdz na gore": 1, "script:foo()": 2, "123": 3, " brama ": 4 } }))
            .toEqual(["wejdz na gore", "brama"]);
        expect(mapSpecialExits(null)).toEqual([]);
    });

    it("lists as custom only the map exits the game does not show", () => {
        const exits = combineExits(
            { exits: ["polnoc", "Brama"] },
            { specialExits: { brama: 1, "wejdz na gore": 2, n: 3, zanurkuj: 4 } },
        );
        expect(exits.special).toEqual(["Brama"]);
        expect(exits.mapSpecial).toEqual(["brama", "wejdz na gore", "n", "zanurkuj"]);
        expect(exits.custom).toEqual(["wejdz na gore", "zanurkuj"]);
    });

    it("works without a map room or game info", () => {
        expect(combineExits(undefined, { specialExits: { wyskocz: 1 } }).custom).toEqual(["wyskocz"]);
        expect(combineExits({ exits: ["wschod"] }, null).custom).toEqual([]);
    });
});
