/**
 * Minimal SSE parsing and emission.
 *
 * Written by hand rather than pulled from a library because the Workers free
 * plan gives each invocation only 10 ms of CPU, and because the three providers
 * disagree about the framing: Groq and OpenRouter emit data-only frames, while
 * Gemini's Interactions API emits *named* events (`step.delta`, `interaction.
 * completed`, `done`) whose name must be read to know what the payload means.
 */

export interface SseFrame {
    /** `event:` field, or undefined for data-only frames. */
    event?: string;
    /** Concatenated `data:` lines. */
    data: string;
}

/**
 * Parse a byte stream into SSE frames.
 *
 * Handles the parts of the spec that actually occur in the wild: `event:`,
 * `data:` (repeatable, newline-joined), comment lines starting `:`, and the
 * blank line as frame terminator. Ignores `id:` and `retry:`.
 */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // Frames are separated by a blank line. Normalise CRLF first — some
            // proxies rewrite line endings and a missed \r leaves `data:` values with
            // a trailing carriage return that breaks JSON.parse.
            buffer = buffer.replace(/\r\n/g, '\n');

            let separator: number;
            while ((separator = buffer.indexOf('\n\n')) !== -1) {
                const raw = buffer.slice(0, separator);
                buffer = buffer.slice(separator + 2);
                const frame = parseFrame(raw);
                if (frame) yield frame;
            }
        }
        // Flush a trailing frame that arrived without its terminating blank line.
        const tail = parseFrame(buffer.replace(/\r\n/g, '\n'));
        if (tail) yield tail;
    } finally {
        // Releasing matters: an abandoned reader keeps the subrequest open and
        // counts against the 6-simultaneous-connections limit.
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
        // Per spec a single leading space after the colon is stripped.
        let value = colon === -1 ? '' : line.slice(colon + 1);
        if (value.startsWith(' ')) value = value.slice(1);

        if (field === 'event') event = value;
        else if (field === 'data') dataLines.push(value);
    }

    if (dataLines.length === 0 && !event) return null;
    return { event, data: dataLines.join('\n') };
}

/** Safe JSON parse for SSE payloads; returns null rather than throwing. */
export function parseJson(data: string): unknown {
    if (!data || data === '[DONE]') return null;
    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
}

/** Format one SSE frame for the client. */
export function formatSse(payload: unknown): string {
    return `data: ${JSON.stringify(payload)}\n\n`;
}
