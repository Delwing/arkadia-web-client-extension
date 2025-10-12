import type {
    TransportAdapter,
    TransportConnectOptions,
    TransportIn,
    TransportObservable,
    TransportOut,
    TransportSubscription,
} from "@client/src/runtime/transport/types";

const WEBSOCKET_URL = "wss://arkadia.rpg.pl/wss";
const GMCP_COMMAND_CODE = 201;
const MCCP_COMMAND_CODE = 86;

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - pako is provided globally by the client bootstrap
declare const pako: any;

class Subject<T> implements TransportObservable<T> {
    private listeners = new Set<(value: T) => void>();

    subscribe(listener: (value: T) => void): TransportSubscription {
        this.listeners.add(listener);
        return {
            unsubscribe: () => {
                this.listeners.delete(listener);
            },
        };
    }

    next(value: T) {
        for (const listener of this.listeners) {
            listener(value);
        }
    }
}

export default class WebSocketTransportAdapter implements TransportAdapter {
    private socket: WebSocket | null = null;
    private readonly subject = new Subject<TransportIn>();
    readonly messages$: TransportObservable<TransportIn> = this.subject;
    private mccp = false;
    private readInflator: any = new pako.Inflate();
    private pingTimer: number | null = null;
    private url: string;

    constructor(url: string = WEBSOCKET_URL) {
        this.url = url;
    }

    connect(_options?: TransportConnectOptions): void {
        this.disconnect();
        this.mccp = false;
        this.resetInflator();

        try {
            this.socket = new WebSocket(this.url, []);
            this.socket.onopen = (event: Event) => {
                this.subject.next({ type: "open", event });
                this.startPing();
            };
            this.socket.onerror = (event: Event) => {
                this.subject.next({ type: "error", event });
            };
            this.socket.onclose = (event: CloseEvent) => {
                this.stopPing();
                this.subject.next({ type: "close", event });
                this.resetInflator();
                this.socket = null;
            };
            this.socket.onmessage = (event: MessageEvent<string>) => {
                try {
                    const decoded = this.handleIncoming(event.data);
                    this.subject.next({ type: "data", payload: decoded });
                } catch (error) {
                    const synthetic = new Event("error");
                    (synthetic as any).detail = error;
                    this.subject.next({ type: "error", event: synthetic });
                }
            };
        } catch (error) {
            const synthetic = new Event("error");
            (synthetic as any).detail = error;
            this.subject.next({ type: "error", event: synthetic });
        }
    }

    disconnect(): void {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.close();
        }
        this.stopPing();
    }

    send(message: TransportOut): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }

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
            this.subject.next({ type: "error", event: synthetic });
        }
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
            this.readInflator.push(byteArray, 2);
            if (this.readInflator.err) {
                console.error("MCCP decompression error:", this.readInflator.msg);
                return decodedData;
            }
            const decompressed = new Uint16Array(this.readInflator.result);
            let result = "";
            for (let i = 0; i < decompressed.length; i++) {
                result += String.fromCharCode(decompressed[i]);
            }
            this.readInflator.chunks = [];
            this.readInflator.ended = false;
            return result;
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

    private startPing() {
        this.stopPing();
        this.send({ kind: "gmcp", path: "core.ping" });
        this.pingTimer = window.setInterval(() => {
            this.send({ kind: "gmcp", path: "core.ping" });
        }, 30000);
    }

    private stopPing() {
        if (this.pingTimer !== null) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    private resetInflator() {
        this.readInflator = new pako.Inflate();
    }
}
