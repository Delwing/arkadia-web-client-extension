/**
 * Arkadia push Worker.
 *
 * Delivers Web Push (RFC 8030 / 8291 / 8292) alerts to a player's registered
 * devices — "your character is taking damage while you are away from the desk".
 *
 * Three properties shape the design:
 *
 * 1. A caller may only ever touch its own account. The account id is carried in
 *    the bearer credential rather than the request body, so there is no
 *    `targetUserId` to guess and no way to make this a relay for spamming
 *    somebody else's phone.
 *
 * 2. The delivery path performs no KV writes. Subscriptions are read as a
 *    single document per account; the only writes are subscribe, unsubscribe,
 *    pairing, and pruning a subscription the push service reported gone.
 *
 * 3. There is no identity provider. See auth.ts for why.
 */

import {
    claimPairingCode,
    generatePairingCode,
    hashSecret,
    mintCredentials,
    parseBearer,
    storePairingCode,
    timingSafeEqual,
    PAIRING_TTL_SECONDS,
    type Credentials,
} from './auth';
import { loadConfig, isOriginAllowed, type RuntimeConfig } from './config';
import { corsHeaders, errorResponse, json } from './http';
import { DEV_PAGE_HTML, DEV_SW_JS } from './devPage';
import { sendPush } from './push';
import { loadVapidKey } from './vapid';
import {
    parseSubscription,
    readDoc,
    removeByEndpoint,
    upsert,
    writeDoc,
} from './subscriptions';
import type { Env, SubscriptionDoc } from './types';

/** Ceiling on the request body, checked before parsing. */
const MAX_BODY_BYTES = 8 * 1024;

interface Session {
    credentials: Credentials;
    doc: SubscriptionDoc;
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const origin = request.headers.get('origin');
        const config = loadConfig(env);
        const allowed = config.allowedOrigins;

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(origin, allowed) });
        }

        if (url.pathname === '/health') {
            return handleHealth(env, config, origin);
        }

        // --- Dev-only test harness ---------------------------------------
        if (config.devTestPage) {
            if (url.pathname === '/dev') return html(DEV_PAGE_HTML);
            // Served from the root so its default scope covers the whole origin.
            if (url.pathname === '/sw.js') return script(DEV_SW_JS);
            if (url.pathname === '/dev/vapid-public') {
                return handleVapidPublic(config, origin);
            }
        }

        if (!url.pathname.startsWith('/push/')) {
            return errorResponse('not_found', 'No such route', 404, origin, allowed);
        }
        if (request.method !== 'POST') {
            return errorResponse('method_not_allowed', 'POST only', 405, origin, allowed);
        }
        if (!isOriginAllowed(origin, allowed)) {
            return errorResponse('forbidden_origin', 'Origin not allowed', 403, origin, allowed);
        }

        const body = await readJsonBody(request);
        if (body === 'too_large') {
            return errorResponse('too_large', 'Request body too large', 413, origin, allowed);
        }
        if (body === 'malformed') {
            return errorResponse('bad_request', 'Malformed JSON', 400, origin, allowed);
        }

        // Subscribe and pair/claim are the two ways in, so neither can require
        // a credential the caller does not have yet.
        if (url.pathname === '/push/subscribe') {
            return handleSubscribe(request, env, config, body, origin);
        }
        if (url.pathname === '/push/pair/claim') {
            return handlePairClaim(env, config, body, origin);
        }
        // Also unauthenticated-capable: the device that shows the QR is the
        // desktop, which may not have subscribed to anything yet (and may have
        // denied notification permission outright). Requiring an account first
        // would leave it with no way to start pairing at all.
        if (url.pathname === '/push/pair/start') {
            return handlePairStart(request, env, config, origin);
        }

        const session = await authenticate(request, env);
        if (!session) {
            return errorResponse('unauthorized', 'Invalid push credential', 401, origin, allowed);
        }

        switch (url.pathname) {
            case '/push/unsubscribe':
                return handleUnsubscribe(env, config, session, body, origin);
            case '/push/notify':
                return handleNotify(env, config, session, body, origin);
            default:
                return errorResponse('not_found', 'No such route', 404, origin, allowed);
        }
    },
};

/**
 * Verify `Authorization: Bearer <pushId>.<pushSecret>`.
 *
 * The stored value is a hash, so a matching document proves the caller holds
 * the secret rather than merely having read our storage.
 */
async function authenticate(request: Request, env: Env): Promise<Session | null> {
    const credentials = parseBearer(request.headers.get('authorization'));
    if (!credentials) return null;

    const doc = await readDoc(env.PUSH_KV, credentials.pushId);
    if (!doc) return null;

    const presented = await hashSecret(credentials.pushSecret);
    if (!timingSafeEqual(presented, doc.secretHash)) return null;

    return { credentials, doc };
}

/**
 * Register a browser.
 *
 * With no credential this mints a new account and returns it — that is how a
 * first device gets one. With a credential it adds the browser to the existing
 * account, which is how a paired second device joins.
 */
async function handleSubscribe(
    request: Request,
    env: Env,
    config: RuntimeConfig,
    body: Record<string, unknown>,
    origin: string | null,
): Promise<Response> {
    const allowed = config.allowedOrigins;
    const subscription = parseSubscription(body.subscription, Date.now());
    if (!subscription) {
        return errorResponse(
            'bad_request',
            'Missing or invalid subscription',
            400,
            origin,
            allowed,
        );
    }

    const presented = parseBearer(request.headers.get('authorization'));
    let credentials: Credentials;
    let doc: SubscriptionDoc;
    let minted = false;

    if (presented) {
        const session = await authenticate(request, env);
        if (!session) {
            return errorResponse(
                'unauthorized',
                'Invalid push credential',
                401,
                origin,
                allowed,
            );
        }
        credentials = session.credentials;
        doc = session.doc;
    } else {
        credentials = mintCredentials();
        doc = { secretHash: await hashSecret(credentials.pushSecret), subscriptions: [] };
        minted = true;
    }

    const next = upsert(doc, subscription, config.maxSubscriptionsPerUser);
    await writeDoc(env.PUSH_KV, credentials.pushId, next);

    return json(
        {
            ok: true,
            devices: next.subscriptions.length,
            // Returned once, at mint time. There is no way to read it back
            // afterwards — the Worker only keeps the hash.
            ...(minted ? credentials : {}),
        },
        200,
        origin,
        allowed,
    );
}

async function handleUnsubscribe(
    env: Env,
    config: RuntimeConfig,
    session: Session,
    body: Record<string, unknown>,
    origin: string | null,
): Promise<Response> {
    const allowed = config.allowedOrigins;
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
    if (!endpoint) {
        return errorResponse('bad_request', 'Missing endpoint', 400, origin, allowed);
    }

    const next = removeByEndpoint(session.doc, endpoint);
    await writeDoc(env.PUSH_KV, session.credentials.pushId, next);

    return json({ ok: true, devices: next.subscriptions.length }, 200, origin, allowed);
}

async function handleNotify(
    env: Env,
    config: RuntimeConfig,
    session: Session,
    body: Record<string, unknown>,
    origin: string | null,
): Promise<Response> {
    const allowed = config.allowedOrigins;
    if (!config.vapidPrivateKey) {
        return errorResponse('internal_error', 'VAPID_PRIVATE_KEY is not set', 500, origin, allowed);
    }

    const title = typeof body.title === 'string' ? body.title.slice(0, 120) : 'Arkadia';
    const text = typeof body.body === 'string' ? body.body.slice(0, 300) : '';
    const target = typeof body.url === 'string' ? body.url.slice(0, 300) : undefined;

    const { doc } = session;
    if (doc.subscriptions.length === 0) {
        return json({ ok: true, delivered: 0, pruned: 0, devices: 0 }, 200, origin, allowed);
    }

    let key;
    try {
        key = await loadVapidKey(config.vapidPrivateKey);
    } catch (err) {
        return errorResponse(
            'internal_error',
            err instanceof Error ? err.message : 'Bad VAPID key',
            500,
            origin,
            allowed,
        );
    }

    const results = await Promise.all(
        doc.subscriptions.map(subscription =>
            sendPush(subscription, key, config.vapidSubject, {
                title,
                body: text,
                url: target,
            }),
        ),
    );

    const gone = results.filter(r => r.outcome === 'gone');
    if (gone.length > 0) {
        // The only write on the delivery path, and only when a subscription is
        // definitively dead.
        let pruned = doc;
        for (const result of gone) {
            pruned = removeByEndpoint(pruned, result.endpoint);
        }
        await writeDoc(env.PUSH_KV, session.credentials.pushId, pruned);
    }

    const delivered = results.filter(r => r.outcome === 'delivered').length;
    console.log(
        '[notify] ' +
            JSON.stringify({
                devices: results.length,
                delivered,
                pruned: gone.length,
                statuses: results.map(r => r.httpStatus),
            }),
    );

    return json(
        {
            ok: true,
            delivered,
            pruned: gone.length,
            devices: doc.subscriptions.length - gone.length,
            statuses: results.map(r => r.httpStatus),
        },
        200,
        origin,
        allowed,
    );
}

/**
 * Park an account's credential under a short code for another device.
 *
 * With a credential this shares the existing account. Without one it mints a
 * fresh account and returns it alongside the code, so the desktop can start
 * pairing as its very first action.
 */
async function handlePairStart(
    request: Request,
    env: Env,
    config: RuntimeConfig,
    origin: string | null,
): Promise<Response> {
    const allowed = config.allowedOrigins;
    const presented = parseBearer(request.headers.get('authorization'));

    let credentials: Credentials;
    let minted = false;

    if (presented) {
        const session = await authenticate(request, env);
        if (!session) {
            return errorResponse('unauthorized', 'Invalid push credential', 401, origin, allowed);
        }
        credentials = session.credentials;
    } else {
        credentials = mintCredentials();
        await writeDoc(env.PUSH_KV, credentials.pushId, {
            secretHash: await hashSecret(credentials.pushSecret),
            subscriptions: [],
        });
        minted = true;
    }

    const code = generatePairingCode();
    await storePairingCode(env.PUSH_KV, code, credentials);

    return json(
        {
            ok: true,
            code,
            expiresInSeconds: PAIRING_TTL_SECONDS,
            ...(minted ? credentials : {}),
        },
        200,
        origin,
        allowed,
    );
}

/** Redeem a pairing code for the credential it holds. Single use. */
async function handlePairClaim(
    env: Env,
    config: RuntimeConfig,
    body: Record<string, unknown>,
    origin: string | null,
): Promise<Response> {
    const allowed = config.allowedOrigins;
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!code) {
        return errorResponse('bad_request', 'Missing code', 400, origin, allowed);
    }

    const credentials = await claimPairingCode(env.PUSH_KV, code);
    if (!credentials) {
        // Same answer for wrong, expired and already-used, so a caller cannot
        // probe which codes ever existed.
        return errorResponse(
            'not_found',
            'Pairing code is invalid or has expired',
            404,
            origin,
            allowed,
        );
    }

    return json({ ok: true, ...credentials }, 200, origin, allowed);
}

async function handleVapidPublic(
    config: RuntimeConfig,
    origin: string | null,
): Promise<Response> {
    if (!config.vapidPrivateKey) {
        return errorResponse(
            'internal_error',
            'VAPID_PRIVATE_KEY is not set',
            500,
            origin,
            config.allowedOrigins,
        );
    }
    const key = await loadVapidKey(config.vapidPrivateKey);
    return json({ publicKey: key.publicKey }, 200, origin, config.allowedOrigins);
}

/**
 * Readiness, without leaking anything.
 *
 * Reports only whether each binding is *present*, which is what the deploy
 * workflow smoke-checks: the likeliest broken deploy is one where the VAPID
 * secret or the KV namespace id was never set, and both fail silently at
 * runtime rather than at deploy time.
 */
function handleHealth(env: Env, config: RuntimeConfig, origin: string | null): Response {
    return json(
        {
            ok: true,
            vapid: config.vapidPrivateKey ? 'configured' : 'missing',
            kv: env.PUSH_KV ? 'bound' : 'missing',
            // Surfaced deliberately: the test page should never be reachable on
            // the deployed Worker.
            testPage: config.devTestPage,
        },
        200,
        origin,
        config.allowedOrigins,
    );
}

async function readJsonBody(
    request: Request,
): Promise<Record<string, unknown> | 'too_large' | 'malformed'> {
    const declared = Number(request.headers.get('content-length') ?? '0');
    if (declared > MAX_BODY_BYTES) return 'too_large';

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return 'too_large';
    if (!raw) return {};

    try {
        const parsed = JSON.parse(raw) as unknown;
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            return 'malformed';
        }
        return parsed as Record<string, unknown>;
    } catch {
        return 'malformed';
    }
}

function html(content: string): Response {
    return new Response(content, {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
}

function script(content: string): Response {
    return new Response(content, {
        headers: {
            'content-type': 'application/javascript; charset=utf-8',
            'cache-control': 'no-store',
        },
    });
}
