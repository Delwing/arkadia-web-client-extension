import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONTENT_SIZE,
  clampPopupLength,
  getInitialPopupSize,
  resolvePopupLength,
} from '@web/layout/utils/popupSize';
import { WindowManager } from '@web/layout/WindowManager';

const setViewport = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
};

// jsdom has no layout: stand in for the browser resolving a probe's length.
const mockProbeSize = (px: number) =>
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: px, height: px, x: 0, y: 0, top: 0, left: 0, right: px, bottom: px, toJSON: () => ({}),
  } as DOMRect);

describe('resolvePopupLength', () => {
  afterEach(() => vi.restoreAllMocks());

  it('takes numbers as px', () => {
    expect(resolvePopupLength(420, 'width')).toBe(420);
  });

  it('ignores missing, zero, negative and non-finite numbers', () => {
    expect(resolvePopupLength(undefined, 'width')).toBeNull();
    expect(resolvePopupLength(0, 'width')).toBeNull();
    expect(resolvePopupLength(-5, 'height')).toBeNull();
    expect(resolvePopupLength(Number.NaN, 'height')).toBeNull();
  });

  it('recognises the content keyword', () => {
    expect(resolvePopupLength('content', 'width')).toBe(CONTENT_SIZE);
    expect(resolvePopupLength(' Content ', 'height')).toBe(CONTENT_SIZE);
  });

  it('resolves a CSS length through the browser', () => {
    const rect = mockProbeSize(480);
    expect(resolvePopupLength('30em', 'width')).toBe(480);
    expect(rect).toHaveBeenCalled();
    expect(document.body.children).toHaveLength(0);
  });

  it('ignores CSS it cannot parse', () => {
    mockProbeSize(480);
    expect(resolvePopupLength('wide', 'width')).toBeNull();
    expect(resolvePopupLength('', 'width')).toBeNull();
  });
});

describe('clampPopupLength', () => {
  beforeEach(() => setViewport(1000, 700));

  it('keeps the size on screen with a margin', () => {
    expect(clampPopupLength(5000, 'width', 300)).toBe(1000 - 32);
    expect(clampPopupLength(5000, 'height', 150)).toBe(700 - 32);
  });

  it('does not go below the minimum', () => {
    expect(clampPopupLength(100, 'width', 300)).toBe(300);
  });

  it('lets the screen win over the minimum on a tiny viewport', () => {
    setViewport(250, 700);
    expect(clampPopupLength(100, 'width', 300)).toBe(250 - 32);
  });
});

describe('getInitialPopupSize', () => {
  beforeEach(() => setViewport(1000, 800));

  it('falls back to the viewport defaults', () => {
    expect(getInitialPopupSize({})).toEqual({ width: 500, height: 320, fitWidth: false, fitHeight: false });
  });

  it('uses the requested px sizes', () => {
    expect(getInitialPopupSize({ initialWidth: 420, initialHeight: 260 }))
      .toEqual({ width: 420, height: 260, fitWidth: false, fitHeight: false });
  });

  it('starts content-sized axes at the default width and auto height', () => {
    expect(getInitialPopupSize({ initialWidth: 'content', initialHeight: 'content' }))
      .toEqual({ width: 500, height: undefined, fitWidth: true, fitHeight: true });
  });

  it('falls back per axis when a value is unusable', () => {
    expect(getInitialPopupSize({ initialWidth: 'wide', initialHeight: 5000 }))
      .toEqual({ width: 500, height: 800 - 32, fitWidth: false, fitHeight: false });
  });
});

describe('WindowManager.hasStoredGeometry', () => {
  it('is false for a popup never opened', () => {
    expect(new WindowManager().hasStoredGeometry('popup:x')).toBe(false);
  });

  it('is true while open and after closing (floating state kept)', () => {
    const m = new WindowManager();
    m.open('popup:x', { title: 'x', width: 400 });
    expect(m.hasStoredGeometry('popup:x')).toBe(true);
    m.close('popup:x');
    m.purgeWindowHint('popup:x');
    expect(m.hasStoredGeometry('popup:x')).toBe(true);
  });
});
