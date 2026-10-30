import type { ProviderName } from '../config';
import type { ProviderAdapter } from './types';
import { geminiAdapter } from './gemini';
import { openaiCompatAdapter } from './openaiCompat';
import { mockAdapter } from './mock';

/**
 * Adapter registry.
 *
 * Gemini defaults to its native `streamGenerateContent` surface, but a Gemini
 * pool entry that sets `baseUrl` to the OpenAI-compatibility path is routed
 * through the OpenAI-compatible adapter instead — the escape hatch if the native
 * surface ever fails. See providers/gemini.ts for why it is not Interactions.
 */
export function adapterFor(provider: ProviderName, baseUrl?: string): ProviderAdapter {
    if (provider === 'mock') return mockAdapter;
    if (provider === 'gemini') {
        return baseUrl?.includes('/openai') ? openaiCompatAdapter : geminiAdapter;
    }
    return openaiCompatAdapter;
}

export { ProviderError } from './types';
export type { ProviderAdapter, ProviderRequest } from './types';
