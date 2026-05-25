import { describe, it, expect } from 'vitest';
import { base64Codec, binaryCodec, selectCodec } from '@shared/socket/transport';

/** Latin-1 byte-string from a list of byte values (one char per byte). */
function bytes(...values: number[]): string {
    return values.map((v) => String.fromCharCode(v)).join('');
}

/** A real ArrayBuffer holding the given byte-string — what an inbound binary
 *  WebSocket frame delivers (binaryType: 'arraybuffer'). */
function frame(byteString: string): ArrayBuffer {
    const buffer = new ArrayBuffer(byteString.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < byteString.length; i++) {
        view[i] = byteString.charCodeAt(i) & 0xff;
    }
    return buffer;
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
            const encoded = base64Codec.encode(payload);
            expect(typeof encoded).toBe('string');
            expect(base64Codec.decode(encoded as string)).toBe(payload);
        });

        it('ignores a stray binary frame', () => {
            expect(base64Codec.decode(frame(bytes(1, 2, 3)))).toBe('');
        });
    });

    describe('binaryCodec', () => {
        it('round-trips a Latin-1 byte-string through binary frames', () => {
            const payload = bytes(0x00, 0x41, 0xff, 0x80, 0x9f, 0x0a);
            const encoded = binaryCodec.encode(payload);
            expect(encoded).toBeInstanceOf(Uint8Array);
            expect(Array.from(encoded as Uint8Array)).toEqual([0x00, 0x41, 0xff, 0x80, 0x9f, 0x0a]);
            // Decode an inbound binary frame back to the original byte-string.
            expect(binaryCodec.decode(frame(payload))).toBe(payload);
        });

        it('preserves bytes 0x80-0x9f that windows-1252 would mangle', () => {
            const payload = bytes(0x80, 0x81, 0x8d, 0x90, 0x9d, 0x9f);
            expect(binaryCodec.decode(frame(payload))).toBe(payload);
        });

        it('tolerates a stray text frame by passing it through', () => {
            expect(binaryCodec.decode('hello')).toBe('hello');
        });
    });
});
