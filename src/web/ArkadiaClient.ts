import {ClientAdapter} from "@client/Client";
import eventBus from "@modules/core/eventBus";
import type {ClientEvents} from "@shared/events";
import {globalStorage} from "@modules/core/storage";
import {CommandOptions, normalizeCommand} from "@client/scripts/commandPreserveCaseMode";
import PingTracker from "./PingTracker";
import {
    createGmcpStream,
    createTelnetOptionParser,
    encodeGmcp,
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
const WEBSOCKET_URL = 'wss://arkadia.rpg.pl/wss';
const MCCP_STORAGE_KEY = 'mccpEnabled';

class ArkadiaClient implements ClientAdapter {
    private socket!: WebSocket;
    private receivedFirstGmcp: boolean = false;
    private pingTracker: PingTracker;
    private messageBuffer: { text: string, type: string }[] = []
    private readonly gmcpStream: (data: string) => void;
    private readonly telnetOptionHandler: (optionData: string) => string;
    private readonly mccpHandler: MccpHandler;
    private autoLowercaseCommands: boolean = false;
    private commandEcho: boolean = true;

    constructor() {
        this.pingTracker = new PingTracker(() => this.sendGmcp('core.ping'));
        this.gmcpStream = createGmcpStream({
            onEnvelope: ({path, value}) => {
                if (path === "client.connect") {
                    this.emit('client.server');
                    return;
                }
                if (path === "char.info" && !this.receivedFirstGmcp) {
                    this.receivedFirstGmcp = true;
                }
                this.emit(`gmcp.${path}`, value);
                this.emit('gmcp', {path, value});
            },
            onMessage: (text, type) => {
                this.messageBuffer.push({text, type});
            },
            onFirstCharInfo: () => {
                if (!this.receivedFirstGmcp) {
                    this.receivedFirstGmcp = true;
                }
            },
        });
        this.telnetOptionHandler = createTelnetOptionParser(this.gmcpStream);
        this.mccpHandler = new MccpHandler((data) => this.sendRaw(data));
        this.mccpHandler.enabled = localStorage.getItem(MCCP_STORAGE_KEY) !== 'false';
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
        try {
            // Reset the flag when connecting
            this.receivedFirstGmcp = false;
            this.socket = new WebSocket(WEBSOCKET_URL, []);
            this.socket.onmessage = (event: MessageEvent<string>) => {
                try {
                    if (event.data.length === 0) return;
                    const decodedData = atob(event.data);
                    // Decompress MCCP data before any other processing
                    const data = this.mccpHandler.processData(decodedData);
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
                this.emit('close', event);
                this.emit('client.disconnect');
                this.pingTracker.stop();
                this.mccpHandler.reset();
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

    /**
     * Returns true when history/echo should be active:
     * available before connection, disabled after connect until gmcp.char.info
     */
    hasReceivedFirstGmcp(): boolean {
        return !this.isSocketOpen() || this.receivedFirstGmcp;
    }

    send(message: string, _echo?: boolean, options?: CommandOptions): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }

        if (this.receivedFirstGmcp) {
            // Pass autoLowercaseCommands setting to normalizeCommand
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
        return this.receivedFirstGmcp && this.commandEcho;
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

export default new ArkadiaClient();
