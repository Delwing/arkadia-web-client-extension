// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyWindowAppearance,
  getWindowFontFamily,
  getWindowFontSize,
  getWindowSetting,
  setWindowSetting,
  subscribeToWindowSetting,
  WINDOW_FONT_FAMILY_KEY,
  WINDOW_FONT_SIZE_KEY,
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

  it('uses plain monospace for the system default font', () => {
    const el = document.createElement('div');
    setWindowSetting('popup:chat', WINDOW_FONT_FAMILY_KEY, 'default');
    applyWindowAppearance(el, 'popup:chat');
    expect(el.style.getPropertyValue('--output-font-family')).toBe('monospace');
  });
});
