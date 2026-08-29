import arkadiaClient from '@web/MudClient';

/*
 * GMCP negotiation across a session-proxy resume.
 *
 * The game sends IAC WILL GMCP exactly once, when the telnet session opens, and the
 * client's negotiation is otherwise reactive. A resumed attach replays from the client's
 * byte offset — which is counted the moment the greeting arrives, before the DO response
 * goes out. A connection that dies in that window therefore used to leave the game with
 * GMCP off and nothing that would ever turn it on: no vitals, no room, no comms, for the
 * rest of the session. Seen in the wild as "reconnects instantly and no GMCP afterwards".
 *
 * The cure is to re-offer DO + Core.Supports on every resumed attach, unprompted.
 */

const GMCP_DO = '\xFF\xFD\xC9';

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
        this.onclose?.({code: 1000, reason: '', wasClean: true} as CloseEvent);
    }

    /** Everything sent on this socket, as one Latin-1 byte-string. */
    sentBytes(): string {
        return this.sent
            .map(frame => typeof frame === 'string'
                ? frame
                : String.fromCharCode(...frame))
            .join('');
    }
}

let instances: FakeSocket[] = [];
const realWebSocket = globalThis.WebSocket;

/** A session-proxy control frame, framed the way proxy/frame.go does. */
function controlFrame(payload: object): ArrayBuffer {
    const json = new TextEncoder().encode(JSON.stringify(payload));
    const buf = new ArrayBuffer(9 + json.length);
    const view = new DataView(buf);
    view.setUint8(0, 0x02);
    view.setBigUint64(1, BigInt(Date.now()));
    new Uint8Array(buf, 9).set(json);
    return buf;
}

/** A data frame carrying raw game bytes (Latin-1 byte-string). */
function dataFrame(bytes: string): ArrayBuffer {
    const buf = new ArrayBuffer(9 + bytes.length);
    const view = new DataView(buf);
    view.setUint8(0, 0x01);
    view.setBigUint64(1, BigInt(Date.now()));
    const payload = new Uint8Array(buf, 9);
    for (let i = 0; i < bytes.length; i++) {
        payload[i] = bytes.charCodeAt(i) & 0xff;
    }
    return buf;
}

function connectThroughSessionProxy(): FakeSocket {
    instances = [];
    arkadiaClient.connect();
    return instances[0];
}

describe('GMCP negotiation across a proxy resume', () => {
    beforeEach(() => {
        (globalThis as unknown as {WebSocket: unknown}).WebSocket = FakeSocket;
        // The default proxy URL ends in /attach, which is what selects the framed
        // codec and the resume machinery under test.
        arkadiaClient.setUserProxyUrl(null);
        arkadiaClient.setProxyMode('proxy');
    });

    afterEach(() => {
        arkadiaClient.setProxyMode('direct');
        (globalThis as unknown as {WebSocket: unknown}).WebSocket = realWebSocket;
        localStorage.clear();
        sessionStorage.clear();
    });

    it('re-offers DO GMCP and Core.Supports on a resumed attach, unprompted', () => {
        const socket = connectThroughSessionProxy();

        socket.onmessage?.({data: controlFrame({type: 'attached', resumed: true})});

        const sent = socket.sentBytes();
        expect(sent).toContain(GMCP_DO);
        expect(sent).toContain('Core.Supports.Add');
        expect(sent).toContain('Gmcp_msgs 1');
    });

    /*
     * A fresh session's greeting still carries the game's IAC WILL GMCP, and the
     * reactive path answers it. Offering here too would be harmless, but the point of
     * the unprompted offer is the resume, where the WILL is behind the offset.
     */
    it('leaves a fresh attach to the ordinary reactive negotiation', () => {
        const socket = connectThroughSessionProxy();

        socket.onmessage?.({data: controlFrame({type: 'attached', resumed: false})});

        expect(socket.sentBytes()).toBe('');
    });

    it('answers the game\'s WILL on a fresh session, as before', () => {
        const socket = connectThroughSessionProxy();

        socket.onmessage?.({data: dataFrame('Witaj w Arkadii\r\n\xFF\xFB\xC9')});

        const sent = socket.sentBytes();
        expect(sent).toContain(GMCP_DO);
        expect(sent).toContain('Core.Supports.Add');
    });

    /*
     * The game ended the session while nobody was attached; the socket is about to be
     * closed after the replay of its parting words. There is nothing to negotiate with.
     */
    it('stays quiet when resuming a session the game already ended', () => {
        const socket = connectThroughSessionProxy();

        socket.onmessage?.({
            data: controlFrame({type: 'attached', resumed: true, upstreamClosed: true, closeReason: 'idle'}),
        });

        expect(socket.sentBytes()).toBe('');
    });

    /*
     * A resume whose replay happens to include the WILL (the client had processed
     * nothing) negotiates once, not twice: the supports declaration is guarded.
     */
    it('declares supports only once when a replayed WILL follows the resume', () => {
        const socket = connectThroughSessionProxy();

        socket.onmessage?.({data: controlFrame({type: 'attached', resumed: true})});
        socket.onmessage?.({data: dataFrame('Witaj w Arkadii\r\n\xFF\xFB\xC9')});

        const supports = socket.sentBytes().match(/Core\.Supports\.Add/g) ?? [];
        expect(supports).toHaveLength(1);
    });

    /*
     * The guard is per connection: a genuinely new socket renegotiates from scratch, or
     * a reconnect after the fix would inherit a stale "already negotiated" and go dark
     * the same way the original bug did.
     */
    it('negotiates afresh on the next connection', () => {
        const first = connectThroughSessionProxy();
        first.onmessage?.({data: controlFrame({type: 'attached', resumed: true})});

        const second = connectThroughSessionProxy();
        second.onmessage?.({data: controlFrame({type: 'attached', resumed: true})});

        const sent = second.sentBytes();
        expect(sent).toContain(GMCP_DO);
        expect(sent).toContain('Core.Supports.Add');
    });
});
