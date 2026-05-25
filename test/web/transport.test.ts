import { describe, it, expect } from 'vitest';
import { base64Codec, binaryCodec, selectCodec } from '@shared/socket/transport';

/** Latin-1 byte-string from a list of byte values (one char per byte). */
function bytes(...values: number[]): string {
    return values.map((v) => String.fromCharCode(v)).join('');
}

describe('transport codecs', () => {
    describe('selectCodec', () => {
        it('returns the binary codec for the proxy path', () => {
            expect(selectCodec(true)).toBe(binaryCodec);
        });
        it('returns the base64 codec for the native path', () => {
            expect(selectCodec(false)).toBe(base64Codec);
        });
    });

    describe('base64Codec', () => {
        it('round-trips a Latin-1 byte-string through base64 text frames', () => {
            const payload = bytes(0x00, 0x41, 0xff, 0x80, 0x9f, 0x0a);
            const frame = base64Codec.encode(payload);
            expect(typeof frame).toBe('string');
            expect(base64Codec.decode(frame as string)).toBe(payload);
        });

        it('ignores a stray binary frame', () => {
            expect(base64Codec.decode(new Uint8Array([1, 2, 3]).buffer)).toBe('');
        });
    });

    describe('binaryCodec', () => {
        it('round-trips a Latin-1 byte-string through binary frames', () => {
            const payload = bytes(0x00, 0x41, 0xff, 0x80, 0x9f, 0x0a);
            const frame = binaryCodec.encode(payload);
            expect(frame).toBeInstanceOf(Uint8Array);
            const view = frame as Uint8Array;
            expect(Array.from(view)).toEqual([0x00, 0x41, 0xff, 0x80, 0x9f, 0x0a]);
            // Decode the ArrayBuffer back to the original byte-string.
            expect(binaryCodec.decode(view.buffer)).toBe(payload);
        });

        it('preserves bytes 0x80-0x9f that windows-1252 would mangle', () => {
            const payload = bytes(0x80, 0x81, 0x8d, 0x90, 0x9d, 0x9f);
            const view = binaryCodec.encode(payload) as Uint8Array;
            expect(binaryCodec.decode(view.buffer)).toBe(payload);
        });

        it('tolerates a stray text frame by passing it through', () => {
            expect(binaryCodec.decode('hello')).toBe('hello');
        });
    });
});
