import { describe, expect, it } from 'vitest';
import { encryptPayload, MAX_PLAINTEXT_BYTES } from '../src/encrypt';
import { base64UrlDecode, base64UrlEncode } from '../src/vapid';

/**
 * The worked example from RFC 8291 section 5.
 *
 * Every input is pinned, including the sender's ephemeral keypair and the salt,
 * which is the only way the output is deterministic. If this test fails, the
 * encryption is wrong — not the test.
 */
const VECTOR = {
    plaintext: 'When I grow up, I want to be a watermelon',
    uaPublic:
        'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
    asPrivateD: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
    asPublic:
        'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
    salt: 'DGv6ra1nlYgDCS1FRnbzlw',
    // The three wrapped lines of the RFC's example body, joined.
    expectedBody:
        'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
        'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
        'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

/**
 * WebCrypto cannot import a bare EC private scalar, so rebuild the JWK from the
 * vector's `d` plus the x/y halves of its public point.
 */
async function vectorSenderKeys(): Promise<CryptoKeyPair> {
    const publicBytes = base64UrlDecode(VECTOR.asPublic);
    const privateKey = await crypto.subtle.importKey(
        'jwk',
        {
            kty: 'EC',
            crv: 'P-256',
            d: VECTOR.asPrivateD,
            x: base64UrlEncode(publicBytes.slice(1, 33)),
            y: base64UrlEncode(publicBytes.slice(33)),
            ext: true,
        },
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveBits'],
    );
    const publicKey = await crypto.subtle.importKey(
        'raw',
        publicBytes,
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        [],
    );
    return { privateKey, publicKey };
}

describe('encryptPayload', () => {
    it('reproduces the RFC 8291 section 5 test vector exactly', async () => {
        const body = await encryptPayload(
            VECTOR.plaintext,
            VECTOR.uaPublic,
            VECTOR.authSecret,
            {
                salt: base64UrlDecode(VECTOR.salt),
                senderKeys: await vectorSenderKeys(),
            },
        );
        expect(base64UrlEncode(body)).toBe(VECTOR.expectedBody);
    });

    it('lays out the aes128gcm header the recipient has to parse', async () => {
        const body = await encryptPayload(
            VECTOR.plaintext,
            VECTOR.uaPublic,
            VECTOR.authSecret,
            {
                salt: base64UrlDecode(VECTOR.salt),
                senderKeys: await vectorSenderKeys(),
            },
        );

        // salt(16) || rs(4, big-endian) || idlen(1) || keyid(65)
        expect(Array.from(body.slice(0, 16))).toEqual(
            Array.from(base64UrlDecode(VECTOR.salt)),
        );
        expect(new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0, false)).toBe(
            4096,
        );
        expect(body[20]).toBe(65);
        expect(base64UrlEncode(body.slice(21, 86))).toBe(VECTOR.asPublic);

        // header + plaintext + padding delimiter + GCM tag
        expect(body.length).toBe(86 + VECTOR.plaintext.length + 1 + 16);
    });

    it('produces a different body every time when the salt is not pinned', async () => {
        // A reused salt with a reused key would leak plaintext relationships;
        // both must be fresh per message.
        const first = await encryptPayload('same text', VECTOR.uaPublic, VECTOR.authSecret);
        const second = await encryptPayload('same text', VECTOR.uaPublic, VECTOR.authSecret);
        expect(base64UrlEncode(first)).not.toBe(base64UrlEncode(second));
        expect(first.length).toBe(second.length);
    });

    it('refuses a payload past the push service body limit', async () => {
        const tooLong = 'x'.repeat(MAX_PLAINTEXT_BYTES + 1);
        await expect(
            encryptPayload(tooLong, VECTOR.uaPublic, VECTOR.authSecret),
        ).rejects.toThrow(/limit is/);

        // The boundary itself must still encrypt, and land exactly on 4096.
        const atLimit = await encryptPayload(
            'x'.repeat(MAX_PLAINTEXT_BYTES),
            VECTOR.uaPublic,
            VECTOR.authSecret,
        );
        expect(atLimit.length).toBe(4096);
    });

    it('rejects a malformed subscription key', async () => {
        await expect(
            encryptPayload('hi', base64UrlEncode(new Uint8Array(64)), VECTOR.authSecret),
        ).rejects.toThrow(/uncompressed P-256 point/);
    });
});
