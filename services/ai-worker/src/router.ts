/**
 * The failover router.
 *
 * Walks the pool in quality order, skipping entries that are cooling down, and
 * retries the *same question* on the next entry when one rate-limits. The user
 * experience target is "one slightly slower answer", never an error.
 *
 * ## Mid-stream failure
 *
 * The awkward case is a provider that commits an HTTP 200, streams some text,
 * and only then reports a rate limit. OpenRouter documents this explicitly:
 * once the first token is written the status and headers are already sent, so
 * the error "must arrive in-band as an SSE event".
 *
 * Two situations, handled differently:
 *
 *  - **Nothing emitted yet** (the overwhelmingly common case — a 429 on the
 *    initial request). Fail over silently. The user sees one answer that took a
 *    little longer to start.
 *  - **Text already emitted.** We cannot un-send it, and resuming from a second
 *    provider mid-sentence would produce visible nonsense. The router emits a
 *    `restart` event instructing the client to discard what it has, then streams
 *    the replacement answer from the next entry. One visible flicker beats a
 *    corrupted answer or a hard failure.
 *
 * ## Cooldown vs plain failure
 *
 * Only quota/rate-limit failures cool an entry. A 500 from a provider is
 * transient and unrelated to our key's standing, so we move on without marking
 * the entry down — cooling it would shrink the pool for a reason that has
 * nothing to do with quota.
 */

import type { PoolEntry, RuntimeConfig } from './config';
import type { PoolHealth } from './poolHealth';
import { resolveCooldownMs } from './cooldown';
import { adapterFor } from './providers';
import { ProviderError } from './providers/types';
import { buildSystemPrompt, estimateTokens } from './prompt';
import { ProposalExtractor } from './proposals';
import type { Proposal } from './types';

export type RouterEvent =
    | { type: 'delta'; text: string }
    | { type: 'restart'; source: string }
    | {
          type: 'result';
          prose: string;
          proposals: Proposal[];
          source: string;
          /** True when this entry got the full knowledge bundle. */
          fullPrompt: boolean;
      }
    | { type: 'exhausted'; retryAfter: number; tried: string[] };

export interface RouterInput {
    question: string;
    userMessage: string;
    config: RuntimeConfig;
    health: PoolHealth;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    now?: () => number;
}

/**
 * Entries that are worth trying right now, in order.
 * Exported so failover ordering can be tested without any network.
 */
export function selectCandidates(pool: PoolEntry[], health: PoolHealth): PoolEntry[] {
    return pool.filter(entry => !health.isCooling(entry.id));
}

export async function* route(input: RouterInput): AsyncGenerator<RouterEvent> {
    const { config, health } = input;
    const fetchImpl = input.fetchImpl ?? fetch;
    const now = input.now ?? (() => Date.now());

    const candidates = selectCandidates(config.pool, health);
    const tried: string[] = [];

    if (candidates.length === 0) {
        yield {
            type: 'exhausted',
            retryAfter: retryAfterSeconds(config.pool, health, now()),
            tried,
        };
        return;
    }

    // Reserve room for the user message and the model's own output, so the
    // system prompt is sized against what is actually left.
    const messageTokens = estimateTokens(input.userMessage);

    let emittedAnything = false;

    for (const entry of candidates) {
        tried.push(entry.id);

        const built = buildSystemPrompt(entry, messageTokens + entry.maxOutputTokens);
        const adapter = adapterFor(entry.provider, entry.baseUrl);
        const extractor = new ProposalExtractor();
        let emittedThisAttempt = false;

        try {
            const stream = await adapter.stream(
                entry,
                {
                    systemPrompt: built.systemPrompt,
                    userMessage: input.userMessage,
                    maxOutputTokens: entry.maxOutputTokens,
                    signal: input.signal,
                },
                fetchImpl,
            );

            for await (const delta of stream) {
                const prose = extractor.push(delta);
                if (!prose) continue;
                if (!emittedThisAttempt && emittedAnything) {
                    // A previous attempt already put text on screen. Tell the client to
                    // throw it away before we start sending the replacement.
                    yield { type: 'restart', source: entry.id };
                }
                emittedThisAttempt = true;
                emittedAnything = true;
                yield { type: 'delta', text: prose };
            }

            const tail = extractor.flushPending();
            if (tail) {
                if (!emittedThisAttempt && emittedAnything) {
                    yield { type: 'restart', source: entry.id };
                }
                emittedThisAttempt = true;
                emittedAnything = true;
                yield { type: 'delta', text: tail };
            }

            const { prose, proposals } = extractor.finish();

            // A provider that returns an empty body without erroring is broken for our
            // purposes; treat it as a failure and fail over rather than showing the
            // user a blank answer.
            if (!prose) {
                health.markCooling(entry.id, 60_000, 'empty response');
                continue;
            }

            health.markHealthy(entry.id);
            yield {
                type: 'result',
                prose,
                // Entries that cannot hold the JSON contract were never asked for
                // proposals; drop anything they produced anyway.
                proposals: entry.supportsToolLoop ? proposals : [],
                source: entry.id,
                fullPrompt: built.full,
            };
            return;
        } catch (error) {
            const failure = asProviderError(error);

            // The client only ever sees `pool_exhausted`, which says nothing about
            // *why* every provider declined — a wrong model id, a rejected header
            // and a real outage all look identical from outside. Diagnosing one
            // meant editing this file and redeploying; log it instead.
            console.error(
                `[pool] ${entry.id} (${entry.provider}/${entry.model}) failed:`,
                `status=${failure.status}`,
                `quota=${failure.quota}`,
                failure.message,
                failure.body ? JSON.stringify(failure.body).slice(0, 300) : '',
            );

            if (failure.quota) {
                const cooldown = resolveCooldownMs(failure.headers, failure.body, now());
                health.markCooling(entry.id, cooldown, `HTTP ${failure.status}`);
            }
            // Non-quota failures are not the key's fault; leave the entry hot and try
            // the next one. If everything is broken the loop still terminates.

            // If this attempt had already emitted text, the next successful attempt
            // will emit a `restart` before its first delta (guarded by
            // `emittedAnything`), so nothing further is needed here.
            continue;
        }
    }

    yield {
        type: 'exhausted',
        retryAfter: retryAfterSeconds(config.pool, health, now()),
        tried,
    };
}

function asProviderError(error: unknown): ProviderError {
    if (error instanceof ProviderError) return error;
    const message = error instanceof Error ? error.message : String(error);
    // An AbortError means the client hung up; anything else is an unknown
    // transport failure. Neither should cool the key.
    return new ProviderError(message, 0, null, null, false);
}

/**
 * Seconds until the pool is worth trying again — the earliest cooldown expiry
 * across all entries. Drives the `pool_exhausted` response so the client knows
 * when to stop offering the clipboard fallback.
 */
function retryAfterSeconds(pool: PoolEntry[], health: PoolHealth, now: number): number {
    if (pool.length === 0) return 3600; // nothing configured at all
    const earliest = health.earliestAvailable(pool.map(entry => entry.id));
    if (earliest === 0) return 60; // available but every attempt failed
    return Math.max(1, Math.ceil((earliest - now) / 1000));
}
