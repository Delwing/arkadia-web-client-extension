import type { ReactNode } from 'react';
import type { PopupPanelConfig } from './types';

export interface RegisteredPopup {
  id: string;
  config: PopupPanelConfig;
  renderContent: () => ReactNode;
  onClose: () => void;
  isPinned: boolean;
  setIsPinned: (pinned: boolean) => void;
  headerActions?: ReactNode;
}

// Registry singleton
const popupRegistry = new Map<string, RegisteredPopup>();
const listeners = new Set<() => void>();

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

export function updatePopup(id: string, updates: Partial<Pick<RegisteredPopup, 'isPinned' | 'headerActions'>>): void {
  const popup = popupRegistry.get(id);
  if (popup) {
    // Check if anything actually changed
    let hasChanges = false;
    if ('isPinned' in updates && popup.isPinned !== updates.isPinned) {
      hasChanges = true;
    }
    if ('headerActions' in updates && popup.headerActions !== updates.headerActions) {
      hasChanges = true;
    }
    if (hasChanges) {
      popupRegistry.set(id, { ...popup, ...updates });
      notifyListeners();
    }
  }
}

/**
 * Force a refresh of popup content rendering.
 * This notifies listeners without changing the registry data,
 * which causes LayoutContent to re-render and pick up updated content from refs.
 */
export function refreshPopupContent(): void {
  notifyListeners();
}
