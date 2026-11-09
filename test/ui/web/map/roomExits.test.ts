import { describe, expect, it } from "vitest";
import eventBus from "@modules/core/eventBus";
import { combineExits, getRoomExits, mapSpecialExits, refreshRoomExits, splitGameExits } from "@web-ui/map/roomExits.ts";

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

    it("picks up a map edit to the room you stand in, without a move", () => {
        refreshRoomExits({ specialExits: {} });
        expect(getRoomExits().custom).toEqual([]);

        // A passage linked: the mapper edits the room in place and says areas changed.
        refreshRoomExits({ specialExits: { "wejdz do szczeliny": 9 } });
        expect(getRoomExits().custom).toEqual(["wejdz do szczeliny"]);

        // A labyrinth script mutates the same room object and emits mapDataChanged.
        const same: { specialExits: Record<string, number> } = { specialExits: {} };
        refreshRoomExits(same);
        same.specialExits.zanurkuj = 3;
        eventBus.emit("mapDataChanged");
        expect(getRoomExits().custom).toEqual(["zanurkuj"]);
    });
});
