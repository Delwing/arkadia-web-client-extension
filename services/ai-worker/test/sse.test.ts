/**
 * SSE parsing. The three providers disagree about framing, and Gemini's
 * Interactions API needs the `event:` name read, so this is worth pinning down.
 */

import { describe, expect, it } from 'vitest';
import { formatSse, parseJson, parseSse } from '../src/sse';
import { collect, sseStream } from './helpers';

describe('parseSse', () => {
    it('parses data-only frames (Groq / OpenRouter shape)', async () => {
        const frames = await collect(
            parseSse(sseStream(['data: {"a":1}\n\n', 'data: {"b":2}\n\n'])),
        );
        expect(frames.map(f => f.data)).toEqual(['{"a":1}', '{"b":2}']);
    });

    it('parses named events (Gemini Interactions shape)', async () => {
        const frames = await collect(
            parseSse(sseStream(['event: step.delta\ndata: {"delta":{"text":"hi"}}\n\n'])),
        );
        expect(frames[0].event).toBe('step.delta');
        expect(frames[0].data).toBe('{"delta":{"text":"hi"}}');
    });

    it('reassembles frames split across chunk boundaries', async () => {
        const frames = await collect(parseSse(sseStream(['data: {"a"', ':1}\n', '\n'])));
        expect(frames).toHaveLength(1);
        expect(frames[0].data).toBe('{"a":1}');
    });

    it('normalises CRLF, which proxies sometimes introduce', async () => {
        // A stray \r left on the value breaks JSON.parse in a very confusing way.
        const frames = await collect(parseSse(sseStream(['data: {"a":1}\r\n\r\n'])));
        expect(frames[0].data).toBe('{"a":1}');
    });

    it('joins repeated data lines with newlines, per spec', async () => {
        const frames = await collect(parseSse(sseStream(['data: one\ndata: two\n\n'])));
        expect(frames[0].data).toBe('one\ntwo');
    });

    it('ignores comment/keep-alive lines', async () => {
        const frames = await collect(parseSse(sseStream([': keep-alive\n\ndata: x\n\n'])));
        expect(frames.map(f => f.data)).toEqual(['x']);
    });

    it('flushes a trailing frame with no terminating blank line', async () => {
        const frames = await collect(parseSse(sseStream(['data: [DONE]'])));
        expect(frames[0].data).toBe('[DONE]');
    });

    it('strips exactly one leading space after the colon', async () => {
        const frames = await collect(parseSse(sseStream(['data:  two-spaces\n\n'])));
        expect(frames[0].data).toBe(' two-spaces');
    });

    it('yields nothing for an empty stream', async () => {
        expect(await collect(parseSse(sseStream([])))).toEqual([]);
    });
});

describe('parseJson', () => {
    it('parses valid payloads', () => {
        expect(parseJson('{"a":1}')).toEqual({ a: 1 });
    });

    it('returns null for the DONE sentinel and for junk', () => {
        expect(parseJson('[DONE]')).toBeNull();
        expect(parseJson('not json')).toBeNull();
        expect(parseJson('')).toBeNull();
    });
});

describe('formatSse', () => {
    it('emits a well-formed frame', () => {
        expect(formatSse({ type: 'delta', text: 'hi' })).toBe(
            'data: {"type":"delta","text":"hi"}\n\n',
        );
    });

    it('escapes newlines so multi-line text cannot break framing', () => {
        const frame = formatSse({ text: 'line1\nline2' });
        expect(frame.split('\n\n')).toHaveLength(2);
    });
});
