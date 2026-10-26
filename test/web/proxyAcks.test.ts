import arkadiaClient from '@web/MudClient';

/*
 * Offset acknowledgements to the session proxy.
 *
 * A ping shows the proxy the page was running when it sent it, not that it read what was
 * still in flight, so releasing held output on a ping lost the tail of it on phones. The
 * client now says exactly how much it processed, as a text message (game input is binary),
 * but only to a proxy that announced it reads them: an older one would forward the text
 * to the game as typed input.
 */

class FakeSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readyState = FakeSocket.OPEN;
    binaryType = '';
    readonly sent: (string | Uint8Array)[] = [];

    onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onopen: ((event: Event) => void) | null = null;

    constructor(readonly url: string, readonly protocols?: string[]) {
        instances.push(this);
    }

    send(data: string | Uint8Array): void {
        this.sent.push(data);
    }

    close(): void {
        this.readyState = FakeSocket.CLOSED;
    }

    /** The text messages sent, parsed: everything meant for the proxy rather than the game. */
    acks(): { type: string; offset: number }[] {
        return this.sent
            .filter((frame): frame is string => typeof frame === 'string')
            .map(frame => JSON.parse(frame));
    }
}

let instances: FakeSocket[] = [];
const realWebSocket = globalThis.WebSocket;

function frame(type: number, payload: Uint8Array): ArrayBuffer {
    const buf = new ArrayBuffer(9 + payload.length);
    const view = new DataView(buf);
    view.setUint8(0, type);
    view.setBigUint64(1, BigInt(Date.now()));
    new Uint8Array(buf, 9).set(payload);
    return buf;
}

const controlFrame = (payload: object) => frame(0x02, new TextEncoder().encode(JSON.stringify(payload)));
const dataFrame = (bytes: string) => frame(0x01, Uint8Array.from(bytes, c => c.charCodeAt(0) & 0xff));

function connectThroughSessionProxy(): FakeSocket {
    instances = [];
    arkadiaClient.connect();
    return instances[0];
}

describe('offset acknowledgements to the session proxy', () => {
    beforeEach(() => {
        (globalThis as unknown as {WebSocket: unknown}).WebSocket = FakeSocket;
        arkadiaClient.setUserProxyUrl(null);
        arkadiaClient.setProxyMode('proxy');
        // A new session for each test: the count runs for the life of one.
        (arkadiaClient as unknown as {processedBytes: number}).processedBytes = 0;
    });

    afterEach(() => {
        jest.useRealTimers();
        arkadiaClient.setProxyMode('direct');
        (globalThis as unknown as {WebSocket: unknown}).WebSocket = realWebSocket;
        localStorage.clear();
        sessionStorage.clear();
    });

    it('answers the end of a session with everything it processed', () => {
        const socket = connectThroughSessionProxy();
        socket.onmessage?.({data: controlFrame({type: 'attached', acks: true})});
        socket.onmessage?.({data: dataFrame('Zegnaj.\r\n')});

        socket.onmessage?.({data: controlFrame({type: 'ended', upstreamClosed: true})});

        expect(socket.acks()).toEqual([{type: 'ack', offset: 'Zegnaj.\r\n'.length}]);
    });

    it('sends nothing to a proxy that did not offer acks', () => {
        const socket = connectThroughSessionProxy();
        socket.onmessage?.({data: controlFrame({type: 'attached'})});
        socket.onmessage?.({data: dataFrame('Zegnaj.\r\n')});

        socket.onmessage?.({data: controlFrame({type: 'ended', upstreamClosed: true})});

        expect(socket.acks()).toEqual([]);
    });

    // Counted on arrival, but not processed until the rest of it comes: a resume still
    // needs those bytes, so the proxy must not be told to let them go.
    it('leaves a telnet sequence held for the next frame out of the count', () => {
        const socket = connectThroughSessionProxy();
        socket.onmessage?.({data: controlFrame({type: 'attached', acks: true})});
        const line = 'Witaj.\r\n';
        socket.onmessage?.({data: dataFrame(`${line}\xff\xfa\xc9Char.Vitals {"hp":`)});

        socket.onmessage?.({data: controlFrame({type: 'ended', upstreamClosed: true})});

        expect(socket.acks()).toEqual([{type: 'ack', offset: line.length}]);
    });

    it('acknowledges with every ping', () => {
        jest.useFakeTimers();
        const socket = connectThroughSessionProxy();
        socket.onmessage?.({data: controlFrame({type: 'attached', acks: true})});
        socket.onmessage?.({data: dataFrame('Gruby czlowiek spoglada na ciebie.\r\n')});

        socket.onopen?.(new Event('open'));

        expect(socket.acks()).toEqual([{type: 'ack', offset: 'Gruby czlowiek spoglada na ciebie.\r\n'.length}]);
    });

    it('forgets the offer on a new socket, which may be another proxy', () => {
        const first = connectThroughSessionProxy();
        first.onmessage?.({data: controlFrame({type: 'attached', acks: true})});

        const second = connectThroughSessionProxy();
        second.onmessage?.({data: controlFrame({type: 'ended', upstreamClosed: true})});

        expect(second.acks()).toEqual([]);
    });
});
