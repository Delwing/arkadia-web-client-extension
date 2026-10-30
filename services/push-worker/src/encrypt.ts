/**
 * Web Push payload encryption — RFC 8291, using the `aes128gcm` content coding
 * of RFC 8188.
 *
 * The push service is an untrusted relay: it sees the ciphertext and never the
 * message. Only the browser that created the subscription can decrypt, because
 * only it holds the private half of the `p256dh` key and the `auth` secret.
 *
 * The scheme, in order:
 *
 *   1. Generate an ephemeral P-256 keypair for this one message.
 *   2. ECDH it against the subscription's public key for a shared secret.
 *   3. HKDF that, salted with the subscription's `auth` secret, into an IKM
 *      bound to both public keys — so the result is useless for any other pair.
 *   4. HKDF the IKM again, salted with 16 random bytes, into the AES key and
 *      the nonce.
 *   5. AES-128-GCM the padded plaintext.
 *   6. Prefix the salt, record size and ephemeral public key, which is what the
 *      recipient needs to redo steps 2-4.
 *
 * Verified against the RFC 8291 section 5 test vector in test/encrypt.test.ts.
 * Do not "clean up" the byte layout here without re-running it.
 */

import { base64UrlDecode, base64UrlEncode } from './vapid';

/** Record size advertised in the header. One record, so this is the ceiling. */
const RECORD_SIZE = 4096;

/** Length of an uncompressed P-256 point, `0x04 || x || y`. */
const PUBLIC_KEY_BYTES = 65;

/** salt(16) + rs(4) + idlen(1) + keyid(65) */
const HEADER_BYTES = 16 + 4 + 1 + PUBLIC_KEY_BYTES;

/**
 * Most push services reject a body over 4096 bytes. Working backwards from
 * that: the header is 86 bytes, GCM adds a 16-byte tag, and RFC 8188 appends a
 * one-byte padding delimiter.
 */
export const MAX_PLAINTEXT_BYTES = RECORD_SIZE - HEADER_BYTES - 16 - 1;

export interface EncryptOverrides {
    /** Test-only: pin the 16-byte salt instead of generating one. */
    salt?: Uint8Array<ArrayBuffer>;
    /** Test-only: pin the ephemeral keypair instead of generating one. */
    senderKeys?: CryptoKeyPair;
}

function concat(...parts: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

/** HKDF-Extract followed by HKDF-Expand, which is what deriveBits gives us. */
async function hkdf(
    salt: Uint8Array<ArrayBuffer>,
    ikm: Uint8Array<ArrayBuffer>,
    info: Uint8Array<ArrayBuffer>,
    lengthBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
    const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt, info },
        key,
        lengthBytes * 8,
    );
    return new Uint8Array(bits);
}

/** `label` followed by a NUL, as every info string in these RFCs is built. */
function infoString(
    label: string,
    ...extra: Uint8Array<ArrayBuffer>[]
): Uint8Array<ArrayBuffer> {
    return concat(new TextEncoder().encode(label), new Uint8Array([0]), ...extra);
}

/**
 * Encrypt one message for one subscription.
 *
 * `uaPublicKey` is the subscription's `p256dh` and `authSecret` its `auth`,
 * both base64url exactly as the Push API produced them.
 */
export async function encryptPayload(
    plaintext: string | Uint8Array<ArrayBuffer>,
    uaPublicKey: string,
    authSecret: string,
    overrides: EncryptOverrides = {},
): Promise<Uint8Array<ArrayBuffer>> {
    const message =
        typeof plaintext === 'string' ? new TextEncoder().encode(plaintext) : plaintext;
    if (message.length > MAX_PLAINTEXT_BYTES) {
        throw new Error(
            `Payload is ${message.length} bytes; the limit is ${MAX_PLAINTEXT_BYTES}`,
        );
    }

    const uaPublicBytes = base64UrlDecode(uaPublicKey);
    if (uaPublicBytes.length !== PUBLIC_KEY_BYTES || uaPublicBytes[0] !== 0x04) {
        throw new Error('Subscription p256dh is not an uncompressed P-256 point');
    }
    const auth = base64UrlDecode(authSecret);

    const salt = overrides.salt ?? crypto.getRandomValues(new Uint8Array(16));
    const senderKeys =
        overrides.senderKeys ??
        (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
            'deriveBits',
        ]));

    const asPublicBytes = new Uint8Array(
        await crypto.subtle.exportKey('raw', senderKeys.publicKey),
    );

    // --- 2. ECDH against the subscription's key --------------------------
    const uaPublic = await crypto.subtle.importKey(
        'raw',
        uaPublicBytes,
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        [],
    );
    const sharedSecret = new Uint8Array(
        await crypto.subtle.deriveBits(
            { name: 'ECDH', public: uaPublic },
            senderKeys.privateKey,
            256,
        ),
    );

    // --- 3. Bind the secret to both public keys --------------------------
    // Including both keys in `info` is what stops a shared secret captured from
    // one exchange being replayed against another subscription.
    const ikm = await hkdf(
        auth,
        sharedSecret,
        infoString('WebPush: info', uaPublicBytes, asPublicBytes),
        32,
    );

    // --- 4. Derive the content encryption key and nonce -------------------
    const cek = await hkdf(salt, ikm, infoString('Content-Encoding: aes128gcm'), 16);
    const nonce = await hkdf(salt, ikm, infoString('Content-Encoding: nonce'), 12);

    // --- 5. Encrypt ------------------------------------------------------
    // 0x02 is RFC 8188's delimiter for the final record. A single-record message
    // that used 0x01 here decrypts to a padding error, not a plaintext.
    const padded = concat(message, new Uint8Array([0x02]));
    const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, [
        'encrypt',
    ]);
    const ciphertext = new Uint8Array(
        await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: nonce, tagLength: 128 },
            aesKey,
            padded,
        ),
    );

    // --- 6. Prepend the RFC 8188 header ----------------------------------
    const recordSize = new Uint8Array(4);
    new DataView(recordSize.buffer).setUint32(0, RECORD_SIZE, false); // big-endian
    const header = concat(
        salt,
        recordSize,
        new Uint8Array([asPublicBytes.length]),
        asPublicBytes,
    );

    return concat(header, ciphertext);
}

/** Exposed for tests and for the size guard in push.ts. */
export function encodeForInspection(bytes: Uint8Array<ArrayBuffer>): string {
    return base64UrlEncode(bytes);
}
