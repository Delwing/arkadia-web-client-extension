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
const MCCP_STORAGE_KEY = 'mccpEnabled';

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
        try {
            this.socket = new WebSocket(WEBSOCKET_URL, []);

            this.socket.onmessage = (event: MessageEvent<string>) => {
                try {
                    if (event.data.length === 0) return;
                    if (this.connectionCheckTimeout !== null) {
                        console.log('[checkConnection] incoming data — clearing pending timeout');
                        clearTimeout(this.connectionCheckTimeout);
                        this.connectionCheckTimeout = null;
                    }
                    const decodedData = atob(event.data);
                    // Decompress MCCP data before any other processing
                    const data = this.mccpHandler.processData(decodedData);
                    if (data.includes(GMCP_WILL)) {
                        this.sendRaw(GMCP_DO);
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
                console.log(`[socket.onclose] code=${event.code} reason="${event.reason}" wasClean=${event.wasClean}`);
                if (this.connectionCheckTimeout !== null) {
                    console.log('[socket.onclose] clearing pending connection check timeout');
                    clearTimeout(this.connectionCheckTimeout);
                    this.connectionCheckTimeout = null;
                }
                this.emit('close', event);
                this.emit('client.disconnect');
                this.pingTracker.stop();
                this.mccpHandler.reset();
                this.echoHandler.reset();
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
        if (!this.isSocketOpen()) {
            console.log('[checkConnection] skipped: socket not open');
            return;
        }
        if (this.connectionCheckTimeout !== null) {
            console.log('[checkConnection] skipped: check already in progress');
            return;
        }
        const startedAt = Date.now();
        console.log('[checkConnection] sending core.ping, arming 5s timeout');
        this.sendGmcp('core.ping');
        this.connectionCheckTimeout = window.setTimeout(() => {
            this.connectionCheckTimeout = null;
            const elapsed = Date.now() - startedAt;
            if (this.isSocketOpen()) {
                console.warn(`[checkConnection] timed out after ${elapsed}ms with no incoming data — closing socket`);
                this.socket.close();
            } else {
                console.log(`[checkConnection] timed out after ${elapsed}ms but socket already closed`);
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
     * Process incoming WebSocket data by removing telnet options
     */
    private processIncomingData(data: string, options?: { timestamp?: number }) {
        const sanitized = stripTelnetSequences(data, this.telnetOptionHandler);
        if (sanitized.length > 0) {
            const timestamp = typeof options?.timestamp === 'number' ? options.timestamp : Date.now();
            this.emit('message', sanitized, undefined, timestamp)
        }
        this.flushMessageBuffer()
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

export default new MudClient();
