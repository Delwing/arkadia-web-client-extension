import type { PoolEntry } from '../config';

export interface ProviderRequest {
    systemPrompt: string;
    userMessage: string;
    maxOutputTokens: number;
    signal?: AbortSignal;
}

/**
 * Raised for any provider failure. `quota` distinguishes "this key is spent,
 * fail over" from "this request was bad, failing over will not help".
 */
export class ProviderError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly body: unknown,
        readonly headers: Headers | null,
        readonly quota: boolean,
    ) {
        super(message);
        this.name = 'ProviderError';
    }
}

export interface ProviderAdapter {
    /**
     * Start a streaming completion.
     *
     * Throws `ProviderError` if the initial response is not OK. The returned
     * generator yields text deltas and may itself throw `ProviderError` — several
     * providers (OpenRouter explicitly, documented) commit a 200 and only then
     * report a rate limit as an in-band SSE frame.
     */
    stream(
        entry: PoolEntry,
        request: ProviderRequest,
        fetchImpl: typeof fetch,
    ): Promise<AsyncGenerator<string>>;
}
