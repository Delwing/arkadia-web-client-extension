/**
 * Identity, without an identity provider.
 *
 * A push account is a random `pushId` plus a random `pushSecret`, minted by the
 * Worker the first time a browser subscribes. The caller presents both as
 * `Authorization: Bearer <pushId>.<pushSecret>`, and may only ever touch the
 * account named by that id.
 *
 * Why not an OAuth/Firebase token: the only thing this Worker needs to decide is
 * "does this caller own these subscriptions", and a 256-bit secret answers that
 * completely. An identity provider would additionally answer "which human is
 * this", which nothing here asks — and it would make push unavailable to anyone
 * who has not signed in, which is optional in this client.
 *
 * The secret is never stored. Only its SHA-256 is, so a leaked KV dump cannot
 * be used to send anything.
 */

import { base64UrlEncode } from './vapid';
import type { KVNamespace } from './types';

/** Characters for a hand-typed pairing code: no 0/O/1/I to mistype. */
const PAIRING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PAIRING_CODE_LENGTH = 8;
/** Long enough to walk to the other device, short enough to not linger. */
const PAIRING_TTL_SECONDS = 300;

export interface Credentials {
    pushId: string;
    pushSecret: string;
}

function randomBase64Url(bytes: number): string {
    return base64UrlEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function mintCredentials(): Credentials {
    return {
        // 16 bytes is ample for a name; the secret carries the security.
        pushId: randomBase64Url(16),
        pushSecret: randomBase64Url(32),
    };
}

export async function hashSecret(secret: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(secret),
    );
    return base64UrlEncode(digest);
}

/**
 * Compare without leaking, through timing, how much of the value matched.
 *
 * Both operands here are SHA-256 digests of the same fixed length, so the early
 * length return cannot reveal anything about the secret itself.
 */
export function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let difference = 0;
    for (let i = 0; i < a.length; i++) {
        difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return difference === 0;
}

/** Split `Authorization: Bearer <pushId>.<pushSecret>` into its halves. */
export function parseBearer(header: string | null): Credentials | null {
    if (!header) return null;
    const match = /^Bearer\s+([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(header.trim());
    if (!match) return null;
    return { pushId: match[1]!, pushSecret: match[2]! };
}

// --- Pairing -----------------------------------------------------------
//
// A second device (the phone) needs the credential the first device holds. The
// holder asks for a short code, renders it as a QR, and the scanning device
// redeems it — nobody types anything.
//
// The code exists rather than putting the credential straight in the QR because
// a photographed QR holding the raw secret would be permanent access. This one
// expires and is single use.

export function generatePairingCode(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(PAIRING_CODE_LENGTH));
    let code = '';
    for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
        code += PAIRING_ALPHABET[bytes[i]! % PAIRING_ALPHABET.length];
    }
    return code;
}

export function pairingKey(code: string): string {
    return `pair:${code.toUpperCase()}`;
}

/**
 * Park a credential under a short code for a few minutes.
 *
 * This is the one place the secret is written to storage in the clear. It is
 * bounded by the TTL and deleted on first use, which is the trade for not
 * making the user type a 43-character string.
 */
export async function storePairingCode(
    kv: KVNamespace | undefined,
    code: string,
    credentials: Credentials,
): Promise<void> {
    if (!kv) return;
    await kv.put(pairingKey(code), JSON.stringify(credentials), {
        expirationTtl: PAIRING_TTL_SECONDS,
    });
}

/** Redeem a pairing code. Single use: the code is deleted on success. */
export async function claimPairingCode(
    kv: KVNamespace | undefined,
    code: string,
): Promise<Credentials | null> {
    if (!kv) return null;
    const key = pairingKey(code);
    const raw = await kv.get(key, 'text');
    if (!raw) return null;
    await kv.delete(key);
    try {
        const parsed = JSON.parse(raw) as Credentials;
        return parsed.pushId && parsed.pushSecret ? parsed : null;
    } catch {
        return null;
    }
}

export { PAIRING_TTL_SECONDS };
