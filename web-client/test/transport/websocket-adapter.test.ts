import WebSocketTransportAdapter from "../../src/transport/websocket-adapter";
import type {TransportIn} from "@client/src/runtime/transport/types";

const globalAny = globalThis as any;

class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 3;
    static instances: MockWebSocket[] = [];

    onopen: ((event: Event) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent<string>) => void) | null = null;
    readyState = MockWebSocket.CONNECTING;
    sent: string[] = [];
    closed = false;

    constructor(public url: string) {
        MockWebSocket.instances.push(this);
    }

    send(data: string) {
        this.sent.push(data);
    }

    close() {
        this.closed = true;
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.({ type: "close" } as CloseEvent);
    }

    triggerOpen() {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.(new Event("open"));
    }

    triggerClose() {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.({ type: "close" } as CloseEvent);
    }

    triggerError(error?: any) {
        const event = new Event("error");
        (event as any).detail = error;
        this.onerror?.(event);
    }

    triggerMessage(payload: string) {
        const data = btoa(payload);
        this.onmessage?.({ data } as MessageEvent<string>);
    }
}

describe("WebSocketTransportAdapter", () => {
    const originalWebSocket = globalAny.WebSocket;

    beforeEach(() => {
        jest.useFakeTimers();
        MockWebSocket.instances = [];
        globalAny.WebSocket = MockWebSocket as unknown as typeof WebSocket;
        globalAny.pako = {
            Inflate: jest.fn(() => ({
                err: 0,
                msg: "",
                result: new Uint16Array(),
                chunks: [],
                ended: false,
                push: jest.fn(),
            })),
        };
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        globalAny.WebSocket = originalWebSocket;
        delete globalAny.pako;
    });

    const collectEvents = (adapter: WebSocketTransportAdapter) => {
        const events: TransportIn[] = [];
        const subscription = adapter.messages$.subscribe((event) => events.push(event));
        return { events, subscription };
    };

    it("emits lifecycle events and sends pings", () => {
        const adapter = new WebSocketTransportAdapter("ws://example");
        const { events, subscription } = collectEvents(adapter);

        adapter.connect();
        const socket = MockWebSocket.instances[0];
        expect(socket).toBeDefined();

        socket.triggerOpen();
        expect(events[0]?.type).toBe("open");
        expect(socket.sent).toHaveLength(1);
        expect(atob(socket.sent[0])).toContain("core.ping");

        jest.advanceTimersByTime(30000);
        expect(socket.sent).toHaveLength(2);

        socket.triggerClose();
        expect(events.some((event) => event.type === "close")).toBe(true);

        jest.advanceTimersByTime(30000);
        expect(socket.sent).toHaveLength(2);

        subscription.unsubscribe();
    });

    it("decodes text frames", () => {
        const adapter = new WebSocketTransportAdapter("ws://example");
        const frames: string[] = [];
        const subscription = adapter.messages$.subscribe((event) => {
            if (event.type === "data") {
                frames.push(event.payload);
            }
        });

        adapter.connect();
        const socket = MockWebSocket.instances[0];
        socket.triggerOpen();
        socket.triggerMessage("hello world");

        expect(frames).toContain("hello world");
        subscription.unsubscribe();
    });

    it("inflates MCCP payloads after negotiation", () => {
        const inflateResult = new Uint16Array(Array.from("decoded").map((char) => char.charCodeAt(0)));
        const inflateMock = {
            err: 0,
            msg: "",
            result: inflateResult,
            chunks: [] as unknown[],
            ended: false,
            push: jest.fn(),
        };
        globalAny.pako = { Inflate: jest.fn(() => inflateMock) };

        const adapter = new WebSocketTransportAdapter("ws://example");
        const frames: string[] = [];
        const subscription = adapter.messages$.subscribe((event) => {
            if (event.type === "data") {
                frames.push(event.payload);
            }
        });

        adapter.connect();
        const socket = MockWebSocket.instances[0];
        socket.triggerOpen();
        socket.triggerMessage(`\xFF\xFA${String.fromCharCode(86)}foo\xFF\xF0`);
        socket.triggerMessage("ignored");

        expect(inflateMock.push).toHaveBeenCalled();
        expect(frames.pop()).toBe("decoded");
        subscription.unsubscribe();
    });

    it("closes the socket on disconnect", () => {
        const adapter = new WebSocketTransportAdapter("ws://example");
        adapter.connect();
        const socket = MockWebSocket.instances[0];
        socket.triggerOpen();

        adapter.disconnect();
        expect(socket.closed).toBe(true);
    });

    it("emits error events", () => {
        const adapter = new WebSocketTransportAdapter("ws://example");
        const { events, subscription } = collectEvents(adapter);

        adapter.connect();
        const socket = MockWebSocket.instances[0];
        const error = new Error("boom");
        socket.triggerError(error);

        expect(events.some((event) => event.type === "error")).toBe(true);
        subscription.unsubscribe();
    });
});
