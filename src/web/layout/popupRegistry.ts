import type { ReactNode } from 'react';
import type { PopupPanelConfig } from './types';

export interface RegisteredPopup {
  id: string;
  config: PopupPanelConfig;
  renderContent: () => ReactNode;
  onClose: () => void;
  isPinned: boolean;
  setIsPinned: (pinned: boolean) => void;
  isLocked: boolean;
  setIsLocked: (locked: boolean) => void;
  onReset: () => void;
  headerActions?: ReactNode;
  /** Popup-specific class applied to the outer shell (e.g. "contracts-window"). */
  panelClassName?: string;
}

// Registry singleton
const popupRegistry = new Map<string, RegisteredPopup>();
const listeners = new Set<() => void>();
const contentListeners = new Map<string, Set<() => void>>();

function notifyListeners(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.error('Popup registry listener error:', e);
    }
  });
}

export function registerPopup(popup: RegisteredPopup): void {
  const existing = popupRegistry.get(popup.id);
  // Only notify if this is a new popup registration
  const isNew = !existing;
  popupRegistry.set(popup.id, popup);
  if (isNew) {
    notifyListeners();
  }
}

export function unregisterPopup(id: string): void {
  if (popupRegistry.delete(id)) {
    notifyListeners();
  }
}

export function getRegisteredPopups(): RegisteredPopup[] {
  return Array.from(popupRegistry.values());
}

export function getPopup(id: string): RegisteredPopup | undefined {
  return popupRegistry.get(id);
}

export function hasPopup(id: string): boolean {
  return popupRegistry.has(id);
}

export function subscribeToRegistry(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function updatePopup(
  id: string,
  updates: Partial<Pick<RegisteredPopup, 'isPinned' | 'isLocked' | 'headerActions'>> & {
    /** Patches config.title — popups with live titles (counts, progress)
     *  mutate this without re-registering. */
    title?: string;
  },
): void {
  const popup = popupRegistry.get(id);
  if (popup) {
    // Check if anything actually changed
    let hasChanges = false;
    if ('isPinned' in updates && popup.isPinned !== updates.isPinned) {
      hasChanges = true;
    }
    if ('isLocked' in updates && popup.isLocked !== updates.isLocked) {
      hasChanges = true;
    }
    if ('headerActions' in updates && popup.headerActions !== updates.headerActions) {
      hasChanges = true;
    }
    const titleChanged =
      'title' in updates && popup.config.title !== updates.title;
    if (titleChanged) {
      hasChanges = true;
    }
    if (hasChanges) {
      const { title, ...rest } = updates;
      const next: RegisteredPopup = { ...popup, ...rest };
      if (titleChanged) {
        next.config = { ...popup.config, title };
      }
      popupRegistry.set(id, next);
      notifyListeners();
    }
  }
}

export function subscribeToPopupContent(popupId: string, listener: () => void): () => void {
  if (!contentListeners.has(popupId)) {
    contentListeners.set(popupId, new Set());
  }
  contentListeners.get(popupId)!.add(listener);
  return () => {
    contentListeners.get(popupId)?.delete(listener);
  };
}

/**
 * Force a refresh of a single popup's content rendering.
 * Only notifies the specific popup's content subscribers, avoiding
 * a global re-render of all FloatingPanel instances.
 */
export function refreshPopupContent(popupId: string): void {
  contentListeners.get(popupId)?.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.error('Popup content listener error:', e);
    }
  });
}
