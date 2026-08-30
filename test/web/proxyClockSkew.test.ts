import arkadiaClient from '@web/MudClient';
import eventBus from '@modules/core/eventBus';
import {eventNow} from '@shared/eventClock';

/*
 * A proxy whose clock disagrees with ours.
 *
 * Frame timestamps come from the proxy's wall clock and scripts stamp events with them
 * (client.now()), but the timers built on those stamps tick against Date.now() here. A
 * proxy running five seconds fast therefore used to turn a five-second cover cooldown
 * into a ten-second one, with nothing anywhere reporting a fault: the frames are
 * well-formed, the two machines simply disagree about the time.
 *
 * MudClient reconciles them before a timestamp reaches the pipeline, so these tests read
 * the event clock from inside a listener - exactly what a script sees.
 */

const SKEW_MS = 5_000;

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

    send(): void {
    }

    close(): void {
    }
}

let instances: FakeSocket[] = [];
const realWebSocket = globalThis.WebSocket;

function frame(kind: number, at: number, bytes: string): ArrayBuffer {
    const buf = new ArrayBuffer(9 + bytes.length);
    const view = new DataView(buf);
    view.setUint8(0, kind);
    view.setBigUint64(1, BigInt(Math.round(at)));
    const payload = new Uint8Array(buf, 9);
    for (let i = 0; i < bytes.length; i++) {
        payload[i] = bytes.charCodeAt(i) & 0xff;
    }
    return buf;
}

/** The control frame every attach opens with, stamped live by a fast proxy. */
const controlFrame = (at: number) => frame(0x02, at, JSON.stringify({type: 'attached', resumed: false}));
const dataFrame = (at: number, bytes: string) => frame(0x01, at, bytes);

function connectThroughSessionProxy(): FakeSocket {
    instances = [];
    arkadiaClient.connect();
    return instances[0];
}

/** When the pipeline thinks the next line happened, as a script would ask. */
function eventTimeOfNextLine(socket: FakeSocket, at: number, text: string): number {
    let stamped = 0;
    const listener = () => {
        stamped = eventNow();
    };
    eventBus.on('socket.incoming', listener);
    try {
        socket.onmessage?.({data: dataFrame(at, text)});
    } finally {
        eventBus.off('socket.incoming', listener);
    }
    return stamped;
}

describe('a session proxy whose clock disagrees with ours', () => {
    beforeEach(() => {
        (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeSocket;
        arkadiaClient.setUserProxyUrl(null);
        arkadiaClient.setProxyMode('proxy');
    });

    afterEach(() => {
        arkadiaClient.setProxyMode('direct');
        (globalThis as unknown as { WebSocket: unknown }).WebSocket = realWebSocket;
        localStorage.clear();
        sessionStorage.clear();
    });

    it('dates live output to now, not to the proxy clock', () => {
        const socket = connectThroughSessionProxy();
        socket.onmessage?.({data: controlFrame(Date.now() + SKEW_MS)});

        const stamped = eventTimeOfNextLine(socket, Date.now() + SKEW_MS, 'Zrecznie zaslaniasz.\r\n');

        // Without the correction this lands SKEW_MS in the future, which is precisely
        // what makes a 5s cooldown count down from 10.
        expect(Math.abs(stamped - Date.now())).toBeLessThan(500);
    });

    it('keeps replayed output as old as it really is', () => {
        const socket = connectThroughSessionProxy();
        socket.onmessage?.({data: controlFrame(Date.now() + SKEW_MS)});

        // Backlog: produced five minutes ago on the proxy's (fast) clock.
        const stamped = eventTimeOfNextLine(socket, Date.now() + SKEW_MS - 300_000, 'Stara linia.\r\n');

        expect(Math.abs((Date.now() - stamped) - 300_000)).toBeLessThan(500);
    });

    it('reports the drift it measured, so it is visible rather than silent', () => {
        const socket = connectThroughSessionProxy();
        const seen: number[] = [];
        const listener = (offset: number) => seen.push(offset);
        eventBus.on('proxy.clockOffset', listener);
        try {
            socket.onmessage?.({data: controlFrame(Date.now() + SKEW_MS)});
        } finally {
            eventBus.off('proxy.clockOffset', listener);
        }

        expect(seen.length).toBeGreaterThan(0);
        expect(Math.abs(seen[0] - SKEW_MS)).toBeLessThan(500);
    });

    it('leaves an agreeing proxy alone', () => {
        const socket = connectThroughSessionProxy();
        socket.onmessage?.({data: controlFrame(Date.now())});

        const stamped = eventTimeOfNextLine(socket, Date.now(), 'Zwykla linia.\r\n');

        expect(Math.abs(stamped - Date.now())).toBeLessThan(500);
    });
});
