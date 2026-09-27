import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import eventBus from "@modules/core/eventBus";
import {setShellSettings} from "@modules/core/settings";
import MediaSessionStatus, {createSilentWav} from "@web/MediaSessionStatus.ts";

class FakeMetadata {
    constructor(public init: MediaMetadataInit) {}
}

describe("createSilentWav", () => {
    it("builds a valid silent PCM WAV", () => {
        const wav = createSilentWav(1, 8000);
        const text = (from: number, to: number) => String.fromCharCode(...wav.slice(from, to));
        expect(wav.length).toBe(44 + 8000);
        expect(text(0, 4)).toBe("RIFF");
        expect(text(8, 12)).toBe("WAVE");
        expect(text(36, 40)).toBe("data");
        expect(wav.slice(44).every((b) => b === 128)).toBe(true);
    });
});

describe("MediaSessionStatus", () => {
    let handlers: Record<string, (() => void) | null>;
    let session: { metadata: FakeMetadata | null; playbackState: string; setActionHandler: (a: string, h: (() => void) | null) => void };
    let play: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        handlers = {};
        session = {
            metadata: null,
            playbackState: "none",
            setActionHandler: (action, handler) => { handlers[action] = handler; },
        };
        Object.defineProperty(navigator, "mediaSession", {value: session, configurable: true});
        vi.stubGlobal("MediaMetadata", FakeMetadata);
        play = vi.fn().mockResolvedValue(undefined);
        vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
        vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
        vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
        URL.createObjectURL = vi.fn(() => "blob:silent");
        URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
        eventBus.emit("client.disconnect");
        setShellSettings({mediaSession: false});
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("stays idle while the setting is off", () => {
        setShellSettings({mediaSession: false});
        new MediaSessionStatus({support: vi.fn()});
        eventBus.emit("client.connect");
        expect(play).not.toHaveBeenCalled();
        expect(session.metadata).toBeNull();
    });

    it("shows HP and character, and next track sends support", () => {
        setShellSettings({mediaSession: true});
        const support = vi.fn();
        new MediaSessionStatus({support});
        eventBus.emit("client.connect");
        eventBus.emit("gmcp.char.info", {name: "Gerwazy"} as never);
        eventBus.emit("gmcp.char.state", {hp: 4} as never);

        expect(play).toHaveBeenCalled();
        expect(session.metadata?.init.title).toBe("Arkadia [5/7]");
        expect(session.metadata?.init.artist).toBe("Gerwazy");

        handlers.nexttrack?.();
        expect(support).toHaveBeenCalledTimes(1);

        eventBus.emit("client.disconnect");
        expect(session.metadata).toBeNull();
        expect(session.playbackState).toBe("none");
    });
});
