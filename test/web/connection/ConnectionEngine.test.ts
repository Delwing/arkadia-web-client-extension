import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConnectionEngine, type ConnectionPorts } from "@web/connection/ConnectionEngine";

/** A fake client: records sends, and lets a test fire events by hand. */
function makePorts(overrides: Partial<ConnectionPorts> = {}) {
    const handlers = new Map<string, Set<(payload?: any) => void>>();
    const sent: { text: string; echo: boolean; options?: any }[] = [];
    const ports: ConnectionPorts = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        isSocketOpen: () => false,
        prepareSounds: vi.fn().mockResolvedValue(undefined),
        send: (text, echo, options) => { sent.push({ text, echo, options }); },
        on: (event, handler) => {
            if (!handlers.has(event)) handlers.set(event, new Set());
            handlers.get(event)!.add(handler);
            return () => handlers.get(event)!.delete(handler);
        },
        ...overrides,
    };
    const emit = (event: string, payload?: any) => {
        for (const h of [...(handlers.get(event) ?? [])]) h(payload);
    };
    const listenerCount = (event: string) => handlers.get(event)?.size ?? 0;
    return { ports, sent, emit, listenerCount };
}

describe("ConnectionEngine", () => {
    let fixture: ReturnType<typeof makePorts>;
    let engine: ConnectionEngine;

    beforeEach(() => {
        fixture = makePorts();
        engine = new ConnectionEngine(fixture.ports);
        engine.start();
    });

    it("starts offline and reports online once the socket opens", () => {
        expect(engine.getState().phase).toBe("offline");
        engine.connect();
        expect(engine.getState().phase).toBe("connecting");
        expect(fixture.ports.connect).toHaveBeenCalled();
        fixture.emit("client.connect");
        expect(engine.getState().phase).toBe("online");
    });

    it("starts online when the socket is already open", () => {
        const open = makePorts({ isSocketOpen: () => true });
        expect(new ConnectionEngine(open.ports).getState().phase).toBe("online");
    });

    it("connect() sends nothing — the game's own prompt takes over", () => {
        engine.connect();
        fixture.emit("socket.incoming");
        fixture.emit("telnet.echo", true);
        expect(fixture.sent).toEqual([]);
    });

    it("sends the character on first server output, then the password when echo is suppressed", () => {
        engine.signIn({ character: "Delwing", password: "sekret" });
        // Both steps are armed before the socket is opened.
        expect(fixture.ports.connect).toHaveBeenCalled();

        fixture.emit("socket.incoming");
        expect(fixture.sent).toEqual([{ text: "Delwing", echo: false, options: undefined }]);

        fixture.emit("telnet.echo", true);
        expect(fixture.sent[1]).toEqual({
            text: "sekret", echo: false, options: { preserveCase: true },
        });
    });

    it("ignores echo events until the server actually suppresses echo", () => {
        engine.signIn({ character: "Delwing", password: "sekret" });
        fixture.emit("telnet.echo", false);
        expect(fixture.sent.find((s) => s.text === "sekret")).toBeUndefined();
        fixture.emit("telnet.echo", true);
        expect(fixture.sent.find((s) => s.text === "sekret")).toBeDefined();
    });

    it("sends the character only once, however much output arrives", () => {
        engine.signIn({ character: "Delwing", password: "" });
        fixture.emit("socket.incoming");
        fixture.emit("socket.incoming");
        fixture.emit("socket.incoming");
        expect(fixture.sent.filter((s) => s.text === "Delwing")).toHaveLength(1);
    });

    it("drops a pending password send when the attempt fails", () => {
        engine.signIn({ character: "Delwing", password: "sekret" });
        fixture.emit("socket.incoming");
        fixture.emit("client.disconnect");
        // Reconnecting by hand must not replay the old password.
        engine.connect();
        fixture.emit("telnet.echo", true);
        expect(fixture.sent.filter((s) => s.text === "sekret")).toHaveLength(0);
    });

    it("leaves no handshake listeners behind after a failed attempt", () => {
        engine.signIn({ character: "Delwing", password: "sekret" });
        expect(fixture.listenerCount("socket.incoming")).toBe(1);
        fixture.emit("client.disconnect");
        expect(fixture.listenerCount("socket.incoming")).toBe(0);
        expect(fixture.listenerCount("telnet.echo")).toBe(0);
    });

    it("re-arms cleanly when a second attempt follows a first", () => {
        engine.signIn({ character: "Pierwszy", password: "a" });
        fixture.emit("client.disconnect");
        engine.signIn({ character: "Drugi", password: "b" });
        fixture.emit("socket.incoming");
        expect(fixture.sent.map((s) => s.text)).toEqual(["Drugi"]);
    });

    it("surfaces the server's login notice while offline and clears it in the world", () => {
        fixture.emit("gmcp_msg.system.login", { text: "  Bledne haslo.  " });
        expect(engine.getState().notice).toBe("Bledne haslo.");
        fixture.emit("gmcp_msg.room.long");
        expect(engine.getState().notice).toBeNull();
    });

    it("clears a stale notice when a new attempt starts", () => {
        fixture.emit("gmcp_msg.system.login", { text: "Bledne haslo." });
        engine.connect();
        expect(engine.getState().notice).toBeNull();
    });

    it("notifies subscribers on every phase change", () => {
        const seen: string[] = [];
        engine.subscribe((s) => seen.push(s.phase));
        engine.connect();
        fixture.emit("client.connect");
        fixture.emit("client.disconnect");
        expect(seen).toEqual(["connecting", "online", "offline"]);
    });

    it("does nothing when asked to connect while already connecting", () => {
        engine.connect();
        engine.connect();
        expect(fixture.ports.connect).toHaveBeenCalledTimes(1);
    });

    it("does not sign in again while already online", () => {
        fixture.emit("client.connect");
        engine.signIn({ character: "Delwing", password: "sekret" });
        expect(fixture.ports.connect).not.toHaveBeenCalled();
    });
});
