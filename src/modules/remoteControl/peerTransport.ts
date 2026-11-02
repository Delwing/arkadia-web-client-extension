/**
 * The link between the PC and the phone, through PeerJS: its public server
 * (0.peerjs.com) introduces the two, then they talk over a WebRTC data channel.
 * PeerJS's default ICE servers include its public TURN relays, so this also
 * gets through mobile carriers' NAT. The server only sees the introduction;
 * the game goes peer to peer (or through the relay, encrypted).
 *
 * The PC registers under an id made from its pairing code, which only a phone
 * that scanned its QR knows; the phone also presents the code, and the PC
 * drops a connection without it.
 *
 * `peerjs` is imported on first use, so it reaches neither the main bundle nor
 * a PC that never switches the pilot on.
 */

import type { DataConnection, Peer as PeerInstance } from "peerjs";

export interface RemoteChannel {
    send(text: string): void;
    onMessage(listener: (text: string) => void): void;
    /** Called once, however the channel ends. */
    onClose(listener: () => void): void;
    close(): void;
}

export interface HostEvents {
    /** Registered with the server: a phone can reach this PC now. */
    ready(): void;
    /** Not registered (yet): the reason, for the log. Retried on its own. */
    offline(reason: string): void;
    /** A phone with the right code connected. */
    connection(channel: RemoteChannel): void;
}

export interface HostHandle {
    close(): void;
}

const RETRY_MS = 5000;
const CONNECT_TIMEOUT_MS = 20000;

/** The PC's id on the server: unguessable, since the pairing code is secret. */
export function hostPeerId(pairCode: string): string {
    return `arkadia-pilot-${pairCode}`;
}

function wrap(conn: DataConnection, onClosed?: () => void): RemoteChannel {
    const closeListeners: (() => void)[] = [];
    let ended = false;
    const end = () => {
        if (ended) return;
        ended = true;
        onClosed?.();
        closeListeners.forEach(listener => listener());
    };
    conn.on('close', end);
    conn.on('error', end);
    // A peer that vanishes (phone asleep, tab closed) may never say goodbye: ICE notices.
    conn.peerConnection?.addEventListener('iceconnectionstatechange', () => {
        const state = conn.peerConnection?.iceConnectionState;
        if (state === 'failed' || state === 'closed') end();
    });
    return {
        send: text => {
            if (conn.open) void conn.send(text);
        },
        onMessage: listener => conn.on('data', data => {
            if (typeof data === 'string') listener(data);
        }),
        onClose: listener => closeListeners.push(listener),
        close: () => {
            conn.close();
            end();
        },
    };
}

/** Register the PC and accept phones that present `pairCode`. */
export function openHost(pairCode: string, events: HostEvents): HostHandle {
    let closed = false;
    let peer: PeerInstance | null = null;
    let retry: number | undefined;

    const start = async () => {
        const { Peer } = await import("peerjs");
        if (closed) return;
        const current = new Peer(hostPeerId(pairCode), { debug: 1 });
        peer = current;
        const again = (reason: string) => {
            if (closed || peer !== current) return;
            events.offline(reason);
            current.destroy();
            peer = null;
            retry = window.setTimeout(() => void start(), RETRY_MS);
        };
        current.on('open', () => events.ready());
        current.on('connection', conn => {
            if ((conn.metadata as { pair?: unknown } | undefined)?.pair !== pairCode) {
                conn.close();
                return;
            }
            conn.on('open', () => events.connection(wrap(conn)));
        });
        // Lost the server (not the phone): register again.
        current.on('disconnected', () => {
            if (!closed && peer === current && !current.destroyed) {
                events.offline('disconnected');
                retry = window.setTimeout(() => current.reconnect(), RETRY_MS);
            }
        });
        current.on('error', error => {
            // "unavailable-id": the server still holds this id from a page that just reloaded.
            if (error.type === 'peer-unavailable') return;
            again(error.type);
        });
    };

    void start().catch(error => events.offline(String(error)));

    return {
        close() {
            closed = true;
            window.clearTimeout(retry);
            peer?.destroy();
            peer = null;
        },
    };
}

/** Reach the PC whose QR gave `pairCode`. Rejects when it is not there. */
export async function connectToHost(pairCode: string): Promise<RemoteChannel> {
    const { Peer } = await import("peerjs");
    return new Promise((resolve, reject) => {
        const peer = new Peer({ debug: 1 });
        let settled = false;
        const fail = (message: string) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            peer.destroy();
            reject(new Error(message));
        };
        const timer = window.setTimeout(() => fail('timeout'), CONNECT_TIMEOUT_MS);
        peer.on('error', error => fail(error.type));
        peer.on('open', () => {
            const conn = peer.connect(hostPeerId(pairCode), {
                reliable: true,
                serialization: 'raw',
                metadata: { pair: pairCode },
            });
            conn.on('open', () => {
                if (settled) return;
                settled = true;
                window.clearTimeout(timer);
                resolve(wrap(conn, () => peer.destroy()));
            });
            conn.on('error', () => fail('connection'));
        });
    });
}
