import { describe, expect, it } from 'vitest';
import {
    claimPairingCode,
    generatePairingCode,
    hashSecret,
    mintCredentials,
    pairingKey,
    parseBearer,
    storePairingCode,
    timingSafeEqual,
} from '../src/auth';
import type { KVNamespace } from '../src/types';

/** In-memory KV, so the suite needs no wrangler process and no network. */
class FakeKV implements KVNamespace {
    readonly store = new Map<string, string>();
    async get(key: string): Promise<string | null> {
        return this.store.get(key) ?? null;
    }
    async put(key: string, value: string): Promise<void> {
        this.store.set(key, value);
    }
    async delete(key: string): Promise<void> {
        this.store.delete(key);
    }
}

describe('mintCredentials', () => {
    it('produces unguessable, url-safe values', () => {
        const a = mintCredentials();
        const b = mintCredentials();
        expect(a.pushId).not.toBe(b.pushId);
        expect(a.pushSecret).not.toBe(b.pushSecret);
        // 32 random bytes, base64url: no padding, no + or /.
        expect(a.pushSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(a.pushId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    });
});

describe('hashSecret', () => {
    it('is deterministic and hides the input', async () => {
        const secret = mintCredentials().pushSecret;
        expect(await hashSecret(secret)).toBe(await hashSecret(secret));
        expect(await hashSecret(secret)).not.toContain(secret);
        expect(await hashSecret('a')).not.toBe(await hashSecret('b'));
    });
});

describe('timingSafeEqual', () => {
    it('matches identical values and rejects everything else', () => {
        expect(timingSafeEqual('abc', 'abc')).toBe(true);
        expect(timingSafeEqual('abc', 'abd')).toBe(false);
        expect(timingSafeEqual('abc', 'ab')).toBe(false);
        expect(timingSafeEqual('', '')).toBe(true);
    });
});

describe('parseBearer', () => {
    it('splits a well-formed credential', () => {
        expect(parseBearer('Bearer abc123.def456')).toEqual({
            pushId: 'abc123',
            pushSecret: 'def456',
        });
    });

    it('rejects anything malformed', () => {
        for (const header of [
            null,
            '',
            'Bearer',
            'Bearer nodot',
            'Basic abc.def',
            'Bearer abc.def.ghi',
            'Bearer abc.',
            'Bearer .def',
            'Bearer has space.def',
        ]) {
            expect(parseBearer(header)).toBeNull();
        }
    });
});

describe('pairing codes', () => {
    it('avoids characters that are misread when typed', () => {
        for (let i = 0; i < 50; i++) {
            const code = generatePairingCode();
            expect(code).toHaveLength(8);
            // No 0/O/1/I, which is the whole point of the restricted alphabet.
            expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
        }
    });

    it('round-trips a credential and is single use', async () => {
        const kv = new FakeKV();
        const credentials = mintCredentials();
        const code = generatePairingCode();

        await storePairingCode(kv, code, credentials);
        expect(await claimPairingCode(kv, code)).toEqual(credentials);

        // Redeeming again must fail: a code left live would let anyone who saw
        // it over a shoulder join the account later.
        expect(await claimPairingCode(kv, code)).toBeNull();
    });

    it('accepts a lowercase code, since users retype it by hand', async () => {
        const kv = new FakeKV();
        const credentials = mintCredentials();
        const code = generatePairingCode();
        await storePairingCode(kv, code, credentials);
        expect(await claimPairingCode(kv, code.toLowerCase())).toEqual(credentials);
    });

    it('returns null for an unknown code', async () => {
        expect(await claimPairingCode(new FakeKV(), 'ZZZZZZZZ')).toBeNull();
    });

    it('stores under a namespaced key that cannot collide with an account', () => {
        expect(pairingKey('abcd1234')).toBe('pair:ABCD1234');
    });
});
