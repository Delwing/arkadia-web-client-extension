import { useEffect, type CSSProperties } from 'react';
import { useWindowSetting } from '../../hooks/useWindowSetting';
import { windowManager } from '../WindowManager';
import {
  applyWindowAppearance,
  normalizeWindowBackground,
  splitWindowBackground,
  subscribeToWindowSetting,
  WINDOW_BACKGROUND_KEY,
  WINDOW_FONT_FAMILY_KEY,
  WINDOW_FONT_SIZE_KEY,
  windowBackgroundRgba,
} from '../windowSettings';

const APPEARANCE_KEYS = [WINDOW_FONT_SIZE_KEY, WINDOW_FONT_FAMILY_KEY, WINDOW_BACKGROUND_KEY];

/**
 * Keep a window's appearance overrides applied to its content element. Every
 * frame that shows a window with a settings cog calls this (the stock panel
 * shells and forge's floating host); the element outlives any one frame, so
 * applying it from more than one is harmless.
 */
export function useWindowAppearance(windowId: string, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    // Same element the content portals into (created on demand either way).
    const apply = () => applyWindowAppearance(windowManager.getOrCreatePortalTarget(windowId), windowId);
    apply();
    const unsubs = APPEARANCE_KEYS.map(key => subscribeToWindowSetting(windowId, key, apply));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [windowId, enabled]);
}

/** Props for a shell's content slot that paint the window's background override. */
export interface WindowBackgroundProps {
  style: CSSProperties;
  /** Translucent windows let what is under them show through (popups.css). */
  'data-window-bg': 'opaque' | 'translucent';
}

/**
 * Props for a shell's content slot: paints the window's background override
 * behind its content (the portal target itself is `display: contents` and
 * paints nothing). Undefined while the window shows its default background.
 */
export function useWindowBackground(windowId: string): WindowBackgroundProps | undefined {
  const [stored] = useWindowSetting<unknown>(windowId, WINDOW_BACKGROUND_KEY, null);
  const background = normalizeWindowBackground(stored);
  if (background === null) return undefined;
  return {
    style: { backgroundColor: windowBackgroundRgba(background) },
    'data-window-bg': splitWindowBackground(background).alpha === 1 ? 'opaque' : 'translucent',
  };
}
