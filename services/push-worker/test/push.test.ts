import { describe, expect, it } from 'vitest';
import { sendPush } from '../src/push';
import { loadVapidKey, type VapidKey } from '../src/vapid';
import type { StoredSubscription } from '../src/types';

/** A real subscription's key material — the RFC 8291 example recipient. */
const SUBSCRIPTION: StoredSubscription = {
    endpoint: 'https://push.example.net/push/abc123',
    p256dh:
        'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    auth: 'BTBZMqHH6r4Tts7J_aSIgg',
    createdAt: 1,
};

const MESSAGE = { title: 'Arkadia', body: 'Jestes ciezko ranny' };

async function makeKey(): Promise<VapidKey> {
    const pair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify'],
    );
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    delete jwk.key_ops;
    delete jwk.ext;
    return loadVapidKey(JSON.stringify(jwk));
}

function responder(status: number): {
    fetchImpl: typeof fetch;
    calls: { url: string; init: RequestInit }[];
} {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(null, { status });
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
}

describe('sendPush', () => {
    it('posts an encrypted aes128gcm body with a VAPID authorization', async () => {
        const key = await makeKey();
        const { fetchImpl, calls } = responder(201);

        const result = await sendPush(SUBSCRIPTION, key, 'https://example.test/issues', MESSAGE, {
            fetchImpl,
        });

        expect(result.outcome).toBe('delivered');
        expect(calls).toHaveLength(1);
        expect(calls[0]!.url).toBe(SUBSCRIPTION.endpoint);

        const headers = calls[0]!.init.headers as Record<string, string>;
        expect(headers['content-encoding']).toBe('aes128gcm');
        expect(headers['content-type']).toBe('application/octet-stream');
        expect(headers.ttl).toBe('120');
        expect(headers.urgency).toBe('high');
        expect(headers.authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);

        // The body must be real ciphertext, not the plaintext JSON.
        const body = calls[0]!.init.body as Uint8Array;
        expect(body.length).toBeGreaterThan(86);
        expect(new TextDecoder().decode(body)).not.toContain('Arkadia');
    });

    it('reports a dead subscription so the caller can prune it', async () => {
        const key = await makeKey();
        for (const status of [404, 410]) {
            const { fetchImpl } = responder(status);
            const result = await sendPush(SUBSCRIPTION, key, 'sub', MESSAGE, { fetchImpl });
            expect(result).toMatchObject({ outcome: 'gone', httpStatus: status });
        }
    });

    it('keeps the subscription on a transient failure', async () => {
        const key = await makeKey();
        // A 500 or a rate limit says nothing about whether the subscription is
        // still valid; dropping it here would silently unsubscribe the user.
        for (const status of [429, 500, 503]) {
            const { fetchImpl } = responder(status);
            const result = await sendPush(SUBSCRIPTION, key, 'sub', MESSAGE, { fetchImpl });
            expect(result.outcome).toBe('failed');
        }
    });

    it('survives the push service being unreachable', async () => {
        const key = await makeKey();
        const fetchImpl = (async () => {
            throw new Error('getaddrinfo ENOTFOUND');
        }) as unknown as typeof fetch;
        const result = await sendPush(SUBSCRIPTION, key, 'sub', MESSAGE, { fetchImpl });
        expect(result).toMatchObject({ outcome: 'failed', httpStatus: 0 });
    });

    it('fails cleanly on corrupt stored key material', async () => {
        const key = await makeKey();
        const { fetchImpl, calls } = responder(201);
        const broken = { ...SUBSCRIPTION, p256dh: 'not-a-key' };
        const result = await sendPush(broken, key, 'sub', MESSAGE, { fetchImpl });
        expect(result.outcome).toBe('failed');
        // Nothing should reach the network when encryption could not be done.
        expect(calls).toHaveLength(0);
    });

    it('trims an oversized body rather than dropping the notification', async () => {
        const key = await makeKey();
        const { fetchImpl, calls } = responder(201);
        const result = await sendPush(
            SUBSCRIPTION,
            key,
            'sub',
            { title: 'Arkadia', body: 'x'.repeat(20_000) },
            { fetchImpl },
        );
        expect(result.outcome).toBe('delivered');
        expect((calls[0]!.init.body as Uint8Array).length).toBeLessThanOrEqual(4096);
    });
});
