// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyWindowAppearance,
  getWindowBackground,
  getWindowFontFamily,
  getWindowFontSize,
  getWindowSetting,
  joinWindowBackground,
  migrateObjectListBackground,
  normalizeWindowBackground,
  setWindowSetting,
  splitWindowBackground,
  subscribeToWindowSetting,
  WINDOW_BACKGROUND_KEY,
  WINDOW_FONT_FAMILY_KEY,
  WINDOW_FONT_SIZE_KEY,
  windowBackgroundRgba,
} from '@web/layout/windowSettings';
import {
  getBuiltInPanelSetting,
  getPopupSetting,
  invalidateLayoutCache,
} from '@web/layout/utils/layoutStorage';

describe('window settings storage', () => {
  beforeEach(() => {
    localStorage.clear();
    invalidateLayoutCache();
  });

  it('stores popup settings in the popup bag', () => {
    setWindowSetting('popup:chat', 'noWrap', true);
    expect(getPopupSetting('popup:chat', 'noWrap', false)).toBe(true);
    expect(getWindowSetting('popup:chat', 'noWrap', false)).toBe(true);
  });

  it('stores Kondycje (objectList) settings in the built-in panel bag', () => {
    setWindowSetting('objectList', WINDOW_FONT_SIZE_KEY, 0.7);
    expect(getBuiltInPanelSetting('objectList', WINDOW_FONT_SIZE_KEY, null)).toBe(0.7);
    expect(getPopupSetting('objectList', WINDOW_FONT_SIZE_KEY, null)).toBeNull();
  });

  it('notifies subscribers of that window and key only', () => {
    const chat = vi.fn();
    const other = vi.fn();
    const unsub = subscribeToWindowSetting('popup:chat', 'noWrap', chat);
    subscribeToWindowSetting('popup:combat', 'noWrap', other);

    setWindowSetting('popup:chat', 'noWrap', true);
    expect(chat).toHaveBeenCalledWith(true);
    expect(other).not.toHaveBeenCalled();

    unsub();
    setWindowSetting('popup:chat', 'noWrap', false);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it('treats null and malformed overrides as following the main window', () => {
    expect(getWindowFontSize('popup:chat')).toBeNull();
    setWindowSetting('popup:chat', WINDOW_FONT_SIZE_KEY, 'big');
    expect(getWindowFontSize('popup:chat')).toBeNull();
    setWindowSetting('popup:chat', WINDOW_FONT_FAMILY_KEY, 'comic-sans');
    expect(getWindowFontFamily('popup:chat')).toBeNull();
  });
});

describe('applyWindowAppearance', () => {
  beforeEach(() => {
    localStorage.clear();
    invalidateLayoutCache();
  });

  it('overrides the output font variables on the window element only when set', () => {
    const el = document.createElement('div');
    applyWindowAppearance(el, 'popup:chat');
    expect(el.style.getPropertyValue('--output-font-size')).toBe('');

    setWindowSetting('popup:chat', WINDOW_FONT_SIZE_KEY, 0.75);
    setWindowSetting('popup:chat', WINDOW_FONT_FAMILY_KEY, 'fira-code');
    applyWindowAppearance(el, 'popup:chat');
    expect(el.style.getPropertyValue('--output-font-size')).toBe('0.75rem');
    expect(el.style.getPropertyValue('--window-font-size')).toBe('0.75rem');
    expect(el.style.getPropertyValue('--output-font-family')).toBe('"Fira Code", monospace');

    // Back to following the main window: the variables are removed, not blanked.
    setWindowSetting('popup:chat', WINDOW_FONT_SIZE_KEY, null);
    setWindowSetting('popup:chat', WINDOW_FONT_FAMILY_KEY, null);
    applyWindowAppearance(el, 'popup:chat');
    expect(el.style.getPropertyValue('--output-font-size')).toBe('');
    expect(el.style.getPropertyValue('--output-font-family')).toBe('');
  });

  it('scales fixed-size text by the override over the main size, per window kind', () => {
    const el = document.createElement('div');
    setWindowSetting('popup:chat', WINDOW_FONT_SIZE_KEY, 1.1);
    applyWindowAppearance(el, 'popup:chat');
    expect(el.style.getPropertyValue('--window-font-scale')).toBe('calc(1.1 / var(--output-font-size-value, 0.875))');

    const objects = document.createElement('div');
    setWindowSetting('objectList', WINDOW_FONT_SIZE_KEY, 0.7);
    applyWindowAppearance(objects, 'objectList');
    expect(objects.style.getPropertyValue('--window-font-scale')).toBe('calc(0.7 / var(--objects-font-size-value, 0.875))');

    setWindowSetting('popup:chat', WINDOW_FONT_SIZE_KEY, null);
    applyWindowAppearance(el, 'popup:chat');
    expect(el.style.getPropertyValue('--window-font-scale')).toBe('');
  });

  it('gives the chosen face to all of the window content', () => {
    const el = document.createElement('div');
    setWindowSetting('popup:chat', WINDOW_FONT_FAMILY_KEY, 'fira-code');
    applyWindowAppearance(el, 'popup:chat');
    for (const name of ['--window-font-family', '--font-ui', '--font-mono']) {
      expect(el.style.getPropertyValue(name)).toBe('"Fira Code", monospace');
    }
    expect(el.style.fontFamily).toBe('"Fira Code", monospace');

    setWindowSetting('popup:chat', WINDOW_FONT_FAMILY_KEY, null);
    applyWindowAppearance(el, 'popup:chat');
    expect(el.style.getPropertyValue('--font-ui')).toBe('');
    expect(el.style.fontFamily).toBe('');
  });

  it('uses plain monospace for the system default font', () => {
    const el = document.createElement('div');
    setWindowSetting('popup:chat', WINDOW_FONT_FAMILY_KEY, 'default');
    applyWindowAppearance(el, 'popup:chat');
    expect(el.style.getPropertyValue('--output-font-family')).toBe('monospace');
  });
});

describe('window background', () => {
  beforeEach(() => {
    localStorage.clear();
    invalidateLayoutCache();
  });

  it('accepts #rrggbb and #rrggbbaa colours only', () => {
    expect(normalizeWindowBackground('#A0b1C2')).toBe('#a0b1c2');
    expect(normalizeWindowBackground('#a0b1c266')).toBe('#a0b1c266');
    // Fully opaque is stored without the alpha.
    expect(normalizeWindowBackground('#a0b1c2ff')).toBe('#a0b1c2');
    expect(normalizeWindowBackground('red')).toBeNull();
    expect(normalizeWindowBackground('#fff')).toBeNull();
    expect(normalizeWindowBackground(12)).toBeNull();
    setWindowSetting('popup:chat', WINDOW_BACKGROUND_KEY, 'url(x)');
    expect(getWindowBackground('popup:chat')).toBeNull();
  });

  it('splits and joins colour and opacity', () => {
    expect(splitWindowBackground('#10203066')).toEqual({ color: '#102030', alpha: 0.4 });
    expect(splitWindowBackground('#102030')).toEqual({ color: '#102030', alpha: 1 });
    expect(joinWindowBackground('#102030', 0.4)).toBe('#10203066');
    expect(joinWindowBackground('#102030', 1)).toBe('#102030');
    expect(windowBackgroundRgba('#10203066')).toBe('rgba(16, 32, 48, 0.4)');
  });

  it('re-declares the popup background for the window content', () => {
    const el = document.createElement('div');
    setWindowSetting('popup:chat', WINDOW_BACKGROUND_KEY, '#102030');
    applyWindowAppearance(el, 'popup:chat');
    expect(el.style.getPropertyValue('--popup-bg')).toBe('#102030');

    // Translucent: content surfaces go see-through so what is under the window shows.
    setWindowSetting('popup:chat', WINDOW_BACKGROUND_KEY, '#10203080');
    applyWindowAppearance(el, 'popup:chat');
    expect(el.style.getPropertyValue('--popup-bg')).toBe('transparent');

    setWindowSetting('popup:chat', WINDOW_BACKGROUND_KEY, null);
    applyWindowAppearance(el, 'popup:chat');
    expect(el.style.getPropertyValue('--popup-bg')).toBe('');
  });
});

describe('migrateObjectListBackground', () => {
  beforeEach(() => {
    localStorage.clear();
    invalidateLayoutCache();
  });

  it('moves a customised Kondycje background into both Kondycje windows', () => {
    localStorage.setItem('uiSettings', JSON.stringify({
      objectsFontSize: 0.8, objectListBackgroundColor: '#336699', objectListBackgroundAlpha: 0.4,
    }));
    migrateObjectListBackground();
    invalidateLayoutCache();
    expect(getWindowBackground('objectList')).toBe('#33669966');
    expect(getWindowBackground('objectListOthers')).toBe('#33669966');
    expect(JSON.parse(localStorage.getItem('uiSettings')!)).toEqual({ objectsFontSize: 0.8 });
  });

  it('leaves the default and an existing window override alone', () => {
    setWindowSetting('objectListOthers', WINDOW_BACKGROUND_KEY, '#123456');
    localStorage.setItem('uiSettings', JSON.stringify({ objectListBackgroundColor: '#000000', objectListBackgroundAlpha: 0.4 }));
    migrateObjectListBackground();
    invalidateLayoutCache();
    expect(getWindowBackground('objectList')).toBeNull();
    expect(getWindowBackground('objectListOthers')).toBe('#123456');
    expect(JSON.parse(localStorage.getItem('uiSettings')!)).toEqual({});
  });
});

describe('applyWindowAppearance and window defaults', () => {
  beforeEach(() => {
    localStorage.clear();
    invalidateLayoutCache();
  });

  it('leaves Kondycje content alone until its background is overridden', () => {
    const el = document.createElement('div');
    applyWindowAppearance(el, 'objectList');
    expect(el.style.getPropertyValue('--popup-bg')).toBe('');
  });
});
