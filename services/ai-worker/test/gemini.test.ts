/**
 * The Gemini adapter, pinned to the request shape Google actually answers.
 *
 * This file exists because the adapter shipped with no test and called an
 * endpoint (`/v1beta/interactions`) that these models do not serve. Nothing
 * failed loudly: the request hung, no bytes were written, and the only symptom
 * was the client's 60 s watchdog reporting "the assistant server is not
 * responding". Every other layer — SSE, prompt building, cache, quota, the whole
 * router — was healthy, which made it look like anything but a wrong URL.
 *
 * So the first assertion here is about the URL. It is the cheapest possible
 * check and it would have caught the entire outage.
 */

import { describe, expect, it } from 'vitest';
import type { PoolEntry } from '../src/config';
import { geminiAdapter } from '../src/providers/gemini';
import { ProviderError } from '../src/providers/types';

function entry(overrides: Partial<PoolEntry> = {}): PoolEntry {
    return {
        id: 'gemini-1',
        provider: 'gemini',
        model: 'gemini-3.5-flash-lite',
        apiKey: 'test-key',
        priority: 10,
        maxPromptTokens: 60_000,
        maxOutputTokens: 1_500,
        supportsToolLoop: true,
        ...overrides,
    } as PoolEntry;
}

const REQUEST = {
    systemPrompt: 'SYSTEM',
    userMessage: 'Jak wlaczyc mape?',
    maxOutputTokens: 1_500,
};

/** An SSE body in the exact frame shape a real `streamGenerateContent` returns. */
function sseBody(chunks: unknown[]): ReadableStream<Uint8Array> {
    const text = chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('');
    return new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode(text));
            controller.close();
        },
    });
}

function okResponse(chunks: unknown[]): Response {
    return new Response(sseBody(chunks), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
    });
}

async function collect(gen: AsyncGenerator<string>): Promise<string> {
    let out = '';
    for await (const piece of gen) out += piece;
    return out;
}

describe('gemini adapter', () => {
    it('posts to streamGenerateContent, not interactions', async () => {
        let seenUrl = '';
        let seenBody: Record<string, unknown> = {};
        let seenHeaders: Record<string, string> = {};

        const fetchImpl = (async (url: string, init: RequestInit) => {
            seenUrl = String(url);
            seenBody = JSON.parse(String(init.body));
            seenHeaders = init.headers as Record<string, string>;
            return okResponse([{ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }]);
        }) as unknown as typeof fetch;

        await geminiAdapter.stream(entry(), REQUEST, fetchImpl);

        expect(seenUrl).toBe(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:streamGenerateContent?alt=sse',
        );
        expect(seenUrl).not.toContain('/interactions');

        // The classic surface names these fields in camelCase and rejects the
        // Interactions spellings (`system_instruction`, `input`, `store`).
        expect(Object.keys(seenBody).sort()).toEqual([
            'contents',
            'generationConfig',
            'systemInstruction',
        ]);
        expect(seenHeaders['x-goog-api-key']).toBe('test-key');
        expect(seenHeaders).not.toHaveProperty('Api-Revision');
    });

    it('concatenates text parts across frames', async () => {
        const fetchImpl = (async () =>
            okResponse([
                { candidates: [{ content: { parts: [{ text: 'Mape ' }] } }] },
                { candidates: [{ content: { parts: [{ text: 'wlaczysz ' }, { text: 'tak.' }] } }] },
            ])) as unknown as typeof fetch;

        const text = await collect(await geminiAdapter.stream(entry(), REQUEST, fetchImpl));
        expect(text).toBe('Mape wlaczysz tak.');
    });

    it('drops reasoning parts so the monologue never reaches the player', async () => {
        const fetchImpl = (async () =>
            okResponse([
                { candidates: [{ content: { parts: [{ text: 'rozwazam...', thought: true }] } }] },
                { candidates: [{ content: { parts: [{ text: 'Odpowiedz.' }] } }] },
            ])) as unknown as typeof fetch;

        const text = await collect(await geminiAdapter.stream(entry(), REQUEST, fetchImpl));
        expect(text).toBe('Odpowiedz.');
    });

    it('raises a quota error for a mid-stream 429 so the router fails over', async () => {
        // A 200 that turns into an error partway through is the case that must not
        // be mistaken for a successful empty answer.
        const fetchImpl = (async () =>
            okResponse([
                { candidates: [{ content: { parts: [{ text: 'czesc' }] } }] },
                { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'quota' } },
            ])) as unknown as typeof fetch;

        const gen = await geminiAdapter.stream(entry(), REQUEST, fetchImpl);
        await expect(collect(gen)).rejects.toMatchObject({ quota: true, status: 429 });
    });

    it('raises a non-quota ProviderError for a failed request', async () => {
        const fetchImpl = (async () =>
            new Response(JSON.stringify({ error: { code: 400, message: 'bad' } }), {
                status: 400,
            })) as unknown as typeof fetch;

        await expect(geminiAdapter.stream(entry(), REQUEST, fetchImpl)).rejects.toBeInstanceOf(
            ProviderError,
        );
        await expect(geminiAdapter.stream(entry(), REQUEST, fetchImpl)).rejects.toMatchObject({
            quota: false,
        });
    });
});
