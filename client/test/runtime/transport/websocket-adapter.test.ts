import WebSocketTransportAdapter from "../../../src/runtime/transport/websocket-adapter";
import type { TransportIn } from "../../../src/runtime/transport/types";

type Listener = (event: Event) => void;

const globalAny = globalThis as any;

class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    static instances: MockWebSocket[] = [];

    onopen: Listener | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    onerror: Listener | null = null;
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
        this.readyState = MockWebSocket.CLOSING;
        this.onclose?.({ type: "close" } as CloseEvent);
        this.readyState = MockWebSocket.CLOSED;
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
                chunks: [] as unknown[],
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

    it("emits events to active subscribers and stops after unsubscribe", () => {
        const adapter = new WebSocketTransportAdapter("ws://example");
        const events: TransportIn[] = [];
        const subscription = adapter.messages$.subscribe((event) => events.push(event));

        adapter.connect();
        const socket = MockWebSocket.instances[0];
        socket.triggerOpen();
        socket.triggerMessage("hello world");

        expect(events[0]?.type).toBe("open");
        expect(events.some((event) => event.type === "data" && event.payload === "hello world")).toBe(true);

        subscription.unsubscribe();
        socket.triggerMessage("ignored");
        expect(events.filter((event) => event.type === "data")).toHaveLength(1);

        adapter.disconnect();
    });

    it("sends pings and encodes outgoing messages", () => {
        const adapter = new WebSocketTransportAdapter("ws://example");
        adapter.connect();
        const socket = MockWebSocket.instances[0];
        socket.triggerOpen();

        expect(socket.sent).toHaveLength(1);
        expect(atob(socket.sent[0])).toContain("core.ping");

        adapter.send({ kind: "text", payload: "look" });
        expect(atob(socket.sent[1])).toBe("look\r\n");

        adapter.send({ kind: "gmcp", path: "test.path", payload: { foo: "bar" } });
        const gmcpPayload = atob(socket.sent[2]);
        expect(gmcpPayload).toContain("test.path");
        expect(gmcpPayload).toContain("foo");

        adapter.disconnect();
    });

});
