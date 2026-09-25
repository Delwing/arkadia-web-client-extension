import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { isLikelyTouchDevice, isMobileLikeViewport } from '@shared/dom/pointerEnvironment';

/**
 * The device-level touch guess. A touch-screen laptop with a mouse reports
 * touch points (Firefox even a coarse primary pointer) yet must stay desktop.
 */
describe('isLikelyTouchDevice', () => {
    let media: { coarse: boolean; fine: boolean };
    const originalMatchMedia = window.matchMedia;
    const originalTouchPoints = Object.getOwnPropertyDescriptor(navigator, 'maxTouchPoints');

    const setTouchPoints = (value: number) =>
        Object.defineProperty(navigator, 'maxTouchPoints', { value, configurable: true });

    beforeEach(() => {
        media = { coarse: false, fine: true };
        setTouchPoints(0);
        window.matchMedia = ((query: string) => ({
            media: query,
            matches: query === '(any-pointer: fine)' ? media.fine
                : query === '(pointer: coarse)' ? media.coarse : false,
            addEventListener: () => {},
            removeEventListener: () => {},
        })) as unknown as typeof window.matchMedia;
        Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true, writable: true });
    });

    afterEach(() => {
        window.matchMedia = originalMatchMedia;
        if (originalTouchPoints) Object.defineProperty(navigator, 'maxTouchPoints', originalTouchPoints);
        else delete (navigator as { maxTouchPoints?: number }).maxTouchPoints;
    });

    test('a plain desktop is not touch', () => {
        expect(isLikelyTouchDevice()).toBe(false);
    });

    test('a touch-screen laptop with a mouse stays desktop', () => {
        setTouchPoints(10);
        media = { coarse: true, fine: true };
        expect(isLikelyTouchDevice()).toBe(false);
        expect(isMobileLikeViewport()).toBe(false);
    });

    test('a phone or tablet without a fine pointer is touch', () => {
        setTouchPoints(5);
        media = { coarse: true, fine: false };
        expect(isLikelyTouchDevice()).toBe(true);
        expect(isMobileLikeViewport()).toBe(true);
    });

    test('touch points alone count when no fine pointer is reported', () => {
        setTouchPoints(5);
        media = { coarse: false, fine: false };
        expect(isLikelyTouchDevice()).toBe(true);
    });
});
