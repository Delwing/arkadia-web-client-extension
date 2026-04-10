// @vitest-environment node

import { encrypt, decrypt, calculateChecksum, isEncryptedData } from '@modules/firebase/firebaseCrypto';

describe('firebaseCrypto', () => {
    describe('encrypt / decrypt round-trip', () => {
        test('encrypts and decrypts back to original data', async () => {
            const original = JSON.stringify({ triggers: [{ pattern: 'test', action: 'say hello' }] });
            const passphrase = 'mySecretPass123';

            const encrypted = await encrypt(original, passphrase);
            const decrypted = await decrypt(encrypted, passphrase);

            expect(decrypted).toBe(original);
        });

        test('works with empty string', async () => {
            const encrypted = await encrypt('', 'pass');
            const decrypted = await decrypt(encrypted, 'pass');
            expect(decrypted).toBe('');
        });

        test('works with large data', async () => {
            const largeData = 'x'.repeat(100_000);
            const encrypted = await encrypt(largeData, 'pass');
            const decrypted = await decrypt(encrypted, 'pass');
            expect(decrypted).toBe(largeData);
        });

        test('produces different ciphertext for same input (random IV/salt)', async () => {
            const data = 'hello world';
            const pass = 'secret';
            const enc1 = await encrypt(data, pass);
            const enc2 = await encrypt(data, pass);
            expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
        });

        test('decrypt with wrong passphrase throws', async () => {
            const encrypted = await encrypt('sensitive data', 'correctPassword');
            await expect(decrypt(encrypted, 'wrongPassword')).rejects.toThrow();
        });
    });

    describe('encrypt output format', () => {
        test('returns object with base64 ciphertext, iv, and salt', async () => {
            const encrypted = await encrypt('test data', 'pass');
            expect(typeof encrypted.ciphertext).toBe('string');
            expect(typeof encrypted.iv).toBe('string');
            expect(typeof encrypted.salt).toBe('string');
            // Base64 strings should not be empty
            expect(encrypted.ciphertext.length).toBeGreaterThan(0);
            expect(encrypted.iv.length).toBeGreaterThan(0);
            expect(encrypted.salt.length).toBeGreaterThan(0);
        });
    });

    describe('calculateChecksum', () => {
        test('returns consistent hex string for same input', async () => {
            const data = 'hello world';
            const hash1 = await calculateChecksum(data);
            const hash2 = await calculateChecksum(data);
            expect(hash1).toBe(hash2);
        });

        test('returns different checksums for different inputs', async () => {
            const hash1 = await calculateChecksum('data1');
            const hash2 = await calculateChecksum('data2');
            expect(hash1).not.toBe(hash2);
        });

        test('returns a 64-character hex string (SHA-256)', async () => {
            const hash = await calculateChecksum('test');
            expect(hash).toMatch(/^[0-9a-f]{64}$/);
        });

        test('handles empty string', async () => {
            const hash = await calculateChecksum('');
            expect(hash).toMatch(/^[0-9a-f]{64}$/);
        });
    });

    describe('isEncryptedData', () => {
        test('returns true for valid encrypted data', () => {
            expect(isEncryptedData({
                ciphertext: 'abc123',
                iv: 'def456',
                salt: 'ghi789',
            })).toBe(true);
        });

        test('returns false for null', () => {
            expect(isEncryptedData(null)).toBe(false);
        });

        test('returns false for undefined', () => {
            expect(isEncryptedData(undefined)).toBe(false);
        });

        test('returns false for non-object', () => {
            expect(isEncryptedData('string')).toBe(false);
            expect(isEncryptedData(42)).toBe(false);
        });

        test('returns false when ciphertext is missing', () => {
            expect(isEncryptedData({ iv: 'a', salt: 'b' })).toBe(false);
        });

        test('returns false when iv is missing', () => {
            expect(isEncryptedData({ ciphertext: 'a', salt: 'b' })).toBe(false);
        });

        test('returns false when salt is missing', () => {
            expect(isEncryptedData({ ciphertext: 'a', iv: 'b' })).toBe(false);
        });

        test('returns false when fields are not strings', () => {
            expect(isEncryptedData({ ciphertext: 123, iv: 'a', salt: 'b' })).toBe(false);
            expect(isEncryptedData({ ciphertext: 'a', iv: null, salt: 'b' })).toBe(false);
        });
    });
});
