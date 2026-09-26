import { describe, expect, it } from 'vitest';
import { FIT_MARGIN, fitToViewport } from '@web/layout/utils/fitToViewport';

const phone = { width: 390, height: 700 };
const desktop = { width: 1600, height: 900 };

describe('fitToViewport', () => {
  it('caps a desktop-sized popup to the phone screen and keeps it on screen', () => {
    const fitted = fitToViewport({ x: 20, y: 100, width: 550, height: 500 }, phone, {
      keepOnScreen: true,
    });
    expect(fitted.width).toBe(phone.width - 2 * FIT_MARGIN);
    expect(fitted.x).toBe(FIT_MARGIN);
    expect(fitted.x + fitted.width).toBeLessThanOrEqual(phone.width);
    expect(fitted.y + (fitted.height ?? 0)).toBeLessThanOrEqual(phone.height);
  });

  it('pulls a window restored off screen back into view', () => {
    const fitted = fitToViewport({ x: 1200, y: 800, width: 300, height: 400 }, phone, {
      keepOnScreen: true,
    });
    expect(fitted.x).toBe(phone.width - 300 - FIT_MARGIN);
    expect(fitted.y).toBe(phone.height - 400 - FIT_MARGIN);
  });

  it('caps a height taller than the screen', () => {
    const fitted = fitToViewport({ x: 0, y: 0, width: 300, height: 2000 }, phone, {
      keepOnScreen: true,
    });
    expect(fitted.height).toBe(phone.height - 2 * FIT_MARGIN);
    expect(fitted.y).toBe(FIT_MARGIN);
  });

  it('uses the measured height of an auto-height window', () => {
    const fitted = fitToViewport({ x: 0, y: 600, width: 300, height: undefined }, phone, {
      keepOnScreen: true,
      measuredHeight: 300,
    });
    expect(fitted.height).toBeUndefined();
    expect(fitted.y).toBe(phone.height - 300 - FIT_MARGIN);
  });

  it('leaves desktop position alone, even partly off screen', () => {
    const geom = { x: 1400, y: 50, width: 550, height: 500 };
    expect(fitToViewport(geom, desktop, { keepOnScreen: false })).toEqual(geom);
  });
});
