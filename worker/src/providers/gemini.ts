/**
 * Gemini native adapter — `streamGenerateContent`.
 *
 * ## Why not the Interactions API
 *
 * This adapter originally targeted `POST /v1beta/interactions`, on the reasoning
 * that Google's guides describe `generateContent` as "legacy" and point new work
 * at Interactions. That reasoning was sound and the result did not work: every
 * request hung until the client's 60 s idle watchdog fired, with no bytes and no
 * error, which reads from the UI as "the assistant server is down".
 *
 * Measured 2026-08-26 against a real key, same model, same machine:
 *
 *   POST /v1beta/models/gemini-3.5-flash-lite:streamGenerateContent?alt=sse
 *     -> HTTP 200 in 0.75 s, SSE frames, correct answer
 *   POST /v1beta/interactions?alt=sse   (Gemini-style body)
 *     -> HTTP 400 "Unknown parameter 'contents'"
 *
 * And `GET /v1beta/models/{id}` reports, for every flash/lite model on this key:
 *
 *   supportedGenerationMethods: generateContent, countTokens,
 *                               createCachedContent, batchGenerateContent
 *
 * Interactions is not among them. Whatever the guides recommend in general, it
 * is not a surface these models serve, so this adapter uses the one they do.
 * `generateContent` being called "legacy" is a documentation stance; the model
 * metadata is the fact.
 *
 * ## Escape hatch
 *
 * If this surface ever starts failing, switch the pool entry to Gemini's
 * OpenAI-compatibility endpoint, which routes through `openaiCompat.ts`:
 *
 *   "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai"
 *
 * ## Streaming shape
 *
 * Unnamed SSE frames, one JSON chunk each:
 *   data: {"candidates":[{"content":{"parts":[{"text":"..."}],"role":"model"}}],
 *          "usageMetadata":{...}}
 *
 * A part carrying `"thought": true` is the model's internal reasoning, not its
 * answer, and must be dropped — otherwise the monologue is streamed to the
 * player. Errors can also arrive mid-stream as a `{"error":{...}}` chunk after a
 * 200, so the body is inspected per frame rather than trusted from the status.
 */

import type { PoolEntry } from '../config';
import { parseSse, parseJson } from '../sse';
import { isQuotaError } from '../cooldown';
import { ProviderError, type ProviderAdapter, type ProviderRequest } from './types';

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiPart {
    text?: string;
    /** True on reasoning parts. Absent on answer parts. */
    thought?: boolean;
}

interface GeminiChunk {
    candidates?: { content?: { parts?: GeminiPart[] } }[];
    error?: { code?: number | string; message?: string; status?: string };
}

export const geminiAdapter: ProviderAdapter = {
    async stream(
        entry: PoolEntry,
        request: ProviderRequest,
        fetchImpl: typeof fetch,
    ): Promise<AsyncGenerator<string>> {
        const base = entry.baseUrl ?? DEFAULT_BASE;
        const url = `${base}/models/${encodeURIComponent(entry.model)}:streamGenerateContent?alt=sse`;

        const response = await fetchImpl(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-goog-api-key': entry.apiKey,
            },
            signal: request.signal,
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: request.systemPrompt }] },
                contents: [{ role: 'user', parts: [{ text: request.userMessage }] }],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: request.maxOutputTokens,
                },
            }),
        });

        if (!response.ok || !response.body) {
            const body = await safeJson(response);
            throw new ProviderError(
                `gemini HTTP ${response.status}`,
                response.status,
                body,
                response.headers,
                isQuotaError(response.status, body),
            );
        }

        return iterate(response);
    },
};

async function* iterate(response: Response): AsyncGenerator<string> {
    for await (const frame of parseSse(response.body!)) {
        if (frame.data === '[DONE]') return;

        const payload = parseJson(frame.data) as GeminiChunk | null;
        if (!payload || typeof payload !== 'object') continue;

        if (payload.error) {
            const status = normalizeStatus(payload.error.code ?? payload.error.status);
            throw new ProviderError(
                `gemini mid-stream: ${payload.error.message ?? 'unknown'}`,
                status,
                payload,
                response.headers,
                isQuotaError(status, payload),
            );
        }

        for (const candidate of payload.candidates ?? []) {
            for (const part of candidate.content?.parts ?? []) {
                if (part.thought) continue;
                if (typeof part.text === 'string' && part.text.length > 0) yield part.text;
            }
        }
    }
}

/**
 * `generateContent` errors carry a numeric `code` plus a SCREAMING_SNAKE
 * `status`. The string forms from the Interactions surface are kept too: a pool
 * entry pointed at a different base URL can still produce them, and mapping one
 * extra string is cheaper than a wrong cooldown decision.
 */
function normalizeStatus(code: number | string | undefined): number {
    if (typeof code === 'number' && Number.isFinite(code)) return code;
    const text = String(code ?? '').toLowerCase();
    if (
        text === 'rate_limit_exceeded' ||
        text === 'quota_exceeded' ||
        text.includes('resource_exhausted')
    ) {
        return 429;
    }
    if (text === 'not_found') return 404;
    if (text === 'permission_denied' || text === 'unauthenticated') return 403;
    return 500;
}

async function safeJson(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        return null;
    }
}
