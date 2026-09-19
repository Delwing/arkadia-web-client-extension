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

    it("prefers the longest matching prefix", () => {
        // `room.combat` is fighting, not scenery — a plain prefix scan over an
        // unsorted table would file it under room.
        expect(channelForType("room.combat")).toBe("combat");
    });

    it("falls back for an unknown or missing type", () => {
        expect(channelForType(undefined)).toBe("system");
        expect(channelForType("something.new")).toBe("system");
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
            expect(CHANNEL_META[channel].colorToken).toMatch(/^var\(--ark-/);
        }
    });
});
