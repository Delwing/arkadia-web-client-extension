import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    ConnectionController,
    PROXY_RESUME_DELAYS_MS,
    formatDuration,
    type ConnectionControllerPorts,
} from "@web/connection/connectionController";
import type { CloseCause } from "@web/MudClient";

/** A fake client and page: records what was sent, and lets a test fire events by hand. */
function makeFixture(overrides: Partial<ConnectionControllerPorts> = {}) {
    const handlers = new Map<string, Set<(payload?: any) => void>>();
    const docListeners = new Set<() => void>();
    const sent: { text: string; echo: boolean; options?: any }[] = [];
    const printed: string[] = [];
    const gmcp: { path: string; payload: unknown }[] = [];
    let socketOpen = false;
    let closeCause: CloseCause = "remote";
    let sessionProxy = false;
    const doc = {
        hidden: false,
        addEventListener: (_: string, fn: () => void) => { docListeners.add(fn); },
        removeEventListener: (_: string, fn: () => void) => { docListeners.delete(fn); },
    };
    const ports: ConnectionControllerPorts = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        isSocketOpen: () => socketOpen,
        checkConnection: vi.fn(),
        sendGmcp: (path, payload) => { gmcp.push({ path, payload }); },
        usesSessionProxy: () => sessionProxy,
        lastCloseCause: () => closeCause,
        prepareSounds: vi.fn().mockResolvedValue(undefined),
        send: (text, echo, options) => { sent.push({ text, echo, options }); },
        println: (text) => { printed.push(text); },
        isResumeNoticeEnabled: () => true,
        on: (event, handler) => {
            if (!handlers.has(event)) handlers.set(event, new Set());
            handlers.get(event)!.add(handler);
            return () => { handlers.get(event)!.delete(handler); };
        },
        isSafari: false,
        document: doc as unknown as Document,
        ...overrides,
    };
    const emit = (event: string, payload?: any) => {
        for (const h of [...(handlers.get(event) ?? [])]) h(payload);
    };
    const setVisibility = (hidden: boolean) => {
        doc.hidden = hidden;
        for (const fn of [...docListeners]) fn();
    };
    return {
        ports, sent, printed, gmcp, emit, setVisibility,
        listenerCount: (event: string) => handlers.get(event)?.size ?? 0,
        setSocketOpen: (open: boolean) => { socketOpen = open; },
        setCloseCause: (cause: CloseCause) => { closeCause = cause; },
        setSessionProxy: (on: boolean) => { sessionProxy = on; },
    };
}

describe("ConnectionController", () => {
    let fx: ReturnType<typeof makeFixture>;
    let controller: ConnectionController;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        fx = makeFixture();
        controller = new ConnectionController(fx.ports);
        controller.start();
    });

    afterEach(() => {
        controller.stop();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    const goOnline = () => {
        controller.connect();
        fx.setSocketOpen(true);
        fx.emit("client.connect");
    };

    describe("connecting", () => {
        it("goes connecting, then connected on client.connect", () => {
            controller.connect();
            expect(controller.getState().connecting).toBe(true);
            expect(fx.ports.connect).toHaveBeenCalledTimes(1);
            expect(fx.ports.prepareSounds).toHaveBeenCalledTimes(1);

            fx.emit("client.connect");
            expect(controller.getState()).toMatchObject({ connected: true, connecting: false });
        });

        it("does not open a second socket on a double tap", () => {
            controller.connect();
            controller.connect();
            controller.toggle();
            expect(fx.ports.connect).toHaveBeenCalledTimes(1);
        });

        it("tells onConnected listeners", () => {
            const connected = vi.fn();
            controller.onConnected(connected);
            goOnline();
            expect(connected).toHaveBeenCalledTimes(1);
        });

        it("notifies subscribers on every change", () => {
            const listener = vi.fn();
            controller.subscribe(listener);
            controller.connect();
            expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ connecting: true }));
        });
    });

    describe("sign in handshake", () => {
        it("sends the name on the first bytes and the password when echo goes off", () => {
            controller.signIn({ character: "Gerwazy", password: "Sekret" });
            expect(fx.ports.connect).toHaveBeenCalledTimes(1);

            fx.emit("socket.incoming");
            fx.emit("socket.incoming");
            expect(fx.sent).toEqual([{ text: "Gerwazy", echo: false, options: undefined }]);

            fx.emit("telnet.echo", false);
            expect(fx.sent).toHaveLength(1);
            fx.emit("telnet.echo", true);
            expect(fx.sent[1]).toEqual({ text: "Sekret", echo: false, options: { preserveCase: true } });
            expect(fx.listenerCount("socket.incoming")).toBe(0);
            expect(fx.listenerCount("telnet.echo")).toBe(0);
        });

        it("re-arms on a second submit without opening a second socket", () => {
            controller.signIn({ character: "Pierwszy", password: "" });
            controller.signIn({ character: "Drugi", password: "" });
            expect(fx.ports.connect).toHaveBeenCalledTimes(1);
            fx.emit("socket.incoming");
            expect(fx.sent.map(s => s.text)).toEqual(["Drugi"]);
        });

        it("drops a pending password send on disconnect", () => {
            controller.signIn({ character: "Gerwazy", password: "Sekret" });
            fx.emit("client.disconnect");
            fx.emit("socket.incoming");
            fx.emit("telnet.echo", true);
            expect(fx.sent).toEqual([]);
        });

        it("drops the handshake when the proxy resumes an existing session", () => {
            controller.signIn({ character: "Gerwazy", password: "Sekret" });
            fx.emit("proxy.session", { resumed: true });
            fx.emit("socket.incoming");
            expect(fx.sent).toEqual([]);
            expect(controller.getState().authClosed).toBe(true);
        });
    });

    describe("login notice", () => {
        it("keeps what the game said about the login until the player is in the world", () => {
            fx.emit("gmcp_msg.system.login", { text: "  Bledne haslo.  " });
            expect(controller.getState().loginNotice).toBe("Bledne haslo.");
            fx.emit("gmcp_msg.room.long");
            expect(controller.getState().loginNotice).toBeNull();
        });

        it("clears it when a new attempt starts", () => {
            fx.emit("gmcp_msg.system.login", { text: "Bledne haslo." });
            controller.connect();
            expect(controller.getState().loginNotice).toBeNull();
        });
    });

    describe("disconnecting", () => {
        it("prints a notice and reports the session lost when not resuming", () => {
            const lost = vi.fn();
            const left = vi.fn();
            controller.onSessionLost(lost);
            controller.onLeftGame(left);
            goOnline();
            controller.closeAuth();

            fx.emit("client.disconnect");

            expect(controller.getState()).toMatchObject({ connected: false, authClosed: false });
            expect(lost).toHaveBeenCalledTimes(1);
            expect(left).toHaveBeenCalledTimes(1);
            expect(fx.printed).toContain("Rozłączono z serwerem Arkadii.");
        });

        it("falls back to offline a second after a requested disconnect with no close event", () => {
            goOnline();
            const left = vi.fn();
            controller.onLeftGame(left);

            controller.toggle();
            expect(controller.getState().disconnecting).toBe(true);
            expect(fx.ports.disconnect).toHaveBeenCalledTimes(1);

            fx.setSocketOpen(false);
            vi.advanceTimersByTime(1000);
            expect(controller.getState()).toMatchObject({ connected: false, disconnecting: false });
            expect(left).toHaveBeenCalledTimes(1);
        });

        it("ignores a second disconnect request while one is in flight", () => {
            goOnline();
            controller.requestDisconnect();
            controller.requestDisconnect();
            expect(fx.ports.disconnect).toHaveBeenCalledTimes(1);
        });
    });

    describe("session proxy reattach", () => {
        beforeEach(() => {
            fx.setSessionProxy(true);
            goOnline();
            controller.closeAuth();
        });

        it("reattaches immediately and keeps the login screen closed", () => {
            const lost = vi.fn();
            controller.onSessionLost(lost);
            vi.mocked(fx.ports.connect).mockClear();

            fx.emit("client.disconnect");
            expect(controller.getState().authClosed).toBe(true);
            vi.advanceTimersByTime(0);
            expect(fx.ports.connect).toHaveBeenCalledTimes(1);
            expect(lost).not.toHaveBeenCalled();
            expect(fx.printed).toEqual([]);
        });

        it("backs off, then gives up and says so", () => {
            const lost = vi.fn();
            controller.onSessionLost(lost);
            vi.mocked(fx.ports.connect).mockClear();

            fx.emit("client.disconnect");
            for (const delay of PROXY_RESUME_DELAYS_MS) {
                vi.advanceTimersByTime(delay);
                fx.emit("client.disconnect");
            }

            expect(fx.ports.connect).toHaveBeenCalledTimes(PROXY_RESUME_DELAYS_MS.length);
            expect(lost).toHaveBeenCalledTimes(1);
            expect(controller.getState().authClosed).toBe(false);
            expect(fx.printed.at(-1)).toMatch(/Nie udało się wznowić/);
        });

        it("does not reattach a session the game itself ended", () => {
            fx.emit("proxy.session", { upstreamClosed: true });
            vi.mocked(fx.ports.connect).mockClear();
            fx.emit("client.disconnect");
            vi.runAllTimers();
            expect(fx.ports.connect).not.toHaveBeenCalled();
            expect(fx.printed).toContain("Rozłączono z serwerem Arkadii.");
        });

        it("does not reattach after the player disconnected", () => {
            fx.setCloseCause("user");
            vi.mocked(fx.ports.connect).mockClear();
            fx.emit("client.disconnect");
            vi.runAllTimers();
            expect(fx.ports.connect).not.toHaveBeenCalled();
        });

        it("announces a resumed session and lost output", () => {
            fx.emit("proxy.session", { resumed: true, sessionAgeMs: 4200, droppedBytes: 12 });
            expect(fx.printed).toEqual([
                "Wznowiono polaczenie z gra (sesja trwa 4 s).",
                "Czesc tekstu z czasu nieobecnosci przepadla (12 bajtow).",
            ]);
        });
    });

    describe("account requests", () => {
        it("connects and holds the request until the game says client.connect", () => {
            const run = vi.fn();
            controller.whenGameReady(run);
            expect(fx.ports.connect).toHaveBeenCalledTimes(1);
            fx.emit("client.connect");
            expect(run).not.toHaveBeenCalled();
            fx.emit("gmcp.client.connect");
            expect(run).toHaveBeenCalledTimes(1);
        });

        it("runs at once when the game is already listening", () => {
            goOnline();
            const run = vi.fn();
            controller.whenGameReady(run);
            expect(run).toHaveBeenCalledTimes(1);
        });

        it("a failed login shows the reason and closes the socket", () => {
            controller.whenGameReady(vi.fn());
            controller.accountLoginFailed("Nie ma takiego konta.");
            expect(controller.getState().loginNotice).toBe("Nie ma takiego konta.");
            expect(fx.ports.disconnect).toHaveBeenCalledTimes(1);
        });

        it("leaving marks the account as leaving until the socket is gone", () => {
            goOnline();
            controller.leaveAccount();
            expect(controller.getState()).toMatchObject({ accountLeaving: true, disconnecting: true });
            fx.emit("client.disconnect");
            expect(controller.getState().accountLeaving).toBe(false);
        });
    });

    describe("playback", () => {
        it("follows recordings and playback", () => {
            fx.emit("recording.loaded", { name: "x", length: 1 });
            expect(controller.getState().playback).toBe(true);
            fx.emit("playback.stop");
            expect(controller.getState().playback).toBe(false);
            fx.emit("playback.start");
            expect(controller.getState().playback).toBe(true);
        });
    });

    describe("tab visibility", () => {
        it("checks the connection on return and marks a silently closed socket offline", () => {
            goOnline();
            fx.setVisibility(true);
            fx.setVisibility(false);
            expect(fx.ports.checkConnection).toHaveBeenCalledTimes(1);

            fx.setVisibility(true);
            fx.setSocketOpen(false);
            fx.setVisibility(false);
            expect(controller.getState().connected).toBe(false);
        });

        it("reattaches a silently closed socket behind the session proxy", () => {
            fx.setSessionProxy(true);
            goOnline();
            vi.mocked(fx.ports.connect).mockClear();
            fx.setSocketOpen(false);
            fx.setVisibility(false);
            vi.advanceTimersByTime(0);
            expect(fx.ports.connect).toHaveBeenCalledTimes(1);
        });

        it("toggles core.keepalive only on Safari", () => {
            goOnline();
            fx.setVisibility(true);
            fx.setVisibility(false);
            expect(fx.gmcp).toEqual([]);

            controller.stop();
            fx = makeFixture({ isSafari: true });
            controller = new ConnectionController(fx.ports);
            controller.start();
            goOnline();
            fx.setVisibility(true);
            fx.setVisibility(false);
            expect(fx.gmcp).toEqual([
                { path: "core.keepalive", payload: { disabled: true } },
                { path: "core.keepalive", payload: { disabled: false } },
            ]);
        });

        it("describes time spent in the background", () => {
            goOnline();
            fx.setVisibility(true);
            vi.advanceTimersByTime(65_000);
            expect(controller.describeDisconnect()).toContain("karta w tle od 1 min 5 s");
        });
    });

    it("stop() removes every subscription", () => {
        controller.signIn({ character: "a", password: "b" });
        controller.stop();
        expect(fx.listenerCount("client.connect")).toBe(0);
        expect(fx.listenerCount("socket.incoming")).toBe(0);
        expect(fx.listenerCount("telnet.echo")).toBe(0);
    });
});

describe("formatDuration", () => {
    it("formats seconds and minutes", () => {
        expect(formatDuration(4_400)).toBe("4 s");
        expect(formatDuration(60_000)).toBe("1 min");
        expect(formatDuration(125_000)).toBe("2 min 5 s");
    });
});
