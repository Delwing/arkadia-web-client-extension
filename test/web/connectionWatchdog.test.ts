import arkadiaClient from '@web/MudClient';

/**
 * The connection watchdog exists to notice a dead socket. Its hazard is the
 * opposite case: on mobile the tab is suspended the moment it goes to the
 * background, so the timer runs on resume — minutes late, with the server's reply
 * still queued behind it. Closing there hangs up on a perfectly healthy
 * connection, which is exactly what a user sees as "I switched apps and got
 * disconnected".
 */

type MessageHandler = (event: { data: string }) => void;

class FakeSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readyState = FakeSocket.OPEN;
    binaryType = '';
    readonly sent: string[] = [];
    closeCount = 0;

    onmessage: MessageHandler | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onopen: ((event: Event) => void) | null = null;

    constructor(readonly url: string) {
        instances.push(this);
    }

    send(data: string): void {
        this.sent.push(String(data));
    }

    close(): void {
        this.closeCount += 1;
        this.readyState = FakeSocket.CLOSED;
        this.onclose?.({code: 1000, reason: '', wasClean: true} as CloseEvent);
    }

    /** Deliver a frame the way the native /wss endpoint does: base64 text. */
    receive(text: string): void {
        this.onmessage?.({data: btoa(text)});
    }
}

let instances: FakeSocket[] = [];
const realWebSocket = globalThis.WebSocket;

/** Must match CONNECTION_CHECK_TIMEOUT_MS in MudClient. */
const PROBE = 8000;

/** Pings the client has sent on this socket, in order. */
const pingsOn = (socket: FakeSocket) => socket.sent.filter(frame => atob(frame).includes('core.ping'));

/** Open a socket without firing onopen, which would start the 3s ping loop. */
function openSocket(): FakeSocket {
    instances = [];
    arkadiaClient.connect();
    return instances[0];
}

describe('connection watchdog', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        (globalThis as unknown as {WebSocket: unknown}).WebSocket = FakeSocket;
    });

    afterEach(() => {
        vi.useRealTimers();
        (globalThis as unknown as {WebSocket: unknown}).WebSocket = realWebSocket;
    });

    it('closes only after three unanswered probes', () => {
        const socket = openSocket();

        arkadiaClient.checkConnection();
        expect(pingsOn(socket)).toHaveLength(1);

        vi.advanceTimersByTime(PROBE);
        expect(socket.closeCount, 'one silent probe is not enough').toBe(0);
        expect(pingsOn(socket)).toHaveLength(2);

        vi.advanceTimersByTime(PROBE);
        expect(socket.closeCount, 'two silent probes are not enough').toBe(0);
        expect(pingsOn(socket)).toHaveLength(3);

        vi.advanceTimersByTime(PROBE);
        expect(socket.closeCount).toBe(1);
        expect(arkadiaClient.lastCloseCause).toBe('watchdog');
    });

    it('leaves the socket alone once any frame arrives', () => {
        const socket = openSocket();

        arkadiaClient.checkConnection();
        socket.receive('Jestes w lesie.\r\n');
        vi.advanceTimersByTime(60_000);

        expect(socket.closeCount).toBe(0);
    });

    it('a reply to a later probe still saves the socket', () => {
        const socket = openSocket();

        arkadiaClient.checkConnection();
        vi.advanceTimersByTime(PROBE);
        vi.advanceTimersByTime(PROBE);

        // Slow, but alive — a phone whose radio took its time waking up.
        socket.receive('Jestes w lesie.\r\n');
        vi.advanceTimersByTime(60_000);

        expect(socket.closeCount).toBe(0);
    });

    it('re-checks instead of closing when the timer fires late (page was suspended)', () => {
        const socket = openSocket();

        arkadiaClient.checkConnection();

        // The tab is frozen for five minutes: wall-clock races ahead, and the
        // callback only runs once the page is resumed.
        vi.setSystemTime(Date.now() + 300_000);
        vi.advanceTimersByTime(PROBE);

        expect(socket.closeCount).toBe(0);
        expect(pingsOn(socket)).toHaveLength(2);
    });

    it('does not spend a probe on a late firing', () => {
        const socket = openSocket();

        arkadiaClient.checkConnection();

        // Two suspensions in a row must not eat into the probe budget: neither
        // firing was ever heard.
        vi.setSystemTime(Date.now() + 300_000);
        vi.advanceTimersByTime(PROBE);
        vi.setSystemTime(Date.now() + 300_000);
        vi.advanceTimersByTime(PROBE);
        expect(socket.closeCount).toBe(0);

        // Awake now, and genuinely unanswered: the full budget still applies.
        vi.advanceTimersByTime(PROBE);
        vi.advanceTimersByTime(PROBE);
        expect(socket.closeCount).toBe(0);

        vi.advanceTimersByTime(PROBE);
        expect(socket.closeCount).toBe(1);
    });

    it('answering after a late firing keeps the socket', () => {
        const socket = openSocket();

        arkadiaClient.checkConnection();
        vi.setSystemTime(Date.now() + 300_000);
        vi.advanceTimersByTime(PROBE);

        // The reply that was queued behind the timer finally gets processed.
        socket.receive('Jestes w lesie.\r\n');
        vi.advanceTimersByTime(60_000);

        expect(socket.closeCount).toBe(0);
    });

    it('does not carry a pending check over to the next socket', () => {
        const first = openSocket();
        arkadiaClient.checkConnection();

        // Reconnecting detaches the old socket's handlers, so its onclose never runs
        // and cannot clear the check on our behalf.
        const second = openSocket();
        vi.advanceTimersByTime(PROBE * 4);

        expect(second.closeCount).toBe(0);
        expect(first.closeCount).toBe(0);
    });

    it('reports who hung up', () => {
        const socket = openSocket();
        expect(arkadiaClient.lastCloseCause, 'a fresh connection blames nobody').toBe('remote');

        arkadiaClient.disconnect();
        expect(socket.closeCount).toBe(1);
        expect(arkadiaClient.lastCloseCause).toBe('user');

        // A drop we did not ask for stays attributed to the far end.
        const next = openSocket();
        next.close();
        expect(arkadiaClient.lastCloseCause).toBe('remote');
    });
});
