/**
 * VAPID (RFC 8292) request signing.
 *
 * The Worker proves to a push service that it is the same application server
 * that issued the subscription, by signing a short-lived ES256 JWT with the
 * private half of the keypair whose public half the browser passed to
 * `pushManager.subscribe()`.
 *
 * This is the half of Web Push that needs no payload encryption, which is why a
 * payload-less push can be delivered before RFC 8291 lands in phase 3.
 */

/** Max lifetime RFC 8292 allows for the JWT is 24h; we use half of it. */
const JWT_TTL_SECONDS = 12 * 60 * 60;

export interface VapidKey {
    /** ECDSA P-256 private key, for signing the JWT. */
    privateKey: CryptoKey;
    /**
     * Raw uncompressed P-256 point (`0x04 || x || y`) as base64url — the `k`
     * parameter of the Authorization header, and the same value the browser
     * used as `applicationServerKey`.
     */
    publicKey: string;
}

export function base64UrlEncode(input: ArrayBuffer | Uint8Array): string {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// The `<ArrayBuffer>` argument matters: TypeScript 5.7+ makes the typed arrays
// generic over their backing buffer, and the bare `Uint8Array` defaults to
// `ArrayBufferLike` — which WebCrypto's `BufferSource` parameters reject,
// because it admits SharedArrayBuffer.
export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
    const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
    const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * Import the private key and derive the matching public key from it.
 *
 * Storing the secret as JWK is what makes this cheap: `d` is the private
 * scalar and `x`/`y` are the public point, so one secret yields both halves and
 * they cannot drift out of step.
 */
export async function loadVapidKey(jwkJson: string): Promise<VapidKey> {
    let jwk: JsonWebKey;
    try {
        jwk = JSON.parse(jwkJson) as JsonWebKey;
    } catch {
        throw new Error('VAPID_PRIVATE_KEY is not valid JSON');
    }
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d || !jwk.x || !jwk.y) {
        throw new Error('VAPID_PRIVATE_KEY must be a P-256 EC private JWK');
    }

    const privateKey = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign'],
    );

    const x = base64UrlDecode(jwk.x);
    const y = base64UrlDecode(jwk.y);
    const raw = new Uint8Array(65);
    raw[0] = 0x04;
    raw.set(x, 1);
    raw.set(y, 33);

    return { privateKey, publicKey: base64UrlEncode(raw) };
}

/**
 * Build the `Authorization` header for one delivery.
 *
 * `audience` must be the *origin* of the push endpoint, not the full URL — push
 * services reject a JWT whose `aud` carries the subscription path.
 */
export async function vapidAuthHeader(
    key: VapidKey,
    audience: string,
    subject: string,
    now: number = Date.now(),
): Promise<string> {
    const header = { typ: 'JWT', alg: 'ES256' };
    const payload = {
        aud: audience,
        exp: Math.floor(now / 1000) + JWT_TTL_SECONDS,
        sub: subject,
    };

    const encoder = new TextEncoder();
    const signingInput =
        base64UrlEncode(encoder.encode(JSON.stringify(header))) +
        '.' +
        base64UrlEncode(encoder.encode(JSON.stringify(payload)));

    // WebCrypto returns the raw r||s pair, which is exactly what JWS ES256
    // wants — no DER unwrapping, unlike Node's crypto.sign default.
    const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        key.privateKey,
        encoder.encode(signingInput),
    );

    const jwt = signingInput + '.' + base64UrlEncode(signature);
    return `vapid t=${jwt}, k=${key.publicKey}`;
}

/** The `aud` claim for an endpoint: scheme + host, nothing else. */
export function audienceFor(endpoint: string): string {
    return new URL(endpoint).origin;
}
