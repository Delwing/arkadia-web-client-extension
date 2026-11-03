import { describe, expect, it } from 'vitest';
import { approxSize } from '@web/storage/approxSize.ts';

describe('approxSize', () => {
    it('counts string characters and a few bytes per scalar', () => {
        expect(approxSize('abc')).toBe(3);
        expect(approxSize(42)).toBe(8);
        expect(approxSize(true)).toBe(1);
        expect(approxSize(null)).toBe(0);
        expect(approxSize(undefined)).toBe(0);
    });

    it('counts binary data by its bytes', () => {
        expect(approxSize(new ArrayBuffer(100))).toBe(100);
        expect(approxSize(new Uint8Array(64))).toBe(64);
        expect(approxSize(new Blob(['12345']))).toBe(5);
    });

    it('sums arrays, maps, sets and objects with their keys', () => {
        expect(approxSize(['ab', 'c'])).toBe(3);
        expect(approxSize({ text: 'abcd', timestamp: 1 })).toBe('text'.length + 4 + 'timestamp'.length + 8);
        expect(approxSize(new Map([['k', 'vv']]))).toBe(3);
        expect(approxSize(new Set(['a', 'bb']))).toBe(3);
    });

    it('stops at a self-reference rather than recursing for ever', () => {
        const loop: Record<string, unknown> = { a: 'x' };
        loop.self = loop;
        expect(Number.isFinite(approxSize(loop))).toBe(true);
    });
});
