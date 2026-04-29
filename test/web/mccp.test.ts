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

    it('should not negotiate when disabled', () => {
        handler.enabled = false;

        handler.processData(`Welcome\r\n${IAC_WILL_COMPRESS2}`);
        expect(sentData).toEqual([]);
        expect(handler.isActive()).toBe(false);
    });

    it('should be enabled by default', () => {
        expect(handler.enabled).toBe(true);
    });

    it('should pass through MCCP sequences when disabled', () => {
        handler.enabled = false;

        const data = `prefix${IAC_SB_COMPRESS2_SE}trailing`;
        const result = handler.processData(data);

        expect(result).toBe(data);
        expect(handler.isActive()).toBe(false);
    });

    it('should correctly re-negotiate MCCP after reset (reconnect scenario)', () => {
        // Simulate first session: MCCP negotiated and active
        const compressor1 = createStreamingCompressor();
        handler.processData(`${IAC_WILL_COMPRESS2}${IAC_SB_COMPRESS2_SE}${compressor1.push('session 1\r\n')}`);
        expect(handler.isActive()).toBe(true);

        // Simulate disconnect: reset is called
        handler.reset();
        expect(handler.isActive()).toBe(false);

        // Simulate reconnect: fresh MCCP negotiation on a new connection.
        // The very first data on the new connection is uncompressed telnet negotiation,
        // NOT compressed — this used to fail with "invalid block type" if the handler
        // was still in compressing=true state.
        sentData = [];
        const compressor2 = createStreamingCompressor();
        const result1 = handler.processData(`Welcome back${IAC_WILL_COMPRESS2}`);
        expect(sentData).toEqual([IAC_DO_COMPRESS2]);
        expect(result1).toBe(`Welcome back${IAC_WILL_COMPRESS2}`);
        expect(handler.isActive()).toBe(false);

        const compressed = compressor2.push('session 2 data\r\n');
        handler.processData(IAC_SB_COMPRESS2_SE + compressed);
        expect(handler.isActive()).toBe(true);

        const result2 = handler.processData(compressor2.push('more session 2\r\n'));
        expect(result2).toBe('more session 2\r\n');
    });
});
