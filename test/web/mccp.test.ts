import pako from 'pako';
import { MccpHandler } from '@shared/socket/mccp';

/**
 * Create a zlib stream that can produce partial chunks (for streaming tests).
 * Uses Z_SYNC_FLUSH so partial output is available.
 */
function createStreamingCompressor(): { push: (str: string) => string } {
    const chunks: Uint8Array[] = [];
    const deflator = new pako.Deflate();
    deflator.onData = (chunk: Uint8Array) => {
        chunks.push(new Uint8Array(chunk));
    };
    return {
        push(str: string): string {
            const bytes = new Uint8Array(str.length);
            for (let i = 0; i < str.length; i++) {
                bytes[i] = str.charCodeAt(i);
            }
            const prevCount = chunks.length;
            deflator.push(bytes, pako.constants.Z_SYNC_FLUSH);
            let result = '';
            for (let i = prevCount; i < chunks.length; i++) {
                for (let j = 0; j < chunks[i].length; j++) {
                    result += String.fromCharCode(chunks[i][j]);
                }
            }
            return result;
        },
    };
}

const IAC_WILL_COMPRESS2 = "\xFF\xFB\x56";
const IAC_DO_COMPRESS2 = "\xFF\xFD\x56";
const IAC_SB_COMPRESS2_SE = "\xFF\xFA\x56\xFF\xF0";

describe('MccpHandler', () => {
    let handler: MccpHandler;
    let sentData: string[];

    beforeEach(() => {
        sentData = [];
        handler = new MccpHandler((data) => sentData.push(data));
    });

    it('should start inactive', () => {
        expect(handler.isActive()).toBe(false);
    });

    it('should pass through uncompressed data unchanged', () => {
        const data = 'Hello, world!\r\n';
        expect(handler.processData(data)).toBe(data);
        expect(handler.isActive()).toBe(false);
    });

    it('should respond to IAC WILL COMPRESS2 with IAC DO COMPRESS2', () => {
        const data = `some text${IAC_WILL_COMPRESS2}more text`;
        handler.processData(data);
        expect(sentData).toEqual([IAC_DO_COMPRESS2]);
    });

    it('should not activate compression on WILL alone', () => {
        handler.processData(IAC_WILL_COMPRESS2);
        expect(handler.isActive()).toBe(false);
    });

    it('should activate compression on IAC SB COMPRESS2 IAC SE', () => {
        const compressor = createStreamingCompressor();
        const compressed = compressor.push('decompressed text');

        const data = `prefix${IAC_SB_COMPRESS2_SE}${compressed}`;
        const result = handler.processData(data);

        expect(handler.isActive()).toBe(true);
        expect(result).toContain('prefix');
        expect(result).toContain('decompressed text');
    });

    it('should handle MCCP start with no trailing data', () => {
        const data = `prefix${IAC_SB_COMPRESS2_SE}`;
        const result = handler.processData(data);

        expect(result).toBe('prefix');
        expect(handler.isActive()).toBe(true);
    });

    it('should decompress subsequent chunks after MCCP starts', () => {
        // First: activate compression with the start sequence
        handler.processData(IAC_SB_COMPRESS2_SE);
        expect(handler.isActive()).toBe(true);

        // Now send compressed data
        const compressor = createStreamingCompressor();
        const compressed = compressor.push('Hello from compressed stream');

        const result = handler.processData(compressed);
        expect(result).toBe('Hello from compressed stream');
    });

    it('should handle multi-chunk streaming decompression', () => {
        handler.processData(IAC_SB_COMPRESS2_SE);

        const compressor = createStreamingCompressor();

        const chunk1 = compressor.push('First message\r\n');
        const result1 = handler.processData(chunk1);
        expect(result1).toBe('First message\r\n');

        const chunk2 = compressor.push('Second message\r\n');
        const result2 = handler.processData(chunk2);
        expect(result2).toBe('Second message\r\n');
    });

    it('should handle full negotiation flow', () => {
        // Step 1: Server offers MCCP
        handler.processData(`Welcome\r\n${IAC_WILL_COMPRESS2}`);
        expect(sentData).toEqual([IAC_DO_COMPRESS2]);
        expect(handler.isActive()).toBe(false);

        // Step 2: Server starts compression
        const compressor = createStreamingCompressor();
        const compressed = compressor.push('Compressed content\r\n');
        handler.processData(IAC_SB_COMPRESS2_SE + compressed);
        expect(handler.isActive()).toBe(true);

        // Step 3: All subsequent data is compressed
        const moreCompressed = compressor.push('More compressed data\r\n');
        const result = handler.processData(moreCompressed);
        expect(result).toBe('More compressed data\r\n');
    });

    it('should reset state on reset()', () => {
        handler.processData(IAC_SB_COMPRESS2_SE);
        expect(handler.isActive()).toBe(true);

        handler.reset();
        expect(handler.isActive()).toBe(false);

        // After reset, data should pass through unchanged
        const data = 'uncompressed again';
        expect(handler.processData(data)).toBe(data);
    });

    it('should handle binary data in compressed stream', () => {
        handler.processData(IAC_SB_COMPRESS2_SE);

        const compressor = createStreamingCompressor();
        // Include ANSI escape codes and telnet sequences in the uncompressed content
        const binaryContent = '\x1b[31mRed text\x1b[0m\r\n';
        const compressed = compressor.push(binaryContent);

        const result = handler.processData(compressed);
        expect(result).toBe(binaryContent);
    });

    it('should handle WILL and SB in the same message', () => {
        const compressor = createStreamingCompressor();
        const compressed = compressor.push('compressed text');

        const data = `${IAC_WILL_COMPRESS2}${IAC_SB_COMPRESS2_SE}${compressed}`;
        const result = handler.processData(data);

        expect(sentData).toEqual([IAC_DO_COMPRESS2]);
        expect(handler.isActive()).toBe(true);
        expect(result).toContain('compressed text');
    });

    it('should track compression statistics', () => {
        handler.processData(IAC_SB_COMPRESS2_SE);

        const compressor = createStreamingCompressor();
        const original = 'Hello from the server!\r\n';
        const compressed = compressor.push(original);

        handler.processData(compressed);

        const stats = handler.getStats();
        expect(stats.active).toBe(true);
        expect(stats.compressedBytes).toBe(compressed.length);
        expect(stats.decompressedBytes).toBe(original.length);
        expect(stats.savedBytes).toBe(original.length - compressed.length);
        expect(stats.ratio).toBeCloseTo(compressed.length / original.length, 2);
    });

    it('should accumulate stats across multiple messages', () => {
        handler.processData(IAC_SB_COMPRESS2_SE);

        const compressor = createStreamingCompressor();
        const msg1 = 'First message\r\n';
        const msg2 = 'Second message\r\n';
        handler.processData(compressor.push(msg1));
        handler.processData(compressor.push(msg2));

        const stats = handler.getStats();
        expect(stats.decompressedBytes).toBe(msg1.length + msg2.length);
        expect(stats.compressedBytes).toBeGreaterThan(0);
        expect(stats.decompressCallCount).toBe(2);
        expect(stats.totalDecompressTimeMs).toBeGreaterThanOrEqual(0);
        expect(stats.avgDecompressTimeUs).toBeGreaterThanOrEqual(0);
        expect(stats.maxDecompressTimeUs).toBeGreaterThanOrEqual(0);
    });

    it('should reset stats on reset()', () => {
        handler.processData(IAC_SB_COMPRESS2_SE);

        const compressor = createStreamingCompressor();
        handler.processData(compressor.push('some data'));
        expect(handler.getStats().compressedBytes).toBeGreaterThan(0);

        handler.reset();

        const stats = handler.getStats();
        expect(stats.compressedBytes).toBe(0);
        expect(stats.decompressedBytes).toBe(0);
        expect(stats.active).toBe(false);
        expect(stats.totalDecompressTimeMs).toBe(0);
        expect(stats.decompressCallCount).toBe(0);
        expect(stats.avgDecompressTimeUs).toBe(0);
        expect(stats.maxDecompressTimeUs).toBe(0);
    });
});
