import WebSocketTransportAdapter from "@client/src/transport/websocket-adapter.ts";
import {TransportSubject} from "@client/src/transport/subject.ts";
import type {TransportIn, TransportOut} from "@client/src/transport/types";

function createOpenEvent(): Event {
    if (typeof Event !== "undefined") {
        return new Event("open");
    }
    return {type: "open"} as Event;
}

function createCloseEvent(): CloseEvent {
    if (typeof CloseEvent !== "undefined") {
        return new CloseEvent("close");
    }
    return {type: "close"} as CloseEvent;
}

export default class SandboxTransportAdapter extends WebSocketTransportAdapter {
    private readonly sandboxSubject: TransportSubject<TransportIn>;
    private connected = false;

    constructor() {
        super();
        this.sandboxSubject = this.messages$ as unknown as TransportSubject<TransportIn>;
    }

    override connect(): void {
        this.connected = true;
        this.sandboxSubject.next({type: "open", event: createOpenEvent()});
    }

    override disconnect(): void {
        if (!this.connected) {
            return;
        }
        this.connected = false;
        this.sandboxSubject.next({type: "close", event: createCloseEvent()});
    }

    override isConnected(): boolean {
        return this.connected;
    }

    override send(message: string): void {
        this.emitCommand({kind: "text", payload: message});
    }

    override sendGmcp(path: string, payload?: unknown): void {
        this.emitCommand({kind: "gmcp", path, payload});
    }

    private emitCommand(message: TransportOut): void {
        this.sandboxSubject.next({type: "command", payload: message});
    }
}
