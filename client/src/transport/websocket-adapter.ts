import type {
    TransportAdapter,
    TransportIn,
    TransportOut,
} from "./types";
import {TransportSubject} from "./subject";

const WEBSOCKET_URL = "wss://arkadia.rpg.pl/wss";
const GMCP_COMMAND_CODE = 201;
const MCCP_COMMAND_CODE = 86;

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - pako is provided globally by the client bootstrap
declare const pako: any;

type InflateInstance = {
    err: number;
    msg: string;
    result: Uint16Array | string;
    chunks: unknown[];
    ended: boolean;
    push(data: number[], mode: number): void;
};

function createCloseEvent(): CloseEvent {
    if (typeof CloseEvent !== "undefined") {
        return new CloseEvent("close");
    }
    return {type: "close"} as CloseEvent;
}

function createInflator(): InflateInstance {
    if (typeof pako !== "undefined" && typeof pako.Inflate === "function") {
        return new pako.Inflate();
    }
    const fallback: InflateInstance = {
        err: 0,
        msg: "",
        result: new Uint16Array(),
        chunks: [],
        ended: false,
        push(data: number[]) {
            this.result = new Uint16Array(data);
        },
    };
    return fallback;
}

function toUint16String(data: Uint16Array): string {
    let result = "";
    for (let i = 0; i < data.length; i++) {
        result += String.fromCharCode(data[i]);
    }
    return result;
}

export default class WebSocketTransportAdapter implements TransportAdapter {
    private socket: WebSocket | null = null;
    readonly subject = new TransportSubject<TransportIn>();
    readonly messages$ = this.subject;
    private mccp = false;
    private inflator: InflateInstance = createInflator();
    private readonly url: string;

    constructor(url: string = WEBSOCKET_URL) {
        this.url = url;
    }

    connect(): void {
        this.mccp = false;
        this.resetInflator();

        if (this.socket) {
            this.teardownCurrentSocket();
        }

        this.openSocket();
    }

    disconnect(): void {
        if (!this.socket) {
            return;
        }

        const socket = this.socket;
        if (socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
            this.cleanupSocket(socket);
            this.socket = null;
            this.subject.next({type: "close", event: createCloseEvent()});
            return;
        }

        socket.close();
    }

    isConnected(): boolean {
        return this.socket && this.socket.readyState === WebSocket.OPEN;
    }

    send(message: string): void {
        this.doSend({kind: "text", payload: message});
    }

    sendGmcp(path: string, payload?: unknown): void {
        this.doSend({kind: "gmcp", path, payload});
    }

    private doSend(message: TransportOut): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }

        this.subject.next({type: "command", payload: message})

        try {
            if (message.kind === "text") {
                this.socket.send(btoa(`${message.payload}\r\n`));
            } else if (message.kind === "gmcp") {
                const data = typeof message.payload === "string"
                    ? message.payload
                    : JSON.stringify(message.payload ?? {});
                const gmcpMessage = `\xFF\xFA${String.fromCharCode(GMCP_COMMAND_CODE)}${message.path} ${data}\xFF\xF0`;
                this.socket.send(btoa(gmcpMessage));
            } else if (message.kind === "raw") {
                this.socket.send(message.payload);
            }
        } catch (error) {
            const synthetic = new Event("error");
            (synthetic as any).detail = error;
            this.subject.next({type: "error", event: synthetic});
        }
    }

    private teardownCurrentSocket() {
        const socket = this.socket;
        if (!socket) {
            return;
        }
        this.cleanupSocket(socket);
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            try {
                socket.close();
            } catch {
            }
        }
        this.socket = null;
    }

    private openSocket() {
        try {
            const socket = new WebSocket(this.url, []);
            this.socket = socket;

            const handleOpen = (event: Event) => {
                if (this.socket !== socket) {
                    return;
                }
                this.subject.next({type: "open", event});
            };

            const handleError = (event: Event) => {
                if (this.socket !== socket) {
                    return;
                }
                this.subject.next({type: "error", event});
            };

            const handleClose = (event: CloseEvent) => {
                if (this.socket !== socket) {
                    return;
                }
                this.subject.next({type: "close", event});
                this.cleanupSocket(socket);
                this.socket = null;
                this.mccp = false;
                this.resetInflator();
            };

            const handleMessage = (event: MessageEvent<string>) => {
                if (this.socket !== socket) {
                    return;
                }
                try {
                    const decoded = this.handleIncoming(event.data);
                    this.subject.next({type: "data", payload: decoded});
                } catch (error) {
                    const synthetic = new Event("error");
                    (synthetic as any).detail = error;
                    this.subject.next({type: "error", event: synthetic});
                }
            };

            socket.onopen = handleOpen;
            socket.onerror = handleError;
            socket.onclose = handleClose;
            socket.onmessage = handleMessage;
        } catch (error) {
            const synthetic = new Event("error");
            (synthetic as any).detail = error;
            this.subject.next({type: "error", event: synthetic});
        }
    }

    private cleanupSocket(socket: WebSocket) {
        socket.onopen = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.onmessage = null;
    }

    private handleIncoming(payload: string): string {
        const decodedData = atob(payload);
        const inflated = this.inflate(decodedData);
        this.detectCompressionStart(inflated);
        return inflated;
    }

    private inflate(decodedData: string): string {
        if (!this.mccp) {
            return decodedData;
        }

        try {
            const byteArray = decodedData.split("").map((char) => char.charCodeAt(0));
            this.inflator.push(byteArray, 2);
            if (this.inflator.err) {
                console.error("MCCP decompression error:", this.inflator.msg);
                return decodedData;
            }
            const result = this.inflator.result;
            if (result instanceof Uint16Array) {
                const text = toUint16String(result);
                this.inflator.chunks = [];
                this.inflator.ended = false;
                return text;
            }
            if (Array.isArray(result)) {
                const data = new Uint16Array(result as unknown as number[]);
                const text = toUint16String(data);
                this.inflator.chunks = [];
                this.inflator.ended = false;
                return text;
            }
            if (typeof result === "string") {
                return result;
            }
            return decodedData;
        } catch (error) {
            console.error("MCCP decompression error:", (error as Error).message);
            return decodedData;
        }
    }

    private detectCompressionStart(data: string) {
        if (this.mccp) {
            return;
        }
        const prefix = `\xFF\xFA${String.fromCharCode(MCCP_COMMAND_CODE)}`;
        if (data.includes(prefix)) {
            this.mccp = true;
        }
    }

    private resetInflator() {
        this.inflator = createInflator();
    }
}
