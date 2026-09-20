import { describe, expect, it } from "vitest";
import {
    CHANNELS,
    CHANNEL_META,
    allChannelsOff,
    allChannelsOn,
    anyChannelOff,
    channelForType,
} from "@ui/logViewer/model/channels";

describe("channelForType", () => {
    it("maps the GMCP message types the client stores", () => {
        expect(channelForType("comm")).toBe("comm");
        expect(channelForType("emotes")).toBe("comm");
        expect(channelForType("combat.avatar")).toBe("combat");
        expect(channelForType("combat.team")).toBe("combat");
        expect(channelForType("room.long")).toBe("room");
        expect(channelForType("room.contents.living")).toBe("room");
        expect(channelForType("living.long")).toBe("room");
        expect(channelForType("notification.mail")).toBe("notify");
        expect(channelForType("mail")).toBe("notify");
        expect(channelForType("command")).toBe("command");
        expect(channelForType("system.login")).toBe("system");
        expect(channelForType("prompt")).toBe("system");
    });

    it("keeps System for the client's own housekeeping, and nothing else", () => {
        // `system.login` in particular: the timeline's login marker and the
        // character attribution built on it both read the message type, so a
        // login that stopped reaching System would take both with it.
        expect(channelForType("system")).toBe("system");
        expect(channelForType("system.login")).toBe("system");
        expect(channelForType("prompt")).toBe("system");
        expect(channelForType("other")).not.toBe("system");
        expect(channelForType("mud")).not.toBe("system");
        expect(channelForType(undefined)).not.toBe("system");
    });

    it("files the game's untagged text under Inne, not System", () => {
        // `other` is Arkadia's own catch-all ("Pozostale komunikaty"), and
        // `mud` is what MudClient puts on text arriving outside GMCP framing —
        // the login screen, among others. Both are the game talking.
        expect(channelForType("other")).toBe("other");
        expect(channelForType("mud")).toBe("other");
    });

    it("files the client's own prints under Skrypty", () => {
        // A record with no type at all came through `Client.print` — every
        // script, plugin and `printLine` takes that path, and game text never
        // does. An empty string is the same thing after a round trip.
        expect(channelForType(undefined)).toBe("script");
        expect(channelForType("")).toBe("script");
    });

    it("separates an absent type from an unrecognized one", () => {
        // The distinction is the whole point: one is the client, the other is
        // the game saying something we do not fold yet.
        expect(channelForType(undefined)).toBe("script");
        expect(channelForType("something.new")).toBe("other");
        expect(channelForType("something.new")).not.toBe(channelForType(undefined));
    });

    it("prefers the longest matching prefix", () => {
        // `room.combat` is fighting, not scenery — a plain prefix scan over an
        // unsorted table would file it under room.
        expect(channelForType("room.combat")).toBe("combat");
    });

    it("falls back for an unknown type", () => {
        expect(channelForType("something.new")).toBe("other");
        expect(channelForType("zupelnie.nowy.typ")).toBe("other");
    });
});

describe("channel filters", () => {
    it("starts with everything on", () => {
        const filter = allChannelsOn();
        expect(CHANNELS.every((channel) => filter[channel])).toBe(true);
        expect(anyChannelOff(filter)).toBe(false);
        expect(allChannelsOff(filter)).toBe(false);
    });

    it("detects a partly and a fully muted filter", () => {
        const filter = { ...allChannelsOn(), combat: false };
        expect(anyChannelOff(filter)).toBe(true);
        expect(allChannelsOff(filter)).toBe(false);

        const silent = Object.fromEntries(CHANNELS.map((channel) => [channel, false])) as typeof filter;
        expect(allChannelsOff(silent)).toBe(true);
    });

    it("gives every channel a label, a tag and a colour", () => {
        for (const channel of CHANNELS) {
            expect(CHANNEL_META[channel].label).toBeTruthy();
            expect(CHANNEL_META[channel].tag).toBeTruthy();
            expect(CHANNEL_META[channel].colorToken).toMatch(/^var\(--lv-/);
        }
    });
});
