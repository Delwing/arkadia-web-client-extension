import { describe, expect, it } from 'vitest';
import {
    audienceFor,
    base64UrlDecode,
    base64UrlEncode,
    loadVapidKey,
    vapidAuthHeader,
} from '../src/vapid';

/** A fresh throwaway keypair, so no real key is embedded in the suite. */
async function makeJwk(): Promise<string> {
    const pair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify'],
    );
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    delete jwk.key_ops;
    delete jwk.ext;
    return JSON.stringify(jwk);
}

describe('base64url', () => {
    it('round-trips bytes without padding', () => {
        const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
        const encoded = base64UrlEncode(bytes);
        expect(encoded).not.toContain('=');
        expect(encoded).not.toContain('+');
        expect(encoded).not.toContain('/');
        expect(Array.from(base64UrlDecode(encoded))).toEqual(Array.from(bytes));
    });
});

describe('loadVapidKey', () => {
    it('derives the uncompressed public point from the private JWK', async () => {
        const jwkJson = await makeJwk();
        const key = await loadVapidKey(jwkJson);
        const raw = base64UrlDecode(key.publicKey);

        expect(raw.length).toBe(65);
        expect(raw[0]).toBe(0x04);

        // The derived point must equal the JWK's own x/y halves.
        const jwk = JSON.parse(jwkJson) as { x: string; y: string };
        expect(Array.from(raw.slice(1, 33))).toEqual(Array.from(base64UrlDecode(jwk.x)));
        expect(Array.from(raw.slice(33))).toEqual(Array.from(base64UrlDecode(jwk.y)));
    });

    it('rejects anything that is not a P-256 private JWK', async () => {
        await expect(loadVapidKey('not json')).rejects.toThrow(/not valid JSON/);
        await expect(loadVapidKey('{"kty":"RSA"}')).rejects.toThrow(/P-256 EC private JWK/);
        // A public JWK has no `d`, so it cannot sign.
        await expect(
            loadVapidKey('{"kty":"EC","crv":"P-256","x":"AA","y":"BB"}'),
        ).rejects.toThrow(/P-256 EC private JWK/);
    });
});

describe('vapidAuthHeader', () => {
    it('produces a JWT that verifies against the advertised public key', async () => {
        const key = await loadVapidKey(await makeJwk());
        const header = await vapidAuthHeader(
            key,
            'https://fcm.googleapis.com',
            'https://example.test/issues',
        );

        const match = /^vapid t=([^,]+), k=(.+)$/.exec(header);
        expect(match).not.toBeNull();
        const [, jwt, advertisedKey] = match!;
        expect(advertisedKey).toBe(key.publicKey);

        const [encodedHeader, encodedPayload, encodedSignature] = jwt!.split('.');
        expect(encodedHeader && encodedPayload && encodedSignature).toBeTruthy();

        // The signature must verify under the key the header advertises —
        // that pairing is the entire point of VAPID.
        const publicKey = await crypto.subtle.importKey(
            'raw',
            base64UrlDecode(advertisedKey!),
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['verify'],
        );
        const verified = await crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            publicKey,
            base64UrlDecode(encodedSignature!),
            new TextEncoder().encode(encodedHeader + '.' + encodedPayload),
        );
        expect(verified).toBe(true);
    });

    it('carries the audience, subject and a bounded expiry', async () => {
        const key = await loadVapidKey(await makeJwk());
        const now = 1_700_000_000_000;
        const header = await vapidAuthHeader(
            key,
            'https://updates.push.services.mozilla.com',
            'https://example.test/issues',
            now,
        );

        const jwt = /t=([^,]+)/.exec(header)![1]!;
        const payload = JSON.parse(
            new TextDecoder().decode(base64UrlDecode(jwt.split('.')[1]!)),
        ) as { aud: string; sub: string; exp: number };

        expect(payload.aud).toBe('https://updates.push.services.mozilla.com');
        expect(payload.sub).toBe('https://example.test/issues');
        // RFC 8292 caps the lifetime at 24h; we must stay under it.
        expect(payload.exp).toBeGreaterThan(now / 1000);
        expect(payload.exp - now / 1000).toBeLessThanOrEqual(24 * 60 * 60);
    });

    it('declares the ES256 algorithm', async () => {
        const key = await loadVapidKey(await makeJwk());
        const header = await vapidAuthHeader(key, 'https://a.test', 'mailto:a@b.test');
        const jwt = /t=([^,]+)/.exec(header)![1]!;
        const jwtHeader = JSON.parse(
            new TextDecoder().decode(base64UrlDecode(jwt.split('.')[0]!)),
        ) as { alg: string; typ: string };
        expect(jwtHeader).toEqual({ typ: 'JWT', alg: 'ES256' });
    });
});

describe('audienceFor', () => {
    it('reduces an endpoint to its origin', () => {
        // Push services reject a JWT whose `aud` carries the subscription path.
        expect(audienceFor('https://fcm.googleapis.com/fcm/send/abc123')).toBe(
            'https://fcm.googleapis.com',
        );
    });
});
