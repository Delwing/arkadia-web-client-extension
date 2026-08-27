import {ClientAdapter} from "@client/Client";
import {
    buildSessionProxyUrl,
    DEFAULT_SESSION_PROXY_URL,
    FORCE_SESSION_PROXY,
    isSessionProxyUrl,
    resetProxySessionId,
} from "./proxySession";
import eventBus from "@modules/core/eventBus";
import type {ClientEvents} from "@shared/events";
import {getRenderSettings, onRenderSettingsChange} from "@modules/core/settings";
import {HELPER_TELNET_URL} from "@modules/helper/helperProtocol";
import {CommandOptions, normalizeCommand} from "@client/scripts/commandPreserveCaseMode";
import PingTracker from "./PingTracker";
import {
    base64Codec,
    createGmcpStream,
    createTelnetOptionParser,
    EchoHandler,
    encodeGmcp,
    GMCP_DO,
    GMCP_WILL,
    MccpHandler,
    selectCodec,
    stripTelnetSequences,
    TELNET_GA,
    TELNET_EOR,
    type TransportCodec,
    type DecodedFrame,
} from "@shared/socket";
import {AnsiAwareBuffer} from "@client/ansi/FormatState";

type Params<T> = [T] extends [void]
    ? []
    : [T] extends [any[]]
        ? T
        : [T];
type EventListener<K extends keyof ClientEvents> = (...args: Params<ClientEvents[K]>) => void;

// WebSocket configuration
const WEBSOCKET_URL = import.meta.env.VITE_WEBSOCKET_URL ?? 'wss://arkadia.rpg.pl/wss';
// Query the proxy worker reads to know which telnet host/port to bridge to.
const PROXY_QUERY = '?host=arkadia.rpg.pl&port=23';
// Opt-in telnet->WebSocket proxy (Arkadia's raw telnet port). Selected via the
// "proxy" checkbox on the connection screen; off by default. Exported so the
// "host your own proxy" wizard can reuse it as the CORS relay for its API calls.
export const PROXY_WEBSOCKET_URL = `wss://arkadia-proxy.delwing.workers.dev${PROXY_QUERY}`;
const MCCP_STORAGE_KEY = 'mccpEnabled';
// Legacy boolean flag (proxy on/off), kept only to migrate to PROXY_MODE_STORAGE_KEY.
const PROXY_STORAGE_KEY = 'proxyEnabled';
// How to reach the game:
//   - 'direct': native Arkadia /wss endpoint (base64 text frames)
//   - 'helper': local helper app's telnet bridge (binary frames)
//   - 'proxy':  a remote telnet->WebSocket proxy, default or user-defined (binary)
const PROXY_MODE_STORAGE_KEY = 'proxyMode';
// A user-deployed proxy URL (from the "host your own" wizard) used in 'proxy'
// mode in place of the default. Stored as a plain wss:// origin.
const USER_PROXY_URL_STORAGE_KEY = 'userProxyUrl';

export type ProxyMode = 'direct' | 'helper' | 'proxy';

class MudClient implements ClientAdapter {
    private socket!: WebSocket;
    private pingTracker: PingTracker;
    private messageBuffer: { text: string, type: string }[] = []
    private readonly gmcpStream: (data: string) => void;
    private readonly telnetOptionHandler: (optionData: string) => string;
    private readonly mccpHandler: MccpHandler;
    private readonly echoHandler: EchoHandler;
    private autoLowercaseCommands: boolean = false;
    private commandEcho: boolean = true;
    private connectionCheckTimeout: number | null = null;
    private gmcpInitialized: boolean = false;
    // Streaming UTF-8 decoder for the raw telnet text stream; holds a trailing
    // partial multi-byte char across WebSocket frames.
    private textDecoder = new TextDecoder('utf-8', {fatal: false});
    // Start of a subnegotiation that arrived without its closing IAC SE, held
    // until the next frame completes it.
    private pendingSubneg = "";
    // Text after the last '\n' of a frame, held back until the next frame
    // continues the line, a prompt (IAC GA/EOR) arrives, or the idle timer
    // fires — prevents spurious line breaks when a line is split across frames.
    private pendingLineTail = "";
    private pendingTailTimer: number | null = null;
    // Latches true once the server sends IAC GA/EOR; from then on we trust those
    // prompt markers and bypass partial-line buffering (mirrors Mudlet).
    private gaDriver = false;
    // Per gmcp_msgs type, the trailing partial line (text after the last '\n')
    // held back until a later message of that type supplies the rest. A complete
    // line of game text ends with '\n'; a payload without one is a line split
    // across frames/messages. Flushed at a prompt boundary, the idle timer, or
    // socket close. Keyed by type so independent streams (room.long, comm, ...)
    // never bleed into each other.
    private pendingMsgTails = new Map<string, string>();
    // How to reach the game (direct / helper / proxy); see PROXY_MODE_STORAGE_KEY.
    private proxyMode: ProxyMode = 'direct';
    // User-deployed proxy URL; overrides PROXY_WEBSOCKET_URL in 'proxy' mode.
    private userProxyUrl: string | null = null;
    // Wire-format strategy, chosen at connect time: binary frames for the
    // proxy/helper, base64 for the native /wss endpoint. Defaults to base64.
    private codec: TransportCodec = base64Codec;

    constructor() {
        this.pingTracker = new PingTracker(() => this.sendGmcp('core.ping'));
        this.gmcpStream = createGmcpStream({
            onEnvelope: ({path, value}) => {
                this.emit(`gmcp.${path}`, value);
                this.emit('gmcp', {path, value});
            },
            onMessage: (text, type) => {
                this.messageBuffer.push({text, type});
            },
        });
        this.telnetOptionHandler = createTelnetOptionParser(this.gmcpStream);
        this.mccpHandler = new MccpHandler((data) => this.sendRaw(data));
        this.mccpHandler.enabled = localStorage.getItem(MCCP_STORAGE_KEY) !== 'false';
        this.proxyMode = MudClient.loadProxyMode();
        this.userProxyUrl = FORCE_SESSION_PROXY
            ? DEFAULT_SESSION_PROXY_URL
            : localStorage.getItem(USER_PROXY_URL_STORAGE_KEY);
        this.echoHandler = new EchoHandler(
            (data) => this.sendRaw(data),
            (serverEchoing) => this.emit('telnet.echo', serverEchoing),
        );
        addEventListener("beforeunload", (event) => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                event.preventDefault();
            }
        })

        // Listen for render settings changes
        const initialRender = getRenderSettings();
        this.autoLowercaseCommands = initialRender.autoLowercaseCommands;
        this.commandEcho = initialRender.commandEcho;
        onRenderSettingsChange((render) => {
            this.autoLowercaseCommands = render.autoLowercaseCommands;
            this.commandEcho = render.commandEcho;
        });

        eventBus.on('playback.incomingData', (data: string, options?: { timestamp?: number }) => {
            this.processIncomingData(data, options);
        });
    }


    /**
     * Register an event listener
     */
    on<K extends keyof ClientEvents>(event: K, listener: EventListener<K>): void {
        eventBus.on(event, listener);
    }

    /**
     * Remove an event listener
     */
    off<K extends keyof ClientEvents>(event: K, listener: EventListener<K>): void {
        eventBus.off(event, listener);
    }

    /**
     * Emit an event to all registered listeners
     */
    emit<K extends keyof ClientEvents>(event: K, ...args: Params<ClientEvents[K]>): void {
        eventBus.emit(event, ...args);
    }

    setMccpEnabled(enabled: boolean): void {
        this.mccpHandler.enabled = enabled;
        localStorage.setItem(MCCP_STORAGE_KEY, String(enabled));
    }

    /**
     * Decide whether compression may be used for the connection about to open.
     *
     * MCCP is a single zlib stream negotiated once and running for the life of the TCP
     * connection. A client that attaches to a session already in progress has none of
     * that decoder state, so it starts inflating from the middle of the stream and
     * renders binary noise — which is exactly what a resumed session looked like before
     * this existed.
     *
     * Sessions on the proxy are built for clients to come and go, so compression is
     * declined there outright. Declining is enough: with the handler disabled we never
     * answer IAC WILL COMPRESS2, so the game never starts compressing and every later
     * reattach reads a plain stream. The saved bandwidth is not worth a session that
     * cannot be resumed.
     */
    private applyMccpForConnection(): void {
        const preferred = localStorage.getItem(MCCP_STORAGE_KEY) !== 'false';
        this.mccpHandler.enabled = preferred && !this.usesSessionProxy();
    }

    isMccpEnabled(): boolean {
        return this.mccpHandler.enabled;
    }

    /**
     * Resolve the persisted proxy mode, migrating the legacy `proxyEnabled`
     * boolean on first run (true -> 'proxy', false/absent -> 'direct').
     */
    private static loadProxyMode(): ProxyMode {
        // BRANCH ONLY, and deliberately ahead of the stored value: a tester who opened
        // this origin on an earlier build has 'direct' persisted, and would otherwise
        // never see the proxy this branch exists to test. See FORCE_SESSION_PROXY.
        if (FORCE_SESSION_PROXY) {
            return 'proxy';
        }
        const stored = localStorage.getItem(PROXY_MODE_STORAGE_KEY);
        if (stored === 'direct' || stored === 'helper' || stored === 'proxy') {
            return stored;
        }
        const migrated: ProxyMode = localStorage.getItem(PROXY_STORAGE_KEY) === 'true' ? 'proxy' : 'direct';
        localStorage.setItem(PROXY_MODE_STORAGE_KEY, migrated);
        return migrated;
    }

    setProxyMode(mode: ProxyMode): void {
        this.proxyMode = mode;
        localStorage.setItem(PROXY_MODE_STORAGE_KEY, mode);
    }

    getProxyMode(): ProxyMode {
        return this.proxyMode;
    }

    /** Set (or clear, with null) a user-deployed proxy URL that overrides the default. */
    setUserProxyUrl(url: string | null): void {
        const trimmed = url?.trim() || null;
        this.userProxyUrl = trimmed;
        if (trimmed) {
            localStorage.setItem(USER_PROXY_URL_STORAGE_KEY, trimmed);
        } else {
            localStorage.removeItem(USER_PROXY_URL_STORAGE_KEY);
        }
    }

    getUserProxyUrl(): string | null {
        return this.userProxyUrl;
    }

    /**
     * The WebSocket URL to dial for the current proxy mode. The helper and a
     * bare user proxy origin both need the host/port query appended; the default
     * proxy URL already carries it, and the native endpoint takes none.
     */
    private resolveConnectUrl(): string {
        if (this.proxyMode === 'helper') {
            return HELPER_TELNET_URL + PROXY_QUERY;
        }
        if (this.proxyMode === 'proxy') {
            if (this.userProxyUrl) {
                // The resumable proxy takes a session id instead of a host/port: it
                // knows where the game is, and the id is what lets a returning client
                // reclaim a connection the browser lost.
                if (isSessionProxyUrl(this.userProxyUrl)) {
                    return buildSessionProxyUrl(this.userProxyUrl);
                }
                return this.userProxyUrl.includes('?') ? this.userProxyUrl : this.userProxyUrl + PROXY_QUERY;
            }
            return PROXY_WEBSOCKET_URL;
        }
        return WEBSOCKET_URL;
    }

    /**
     * Whether the current connection can survive the browser's socket dying.
     *
     * The UI needs this to decide whether a drop is worth reconnecting through
     * automatically: with a session proxy that costs the player nothing, and without one
     * it would silently drop them at a login prompt.
     */
    usesSessionProxy(): boolean {
        return this.proxyMode === 'proxy' && isSessionProxyUrl(this.userProxyUrl);
    }

    /**
     * Connect to the WebSocket server
     */
    connect(): void {
        // Detach handlers from any previous socket so its pending async
        // callbacks (onmessage, onclose) can't corrupt the new connection's
        // protocol state.  Reset before creating the new socket.
        if (this.socket) {
            this.socket.onmessage = null;
            this.socket.onclose = null;
            this.socket.onerror = null;
            this.socket.onopen = null;
        }
        this.applyMccpForConnection();
        this.mccpHandler.reset();
        this.echoHandler.reset();
        this.gmcpInitialized = false;
        this.textDecoder = new TextDecoder('utf-8', {fatal: false});
        this.pendingSubneg = "";
        this.pendingLineTail = "";
        this.pendingMsgTails.clear();
        this.gaDriver = false;
        // Proxy/helper speak raw binary frames; native /wss speaks base64 text.
        this.codec = selectCodec(this.proxyMode !== 'direct', this.usesSessionProxy());
        this.clearTailTimer();
        try {
            const url = this.resolveConnectUrl();
            this.socket = new WebSocket(url, []);
            // Deliver binary frames (proxy) as ArrayBuffer rather than Blob;
            // harmless for the native endpoint's text frames.
            this.socket.binaryType = 'arraybuffer';

            this.socket.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
                try {
                    // The session proxy's frames carry when the server produced the
                    // bytes; the plain codecs have no such notion and fall back.
                    const frame = this.codec.decodeFrame
                        ? this.codec.decodeFrame(event.data)
                        : {bytes: this.codec.decode(event.data)} as DecodedFrame;

                    if (this.connectionCheckTimeout !== null) {
                        clearTimeout(this.connectionCheckTimeout);
                        this.connectionCheckTimeout = null;
                    }

                    if (frame.control) {
                        // Session metadata, not game output: never goes near the
                        // trigger pipeline.
                        this.emit('proxy.session', frame.control);
                        return;
                    }

                    const decodedData = frame.bytes;
                    if (decodedData.length === 0) return;
                    // Decompress MCCP data before any other processing
                    const data = this.mccpHandler.processData(decodedData);
                    if (data.includes(GMCP_WILL)) {
                        this.sendRaw(GMCP_DO);
                        this.negotiateGmcpSupports();
                    }
                    this.echoHandler.processData(data);
                    this.emit('socket.incoming', data);
                    try {
                        // Replayed output describes things that happened while the tab
                        // was frozen, so pass the server's clock rather than letting
                        // everything downstream assume "now".
                        this.processIncomingData(data, frame.at ? {timestamp: frame.at} : undefined);
                    } catch (processingError) {
                        console.error('Error during trigger processing:', processingError);
                        console.error('Line was recorded but not processed:', data.substring(0, 100));
                    }
                } catch (error) {
                    console.error('Error processing incoming message:', error);
                }
            };

            this.socket.onerror = (error: Event) => {
                this.emit('error', error);
            };

            this.socket.onclose = (event: CloseEvent) => {
                if (this.connectionCheckTimeout !== null) {
                    clearTimeout(this.connectionCheckTimeout);
                    this.connectionCheckTimeout = null;
                }
                this.flushPendingLineTail();
                this.flushMessageBuffer(true);
                this.emit('close', event);
                this.emit('client.disconnect');
                this.pingTracker.stop();
                this.mccpHandler.reset();
                this.echoHandler.reset();
                this.pendingSubneg = "";
                this.pendingLineTail = "";
                this.pendingMsgTails.clear();
                this.clearTailTimer();
            };

            this.socket.onopen = (event: Event) => {
                this.emit('open', event);
                this.emit('client.connect');
                this.pingTracker.start();
            };
        } catch (error) {
            this.emit('error', error);
        }
    }

    /**
     * Disconnect from the WebSocket server
     */
    disconnect(): void {
        // Leaving on purpose ends the session rather than parking it: resuming into a
        // character the player meant to leave would be a surprise, and the proxy would
        // otherwise hold that connection open until its TTL.
        resetProxySessionId();
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.close();
        }
        this.pingTracker.stop();
    }

    /**
     * Check if the WebSocket is currently open
     */
    isSocketOpen(): boolean {
        return !!this.socket && this.socket.readyState === WebSocket.OPEN;
    }

    isPasswordMode(): boolean {
        return this.isSocketOpen() && this.echoHandler.serverEchoing;
    }

    checkConnection(): void {
        if (!this.isSocketOpen() || this.connectionCheckTimeout !== null) return;
        this.sendGmcp('core.ping');
        this.connectionCheckTimeout = window.setTimeout(() => {
            this.connectionCheckTimeout = null;
            if (this.isSocketOpen()) {
                this.socket.close();
            }
        }, 5000);
    }

    send(message: string, _echo?: boolean, options?: CommandOptions): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }

        if (!this.echoHandler.serverEchoing) {
            const normalizeOptions = {
                ...options,
                autoLowercaseCommands: this.autoLowercaseCommands
            };
            message = normalizeCommand(message, normalizeOptions)
            this.emit('socket.outgoing', message);
        }

        try {
            this.socket.send(this.codec.encode(message + "\r\n"));
        } catch (error) {
            console.error('Error sending message:', error);
            this.emit('error', error);
        }
    }

    shouldEchoCommand(): boolean {
        if (!this.isSocketOpen()) return true;
        return !this.echoHandler.serverEchoing && this.commandEcho;
    }

    /**
     * Send raw telnet data (no \r\n suffix, just base64 encode and send).
     * Used for telnet option negotiation responses like MCCP.
     */
    private sendRaw(data: string): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }
        try {
            this.socket.send(this.codec.encode(data));
        } catch (error) {
            console.error('Error sending raw data:', error);
        }
    }

    /**
     * Announce supported GMCP modules to the server (Core.Supports.Add) and turn
     * on base64 encoding for gmcp_msgs (Core.Options.Set). Sent once per
     * connection right after we accept GMCP (IAC DO GMCP).
     *
     * Safe on both transports: native Arkadia (/wss) already has these enabled by
     * default and simply re-accepts them, while the telnet proxy needs the
     * explicit declaration before it streams `gmcp_msgs`. Module names carry the
     * " 1" version suffix per the GMCP/Mudlet convention.
     */
    private negotiateGmcpSupports(): void {
        if (this.gmcpInitialized) {
            return;
        }
        this.gmcpInitialized = true;
        // Char/Core/Room are auto-enabled after IAC DO GMCP; add the rest.
        // Objects drives item/combat panels; Gmcp_msgs streams game text. Then
        // turn on base64 encoding for gmcp_msgs so its text decodes consistently.
        this.sendGmcp('Core.Supports.Add', ['Objects 1', 'Gmcp_msgs 1', 'Mail 1']);
        this.sendGmcp('Core.Options.Set', ['base64_gmcp_msgs']);
    }

    sendGmcp(path: string, payload: any = {}): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }
        try {
            const gmcpMessage = encodeGmcp(path, payload);
            this.socket.send(this.codec.encode(gmcpMessage));
        } catch (error) {
            console.error('Error sending GMCP message:', error);
            this.emit('error', error);
        }
    }

    output(text?: string | AnsiAwareBuffer, type?: string, timestamp?: number) {
        const ts = typeof timestamp === 'number' ? timestamp : Date.now();
        this.emit('message', text, type, ts)
    }

    /**
     * Latin-1 byte-string (from atob) -> UTF-8 string, buffering any trailing
     * partial multi-byte sequence for the next frame.
     */
    private decodeUtf8(byteString: string): string {
        if (byteString.length === 0) return '';
        const bytes = new Uint8Array(byteString.length);
        for (let i = 0; i < byteString.length; i++) {
            bytes[i] = byteString.charCodeAt(i) & 0xff;
        }
        return this.textDecoder.decode(bytes, {stream: true});
    }

    /**
     * Process incoming data: strip telnet options (which feed the GMCP/echo
     * handlers), then route the remaining game text through the same line
     * pipeline as gmcp_msgs (flushLines -> onLine -> AnsiAwareBuffer) so ANSI
     * colors render. Handles subnegotiations, prompts, and lines split across
     * WebSocket frames.
     *
     * Native Arkadia (the /wss endpoint) carries no game text here — it streams
     * via gmcp_msgs — so this is effectively a no-op there. The raw text path
     * matters for the telnet proxy.
     */
    private processIncomingData(rawData: string, _options?: { timestamp?: number }) {
        const data = this.pendingSubneg + rawData;
        this.pendingSubneg = "";

        // Hold back a subnegotiation that arrived without its closing IAC SE so
        // stripTelnetSequences doesn't mangle a half-frame GMCP/MCCP packet.
        const incompleteAt = findIncompleteSubnegStart(data);
        let processable = data;
        if (incompleteAt !== -1) {
            this.pendingSubneg = data.substring(incompleteAt);
            processable = data.substring(0, incompleteAt);
        }

        const hasPrompt = processable.includes(TELNET_GA) || processable.includes(TELNET_EOR);
        const sanitized = stripTelnetSequences(processable, this.telnetOptionHandler).replace(/\r/g, '');
        const decoded = this.decodeUtf8(sanitized);

        if (decoded.length > 0) {
            if (this.gaDriver) {
                // Server reliably marks prompts via IAC GA/EOR — emit verbatim.
                this.pushChunk(decoded);
            } else {
                const combined = this.pendingLineTail + decoded;
                const lastNl = combined.lastIndexOf('\n');
                if (lastNl === -1) {
                    this.pendingLineTail = combined;
                } else {
                    this.pushChunk(combined.substring(0, lastNl + 1));
                    this.pendingLineTail = combined.substring(lastNl + 1);
                }
            }
        }

        if (hasPrompt) {
            // A telnet prompt (IAC GA/EOR) ends the server's burst: complete the
            // raw tail and force every held partial line out, then trust prompt
            // markers from here on.
            this.flushPendingLineTail();
            this.gaDriver = true;
            this.flushMessageBuffer(true);
        } else {
            this.flushMessageBuffer();
        }

        // Arm the idle flush while any partial line — raw or per-type gmcp_msgs —
        // is still waiting for its continuation; cancel it once nothing is held.
        // scheduleTailFlush no-ops if a timer is already pending, so an unrelated
        // frame doesn't keep pushing back a held line's deadline.
        if (this.pendingLineTail.length > 0 || this.hasPendingMsgTails()) {
            this.scheduleTailFlush();
        } else {
            this.clearTailTimer();
        }
    }

    private hasPendingMsgTails(): boolean {
        for (const tail of this.pendingMsgTails.values()) {
            if (tail.length > 0) return true;
        }
        return false;
    }

    /** Queue a chunk of raw game text for the flushLines pipeline. */
    private pushChunk(text: string): void {
        if (text.length === 0) return;
        this.messageBuffer.push({text, type: 'mud'});
    }

    /** Flush a held-back partial line (prompt or frame-split tail) through the
     *  normal line pipeline so triggers and rendering treat it as complete. */
    private flushPendingLineTail(): void {
        this.clearTailTimer();
        if (this.pendingLineTail.length === 0) return;
        const tail = this.pendingLineTail;
        this.pendingLineTail = "";
        this.pushChunk(tail);
    }

    private scheduleTailFlush(): void {
        if (this.pendingTailTimer !== null) return;
        this.pendingTailTimer = window.setTimeout(() => {
            this.pendingTailTimer = null;
            // No continuation arrived in time — render whatever is held as-is.
            this.flushPendingLineTail();
            this.flushMessageBuffer(true);
        }, 300);
    }

    private clearTailTimer(): void {
        if (this.pendingTailTimer !== null) {
            clearTimeout(this.pendingTailTimer);
            this.pendingTailTimer = null;
        }
    }

    /**
     * Group buffered messages by consecutive type and emit complete lines.
     *
     * A complete line of game text ends with '\n'. A gmcp_msgs payload that
     * doesn't is a line split across frames/messages, so its trailing remainder
     * is held per type in pendingMsgTails and joined with the continuation in a
     * later frame. `force` (a prompt boundary, the idle timer, or socket close)
     * emits every held tail immediately instead of waiting for the '\n'.
     *
     * A gmcp_msgs "prompt" has no trailing newline by design and marks the end
     * of a server burst, so its presence also forces a flush.
     */
    flushMessageBuffer(force = false) {
        const promptBoundary = force || this.messageBuffer.some(m => m.type === 'prompt');

        if (this.messageBuffer.length === 0 && !(promptBoundary && this.hasPendingMsgTails())) {
            return;
        }

        // Concatenate consecutive same-type messages — a single frame's run of
        // one type is one line fragment.
        const groups: { text: string; type: string }[] = [];
        let currentType: string | null = null;
        let currentText = "";

        this.messageBuffer.forEach((message) => {
            if (message.type === currentType) {
                currentText += message.text;
            } else {
                if (currentType !== null) {
                    groups.push({ text: currentText, type: currentType });
                }
                currentType = message.type;
                currentText = message.text;
            }
        });
        if (currentType !== null) {
            groups.push({ text: currentText, type: currentType });
        }

        this.messageBuffer = [];

        const out: { text: string; type: string }[] = [];
        for (const group of groups) {
            const held = this.pendingMsgTails.get(group.type) ?? "";
            this.pendingMsgTails.delete(group.type);
            const combined = held + group.text;
            if (combined.length === 0) continue;

            const lastNl = combined.lastIndexOf('\n');
            if (lastNl === -1) {
                // No line terminator yet — hold for the next frame unless a
                // prompt boundary says the burst is over.
                if (promptBoundary) {
                    out.push({ text: combined, type: group.type });
                } else {
                    this.pendingMsgTails.set(group.type, combined);
                }
                continue;
            }

            out.push({ text: combined.substring(0, lastNl + 1), type: group.type });
            const tail = combined.substring(lastNl + 1);
            if (tail.length > 0) {
                if (promptBoundary) {
                    out.push({ text: tail, type: group.type });
                } else {
                    this.pendingMsgTails.set(group.type, tail);
                }
            }
        }

        if (promptBoundary && this.pendingMsgTails.size > 0) {
            // Flush tails for types that didn't appear in this batch.
            for (const [type, tail] of this.pendingMsgTails) {
                if (tail.length > 0) out.push({ text: tail, type });
            }
            this.pendingMsgTails.clear();
        }

        if (out.length > 0) {
            this.emit('flushLines', out);
        }
    }

}

/**
 * Index of the first IAC SB (subnegotiation start) that has no matching IAC SE
 * later in the string, or -1 if every subnegotiation is complete. Used to detect
 * a GMCP/MCCP subnegotiation split across WebSocket frames so it can be held
 * back until the closing IAC SE arrives.
 */
function findIncompleteSubnegStart(data: string): number {
    const IAC = 0xFF;
    const SB = 0xFA;
    const SE = 0xF0;
    let i = 0;
    while (i < data.length - 1) {
        if (data.charCodeAt(i) === IAC && data.charCodeAt(i + 1) === SB) {
            let j = i + 2;
            let found = false;
            while (j < data.length - 1) {
                if (data.charCodeAt(j) === IAC && data.charCodeAt(j + 1) === SE) {
                    found = true;
                    i = j + 2;
                    break;
                }
                j++;
            }
            if (!found) return i;
        } else {
            i++;
        }
    }
    return -1;
}

export default new MudClient();
