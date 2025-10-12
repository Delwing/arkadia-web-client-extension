import type {
    TransportAdapter,
    TransportConnectOptions,
    TransportIn,
    TransportOut,
} from "./types";
import { TransportSubject } from "./subject";

export interface MockTransportAdapterOptions {
    emitLifecycle?: boolean;
}

function createOpenEvent(): Event {
    return new Event("open");
}

function createCloseEvent(): CloseEvent {
    if (typeof CloseEvent !== "undefined") {
        return new CloseEvent("close");
    }
    return { type: "close" } as CloseEvent;
}

export default class MockTransportAdapter implements TransportAdapter {
    private readonly subject = new TransportSubject<TransportIn>();
    readonly messages$ = this.subject;
    readonly sent: TransportOut[] = [];
    connected = false;
    private readonly emitLifecycle: boolean;

    constructor(options: MockTransportAdapterOptions = {}) {
        this.emitLifecycle = options.emitLifecycle ?? true;
    }

    connect(_options?: TransportConnectOptions): void {
        this.connected = true;
        if (this.emitLifecycle) {
            this.subject.next({ type: "open", event: createOpenEvent() });
        }
    }

    disconnect(): void {
        if (!this.connected) {
            return;
        }
        this.connected = false;
        if (this.emitLifecycle) {
            this.subject.next({ type: "close", event: createCloseEvent() });
        }
    }

    send(message: TransportOut): void {
        this.sent.push(message);
    }

    emit(event: TransportIn) {
        this.subject.next(event);
    }

    emitData(payload: string) {
        this.emit({ type: "data", payload });
    }

    emitError(event: Event = new Event("error")) {
        this.emit({ type: "error", event });
    }

    clear() {
        this.sent.length = 0;
    }
}
