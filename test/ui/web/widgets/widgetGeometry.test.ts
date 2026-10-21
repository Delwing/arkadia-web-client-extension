import { describe, expect, test } from 'vitest';
import { anchorAt, widgetPosition } from '@web-ui/widgets/widgetGeometry.ts';

const area = { left: 100, top: 50, width: 800, height: 600 };
const size = { width: 120, height: 40 };

describe('widget geometry', () => {
    test('each corner measures its offset from its own edges', () => {
        expect(widgetPosition({ corner: 'tl', dx: 10, dy: 20 }, area, size)).toEqual({ left: 110, top: 70 });
        expect(widgetPosition({ corner: 'tr', dx: 10, dy: 20 }, area, size)).toEqual({ left: 770, top: 70 });
        expect(widgetPosition({ corner: 'bl', dx: 10, dy: 20 }, area, size)).toEqual({ left: 110, top: 590 });
        expect(widgetPosition({ corner: 'br', dx: 10, dy: 20 }, area, size)).toEqual({ left: 770, top: 590 });
    });

    test('a right-pinned widget follows the right edge when the area narrows', () => {
        const narrow = { ...area, width: 400 };
        expect(widgetPosition({ corner: 'tr', dx: 10, dy: 20 }, narrow, size).left).toBe(370);
    });

    test('a widget stays inside the area when its offset no longer fits', () => {
        const small = { left: 0, top: 0, width: 300, height: 200 };
        expect(widgetPosition({ corner: 'tl', dx: 500, dy: 500 }, small, size)).toEqual({ left: 180, top: 160 });
    });

    test('a widget bigger than the area sticks to its top-left', () => {
        const tiny = { left: 10, top: 10, width: 50, height: 20 };
        expect(widgetPosition({ corner: 'br', dx: 0, dy: 0 }, tiny, size)).toEqual({ left: 10, top: 10 });
    });

    test('a drop picks the corner nearest the widget centre', () => {
        expect(anchorAt(110, 70, size, area)).toEqual({ corner: 'tl', dx: 10, dy: 20 });
        expect(anchorAt(770, 590, size, area)).toEqual({ corner: 'br', dx: 10, dy: 20 });
        expect(anchorAt(770, 70, size, area).corner).toBe('tr');
        expect(anchorAt(110, 590, size, area).corner).toBe('bl');
    });

    test('anchor and position round-trip', () => {
        for (const [left, top] of [[130, 90], [600, 80], [200, 500], [700, 560]]) {
            expect(widgetPosition(anchorAt(left, top, size, area), area, size)).toEqual({ left, top });
        }
    });

    test('a drop outside the area never gives a negative offset', () => {
        const anchor = anchorAt(50, 0, size, area);
        expect(anchor).toEqual({ corner: 'tl', dx: 0, dy: 0 });
    });
});
