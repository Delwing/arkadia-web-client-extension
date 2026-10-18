import { describe, expect, test } from "vitest";
import eventBus from "@modules/core/eventBus";
import "@web/MudClient.ts";
import { attachGmcpListener, gmcp } from "@client/gmcp.ts";

const IAC = "\xff";
const SB = "\xfa";
const SE = "\xf0";
const GMCP = "\xc9";

function gmcpFrame(path: string, value: unknown) {
    return `${IAC}${SB}${GMCP}${path} ${JSON.stringify(value)}${IAC}${SE}`;
}

describe("MudClient GMCP dispatch", () => {
    test("merges the mirror before a gmcp.<path> listener runs", () => {
        attachGmcpListener(eventBus);
        let seen: unknown;
        const off = eventBus.on("gmcp.char.options", () => {
            seen = gmcp.char?.options?.state_modifiers;
        });

        eventBus.emit("playback.incomingData", gmcpFrame("char.options", { state_modifiers: 1 }));
        off();

        expect(seen).toBe(1);
    });
});
