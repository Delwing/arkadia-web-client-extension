import type { CloseCause } from "../MudClient";
import { shouldReattachAfterClose } from "../proxySession";

/**
 * Where the stock UI stands with the game, and what its login screen should show.
 * Read with getState(), followed with subscribe().
 */
export interface ConnectionControllerState {
    connected: boolean;
    /** A socket is being opened and has not said client.connect yet. */
    connecting: boolean;
    /** The player asked to leave and the socket has not closed yet. */
    disconnecting: boolean;
    /** The login screen was dismissed (or a resumed session made it pointless). */
    authClosed: boolean;
    /** A recording is loaded or playing: there is no game to log in to. */
    playback: boolean;
    /** Set by leaving an account until the connection it closes is gone. */
    accountLeaving: boolean;
    /** What the game said about the last login; shown only while offline. */
    loginNotice: string | null;
}

/** Credentials for one sign-in attempt. Neither value is stored anywhere. */
export interface Credentials {
    character: string;
    password: string;
}

type ControllerEvent =
    | "client.connect"
    | "client.disconnect"
    | "close"
    | "proxy.session"
    | "socket.incoming"
    | "telnet.echo"
    | "gmcp.client.connect"
    | "gmcp_msg.system.login"
    | "gmcp_msg.room.long"
    | "recording.loaded"
    | "playback.start"
    | "playback.stop";

/**
 * What the controller needs from the outside world. Injected so the whole
 * connection lifecycle runs in a unit test without a socket or a DOM.
 */
export interface ConnectionControllerPorts {
    /** Open the game socket. */
    connect(): void;
    /** Close it. */
    disconnect(): void;
    isSocketOpen(): boolean;
    /** Ask the server to prove the socket is still alive. */
    checkConnection(): void;
    sendGmcp(path: string, payload: unknown): void;
    usesSessionProxy(): boolean;
    lastCloseCause(): CloseCause;
    /** Warm the audio context — must happen inside the user gesture that connects. */
    prepareSounds(): Promise<void>;
    /** Send one line to the game. Used only for the login handshake. */
    send(text: string, echo: boolean, options?: { preserveCase?: boolean }): void;
    /** Print a line of client text into the output. */
    println(text: string): void;
    isResumeNoticeEnabled(): boolean;
    /** Subscribe to a client event; returns an unsubscribe function. */
    on(event: ControllerEvent, handler: (payload?: any) => void): () => void;
    /** Only Safari gets core.keepalive toggled when the tab hides (see visibility handling). */
    isSafari: boolean;
    /** The page whose visibility drives keepalive and reconnect checks. */
    document?: Pick<Document, "hidden" | "addEventListener" | "removeEventListener">;
}

/*
Reattach after the browser's socket dies behind a session proxy.

Losing that socket is not losing the game: the proxy still holds the telnet connection
and the character is still standing where it was. A phone freezing a backgrounded tab
produces exactly this, several times a session, so it has to heal itself rather than
hand the player a disconnect notice and a Połącz button.

The first attempt is immediate — a hidden tab still runs JavaScript, so the socket is
often back before the player looks. A frozen one runs nothing, but the close event is
delivered on resume and the attempt happens then instead. Later attempts back off, for
the case the proxy itself is unreachable, and after the last one we say so plainly.
*/
export const PROXY_RESUME_DELAYS_MS = [0, 2_000, 5_000, 15_000, 30_000];

/** How long a requested disconnect waits for the close event before assuming it. */
const DISCONNECT_FALLBACK_MS = 1000;

export const formatDuration = (ms: number): string => {
    const seconds = Math.max(0, Math.round(ms / 1000));
    if (seconds < 60) return `${seconds} s`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
};

/**
 * The stock UI's connection lifecycle, headless: connect and disconnect, the
 * autologin handshake, reattaching through the session proxy, checks when the
 * tab comes back, and the e-mail account's requests waiting for the game.
 *
 * The login screen and buttons render from getState(); side effects that belong
 * to other features (wake lock, the account session) hang off onConnected,
 * onSessionLost and onLeftGame.
 */
export class ConnectionController {
    private readonly ports: ConnectionControllerPorts;
    private readonly doc: NonNullable<ConnectionControllerPorts["document"]> | null;
    private state: ConnectionControllerState = {
        connected: false,
        connecting: false,
        disconnecting: false,
        authClosed: false,
        playback: false,
        accountLeaving: false,
        loginNotice: null,
    };
    private readonly listeners = new Set<(state: ConnectionControllerState) => void>();
    private readonly connectedListeners = new Set<() => void>();
    private readonly sessionLostListeners = new Set<() => void>();
    private readonly leftGameListeners = new Set<() => void>();
    private readonly teardown: (() => void)[] = [];

    /** One-shot handshake subscriptions for the sign-in in flight. */
    private pendingLogin: (() => void)[] = [];
    /** An account request waiting for the game to say client.connect. */
    private pendingAccountRequest: (() => void) | null = null;

    private proxyResumeAttempt = 0;
    private proxyResumeTimer: ReturnType<typeof setTimeout> | null = null;
    // Set when the proxy reports the game ended the session. Reattaching then is not a
    // resume — it is a fresh login the player did not ask for, on top of the explanation
    // they came back to read.
    private proxySessionEnded = false;

    // Disconnect diagnostics, for the console only. Behind the session proxy a dropped
    // socket costs the player nothing, so close codes and background timings would only
    // read as alarming noise in the output.
    private lastCloseEvent: CloseEvent | null = null;
    private hiddenSince: number | null = null;
    private lastReturnFromBackground: { at: number; backgroundMs: number } | null = null;

    constructor(ports: ConnectionControllerPorts) {
        this.ports = ports;
        this.doc = ports.document ?? (typeof document !== "undefined" ? document : null);
    }

    /** Wire up the client events. Returns a teardown for the whole controller. */
    start(): () => void {
        const on = this.ports.on;
        this.teardown.push(
            on("gmcp_msg.system.login", (args) => {
                const text = typeof args?.text === "string" ? args.text.trim() : "";
                if (text) this.set({ loginNotice: text });
            }),
            on("gmcp_msg.room.long", () => {
                if (this.state.loginNotice !== null) this.set({ loginNotice: null });
            }),
            on("gmcp.client.connect", () => {
                const run = this.pendingAccountRequest;
                this.pendingAccountRequest = null;
                run?.();
            }),
            on("client.connect", () => this.handleConnect()),
            on("close", (event) => { this.lastCloseEvent = event ?? null; }),
            on("client.disconnect", () => this.handleDisconnect()),
            on("proxy.session", (info) => this.handleProxySession(info)),
            on("recording.loaded", () => this.set({ playback: true })),
            on("playback.start", () => this.set({ playback: true })),
            on("playback.stop", () => this.set({ playback: false })),
        );
        if (this.doc) {
            const doc = this.doc;
            const onVisibility = () => this.handleVisibilityChange();
            doc.addEventListener("visibilitychange", onVisibility);
            this.teardown.push(() => doc.removeEventListener("visibilitychange", onVisibility));
        }
        return () => this.stop();
    }

    stop(): void {
        this.clearPendingLogin();
        this.cancelProxyResume();
        while (this.teardown.length) this.teardown.pop()!();
        this.listeners.clear();
        this.connectedListeners.clear();
        this.sessionLostListeners.clear();
        this.leftGameListeners.clear();
    }

    getState(): ConnectionControllerState {
        return this.state;
    }

    subscribe(listener: (state: ConnectionControllerState) => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    /** The game connection came up. */
    onConnected(listener: () => void): () => void {
        this.connectedListeners.add(listener);
        return () => { this.connectedListeners.delete(listener); };
    }

    /** The connection is gone for good: not resuming, or resuming gave up. */
    onSessionLost(listener: () => void): () => void {
        this.sessionLostListeners.add(listener);
        return () => { this.sessionLostListeners.delete(listener); };
    }

    /** The character left the game: whatever an account screen held is stale. */
    onLeftGame(listener: () => void): () => void {
        this.leftGameListeners.add(listener);
        return () => { this.leftGameListeners.delete(listener); };
    }

    /**
     * Open the socket without credentials. A second connect while one is in flight
     * opens a second socket with the same session id, and the proxy kills one of them
     * as "replaced by a newer attach" — so a double tap must not race itself.
     */
    connect(): void {
        if (this.state.connected || this.state.connecting) return;
        this.begin();
    }

    /** Connect, or disconnect when already connected (the menu's Połącz/Rozłącz). */
    toggle(): void {
        if (this.state.connected) {
            this.requestDisconnect();
        } else {
            this.connect();
        }
    }

    /**
     * Connect and answer the game's login prompts. Arkadia does not take credentials
     * up front: the first bytes from the server mean the name prompt is up, and the
     * server suppressing echo means it is asking for the password.
     *
     * Re-submitting while a connection is in flight re-arms the handshake but does
     * not open a second socket.
     */
    signIn({ character, password }: Credentials): void {
        this.clearPendingLogin();
        if (character) {
            this.pendingLogin.push(this.onceWhen("socket.incoming", () => true, () =>
                this.ports.send(character, false)));
        }
        if (password) {
            // telnet.echo fires with false as well (echo restored); only the
            // suppression means "password prompt".
            this.pendingLogin.push(this.onceWhen("telnet.echo", (serverEchoing) => serverEchoing === true, () =>
                this.ports.send(password, false, { preserveCase: true })));
        }
        if (!this.state.connected && !this.state.connecting) {
            this.begin();
        }
    }

    /**
     * Close the connection on the player's word. The close event does not always
     * come, so once the socket is shut a second later the state follows without it,
     * the same as the event would have done.
     */
    requestDisconnect(): void {
        if (this.state.disconnecting) return;
        this.set({ disconnecting: true });
        this.ports.disconnect();
        setTimeout(() => {
            if (this.state.disconnecting && !this.ports.isSocketOpen()) {
                this.pendingAccountRequest = null;
                this.set({ connected: false, disconnecting: false, accountLeaving: false });
                this.emit(this.leftGameListeners);
            }
        }, DISCONNECT_FALLBACK_MS);
    }

    /** Dismiss the login screen without connecting. */
    closeAuth(): void {
        this.set({ authClosed: true });
    }

    clearLoginNotice(): void {
        if (this.state.loginNotice !== null) this.set({ loginNotice: null });
    }

    /**
     * An account e-mail login was refused: say why on the login screen and drop the
     * connection it opened.
     */
    accountLoginFailed(message: string): void {
        this.pendingAccountRequest = null;
        this.set({ loginNotice: message });
        this.ports.disconnect();
    }

    /**
     * Run an account request once the game listens. The game takes requests once it
     * has said client.connect, as it does for the original client; an open socket
     * alone is not yet listening. Connects first when offline.
     */
    whenGameReady(run: () => void): void {
        if (this.state.connected && !this.pendingAccountRequest) {
            run();
            return;
        }
        this.pendingAccountRequest = run;
        if (this.state.connected || this.state.connecting) return;
        this.begin();
    }

    /** Leave the account: close the connection it rides on. */
    leaveAccount(): void {
        this.pendingAccountRequest = null;
        if (this.state.connected) {
            this.set({ accountLeaving: true });
            this.requestDisconnect();
        } else if (this.state.connecting) {
            this.ports.disconnect();
        }
    }

    /** Why the last connection ended, for the console. */
    describeDisconnect(now = Date.now()): string {
        const details: string[] = [];
        const cause = this.ports.lastCloseCause();
        if (cause === "user") {
            details.push("rozłączenie na żądanie");
        } else if (cause === "watchdog") {
            details.push("brak odpowiedzi serwera na sprawdzenie połączenia");
        } else {
            details.push("połączenie zamknięte po stronie serwera lub sieci");
        }

        if (this.lastCloseEvent) {
            details.push(`kod ${this.lastCloseEvent.code}${this.lastCloseEvent.wasClean ? "" : ", zerwane"}`);
            if (this.lastCloseEvent.reason) details.push(this.lastCloseEvent.reason);
        }

        if (this.hiddenSince !== null) {
            details.push(`karta w tle od ${formatDuration(now - this.hiddenSince)}`);
        } else if (this.lastReturnFromBackground && now - this.lastReturnFromBackground.at < 120_000) {
            details.push(
                `powrót z tła ${formatDuration(now - this.lastReturnFromBackground.at)} temu, po ${formatDuration(this.lastReturnFromBackground.backgroundMs)} w tle`,
            );
        }

        return details.join("; ");
    }

    private begin(): void {
        this.set({ connecting: true, loginNotice: null });
        void this.ports.prepareSounds();
        this.ports.connect();
    }

    private handleConnect(): void {
        this.cancelProxyResume();
        this.set({ connected: true, connecting: false, disconnecting: false });
        this.emit(this.connectedListeners);
    }

    private handleDisconnect(): void {
        const willResume = shouldReattachAfterClose({
            usesSessionProxy: this.ports.usesSessionProxy(),
            closedByUser: this.ports.lastCloseCause() === "user",
            sessionEndedByGame: this.proxySessionEnded,
        });
        // A drop mid-handshake must not leave a password send armed.
        this.clearPendingLogin();
        this.pendingAccountRequest = null;
        this.set({
            connected: false,
            connecting: false,
            disconnecting: false,
            accountLeaving: false,
            // Reopening the login overlay would be wrong while a reattach is in flight:
            // the character is still in the world, so there is nothing to log in to, and
            // it would flash over the output for as long as the reconnect takes.
            ...(willResume ? {} : { authClosed: false }),
        });
        this.emit(this.leftGameListeners);
        console.log(`Client disconnected from Arkadia server: ${this.describeDisconnect()}`);

        if (willResume) {
            this.scheduleProxyResume();
            return;
        }

        this.cancelProxyResume();
        this.emit(this.sessionLostListeners);
        this.ports.println("Rozłączono z serwerem Arkadii.");
    }

    // What the session proxy reports on attach. A resume is worth saying out loud: the
    // player pressed nothing and their character is still where they left it, which is
    // otherwise indistinguishable from a fresh login that happened to work.
    private handleProxySession(info: any): void {
        if (info?.upstreamClosed) {
            // The game itself ended this session while nobody was listening. The replay
            // that arrived just before this carries its parting words — "zostajesz
            // rozlaczony z powodu bezczynnosci" and the like — which is the entire reason
            // an ended session is kept around instead of dropped. Reattaching would open a
            // fresh connection and bury that under a login banner.
            this.proxySessionEnded = true;
            return;
        }
        if (!info?.resumed) return;
        // A resumed session is already logged in, so nothing armed by the login form
        // may fire: the name would be typed into the world as a command, and the
        // password handler would wait for a prompt that never comes.
        this.clearPendingLogin();
        // Already in the world: the login screen has nothing left to ask for.
        this.set({ authClosed: true });
        const away = typeof info.sessionAgeMs === "number"
            ? ` (sesja trwa ${Math.round(info.sessionAgeMs / 1000)} s)`
            : "";
        if (this.ports.isResumeNoticeEnabled()) {
            this.ports.println(`Wznowiono polaczenie z gra${away}.`);
        }
        // Not covered by the setting. Losing output is not routine, and a gap the player
        // cannot account for is worse than a line they asked not to see.
        if (info.droppedBytes) {
            this.ports.println(`Czesc tekstu z czasu nieobecnosci przepadla (${info.droppedBytes} bajtow).`);
        }
    }

    private handleVisibilityChange(): void {
        const doc = this.doc!;
        // `core.keepalive` toggling is only useful on Safari (where the original user
        // reported background-tab disconnects). On Chromium/Firefox it causes the
        // opposite problem: telling the server to stop sending data lets the idle TCP
        // connection get killed by browser/server/proxy timeouts.
        if (doc.hidden) {
            this.hiddenSince = Date.now();
            // Deliberately no connection check on the way out. Mobile suspends a
            // backgrounded tab within moments of this event, so a check armed here can
            // only ever expire unattended and report a silence nobody was listening for.
            if (this.state.connected && this.ports.isSafari) {
                this.ports.sendGmcp("core.keepalive", { disabled: true });
            }
            return;
        }

        if (this.hiddenSince !== null) {
            this.lastReturnFromBackground = { at: Date.now(), backgroundMs: Date.now() - this.hiddenSince };
            this.hiddenSince = null;
        }

        // Coming back is when the answer matters: the socket may well have died while we
        // were away, and the buttons have to reflect that.
        if (this.state.connected) {
            this.ports.checkConnection();
        }

        const socketOpen = this.ports.isSocketOpen();
        if (socketOpen && !this.state.connected) {
            this.set({ connected: true });
        } else if (!socketOpen && this.state.connected) {
            // Belt and braces: a socket that closed without delivering its close event.
            // The ordinary path is client.disconnect, which fires on resume for a tab that
            // was frozen, and reattaches there.
            this.set({ connected: false, connecting: false, disconnecting: false });
            if (this.ports.usesSessionProxy()) {
                this.scheduleProxyResume();
            }
        } else if (socketOpen && this.state.connected && this.ports.isSafari) {
            this.ports.sendGmcp("core.keepalive", { disabled: false });
        }
    }

    private cancelProxyResume(): void {
        if (this.proxyResumeTimer !== null) {
            clearTimeout(this.proxyResumeTimer);
            this.proxyResumeTimer = null;
        }
        this.proxyResumeAttempt = 0;
        // Consumed: it only ever suppresses the one reattach that would have followed the
        // session the game ended. A later connection starts with a clean slate.
        this.proxySessionEnded = false;
    }

    private scheduleProxyResume(): void {
        if (this.proxyResumeTimer !== null) return;
        if (this.proxyResumeAttempt >= PROXY_RESUME_DELAYS_MS.length) {
            this.proxyResumeAttempt = 0;
            this.set({ authClosed: false });
            this.emit(this.sessionLostListeners);
            this.ports.println("Nie udało się wznowić połączenia. Kliknij Połącz, aby spróbować ponownie.");
            return;
        }
        const delay = PROXY_RESUME_DELAYS_MS[this.proxyResumeAttempt];
        this.proxyResumeAttempt += 1;
        this.proxyResumeTimer = setTimeout(() => {
            this.proxyResumeTimer = null;
            if (this.state.connected || this.state.connecting) return;
            this.ports.connect();
        }, delay);
    }

    /** Subscribe until `when` holds once, then run and unsubscribe. */
    private onceWhen(event: ControllerEvent, when: (payload: any) => boolean, run: () => void): () => void {
        let done = false;
        let off: (() => void) | null = this.ports.on(event, (payload) => {
            if (done || !when(payload)) return;
            done = true;
            off?.();
            off = null;
            run();
        });
        return () => {
            done = true;
            off?.();
            off = null;
        };
    }

    private clearPendingLogin(): void {
        while (this.pendingLogin.length) this.pendingLogin.pop()!();
    }

    private emit(listeners: Set<() => void>): void {
        for (const listener of [...listeners]) listener();
    }

    private set(patch: Partial<ConnectionControllerState>): void {
        this.state = { ...this.state, ...patch };
        for (const listener of [...this.listeners]) listener(this.state);
    }
}
