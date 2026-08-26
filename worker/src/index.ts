/**
 * Arkadia AI assistant Worker.
 *
 * `POST /ask` is the only inference endpoint. It takes a question plus
 * structured context — never a prompt — and streams back a Polish answer and
 * any structured proposals.
 *
 * The security property that matters: because the system prompt is built here,
 * from the Worker's own knowledge bundle, there is no request that turns this
 * into a general-purpose LLM proxy. That is what keeps the owner's free-tier
 * keys from being found and drained.
 */

import { loadConfig, isOriginAllowed } from './config';
import { AnswerCache, type CachedAnswer } from './cache';
import { cacheKey, isCacheable, normalizeQuestion } from './normalize';
import { PoolHealth } from './poolHealth';
import { buildUserMessage, PROMPT_VERSION } from './prompt';
import { route } from './router';
import { chargeQuota, checkBurst, quotaSubject, readQuota } from './quota';
import { formatSse } from './sse';
import { passSubject, turnstileGate } from './turnstile';
import { KB_VERSION } from './kb';
import type { AskEvent, AskRequest, Env, ErrorStatus } from './types';

/** Absolute ceiling on the request body, checked before parsing. */
const MAX_BODY_BYTES = 32 * 1024;

export default {
    async fetch(
        request: Request,
        env: Env,
        ctx: { waitUntil(promise: Promise<unknown>): void },
    ): Promise<Response> {
        const url = new URL(request.url);
        const origin = request.headers.get('origin');
        const config = loadConfig(env);

        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: corsHeaders(origin, config.allowedOrigins),
            });
        }

        if (url.pathname === '/health') {
            return handleHealth(env, config, origin);
        }

        if (url.pathname !== '/ask') {
            return json({ error: 'not_found' }, 404, origin, config.allowedOrigins);
        }
        if (request.method !== 'POST') {
            return json({ error: 'method_not_allowed' }, 405, origin, config.allowedOrigins);
        }
        if (!isOriginAllowed(origin, config.allowedOrigins)) {
            return errorResponse(
                'forbidden_origin',
                'Origin not allowed',
                403,
                origin,
                config.allowedOrigins,
            );
        }

        return handleAsk(request, env, ctx, config, origin);
    },
};

async function handleAsk(
    request: Request,
    env: Env,
    ctx: { waitUntil(promise: Promise<unknown>): void },
    config: ReturnType<typeof loadConfig>,
    origin: string | null,
): Promise<Response> {
    const allowed = config.allowedOrigins;

    // --- Size guard, before we spend anything parsing. ---------------------
    const declaredLength = Number(request.headers.get('content-length') ?? '0');
    if (declaredLength > MAX_BODY_BYTES) {
        return errorResponse('too_large', 'Request body too large', 413, origin, allowed);
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
        return errorResponse('too_large', 'Request body too large', 413, origin, allowed);
    }

    let body: AskRequest;
    try {
        body = JSON.parse(raw) as AskRequest;
    } catch {
        return errorResponse('bad_request', 'Malformed JSON', 400, origin, allowed);
    }

    const question = typeof body?.question === 'string' ? body.question.trim() : '';
    if (!question) {
        return errorResponse('bad_request', 'Missing question', 400, origin, allowed);
    }
    if (question.length > config.maxQuestionChars) {
        return errorResponse('too_large', 'Question too long', 413, origin, allowed);
    }

    // The context is caller-controlled; cap it independently of the whole body so
    // a huge context cannot crowd out the question.
    if (body.context !== undefined) {
        if (
            typeof body.context !== 'object' ||
            body.context === null ||
            Array.isArray(body.context)
        ) {
            return errorResponse('bad_request', 'Invalid context', 400, origin, allowed);
        }
        const contextBytes = JSON.stringify(body.context).length;
        if (contextBytes > config.maxContextBytes) {
            return errorResponse('too_large', 'Context too large', 413, origin, allowed);
        }
    }

    const kv = env.AI_KV;
    const salt = env.HASH_SALT ?? 'arkadia-default-salt';
    const ip = request.headers.get('cf-connecting-ip');
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId : null;

    // --- Abuse gates ------------------------------------------------------
    const subject = await quotaSubject(deviceId, ip, salt);

    if (!(await checkBurst(env.BURST_LIMITER, subject))) {
        console.log('[ask] ' + JSON.stringify({ outcome: 'burst_limited' }));
        return errorResponse(
            'quota_exceeded',
            'Zbyt wiele zapytan naraz. Sprobuj za chwile.',
            429,
            origin,
            allowed,
        );
    }

    const gate = await turnstileGate({
        enabled: config.turnstileEnabled,
        secret: config.turnstileSecret,
        token: body.turnstileToken,
        subject: await passSubject(deviceId, ip, salt),
        remoteIp: ip,
        kv,
    });
    if (gate.status === 'challenge_required') {
        console.log('[ask] ' + JSON.stringify({ outcome: 'challenge_required' }));
        return errorResponse('challenge_required', 'Weryfikacja wymagana', 401, origin, allowed);
    }
    if (gate.status === 'challenge_failed') {
        return errorResponse(
            'challenge_failed',
            `Weryfikacja nieudana: ${gate.errorCodes.join(', ')}`,
            403,
            origin,
            allowed,
        );
    }

    // --- Cache lookup -----------------------------------------------------
    // Deliberately before the quota check: a cached answer costs the pool nothing,
    // so it is neither charged nor blocked by an exhausted quota.
    const kbVersion =
        typeof body.kbVersion === 'string' && body.kbVersion ? body.kbVersion : KB_VERSION;
    const cacheable = isCacheable(question);
    const normalizedQuestion = normalizeQuestion(question);
    // Keyed on the prompt fingerprint too, not just the bundle: a persona or
    // section-order change alters every answer, and without this the cache keeps
    // serving the ones produced by the previous prompt.
    const key = await cacheKey(question, `${KB_VERSION}.${PROMPT_VERSION}`);
    const cache = new AnswerCache(kv, getEdgeCache(), {
        ttlSeconds: config.cacheTtlSeconds,
        kvWrites: config.kvCacheWrites,
    });

    if (cacheable) {
        const hit = await cache.get(key);
        if (hit.value) {
            if (hit.tier === 'kv') ctx.waitUntil(cache.promote(key, hit.value));
            console.log('[ask] ' + JSON.stringify({ outcome: 'ok', servedBy: hit.value.source, cached: true, tier: hit.tier }));
            return cachedResponse(hit.value, hit.tier ?? 'kv', origin, allowed, kbVersion);
        }
    }

    // --- Quota ------------------------------------------------------------
    const quota = await readQuota(kv, subject, config.dailyQuota);
    if (quota.exceeded) {
        console.log('[ask] ' + JSON.stringify({ outcome: 'quota_exceeded', quotaUsed: quota.used, quotaLimit: quota.limit }));
        return errorResponse(
            'quota_exceeded',
            `Wykorzystano dzienny limit pytan (${quota.limit}). Limit odnowi sie o polnocy UTC.`,
            429,
            origin,
            allowed,
            Math.ceil((quota.resetsAt - Date.now()) / 1000),
        );
    }

    if (config.pool.length === 0) {
        return errorResponse(
            'pool_exhausted',
            'Brak skonfigurowanych dostawcow',
            503,
            origin,
            allowed,
            3600,
        );
    }

    // --- Live call --------------------------------------------------------
    const health = new PoolHealth(kv);
    await health.load();

    const userMessage = buildUserMessage(question, body.context, config.maxContextBytes);

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const send = (event: AskEvent) => writer.write(encoder.encode(formatSse(event)));

    const pump = (async () => {
        let charged = false;
        /**
         * One structured line per request, for answering "are users hitting
         * limits?" after a few days without shipping an analytics stack.
         *
         * Workers Logs (`observability.enabled` in wrangler.jsonc) captures
         * console output and makes it filterable in the dashboard, so this costs
         * nothing — unlike counters in KV, where the free tier's 1,000 writes/day
         * is the scarcest resource the Worker has and would be spent on
         * telemetry instead of pool health.
         *
         * Emitted once, in `finally`, so a failure is logged as loudly as a
         * success. Never contains the question: these are user messages.
         */
        const started = Date.now();
        let outcome = 'unknown';
        let servedBy = '';
        let quotaUsed = -1;
        try {
            for await (const event of route({
                question,
                userMessage,
                config,
                health,
                signal: request.signal,
            })) {
                switch (event.type) {
                    case 'delta':
                        await send({ type: 'delta', text: event.text });
                        break;
                    case 'restart':
                        await send({ type: 'restart', source: event.source });
                        break;
                    case 'result': {
                        await send({ type: 'proposals', proposals: event.proposals });
                        // Charge only now: the pool was actually used.
                        const charge = await chargeQuota(kv, subject, config.dailyQuota);
                        charged = true;
                        outcome = 'ok';
                        servedBy = event.source;
                        quotaUsed = charge.used;
                        await send({
                            type: 'done',
                            quota: {
                                used: charge.used,
                                limit: charge.limit,
                                resetsAt: charge.resetsAt,
                            },
                        });
                        if (cacheable) {
                            const value: CachedAnswer = {
                                answer: event.prose,
                                proposals: event.proposals,
                                source: event.source,
                                createdAt: Date.now(),
                                kbVersion: KB_VERSION,
                                // Normalized, not raw: enough to tell what a cached
                                // answer is for, without storing what a user typed.
                                normalizedQuestion,
                            };
                            ctx.waitUntil(cache.put(key, value));
                        }
                        break;
                    }
                    case 'exhausted':
                        // The whole point of the structured status: the client falls back to
                        // its clipboard-bridge mode rather than showing a dead end.
                        await send({
                            type: 'error',
                            status: 'pool_exhausted',
                            message: 'Wszyscy dostawcy sa chwilowo niedostepni.',
                            retryAfter: event.retryAfter,
                        });
                        outcome = 'pool_exhausted';
                        break;
                }
            }
        } catch {
            outcome = 'internal_error';
            try {
                await send({
                    type: 'error',
                    status: 'internal_error',
                    message: 'Blad wewnetrzny.',
                });
            } catch {
                /* stream already gone */
            }
        } finally {
            if (!charged) {
                // Nothing to do — an uncharged failure is intentionally free.
            }
            console.log('[ask] ' + JSON.stringify({
                outcome,
                servedBy,
                cached: false,
                quotaUsed,
                quotaLimit: config.dailyQuota,
                poolSize: config.pool.length,
                cooling: config.pool.filter(e => health.isCooling(e.id)).length,
                ms: Date.now() - started,
            }));
            ctx.waitUntil(health.flush());
            try {
                await writer.close();
            } catch {
                /* already closed */
            }
        }
    })();

    ctx.waitUntil(pump);

    return new Response(readable, {
        status: 200,
        headers: {
            ...corsHeaders(origin, allowed),
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-store',
            // Hit-rate measurement: this request reached a provider.
            'x-ai-cache': 'miss',
            'x-ai-kb-version': KB_VERSION,
        },
    });
}

/** Replay a cached answer in the same SSE shape a live call produces. */
function cachedResponse(
    value: CachedAnswer,
    tier: string,
    origin: string | null,
    allowed: string[],
    clientKbVersion: string,
): Response {
    const events: AskEvent[] = [
        { type: 'meta', cached: true, source: value.source, cacheTier: tier },
        { type: 'delta', text: value.answer },
        { type: 'proposals', proposals: value.proposals },
        { type: 'done' },
    ];
    const payload = events.map(event => formatSse(event)).join('');
    return new Response(payload, {
        status: 200,
        headers: {
            ...corsHeaders(origin, allowed),
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-store',
            'x-ai-cache': 'hit',
            'x-ai-cache-tier': tier,
            'x-ai-kb-version': KB_VERSION,
            'x-ai-kb-stale': String(clientKbVersion !== KB_VERSION),
        },
    });
}

/**
 * Operator endpoint. Exposes pool health without revealing keys, so the owner
 * can see which providers are cooling and why.
 */
async function handleHealth(
    env: Env,
    config: ReturnType<typeof loadConfig>,
    origin: string | null,
): Promise<Response> {
    const health = new PoolHealth(env.AI_KV);
    await health.load();
    const snapshot = health.snapshot();
    return json(
        {
            kbVersion: KB_VERSION,
            dailyQuota: config.dailyQuota,
            turnstile: config.turnstileEnabled,
            pool: config.pool.map(entry => ({
                id: entry.id,
                provider: entry.provider,
                model: entry.model,
                priority: entry.priority,
                maxPromptTokens: entry.maxPromptTokens,
                supportsToolLoop: entry.supportsToolLoop,
                cooling: health.isCooling(entry.id),
                cooledUntil: health.cooledUntil(entry.id) || undefined,
                reason: snapshot.entries[entry.id]?.reason,
            })),
        },
        200,
        origin,
        config.allowedOrigins,
    );
}

function getEdgeCache() {
    // `caches` is absent in plain-Node test environments; the cache tier is
    // optional by design.
    const globalCaches = (globalThis as { caches?: { default?: unknown } }).caches;
    return globalCaches?.default as
        | {
              match(r: Request): Promise<Response | undefined>;
              put(r: Request, x: Response): Promise<void>;
          }
        | undefined;
}

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
    const allowOrigin = origin && isOriginAllowed(origin, allowed) ? origin : (allowed[0] ?? '*');
    return {
        'access-control-allow-origin': allowOrigin,
        'access-control-allow-methods': 'POST, GET, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400',
        // Responses vary by Origin; without this a shared cache could serve one
        // origin's CORS headers to another.
        vary: 'Origin',
    };
}

function json(
    payload: unknown,
    status: number,
    origin: string | null,
    allowed: string[],
    extra: Record<string, string> = {},
): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            ...corsHeaders(origin, allowed),
            'content-type': 'application/json; charset=utf-8',
            ...extra,
        },
    });
}

function errorResponse(
    status: ErrorStatus,
    message: string,
    httpStatus: number,
    origin: string | null,
    allowed: string[],
    retryAfter?: number,
): Response {
    return json(
        { status, message, ...(retryAfter ? { retryAfter } : {}) },
        httpStatus,
        origin,
        allowed,
        retryAfter ? { 'retry-after': String(retryAfter) } : {},
    );
}
