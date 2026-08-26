/**
 * Browser-side SSE frame reader.
 *
 * Mirrors `worker/src/sse.ts` (same field handling, same CRLF normalisation)
 * but reads a `fetch` response body instead of a Worker stream. Hand-written
 * for the same reason the Worker's is: `EventSource` cannot issue a POST, and
 * both the Worker (`data:` only) and the BYOK providers (`data:` plus named
 * `event:` frames) have to be parsed by the same loop.
 */

export interface SseFrame {
    /** `event:` field, or undefined for data-only frames. */
    event?: string;
    /** Concatenated `data:` lines. */
    data: string;
}

/** Parse a `fetch` response body into SSE frames. */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            buffer = buffer.replace(/\r\n/g, '\n');

            let separator: number;
            while ((separator = buffer.indexOf('\n\n')) !== -1) {
                const raw = buffer.slice(0, separator);
                buffer = buffer.slice(separator + 2);
                const frame = parseFrame(raw);
                if (frame) yield frame;
            }
        }
        const tail = parseFrame(buffer.replace(/\r\n/g, '\n'));
        if (tail) yield tail;
    } finally {
        try {
            reader.releaseLock();
        } catch {
            /* already released */
        }
    }
}

function parseFrame(raw: string): SseFrame | null {
    if (!raw.trim()) return null;
    let event: string | undefined;
    const dataLines: string[] = [];

    for (const line of raw.split('\n')) {
        if (!line || line.startsWith(':')) continue; // comment / keep-alive
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        let value = colon === -1 ? '' : line.slice(colon + 1);
        if (value.startsWith(' ')) value = value.slice(1);

        if (field === 'event') event = value;
        else if (field === 'data') dataLines.push(value);
    }

    if (dataLines.length === 0 && !event) return null;
    return { event, data: dataLines.join('\n') };
}

/** Safe JSON parse for SSE payloads; returns null rather than throwing. */
export function parseSseJson(data: string): unknown {
    if (!data || data === '[DONE]') return null;
    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
}
