/**
 * Test doubles. Everything here is in-memory — the suite must run with no
 * network access and no wrangler process.
 */

import type { KVLike } from '../src/poolHealth';

export class FakeKV implements KVLike {
    readonly store = new Map<string, string>();
    writes = 0;
    reads = 0;
    /** Set to make every operation throw, to exercise the fail-open paths. */
    broken = false;

    async get(key: string): Promise<string | null> {
        if (this.broken) throw new Error('kv down');
        this.reads++;
        return this.store.get(key) ?? null;
    }

    async put(key: string, value: string): Promise<void> {
        if (this.broken) throw new Error('kv down');
        this.writes++;
        this.store.set(key, value);
    }

    async delete(key: string): Promise<void> {
        if (this.broken) throw new Error('kv down');
        this.store.delete(key);
    }
}

/** A controllable clock, so cooldown expiry is testable without waiting. */
export class FakeClock {
    constructor(private current: number = 1_700_000_000_000) {}
    now = (): number => this.current;
    advance(ms: number): void {
        this.current += ms;
    }
}

/** Build a Headers object from a plain record. */
export function headers(values: Record<string, string>): Headers {
    return new Headers(values);
}

/** Turn a list of SSE frame strings into a ReadableStream of bytes. */
export function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
            controller.close();
        },
    });
}

/** Drain an async generator into an array. */
export async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
    const out: T[] = [];
    for await (const item of source) out.push(item);
    return out;
}
