/**
 * Mock provider — the keyless local smoke-test path.
 *
 * `wrangler dev` with the mock pool entry exercises the entire request path
 * (origin check, Turnstile gate, quota, cache, router, streaming, proposal
 * extraction) with zero real API keys and zero network access.
 *
 * It also lets the failover logic be driven deliberately: a question containing
 * a magic token makes the mock fail in a specific way, so you can watch the
 * router cool an entry and move to the next one.
 *
 *   __force429   → short (30s) rate limit; cools this entry in memory only, so
 *                  the router fails over but /health still shows it healthy —
 *                  short cooldowns are deliberately not persisted
 *   __forcequota → 6h daily-quota exhaustion; long enough to be written to KV,
 *                  so /health reports it cooling
 *   __force500   → non-quota error, router fails over without cooling
 *   __forcemid   → succeeds, then errors mid-stream after a few tokens
 *
 * A bare token affects every mock entry, which exercises graceful exhaustion.
 * Suffix it with `@<entry-id>` to target one entry — `__force429@mock-primary`
 * makes the primary fail and the secondary answer, which is the failover path.
 */

import type { PoolEntry } from '../config';
import { ProviderError, type ProviderAdapter, type ProviderRequest } from './types';

const CANNED_ANSWER = [
    'Aby ustawic trigger na zabicie przeciwnika, otworz Ustawienia, ',
    'przejdz do zakladki Triggery i dodaj nowy trigger typu zdarzenie. ',
    'Wybierz zdarzenie `kill`, a nastepnie dodaj makro `command`, ',
    'ktore wysle wybrana przez ciebie komende do gry.\n\n',
];

/** Emitted verbatim so the proposal extractor is exercised end to end. */
const CANNED_PROPOSALS = `\`\`\`proposals
[
  {
    "kind": "trigger",
    "type": "event",
    "event": "kill",
    "label": "Trigger na zabicie",
    "macros": [{ "type": "command", "command": "zbierz wszystko" }]
  }
]
\`\`\``;

export const mockAdapter: ProviderAdapter = {
    async stream(entry: PoolEntry, request: ProviderRequest): Promise<AsyncGenerator<string>> {
        const probe = `${request.userMessage} ${request.systemPrompt}`.toLowerCase();

        /**
         * True when `token` is present and either untargeted, or targeted at this
         * entry via a `@<entry-id>` suffix.
         */
        const forced = (token: string): boolean => {
            const at = probe.indexOf(token);
            if (at === -1) return false;
            const rest = probe.slice(at + token.length);
            if (!rest.startsWith('@')) return true; // untargeted: every entry fails
            const target = rest.slice(1).split(/[\s,]/)[0];
            return target === entry.id.toLowerCase();
        };

        if (forced('__forcequota')) {
            throw new ProviderError(
                `mock ${entry.id} forced daily quota exhaustion`,
                429,
                { error: { message: 'forced daily quota exhaustion for testing' } },
                new Headers({ 'retry-after': String(6 * 60 * 60) }),
                true,
            );
        }
        if (forced('__force429')) {
            throw new ProviderError(
                `mock ${entry.id} forced 429`,
                429,
                { error: { message: 'forced rate limit for testing' } },
                new Headers({ 'retry-after': '30' }),
                true,
            );
        }
        if (forced('__force500')) {
            throw new ProviderError(
                `mock ${entry.id} forced 500`,
                500,
                { error: { message: 'forced upstream failure' } },
                null,
                false,
            );
        }

        return generate(entry, forced('__forcemid'));
    },
};

async function* generate(entry: PoolEntry, failMidStream: boolean): AsyncGenerator<string> {
    yield `[mock:${entry.id}] `;
    let emitted = 0;
    for (const piece of CANNED_ANSWER) {
        if (failMidStream && emitted === 2) {
            throw new ProviderError(
                `mock ${entry.id} forced mid-stream failure`,
                429,
                { error: { code: 429, message: 'forced mid-stream rate limit' } },
                null,
                true,
            );
        }
        emitted++;
        yield piece;
    }
    // Only well-behaved entries are asked for structured proposals.
    if (entry.supportsToolLoop) yield CANNED_PROPOSALS;
}
