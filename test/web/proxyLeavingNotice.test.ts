import arkadiaClient from '@web/MudClient';

/*
 * Telling the proxy that a deliberate disconnect is over.
 *
 * Dropping the session id stops *us* resuming, but it does not stop the character
 * standing in the world: the proxy holds the telnet connection until its TTL, thirty-five
 * minutes of somebody idling where they chose to leave. The beacon a closing tab sends is
 * what ends it, and "Rozlacz" has to send the same one.
 *
 * Timing is the whole of the difference between the two. A closing tab takes its socket
 * with it, so the beacon — delivered after unload — arrives with nobody attached, and the
 * proxy acts. A menu disconnect unloads nothing, so the same call made inline arrives
 * while we are still the attached client, and the proxy ignores it exactly then (that
 * guard is what stops a reload's late beacon killing the page that replaced it).
 */

class FakeSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readyState = FakeSocket.OPEN;
    binaryType = '';

    onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onopen: ((event: Event) => void) | null = null;

    constructor(readonly url: string, readonly protocols?: string[]) {
        instances.push(this);
    }

    send(): void {
    }

    /** Closes the way a real socket does: the event lands after close() returns. */
    close(): void {
        this.readyState = FakeSocket.CLOSING;
        queueMicrotask(() => {
            this.readyState = FakeSocket.CLOSED;
            this.onclose?.({code: 1000, reason: '', wasClean: true} as CloseEvent);
        });
    }
}

let instances: FakeSocket[] = [];
const realWebSocket = globalThis.WebSocket;

interface Beacon {
    url: string;
    body: BodyInit | undefined;
}

let beacons: Beacon[] = [];

/** What each beacon carried, read back out of the Blob sendBeacon is handed. */
function beaconBodies(): Promise<string[]> {
    return Promise.all(beacons.map(b => (b.body instanceof Blob
        ? b.body.text()
        : Promise.resolve(String(b.body ?? '')))));
}

/** The session id offered in the handshake, which is what a notice must name. */
function offeredSessionId(socket: FakeSocket): string {
    const carried = (socket.protocols ?? []).find(p => p.startsWith('s.'));
    return carried?.slice(2) ?? '';
}

describe('leaving notice on a deliberate disconnect', () => {
    beforeEach(() => {
        (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeSocket;
        beacons = [];
        navigator.sendBeacon = ((url: string, body?: BodyInit) => {
            beacons.push({url, body});
            return true;
        }) as typeof navigator.sendBeacon;
        // The default proxy URL ends in /attach — the resumable kind, the only one that
        // holds a session open after the socket goes.
        arkadiaClient.setUserProxyUrl(null);
        arkadiaClient.setProxyMode('proxy');
        instances = [];
    });

    afterEach(() => {
        arkadiaClient.setProxyMode('direct');
        (globalThis as unknown as { WebSocket: unknown }).WebSocket = realWebSocket;
        localStorage.clear();
        sessionStorage.clear();
    });

    it('tells the proxy the session is over, naming the id it connected with', async () => {
        arkadiaClient.connect();
        const socket = instances[0];
        const sessionId = offeredSessionId(socket);

        arkadiaClient.disconnect();
        await Promise.resolve();

        expect(beacons).toHaveLength(1);
        expect(beacons[0].url).toContain('/leaving');
        // The id is a credential, so it rides in the body rather than the URL.
        await expect(beaconBodies()).resolves.toEqual([sessionId]);
        expect(beacons[0].url).not.toContain(sessionId);
    });

    it('waits for the socket to close, which is when the proxy will act on it', () => {
        arkadiaClient.connect();

        arkadiaClient.disconnect();

        // Still attached at this point: a notice sent now is one the proxy discards.
        expect(beacons).toHaveLength(0);
    });

    it('names the session being left, not the one starting next', async () => {
        vi.useFakeTimers();
        try {
            arkadiaClient.connect();
            const leaving = offeredSessionId(instances[0]);

            arkadiaClient.disconnect();
            // Reconnecting at once detaches the old socket's handlers, so its close event
            // never arrives and the backstop timer is what delivers the notice. The id it
            // carries must still be the abandoned one.
            arkadiaClient.connect();
            await Promise.resolve();
            vi.advanceTimersByTime(2000);

            const arriving = offeredSessionId(instances[1]);
            expect(arriving).not.toBe(leaving);
            await expect(beaconBodies()).resolves.toEqual([leaving]);
        } finally {
            vi.useRealTimers();
        }
    });

    it('stays quiet on a direct connection, where no session outlives the socket', async () => {
        arkadiaClient.setProxyMode('direct');
        arkadiaClient.connect();

        arkadiaClient.disconnect();
        await Promise.resolve();

        expect(beacons).toHaveLength(0);
    });
});
