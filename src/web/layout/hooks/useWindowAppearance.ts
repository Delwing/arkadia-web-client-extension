import { useEffect } from 'react';
import { windowManager } from '../WindowManager';
import {
  applyWindowAppearance,
  subscribeToWindowSetting,
  WINDOW_FONT_FAMILY_KEY,
  WINDOW_FONT_SIZE_KEY,
} from '../windowSettings';

/**
 * Keep a window's font overrides applied to its content element. Every frame
 * that shows a window with a settings cog calls this (the stock panel shells
 * and forge's floating host); the element outlives any one frame, so applying
 * it from more than one is harmless.
 */
export function useWindowAppearance(windowId: string, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    // Same element the content portals into (created on demand either way).
    const apply = () => applyWindowAppearance(windowManager.getOrCreatePortalTarget(windowId), windowId);
    apply();
    const unsubSize = subscribeToWindowSetting(windowId, WINDOW_FONT_SIZE_KEY, apply);
    const unsubFamily = subscribeToWindowSetting(windowId, WINDOW_FONT_FAMILY_KEY, apply);
    return () => {
      unsubSize();
      unsubFamily();
    };
  }, [windowId, enabled]);
}
