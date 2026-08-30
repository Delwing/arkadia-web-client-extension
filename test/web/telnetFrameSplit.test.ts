import arkadiaClient from '@web/MudClient';
import eventBus from '@modules/core/eventBus';

/*
 * A telnet sequence split across two transport frames.
 *
 * The proxy forwards whatever bytes the TCP stream gave it, so an IAC SB ... IAC SE
 * packet can be cut at any byte — including between the IAC and the SB right after it.
 * A head that short matches none of the telnet patterns, so the stray IAC was dropped
 * and the rest of the packet rendered as game text: seen in the wild as a bare
 * `char.state {"hp":5}` in the main output.
 */

class FakeSocket {
    static readonly OPEN = 1;
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
        this.readyState = 3;
    }

    /** Everything sent on this socket, as one Latin-1 byte-string. */
    sentBytes(): string {
        return this.sent
            .map(frame => (typeof frame === 'string' ? frame : String.fromCharCode(...frame)))
            .join('');
    }
}

let instances: FakeSocket[] = [];
const realWebSocket = globalThis.WebSocket;

/** A session-proxy data frame, framed the way proxy/frame.go does. */
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

describe('a telnet sequence split across frames', () => {
    let lines: string[];
    let states: unknown[];
    const onLines = (out: { text: string; type: string }[]) => {
        out.forEach(m => lines.push(m.text));
    };
    const onState = (value: unknown) => {
        states.push(value);
    };

    beforeEach(() => {
        lines = [];
        states = [];
        (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeSocket;
        arkadiaClient.setUserProxyUrl(null);
        arkadiaClient.setProxyMode('proxy');
        eventBus.on('flushLines', onLines as never);
        eventBus.on('gmcp.char.state' as never, onState as never);
        instances = [];
        arkadiaClient.connect();
    });

    afterEach(() => {
        eventBus.off('flushLines', onLines as never);
        eventBus.off('gmcp.char.state' as never, onState as never);
        arkadiaClient.setProxyMode('direct');
        (globalThis as unknown as { WebSocket: unknown }).WebSocket = realWebSocket;
        localStorage.clear();
        sessionStorage.clear();
    });

    const GMCP = '\xFF\xFA\xC9char.state {"hp":5}\xFF\xF0';
    const TAIL = 'Jestes glodny.\r\n';

    it.each([
        ['between IAC and SB', 1],
        ['after IAC SB', 2],
        ['after the option byte', 3],
        ['mid payload', 10],
        ['before IAC SE', GMCP.length - 2],
        ['between IAC and SE', GMCP.length - 1],
    ])('cut %s is parsed as GMCP and never reaches the output', (_name, at) => {
        const socket = instances[0];
        socket.onmessage?.({data: dataFrame('Rozgladasz sie.\r\n' + GMCP.substring(0, at))});
        socket.onmessage?.({data: dataFrame(GMCP.substring(at) + TAIL)});

        expect(states).toEqual([{hp: 5}]);
        expect(lines.join('')).not.toContain('char.state');
        // The game text on either side of the split packet still arrives intact.
        expect(lines.join('')).toContain('Rozgladasz sie.');
        expect(lines.join('')).toContain('Jestes glodny.');
    });

    /*
     * A packet can also be dribbled out a byte at a time, so the hold-back has to
     * survive any number of boundaries, not just one.
     */
    it('reassembles a subnegotiation delivered one byte per frame', () => {
        const socket = instances[0];
        for (const byte of ('Rozgladasz sie.\r\n' + GMCP + TAIL).split('')) {
            socket.onmessage?.({data: dataFrame(byte)});
        }

        expect(states).toEqual([{hp: 5}]);
        expect(lines.join('')).not.toContain('char.state');
        expect(lines.join('')).toContain('Jestes glodny.');
    });

    /*
     * The same boundary can land inside a three-byte negotiation. Losing this one
     * costs the whole session's GMCP, since the game offers it exactly once.
     */
    it('answers a WILL GMCP whose option byte arrives in the next frame', () => {
        const socket = instances[0];
        socket.onmessage?.({data: dataFrame('Witaj w Arkadii\r\n\xFF\xFB')});
        socket.onmessage?.({data: dataFrame('\xC9')});

        expect(socket.sentBytes()).toContain('\xFF\xFD\xC9');
        expect(lines.join('')).toContain('Witaj w Arkadii');
    });

    /*
     * The negotiation scan keeps only two bytes of history, which is the whole
     * needle minus one — enough to span any boundary, and too little to ever hold a
     * complete sequence. It carries them forward from the *joined* string, so a WILL
     * split three ways is still recognised, and still answered exactly once.
     */
    it('answers a WILL GMCP arriving one byte per frame, exactly once', () => {
        const socket = instances[0];
        for (const byte of 'Witaj\r\n\xFF\xFB\xC9'.split('')) {
            socket.onmessage?.({data: dataFrame(byte)});
        }

        const answers = socket.sentBytes().match(/\xFF\xFD\xC9/g) ?? [];
        expect(answers).toHaveLength(1);
    });

    it('does not re-answer a WILL GMCP that fell entirely inside one frame', () => {
        const socket = instances[0];
        socket.onmessage?.({data: dataFrame('Witaj\r\n\xFF\xFB\xC9')});
        socket.onmessage?.({data: dataFrame('Jestes glodny.\r\n')});

        const answers = socket.sentBytes().match(/\xFF\xFD\xC9/g) ?? [];
        expect(answers).toHaveLength(1);
    });
});
