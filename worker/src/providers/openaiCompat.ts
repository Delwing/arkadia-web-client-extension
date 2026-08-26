/**
 * OpenAI-compatible chat-completions adapter.
 *
 * Serves Groq (`https://api.groq.com/openai/v1`), OpenRouter
 * (`https://openrouter.ai/api/v1`) and — when a pool entry opts in via
 * `baseUrl` — Gemini's OpenAI-compatibility surface
 * (`https://generativelanguage.googleapis.com/v1beta/openai`).
 *
 * Wire format verified 2026-08-25 against console.groq.com/docs and
 * openrouter.ai/docs: data-only SSE frames, delta at
 * `choices[0].delta.content`, terminated by `data: [DONE]`.
 */

import type { PoolEntry } from '../config';
import { parseSse, parseJson } from '../sse';
import { isQuotaError } from '../cooldown';
import { ProviderError, type ProviderAdapter, type ProviderRequest } from './types';

const BASE_URLS: Record<string, string> = {
    groq: 'https://api.groq.com/openai/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
};

interface ChatChunk {
    choices?: Array<{
        delta?: { content?: string | null };
        finish_reason?: string | null;
    }>;
    /**
     * OpenRouter documents that once the first token is written the 200 and its
     * headers are committed, so a later failure "must arrive in-band as an SSE
     * event". This is that event.
     */
    error?: { code?: number | string; message?: string; metadata?: unknown };
}

export const openaiCompatAdapter: ProviderAdapter = {
    async stream(
        entry: PoolEntry,
        request: ProviderRequest,
        fetchImpl: typeof fetch,
    ): Promise<AsyncGenerator<string>> {
        const base = entry.baseUrl ?? BASE_URLS[entry.provider];
        if (!base) {
            throw new ProviderError(
                `no base URL for provider ${entry.provider}`,
                0,
                null,
                null,
                false,
            );
        }

        const headers: Record<string, string> = {
            'content-type': 'application/json',
            authorization: `Bearer ${entry.apiKey}`,
        };
        if (entry.provider === 'openrouter') {
            // Optional per OpenRouter docs — they only affect leaderboard attribution,
            // but identifying ourselves is polite and aids support requests.
            headers['HTTP-Referer'] = 'https://arkadia-client.pages.dev';
            headers['X-Title'] = 'Arkadia Web Client';
        }

        const response = await fetchImpl(`${base}/chat/completions`, {
            method: 'POST',
            headers,
            signal: request.signal,
            body: JSON.stringify({
                model: entry.model,
                stream: true,
                max_tokens: request.maxOutputTokens,
                temperature: 0.3,
                messages: [
                    { role: 'system', content: request.systemPrompt },
                    { role: 'user', content: request.userMessage },
                ],
            }),
        });

        if (!response.ok || !response.body) {
            const body = await safeJson(response);
            throw new ProviderError(
                `${entry.provider} HTTP ${response.status}`,
                response.status,
                body,
                response.headers,
                isQuotaError(response.status, body),
            );
        }

        return iterate(entry, response);
    },
};

async function* iterate(entry: PoolEntry, response: Response): AsyncGenerator<string> {
    for await (const frame of parseSse(response.body!)) {
        if (frame.data === '[DONE]') return;
        const chunk = parseJson(frame.data) as ChatChunk | null;
        if (!chunk) continue;

        // Check for the in-band error BEFORE reading deltas — the frame carrying it
        // may also carry a `choices` array with `finish_reason: "error"`.
        if (chunk.error) {
            const status = normalizeStatus(chunk.error.code);
            throw new ProviderError(
                `${entry.provider} mid-stream: ${chunk.error.message ?? 'unknown'}`,
                status,
                chunk,
                response.headers,
                isQuotaError(status, chunk),
            );
        }

        const text = chunk.choices?.[0]?.delta?.content;
        if (typeof text === 'string' && text.length > 0) yield text;
    }
}

/** Error codes arrive as numbers (OpenRouter) or strings; normalise to a status. */
function normalizeStatus(code: number | string | undefined): number {
    if (typeof code === 'number' && Number.isFinite(code)) return code;
    const text = String(code ?? '').toLowerCase();
    if (text.includes('rate_limit') || text.includes('quota')) return 429;
    return 500;
}

async function safeJson(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        return null;
    }
}
