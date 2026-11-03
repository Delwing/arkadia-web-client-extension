import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const peers: FakePeer[] = [];

class FakePeer {
    destroyed = false;
    disconnected = false;
    reconnect = vi.fn();
    private listeners = new Map<string, ((...args: unknown[]) => void)[]>();
    constructor(public id: string) {
        peers.push(this);
    }
    on(event: string, listener: (...args: unknown[]) => void) {
        this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
        return this;
    }
    emit(event: string, ...args: unknown[]) {
        this.listeners.get(event)?.forEach(listener => listener(...args));
    }
    destroy() {
        if (this.destroyed) return;
        // As PeerJS does: "disconnected" goes out before the peer counts as destroyed.
        this.disconnected = true;
        this.emit('disconnected', this.id);
        this.destroyed = true;
    }
    /** The server turned the id down: PeerJS destroys the peer, then reports the error. */
    rejectId() {
        this.destroy();
        this.emit('error', { type: 'unavailable-id' });
    }
}

vi.mock("peerjs", () => ({ Peer: FakePeer }));

const { openHost } = await import("@modules/remoteControl/peerTransport.ts");

describe("openHost", () => {
    beforeEach(() => {
        peers.length = 0;
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    const events = () => ({ ready: vi.fn(), offline: vi.fn(), connection: vi.fn() });

    it("starts over, without reconnecting the destroyed peer, when the id is taken", async () => {
        const handlers = events();
        const host = openHost('abc', handlers);
        await vi.waitFor(() => expect(peers).toHaveLength(1));

        peers[0].rejectId();
        await Promise.resolve();
        expect(handlers.offline.mock.calls).toEqual([['unavailable-id']]);

        await vi.advanceTimersByTimeAsync(5000);
        expect(peers[0].reconnect).not.toHaveBeenCalled();
        expect(peers).toHaveLength(2);
        host.close();
    });

    it("reconnects a peer that only lost the server", async () => {
        const handlers = events();
        const host = openHost('abc', handlers);
        await vi.waitFor(() => expect(peers).toHaveLength(1));

        peers[0].disconnected = true;
        peers[0].emit('disconnected', peers[0].id);
        await Promise.resolve();
        expect(handlers.offline.mock.calls).toEqual([['disconnected']]);

        await vi.advanceTimersByTimeAsync(5000);
        expect(peers[0].reconnect).toHaveBeenCalledTimes(1);
        expect(peers).toHaveLength(1);
        host.close();
    });
});
