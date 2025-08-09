import ProtocolHandler from './ProtocolHandler';
import Recorder from './Recorder';

const WEBSOCKET_URL = 'wss://arkadia.rpg.pl/wss';
const GMCP_COMMAND_CODE = 201;

export default class ConnectionManager {
    private socket!: WebSocket;
    private mccp = false;
    // @ts-ignore
    private readInflator = new pako.Inflate();
    private userCommand: string | null = null;
    private passwordCommand: string | null = null;
    private lastConnectManual = true;
    private pingTimer: number | null = null;

    constructor(
        private protocol: ProtocolHandler,
        private recorder: Recorder,
        private emit: (event: string, ...args: any[]) => void,
    ) {}

    connect(manual = true) {
        try {
            this.lastConnectManual = manual;
            this.socket = new WebSocket(WEBSOCKET_URL, []);
            this.socket.onmessage = (event: MessageEvent<string>) => {
                try {
                    const decodedData = this.inflate(atob(event.data));
                    this.recorder.handleIncoming(decodedData);
                    this.protocol.processIncomingData(decodedData);
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
                this.stopPing();
                // @ts-ignore
                this.readInflator = new pako.Inflate();
            };
            this.socket.onopen = (event: Event) => {
                this.emit('open', event);
                this.emit('client.connect');
                this.mccp = false;
                this.startPing();
                if (!this.lastConnectManual && this.userCommand && this.passwordCommand) {
                    this.send(this.userCommand, false);
                    if (this.passwordCommand !== this.userCommand) {
                        this.send(this.passwordCommand, false);
                    }
                }
            };
        } catch (error) {
            this.emit('error', error);
        }
    }

    disconnect() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.close();
        }
        this.mccp = false;
        this.stopPing();
    }

    isSocketOpen(): boolean {
        return !!this.socket && this.socket.readyState === WebSocket.OPEN;
    }

    setStoredPassword(password: string | null) {
        this.passwordCommand = password;
    }

    setStoredCharacter(character: string | null) {
        this.userCommand = character;
    }

    sendRaw(message: string) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.error('WebSocket is not connected');
            return;
        }
        try {
            this.socket.send(message);
        } catch (error) {
            console.error('Error sending message:', error);
            this.emit('error', error);
        }
    }

    send(message: string, echo: boolean = true) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.error('WebSocket is not connected');
            return;
        }
        if (!this.protocol.hasReceivedFirstGmcp()) {
            if (!this.userCommand) {
                this.userCommand = message;
            }
            this.passwordCommand = message;
        }
        try {
            this.recorder.handleOutgoing(message);
            this.socket.send(btoa(message + "\r\n"));
            if (echo && this.protocol.hasReceivedFirstGmcp() && message) {
                this.emit('message', "→ " + message, 'command');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            this.emit('error', error);
        }
    }

    sendGmcp(path: string, payload: any = {}) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }
        try {
            const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
            const gmcpMessage = `\xFF\xFA${String.fromCharCode(GMCP_COMMAND_CODE)}${path} ${data}\xFF\xF0`;
            this.socket.send(btoa(gmcpMessage));
        } catch (error) {
            console.error('Error sending GMCP message:', error);
            this.emit('error', error);
        }
    }

    private startPing() {
        this.stopPing();
        this.sendGmcp('core.ping');
        this.pingTimer = window.setInterval(() => this.sendGmcp('core.ping'), 30000);
    }

    private stopPing() {
        if (this.pingTimer !== null) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    enableMccp() {
        this.mccp = true;
    }

    private inflate(decodedData: string) {
        if (this.mccp) {
            try {
                const byteArray = decodedData.split("").map(function (char) {
                    return char.charCodeAt(0);
                });
                this.readInflator.push(byteArray, 2);
                if (this.readInflator.err) {
                    console.error("MCCP decompression error: " + this.readInflator.msg);
                    return decodedData;
                }
                const decompressed = new Uint16Array(this.readInflator.result);
                const length = decompressed.length;
                decodedData = "";
                for (let i = 0; i < length; i++) {
                    decodedData += String.fromCharCode(decompressed[i]);
                }
            } catch (error) {
                console.log("MCCP decompression error: " + error.message);
            }
        }
        return decodedData;
    }
}
