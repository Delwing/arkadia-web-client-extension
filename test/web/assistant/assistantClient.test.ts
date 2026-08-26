/**
 * Wire-level behaviour of the assistant transport: SSE framing, the `restart`
 * contract, terminal error statuses and the shape translation that keeps the
 * Worker's vocabulary from leaking into the validator.
 */
import { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { askAssistant, toValidatorInput, type AssistantEvent } from '@web/assistant/assistantClient';
import { resetKnowledgeBundleCache } from '@web/assistant/knowledgeBundleClient';

const WORKER = 'http://localhost:8787';

// jsdom ships no streams; the transport is stream-shaped by nature.
(globalThis as unknown as { ReadableStream?: unknown }).ReadableStream ??= NodeReadableStream;

function sseBody(frames: unknown[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const payload = frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join('');
    return new ReadableStream<Uint8Array>({
        start(controller) {
            // Split mid-frame on purpose: the reader must not assume one chunk
            // equals one frame.
            const bytes = encoder.encode(payload);
            const half = Math.floor(bytes.length / 2);
            controller.enqueue(bytes.slice(0, half));
            controller.enqueue(bytes.slice(half));
            controller.close();
        },
    });
}

function stubFetch(handler: (url: string) => Response) {
    globalThis.fetch = jest.fn((input: RequestInfo | URL) =>
        Promise.resolve(handler(String(input)))) as unknown as typeof fetch;
}

/** Answers the knowledge-bundle request, delegates everything else. */
function routed(askResponse: () => Response) {
    return (url: string): Response => {
        if (url.includes('assistant-kb.json')) {
            return new Response(JSON.stringify({ version: 'test-kb', schemas: {}, index: {} }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        }
        return askResponse();
    };
}

function sseResponse(frames: unknown[]): Response {
    return new Response(sseBody(frames), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
    });
}

async function collect(question = 'jak ustawic trigger'): Promise<AssistantEvent[]> {
    const events: AssistantEvent[] = [];
    await askAssistant({ question, onEvent: event => events.push(event) });
    return events;
}

describe('toValidatorInput', () => {
    it('renames the Worker vocabulary onto the validator vocabulary', () => {
        expect(toValidatorInput({ kind: 'settings', key: 'lowHpAlert', value: 3, label: 'Prog HP' }))
            .toEqual({ kind: 'settingChange', key: 'lowHpAlert', value: 3, reason: 'Prog HP' });
    });

    it('maps triggerType onto type', () => {
        expect(toValidatorInput({ kind: 'trigger', triggerType: 'event', event: 'kill', macros: [] }))
            .toEqual({ kind: 'trigger', type: 'event', event: 'kill', macros: [] });
    });

    it('leaves an already-conforming proposal alone', () => {
        const input = { kind: 'alias', pattern: 'zz', command: 'zabij' };
        expect(toValidatorInput(input)).toEqual(input);
    });
});

describe('askAssistant over the Worker', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem('arkadia.assistantWorkerUrl', WORKER);
        resetKnowledgeBundleCache();
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        localStorage.clear();
    });

    it('streams deltas and validated proposals, then finishes', async () => {
        stubFetch(routed(() => sseResponse([
            { type: 'delta', text: 'Aby ustawic trigger, ' },
            { type: 'delta', text: 'otworz ustawienia.' },
            {
                type: 'proposals',
                proposals: [{
                    kind: 'trigger',
                    triggerType: 'event',
                    event: 'kill',
                    label: 'Trigger na zabicie',
                    macros: [{ type: 'command', command: 'zbierz wszystko' }],
                }],
            },
            { type: 'done', quota: { used: 1, limit: 5, resetsAt: 0 } },
        ])));

        const events = await collect();

        expect(events.filter(e => e.type === 'delta').map(e => (e as { text: string }).text).join(''))
            .toBe('Aby ustawic trigger, otworz ustawienia.');

        const proposals = events.find(e => e.type === 'proposals') as { results: { ok: boolean }[] };
        expect(proposals.results).toHaveLength(1);
        expect(proposals.results[0].ok).toBe(true);

        expect(events.at(-1)).toMatchObject({ type: 'done', via: 'worker' });
    });

    it('sends the knowledge bundle version as kbVersion', async () => {
        stubFetch(routed(() => sseResponse([{ type: 'done' }])));

        await collect();

        const askCall = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } })
            .mock.calls.find(call => String(call[0]).includes('/ask'));
        expect(askCall).toBeDefined();
        expect(JSON.parse(String(askCall![1].body))).toMatchObject({ kbVersion: 'test-kb' });
    });

    it('passes the restart frame through so the panel can discard partial text', async () => {
        stubFetch(routed(() => sseResponse([
            { type: 'delta', text: 'polowa odpowiedzi' },
            { type: 'restart', source: 'gemini-1' },
            { type: 'delta', text: 'pelna odpowiedz' },
            { type: 'done' },
        ])));

        const events = await collect();

        expect(events.map(e => e.type)).toEqual(['delta', 'restart', 'delta', 'done']);
    });

    it('surfaces pool_exhausted as a terminal error when no own key is set', async () => {
        stubFetch(routed(() => sseResponse([
            { type: 'error', status: 'pool_exhausted', message: 'Wszyscy dostawcy sa chwilowo niedostepni.', retryAfter: 3600 },
        ])));

        const events = await collect();

        expect(events).toEqual([expect.objectContaining({
            type: 'error',
            status: 'pool_exhausted',
            retryAfter: 3600,
        })]);
    });

    it('reports a non-streaming HTTP failure with its structured status', async () => {
        stubFetch(routed(() => new Response(
            JSON.stringify({ status: 'quota_exceeded', message: 'Limit wyczerpany' }),
            { status: 429, headers: { 'content-type': 'application/json' } },
        )));

        const events = await collect();

        expect(events).toEqual([expect.objectContaining({ type: 'error', status: 'quota_exceeded' })]);
    });

    it('drops proposals that fail validation instead of rendering them', async () => {
        stubFetch(routed(() => sseResponse([
            { type: 'proposals', proposals: [{ kind: 'settings', key: 'zmyslonyKlucz', value: 1 }] },
            { type: 'done' },
        ])));

        const events = await collect();
        const proposals = events.find(e => e.type === 'proposals') as { results: { ok: boolean }[] };

        expect(proposals.results[0].ok).toBe(false);
    });

    it('falls back to the user key when the shared pool is exhausted', async () => {
        localStorage.setItem('arkadia.assistantApiKey', 'test-key');
        let askCalls = 0;
        stubFetch((url: string) => {
            if (url.includes('assistant-kb.json')) {
                return new Response(JSON.stringify({
                    version: 'test-kb',
                    schemas: {},
                    index: { format: [], panels: [], settings: [], commands: [], events: [], docs: [] },
                }), { status: 200, headers: { 'content-type': 'application/json' } });
            }
            if (url.includes('/ask')) {
                askCalls++;
                return sseResponse([{ type: 'error', status: 'pool_exhausted', message: 'pusto' }]);
            }
            // The BYOK provider: OpenAI-compatible streaming chunks.
            return sseResponse([
                { choices: [{ delta: { content: 'Odpowiedz z mojego klucza.' } }] },
            ]);
        });

        const events = await collect();

        expect(askCalls).toBe(1);
        expect(events.map(e => e.type)).toEqual(['notice', 'delta', 'proposals', 'done']);
        expect(events.at(-1)).toMatchObject({ type: 'done', via: 'byok' });
    });

    it('does not leave a blank turn when the stream carries no frames', async () => {
        stubFetch(routed(() => sseResponse([])));

        const events = await collect();

        expect(events).toEqual([expect.objectContaining({
            type: 'error',
            status: 'internal_error',
            message: expect.stringContaining('bez zadnej odpowiedzi'),
        })]);
    });

    it('errors clearly when neither a Worker nor a key is configured', async () => {
        localStorage.clear();
        localStorage.setItem('arkadia.assistantWorkerUrl', '');
        stubFetch(routed(() => sseResponse([{ type: 'done' }])));

        const events: AssistantEvent[] = [];
        await askAssistant({ question: 'test', onEvent: e => events.push(e) });

        expect(events).toEqual([expect.objectContaining({ type: 'error', status: 'not_configured' })]);
    });
});
