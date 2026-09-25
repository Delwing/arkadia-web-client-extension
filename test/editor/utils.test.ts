import { describe, expect, it } from 'vitest';
import { formatAgo } from '../../editor/utils';

const NOW = Date.UTC(2026, 8, 25, 12, 0, 0);
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

describe('formatAgo', () => {
    it('keeps the switcher column short', () => {
        expect(formatAgo(NOW - 20_000, false, NOW)).toBe('just now');
        expect(formatAgo(NOW - 2 * MIN, false, NOW)).toBe('2 min');
        expect(formatAgo(NOW - 3 * 60 * MIN, false, NOW)).toBe('3 h');
        expect(formatAgo(NOW - 3 * DAY, false, NOW)).toBe('3 d');
        expect(formatAgo(NOW - 14 * DAY, false, NOW)).toBe('2 wk');
        expect(formatAgo(NOW - 60 * DAY, false, NOW)).toBe('2 mo');
        expect(formatAgo(NOW - 800 * DAY, false, NOW)).toBe('2 y');
    });

    it('reads as a phrase on the welcome cards', () => {
        expect(formatAgo(NOW - 2 * MIN, true, NOW)).toBe('2 min ago');
        expect(formatAgo(NOW - DAY, true, NOW)).toBe('yesterday');
        expect(formatAgo(NOW - 3 * DAY, true, NOW)).toBe('3 days ago');
    });

    it('treats a clock slightly ahead of now as just now', () => {
        expect(formatAgo(NOW + 5 * MIN, false, NOW)).toBe('just now');
    });
});
