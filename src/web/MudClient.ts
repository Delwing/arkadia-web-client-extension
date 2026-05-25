import {ClientAdapter} from "@client/Client";
import eventBus from "@modules/core/eventBus";
import type {ClientEvents} from "@shared/events";
import {globalStorage} from "@modules/core/storage";
import {CommandOptions, normalizeCommand} from "@client/scripts/commandPreserveCaseMode";
import PingTracker from "./PingTracker";
import {
    createGmcpStream,
    createTelnetOptionParser,
    EchoHandler,
    encodeGmcp,
    GMCP_DO,
    GMCP_WILL,
    MccpHandler,
    stripTelnetSequences,
    TELNET_GA,
    TELNET_EOR,
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
const PROXY_STORAGE_KEY = 'proxyEnabled';
// A user-deployed proxy URL (from the "host your own" wizard) that overrides the
// default proxy when proxy mode is on. Stored as a plain wss:// origin.
const USER_PROXY_URL_STORAGE_KEY = 'userProxyUrl';

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
    // When true, connect through the proxy instead of WEBSOCKET_URL.
    private proxyEnabled = false;
    // User-deployed proxy URL; overrides PROXY_WEBSOCKET_URL when set.
    private userProxyUrl: string | null = null;

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
        this.proxyEnabled = localStorage.getItem(PROXY_STORAGE_KEY) === 'true';
        this.userProxyUrl = localStorage.getItem(USER_PROXY_URL_STORAGE_KEY) || null;
        this.echoHandler = new EchoHandler(
            (data) => this.sendRaw(data),
            (serverEchoing) => this.emit('telnet.echo', serverEchoing),
        );
        addEventListener("beforeunload", (event) => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                event.preventDefault();
            }
        })

        // Listen for UI settings changes
        const initialUiSettings = globalStorage.get('uiSettings');
        if (initialUiSettings) {
            if (typeof initialUiSettings.autoLowercaseCommands === 'boolean') {
                this.autoLowercaseCommands = initialUiSettings.autoLowercaseCommands;
            }
            if (typeof initialUiSettings.commandEcho === 'boolean') {
                this.commandEcho = initialUiSettings.commandEcho;
            }
        }
        globalStorage.onChange('uiSettings', (settings) => {
            if (typeof settings?.autoLowercaseCommands === 'boolean') {
                this.autoLowercaseCommands = settings.autoLowercaseCommands;
            }
            if (typeof settings?.commandEcho === 'boolean') {
                this.commandEcho = settings.commandEcho;
            }
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

    isMccpEnabled(): boolean {
        return this.mccpHandler.enabled;
    }

    setProxyEnabled(enabled: boolean): void {
        this.proxyEnabled = enabled;
        localStorage.setItem(PROXY_STORAGE_KEY, String(enabled));
    }

    isProxyEnabled(): boolean {
        return this.proxyEnabled;
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
        this.mccpHandler.reset();
        this.echoHandler.reset();
        this.gmcpInitialized = false;
        this.textDecoder = new TextDecoder('utf-8', {fatal: false});
        this.pendingSubneg = "";
        this.pendingLineTail = "";
        this.gaDriver = false;
        this.clearTailTimer();
        try {
            // A user-deployed proxy is a bare wss:// origin — append the host/port
            // query the worker needs (unless the user already included one).
            const customProxy = this.userProxyUrl
                ? (this.userProxyUrl.includes('?') ? this.userProxyUrl : this.userProxyUrl + PROXY_QUERY)
                : null;
            const proxyUrl = customProxy ?? PROXY_WEBSOCKET_URL;
            const url = this.proxyEnabled ? proxyUrl : WEBSOCKET_URL;
            this.socket = new WebSocket(url, []);

            this.socket.onmessage = (event: MessageEvent<string>) => {
                try {
                    if (event.data.length === 0) return;
                    if (this.connectionCheckTimeout !== null) {
                        clearTimeout(this.connectionCheckTimeout);
                        this.connectionCheckTimeout = null;
                    }
                    const decodedData = atob(event.data);
                    // Decompress MCCP data before any other processing
                    const data = this.mccpHandler.processData(decodedData);
                    if (data.includes(GMCP_WILL)) {
                        this.sendRaw(GMCP_DO);
                        this.negotiateGmcpSupports();
                    }
                    this.echoHandler.processData(data);
                    this.emit('socket.incoming', data);
                    try {
                        this.processIncomingData(data);
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
                this.emit('close', event);
                this.emit('client.disconnect');
                this.pingTracker.stop();
                this.mccpHandler.reset();
                this.echoHandler.reset();
                this.pendingSubneg = "";
                this.pendingLineTail = "";
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
            this.socket.send(btoa(message + "\r\n"));
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
            this.socket.send(btoa(data));
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
        this.sendGmcp('Core.Supports.Add', ['Objects 1', 'Gmcp_msgs 1']);
        this.sendGmcp('Core.Options.Set', ['base64_gmcp_msgs']);
    }

    sendGmcp(path: string, payload: any = {}): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }
        try {
            const gmcpMessage = encodeGmcp(path, payload);
            this.socket.send(btoa(gmcpMessage));
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
            this.clearTailTimer();
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
            this.flushPendingLineTail();
            this.gaDriver = true;
        } else if (this.pendingLineTail.length > 0) {
            this.scheduleTailFlush();
        }

        this.flushMessageBuffer();
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
            if (this.pendingLineTail.length === 0) return;
            this.flushPendingLineTail();
            this.flushMessageBuffer();
        }, 300);
    }

    private clearTailTimer(): void {
        if (this.pendingTailTimer !== null) {
            clearTimeout(this.pendingTailTimer);
            this.pendingTailTimer = null;
        }
    }

    flushMessageBuffer() {
        if (this.messageBuffer.length === 0) {
            return;
        }

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
        this.emit('flushLines', groups);
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
