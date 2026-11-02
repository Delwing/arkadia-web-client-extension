import { describe, expect, it } from "vitest";
import { splitExits } from "../../../views/remote/exits";

describe("splitExits", () => {
    it("maps short and Polish directions onto the pad, keeps named exits apart", () => {
        const { directions, named } = splitExits(["n", "poludniowy-wschod", "gora", "wyjscie", "brama"]);
        expect([...directions].sort()).toEqual(["n", "se", "u"]);
        expect(named).toEqual(["wyjscie", "brama"]);
    });

    it("handles a room with no exits", () => {
        const { directions, named } = splitExits([]);
        expect(directions.size).toBe(0);
        expect(named).toEqual([]);
    });
});
