/** How the client currently stands with the game server. */
export type ConnectionPhase = "offline" | "connecting" | "online";

export interface ConnectionState {
    phase: ConnectionPhase;
    /**
     * The server's last login-screen message (`gmcp_msg.system.login`) — e.g. a
     * rejected password. Only meaningful while offline: the server sends it as
     * it drops us, so it explains why we are back on the login screen. Cleared
     * once we are actually in the world (`gmcp_msg.room.long`).
     */
    notice: string | null;
}

/** Credentials for one sign-in attempt. Neither value is stored anywhere. */
export interface Credentials {
    character: string;
    password: string;
}

/**
 * Everything the engine needs from the outside world. Injected rather than
 * imported so the login handshake can be unit-tested without a socket, and so a
 * second UI can drive the same engine over its own transport.
 */
export interface ConnectionPorts {
    /** Open the game socket. */
    connect(): void;
    /** Close it. */
    disconnect(): void;
    /** Whether the socket is open right now (for the initial phase). */
    isSocketOpen(): boolean;
    /** Warm the audio context — must happen inside the user gesture that connects. */
    prepareSounds(): Promise<void>;
    /** Send one line to the game. Used only for the autologin handshake. */
    send(text: string, echo: boolean, options?: { preserveCase?: boolean }): void;
    /** Subscribe to a client event; returns an unsubscribe function. */
    on(event: ConnectionEvent, handler: (payload?: any) => void): () => void;
}

type ConnectionEvent =
    | "client.connect"
    | "client.disconnect"
    | "socket.incoming"
    | "telnet.echo"
    | "gmcp_msg.system.login"
    | "gmcp_msg.room.long";

/**
 * Headless connection + autologin logic, shared by any UI that needs a login
 * screen.
 *
 * The autologin handshake is the subtle part and the reason this is a unit
 * rather than a few lines in a component. Arkadia does not accept credentials
 * up front; you have to answer its prompts in order:
 *
 *   1. Arm both steps BEFORE opening the socket, so neither prompt can arrive
 *      while nothing is listening.
 *   2. On the first byte from the server (`socket.incoming`) the login banner
 *      has been printed and the name prompt is up — send the character name.
 *   3. When the server suppresses echo (`telnet.echo` turns true) it is asking
 *      for the password — send it with `preserveCase`, since passwords are
 *      case-sensitive and the client otherwise lowercases commands.
 *
 * Both subscriptions are one-shot and are torn down on disconnect, so a
 * failed attempt can never leak a pending password send into the next session.
 * Neither the character nor the password is persisted — they live in a closure
 * until they are sent, and the browser's own password manager (via the form's
 * autocomplete attributes) is what remembers them across visits, if anything.
 *
 * Mirrors the behaviour of the stock UI's inline implementation in
 * `src/web/main.ts`; that copy can be replaced with this engine.
 */
export class ConnectionEngine {
    private readonly ports: ConnectionPorts;
    private state: ConnectionState = { phase: "offline", notice: null };
    private readonly listeners = new Set<(state: ConnectionState) => void>();
    private readonly teardown: (() => void)[] = [];
    /** One-shot handshake subscriptions for the attempt in flight. */
    private pending: (() => void)[] = [];

    constructor(ports: ConnectionPorts) {
        this.ports = ports;
        this.state = { phase: ports.isSocketOpen() ? "online" : "offline", notice: null };
    }

    /** Wire up the client events. Returns a teardown for the whole engine. */
    start(): () => void {
        this.teardown.push(
            this.ports.on("client.connect", () => {
                this.set({ phase: "online", notice: null });
            }),
            this.ports.on("client.disconnect", () => {
                // A drop mid-handshake must not leave a password send armed.
                this.clearPending();
                this.set({ phase: "offline" });
            }),
            this.ports.on("gmcp_msg.system.login", (args) => {
                const text = typeof args?.text === "string" ? args.text.trim() : "";
                if (text) this.set({ notice: text });
            }),
            this.ports.on("gmcp_msg.room.long", () => {
                // We are in the world; whatever the login screen said is stale.
                if (this.state.notice !== null) this.set({ notice: null });
            }),
        );
        return () => this.stop();
    }

    stop(): void {
        this.clearPending();
        while (this.teardown.length) this.teardown.pop()!();
        this.listeners.clear();
    }

    getState(): ConnectionState {
        return this.state;
    }

    /** Subscribe to state changes; returns an unsubscribe function. */
    subscribe(listener: (state: ConnectionState) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** Open the socket without logging in — the game's own login prompt takes over. */
    connect(): void {
        if (this.state.phase !== "offline") return;
        this.clearPending();
        this.begin();
    }

    /** Connect and answer the login prompts with these credentials. */
    signIn({ character, password }: Credentials): void {
        if (this.state.phase === "online") return;
        this.clearPending();

        if (character) {
            this.pending.push(
                this.once("socket.incoming", () => this.ports.send(character, false)),
            );
        }
        if (password) {
            // `telnet.echo` fires with false as well (echo restored); only the
            // suppression means "password prompt".
            this.pending.push(
                this.onceWhen("telnet.echo", (serverEchoing) => serverEchoing === true, () =>
                    this.ports.send(password, false, { preserveCase: true }),
                ),
            );
        }

        this.begin();
    }

    disconnect(): void {
        this.clearPending();
        this.ports.disconnect();
    }

    private begin(): void {
        this.set({ phase: "connecting", notice: null });
        void this.ports.prepareSounds();
        this.ports.connect();
    }

    /** Subscribe, and unsubscribe as soon as the event fires once. */
    private once(event: ConnectionEvent, run: () => void): () => void {
        return this.onceWhen(event, () => true, run);
    }

    /** As {@link once}, but ignores firings until `when` holds. */
    private onceWhen(
        event: ConnectionEvent,
        when: (payload: any) => boolean,
        run: () => void,
    ): () => void {
        let off: (() => void) | null = null;
        let done = false;
        off = this.ports.on(event, (payload) => {
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

    private clearPending(): void {
        while (this.pending.length) this.pending.pop()!();
    }

    private set(patch: Partial<ConnectionState>): void {
        this.state = { ...this.state, ...patch };
        for (const listener of this.listeners) listener(this.state);
    }
}
