import { describe, expect, it } from "vitest";
import { emptyRemoteState, OutputBacklog, parseHostMessage, parseRemoteMessage, parseStatePatch } from "@modules/remoteControl/protocol.ts";

describe("remote control protocol", () => {
    it("accepts a command from the phone", () => {
        expect(parseRemoteMessage(JSON.stringify({ t: "cmd", text: "zerknij" }))).toEqual({ t: "cmd", text: "zerknij" });
    });

    it("rejects anything else from the phone", () => {
        expect(parseRemoteMessage("not json")).toBeNull();
        expect(parseRemoteMessage(JSON.stringify({ t: "cmd", text: 5 }))).toBeNull();
        expect(parseRemoteMessage(JSON.stringify({ t: "eval", code: "x" }))).toBeNull();
        expect(parseRemoteMessage(new ArrayBuffer(4))).toBeNull();
    });

    it("parses output and hello from the PC, dropping bad backlog entries", () => {
        expect(parseHostMessage(JSON.stringify({ t: "out", html: "<b>x</b>" }))).toEqual({ t: "out", html: "<b>x</b>" });
        expect(parseHostMessage(JSON.stringify({ t: "hello", state: { character: "Dargoth" }, backlog: ["a", 1, "b"] })))
            .toEqual({ t: "hello", state: { ...emptyRemoteState(), character: "Dargoth" }, backlog: ["a", "b"] });
        expect(parseHostMessage(JSON.stringify({ t: "hello", backlog: [] })))
            .toEqual({ t: "hello", state: emptyRemoteState(), backlog: [] });
    });

    it("keeps only the newest output in the backlog", () => {
        const backlog = new OutputBacklog(3);
        ["1", "2", "3", "4", "5"].forEach(item => backlog.push(item));
        expect(backlog.snapshot()).toEqual(["3", "4", "5"]);
    });
});

describe("remote control state", () => {
    it("keeps only well-formed state fields", () => {
        expect(parseStatePatch({
            character: "Dargoth",
            vitals: { hp: 5, fatigue: "x", mana: Infinity, panic: 0 },
            combat: "yes",
            room: { id: 42, name: "", exits: ["n", 3, "wyjscie"] },
            extra: 1,
        })).toEqual({
            character: "Dargoth",
            vitals: { hp: 5, panic: 0 },
            room: { id: 42, name: null, exits: ["n", "wyjscie"] },
        });
        expect(parseStatePatch({ room: null })).toEqual({ room: null });
        expect(parseStatePatch("nope")).toEqual({});
    });

    it("fills a hello's missing state with defaults and passes state patches through", () => {
        const hello = parseHostMessage(JSON.stringify({ t: "hello", state: { combat: true }, backlog: [] }));
        expect(hello).toEqual({ t: "hello", state: { ...emptyRemoteState(), combat: true }, backlog: [] });
        expect(parseHostMessage(JSON.stringify({ t: "state", state: { vitals: { hp: 2 } } })))
            .toEqual({ t: "state", state: { vitals: { hp: 2 } } });
    });
});

describe("remote control objects", () => {
    it("keeps well-formed objects and fills their defaults", () => {
        expect(parseStatePatch({
            objects: [{ num: 5, desc: "Ork", hp: 2, team: false, fighting: true, mine: true }, { num: -1 }, "x", { num: 6 }],
            attackCommand: " atakuj ",
        })).toEqual({
            objects: [
                { num: 5, desc: "Ork", shortcut: null, hp: 2, team: false, fighting: true, mine: true, attackTarget: false, defenseTarget: false },
                { num: 6, desc: "ob_6", shortcut: null, hp: null, team: false, fighting: false, mine: false, attackTarget: false, defenseTarget: false },
            ],
            attackCommand: "atakuj",
        });
    });
});
