/**
 * Spike: does a Durable Object keep a telnet connection alive while nobody is attached?
 *
 * The disconnect reports established that Chrome freezes a backgrounded tab on Android
 * and the game connection dies with it. A stateful proxy would fix that for every
 * platform: the telnet socket lives in the proxy, so the character stays online while
 * the browser is frozen, and the page reattaches and replays what it missed.
 *
 * That only works if the object survives with no client connected. Cloudflare evicts
 * idle Durable Objects, and the docs are explicit that in-memory state must be
 * reconstructible from storage — a live TCP socket is precisely what isn't. A pending
 * socket read *should* keep the object resident, but "should" is not something to build
 * on, and WebSocket Hibernation (the usual answer to staying cheap) is unusable here
 * because it evicts the object from memory, killing the socket.
 *
 * So this measures it instead of guessing. An alarm writes a heartbeat to storage every
 * 30s recording whether the socket is still in memory. Eviction is then unmistakable:
 * the alarm wakes a *fresh* object with no socket and no close record, which reads very
 * differently from the upstream hanging up (which records a reason). `/status` prints
 * the log, so the whole test runs from curl with no client changes and no game account.
 */
// `Socket` is a global in @cloudflare/workers-types, not a module export.
import { connect } from 'cloudflare:sockets';

export interface Env {
    SESSION: DurableObjectNamespace;
}

const DEFAULT_HOST = 'arkadia.rpg.pl';
const DEFAULT_PORT = 23;
/** Output held for a detached client. Oldest bytes are dropped past this. */
const BUFFER_LIMIT_BYTES = 256 * 1024;
const HEARTBEAT_MS = 30_000;
/** ~2 hours of heartbeats; enough to see a long detach without unbounded storage. */
const HEARTBEAT_KEEP = 240;
/** How long a session may sit with nobody attached before we hang up upstream. */
const DETACHED_TTL_MS = 30 * 60 * 1000;
/** How often the drain loop looks for queued input. See drain() for why it polls. */
const DRAIN_POLL_MS = 25;

interface Heartbeat {
    t: number;
    /** Socket still in memory? False here after a wake means we were evicted. */
    up: boolean;
    attached: boolean;
    buffered: number;
    closed: string | null;
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const session = url.searchParams.get('session');
        if (!session) {
            return new Response('missing ?session=<id>', { status: 400 });
        }
        // One object per session id; reattaching with the same id lands on the same
        // instance, which is the whole point of the design.
        return env.SESSION.get(env.SESSION.idFromName(session)).fetch(request);
    },
};

export class Session {
    private socket: Socket | null = null;
    private outbox: Uint8Array[] = [];
    private outboxWake: (() => void) | null = null;
    private client: WebSocket | null = null;
    private buffer: Uint8Array[] = [];
    private bufferBytes = 0;
    private droppedBytes = 0;
    private openedAt = 0;
    private closeReason: string | null = null;
    private detachedAt: number | null = null;
    // Write-path instrumentation: which of "the event never fired", "the write never
    // resolved" and "the write failed" is happening.
    private clientMessages = 0;
    private bytesToUpstream = 0;
    private lastWriteError: string | null = null;
    private drainState = 'not started';
    private drainPolls = 0;
    private lastDataKind = 'none';
    private lastChunkLen = -1;

    constructor(private state: DurableObjectState, private env: Env) {}

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname.endsWith('/status')) {
            return Response.json(await this.status());
        }

        // Diagnostic: write upstream from a *request* context rather than from a
        // WebSocket event listener, to find out which of the two the hang belongs to.
        if (url.pathname.endsWith('/send')) {
            const text = url.searchParams.get('text') ?? 'probe';
            await this.writeUpstream(new TextEncoder().encode(`${text}\r\n`));
            return Response.json(await this.status());
        }

        if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response('expected a websocket upgrade', { status: 426 });
        }

        const host = url.searchParams.get('host') ?? DEFAULT_HOST;
        const port = Number(url.searchParams.get('port') ?? DEFAULT_PORT);

        const pair = new WebSocketPair();
        const client = pair[0];
        const server = pair[1];
        server.accept();

        await this.ensureUpstream(host, port);
        this.attach(server);

        return new Response(null, { status: 101, webSocket: client });
    }

    /** Open the telnet connection once; later attaches reuse it. */
    private async ensureUpstream(host: string, port: number): Promise<void> {
        if (this.socket) return;

        this.socket = connect({ hostname: host, port });
        this.openedAt = Date.now();
        this.closeReason = null;
        await this.state.storage.put('openedAt', this.openedAt);

        // Deliberately not awaited: the read loop must outlive this request, which is
        // the behaviour under test.
        void this.pump();
        void this.drain();

        await this.state.storage.setAlarm(Date.now() + HEARTBEAT_MS);
    }

    private async pump(): Promise<void> {
        const reader = this.socket!.readable.getReader();
        try {
            for (;;) {
                const { value, done } = await reader.read();
                if (done) {
                    this.onUpstreamClosed('upstream ended the stream');
                    return;
                }
                if (value) this.deliver(value);
            }
        } catch (err) {
            this.onUpstreamClosed(err instanceof Error ? err.message : String(err));
        }
    }

    /** Straight to the client when one is attached, otherwise into the buffer. */
    private deliver(chunk: Uint8Array): void {
        if (this.client && this.client.readyState === WebSocket.READY_STATE_OPEN) {
            try {
                this.client.send(chunk);
                return;
            } catch {
                // Fall through and buffer: a send failure means the client is gone but
                // its close event has not reached us yet.
            }
        }
        this.buffer.push(chunk);
        this.bufferBytes += chunk.byteLength;
        while (this.bufferBytes > BUFFER_LIMIT_BYTES && this.buffer.length > 0) {
            const oldest = this.buffer.shift()!;
            this.bufferBytes -= oldest.byteLength;
            this.droppedBytes += oldest.byteLength;
        }
    }

    private attach(ws: WebSocket): void {
        // A second attach on the same session replaces the first; two live clients on
        // one character would interleave input unpredictably.
        if (this.client) {
            try { this.client.close(1000, 'replaced by a newer attach'); } catch { /* ignore */ }
        }
        this.client = ws;
        this.detachedAt = null;

        // Ask for ArrayBuffer frames. Left at its default, workerd hands binary frames
        // to a server-side socket as a Blob, and `new Uint8Array(blob)` produces an
        // empty array — no throw, no warning. Every write then "succeeds" with nothing
        // in it, which is as quiet as a bug gets. The Blob branch below stays as a
        // belt-and-braces guard in case the default differs elsewhere.
        try { (ws as { binaryType?: string }).binaryType = 'arraybuffer'; } catch { /* not settable */ }

        ws.addEventListener('message', (event) => {
            this.clientMessages += 1;
            const data = event.data;
            this.lastDataKind = Object.prototype.toString.call(data);

            if (typeof data === 'string') {
                this.enqueueUpstream(new TextEncoder().encode(data));
                return;
            }
            if (data instanceof ArrayBuffer) {
                this.enqueueUpstream(new Uint8Array(data));
                return;
            }
            if (data instanceof Blob) {
                void data.arrayBuffer().then((buf) => this.enqueueUpstream(new Uint8Array(buf)));
                return;
            }
            this.lastWriteError = `unhandled frame type ${this.lastDataKind}`;
            return;
        });

        const detach = () => {
            if (this.client === ws) {
                this.client = null;
                this.detachedAt = Date.now();
            }
        };
        ws.addEventListener('close', detach);
        ws.addEventListener('error', detach);

        this.flushBuffer();
    }

    /**
     * Queue one chunk for the upstream socket.
     *
     * Deliberately does not write. A `write()` issued from inside a WebSocket
     * `message` listener hangs forever in workerd — it never resolves, never rejects,
     * and the bytes never reach the socket, so everything typed in the browser is
     * silently swallowed. The same write from a request handler succeeds, so the
     * socket is fine; it is the listener's I/O context that cannot drive it.
     *
     * So input is parked here and written by {@link drain}, which runs in the context
     * that opened the socket — the same one `pump()` reads from.
     */
    private enqueueUpstream(bytes: Uint8Array): void {
        // Copy, don't reference. `event.data`'s ArrayBuffer is only valid for the
        // duration of the listener; queueing a view onto it means the drain loop later
        // writes a detached, zero-length chunk. That failure is silent in the worst
        // way — `write()` resolves, the socket reports no error, and the bytes simply
        // never exist.
        this.outbox.push(new Uint8Array(bytes));
        this.lastChunkLen = bytes.byteLength;
        const wake = this.outboxWake;
        this.outboxWake = null;
        wake?.();
    }

    /**
     * Writes queued input, polling rather than waiting on a wake-up promise.
     *
     * The poll is the point. Resuming from a promise resolved inside the WebSocket
     * listener hands this loop the listener's I/O context, and the write hangs exactly
     * as it does there. A `setTimeout` created by this loop keeps it in the context
     * that opened the socket, at the cost of up to one interval of input latency.
     */
    private async drain(): Promise<void> {
        this.drainState = 'getting writer';
        let writer: WritableStreamDefaultWriter<Uint8Array>;
        try {
            writer = this.socket!.writable.getWriter();
        } catch (err) {
            this.drainState = `getWriter threw: ${err instanceof Error ? err.message : String(err)}`;
            return;
        }
        this.drainState = 'polling';
        try {
            while (this.socket) {
                if (this.outbox.length === 0) {
                    await new Promise<void>((resolve) => setTimeout(resolve, DRAIN_POLL_MS));
                    this.drainPolls += 1;
                    continue;
                }
                const chunk = this.outbox.shift()!;
                this.drainState = 'writing';
                await writer.write(chunk);
                this.drainState = 'wrote';
                this.bytesToUpstream += chunk.byteLength;
            }
            this.drainState = 'socket gone';
        } catch (err) {
            this.drainState = 'threw';
            this.lastWriteError = err instanceof Error ? err.message : String(err);
        }
    }

    /** Diagnostic entry point: writes from a request context, which does work. */
    private async writeUpstream(bytes: Uint8Array): Promise<void> {
        this.enqueueUpstream(bytes);
    }

    /** Replay what arrived while nobody was listening, oldest first. */
    private flushBuffer(): void {
        if (!this.client) return;
        const pending = this.buffer;
        this.buffer = [];
        this.bufferBytes = 0;
        for (const chunk of pending) {
            try { this.client.send(chunk); } catch { /* client vanished mid-replay */ }
        }
    }

    private onUpstreamClosed(reason: string): void {
        this.closeReason = reason;
        this.socket = null;

        void this.state.storage.put('closeReason', `${reason} @ ${new Date().toISOString()}`);
        if (this.client) {
            try { this.client.close(1011, reason.slice(0, 120)); } catch { /* ignore */ }
            this.client = null;
        }
    }

    /**
     * The measurement. Whether this fires at all, and what it sees when it does, is the
     * answer we are after.
     */
    async alarm(): Promise<void> {
        const log = (await this.state.storage.get<Heartbeat[]>('heartbeats')) ?? [];
        log.push({
            t: Date.now(),
            up: this.socket !== null,
            attached: this.client !== null,
            buffered: this.bufferBytes,
            closed: this.closeReason,
        });
        await this.state.storage.put('heartbeats', log.slice(-HEARTBEAT_KEEP));

        if (this.detachedAt !== null && Date.now() - this.detachedAt > DETACHED_TTL_MS) {
            this.onUpstreamClosed('detached longer than the session TTL');
            return;
        }

        // Keep measuring only while there is something to measure. Once the socket is
        // gone the object can be evicted; there is nothing left to lose.
        if (this.socket) {
            await this.state.storage.setAlarm(Date.now() + HEARTBEAT_MS);
        }
    }

    private async status() {
        const heartbeats = (await this.state.storage.get<Heartbeat[]>('heartbeats')) ?? [];
        const openedAt = (await this.state.storage.get<number>('openedAt')) ?? null;
        const storedClose = (await this.state.storage.get<string>('closeReason')) ?? null;
        const now = Date.now();

        return {
            now: new Date(now).toISOString(),
            // In-memory truth. `socketInMemory: false` alongside a heartbeat history
            // that stops abruptly is what eviction looks like.
            socketInMemory: this.socket !== null,
            clientAttached: this.client !== null,
            openedAt: openedAt ? new Date(openedAt).toISOString() : null,
            aliveForMs: this.openedAt ? now - this.openedAt : null,
            detachedForMs: this.detachedAt ? now - this.detachedAt : null,
            bufferedBytes: this.bufferBytes,
            droppedBytes: this.droppedBytes,
            clientMessages: this.clientMessages,
            bytesToUpstream: this.bytesToUpstream,
            lastWriteError: this.lastWriteError,
            drainState: this.drainState,
            drainPolls: this.drainPolls,
            lastDataKind: this.lastDataKind,
            lastChunkLen: this.lastChunkLen,
            closeReason: this.closeReason ?? storedClose,
            heartbeats: heartbeats.map(h => ({
                at: new Date(h.t).toISOString(),
                up: h.up,
                attached: h.attached,
                buffered: h.buffered,
                closed: h.closed,
            })),
        };
    }
}
