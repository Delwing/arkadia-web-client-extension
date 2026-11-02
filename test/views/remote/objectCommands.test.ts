import { describe, expect, it } from "vitest";
import { attackCommandFor, coverCommandFor } from "../../../views/remote/objectCommands";
import type { RemoteObject } from "@modules/remoteControl/protocol.ts";

const object = (overrides: Partial<RemoteObject>): RemoteObject => ({
    num: 100, desc: "Ork", shortcut: "1", hp: 3, team: false, fighting: false,
    mine: false, attackTarget: false, defenseTarget: false, ...overrides,
});

describe("remote object commands", () => {
    it("attacks with the PC's attack command", () => {
        expect(attackCommandFor(object({}), "zabij")).toBe("zabij ob_100");
        expect(attackCommandFor(object({}), "atakuj")).toBe("atakuj ob_100");
    });

    it("covers a teammate, stands in front of anyone else", () => {
        expect(coverCommandFor(object({ team: true, num: 7 }))).toBe("zaslon ob_7");
        expect(coverCommandFor(object({}))).toBe("zaslon przed ob_100");
    });
});
