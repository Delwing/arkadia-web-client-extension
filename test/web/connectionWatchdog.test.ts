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

    it('closes a socket that answers nothing while the page is awake', () => {
        const socket = openSocket();

        arkadiaClient.checkConnection();
        expect(pingsOn(socket)).toHaveLength(1);

        vi.advanceTimersByTime(5000);

        expect(socket.closeCount).toBe(1);
    });

    it('leaves the socket alone once any frame arrives', () => {
        const socket = openSocket();

        arkadiaClient.checkConnection();
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
        vi.advanceTimersByTime(5000);

        expect(socket.closeCount).toBe(0);
        expect(pingsOn(socket)).toHaveLength(2);
    });

    it('still closes if the re-check goes unanswered too', () => {
        const socket = openSocket();

        arkadiaClient.checkConnection();
        vi.setSystemTime(Date.now() + 300_000);
        vi.advanceTimersByTime(5000);
        expect(socket.closeCount).toBe(0);

        // Awake this time, and the server is genuinely gone.
        vi.advanceTimersByTime(5000);

        expect(socket.closeCount).toBe(1);
    });

    it('answering the re-check keeps the socket', () => {
        const socket = openSocket();

        arkadiaClient.checkConnection();
        vi.setSystemTime(Date.now() + 300_000);
        vi.advanceTimersByTime(5000);

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
        vi.advanceTimersByTime(5000);

        expect(second.closeCount).toBe(0);
        expect(first.closeCount).toBe(0);
    });
});
