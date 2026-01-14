/**
 * Plugin Popup Registry - Manages registration of plugin popups
 *
 * Separated from pluginPopupRenderer.tsx to satisfy React Fast Refresh
 * which requires files to only export components.
 */

import type React from 'react';
import type { PluginPopupType } from './types';

export interface PluginPopupConfig {
  popupId: string;
  popupType: PluginPopupType;
  title: string;
  body: string | Node | React.ReactNode;
  isPinned: boolean;
  onClose: () => void;
  onPinnedChange: (pinned: boolean) => void;
  onLockedChange?: (locked: boolean) => void;
  onPanelRef?: (element: HTMLDivElement | null) => void;
}

// Registry of active plugin popups
const pluginPopupRegistry = new Map<string, PluginPopupConfig>();
const listeners = new Set<() => void>();

function notifyListeners(): void {
  listeners.forEach(listener => {
    try {
      listener();
    } catch (e) {
      console.error('[PluginPopupRegistry] Listener error:', e);
    }
  });
}

/**
 * Register a plugin popup to be rendered within the main React tree.
 */
export function registerPluginPopup(config: PluginPopupConfig): void {
  pluginPopupRegistry.set(config.popupId, config);
  notifyListeners();
}

/**
 * Unregister a plugin popup.
 */
export function unregisterPluginPopup(popupId: string): void {
  if (pluginPopupRegistry.delete(popupId)) {
    notifyListeners();
  }
}

/**
 * Update a plugin popup's config.
 */
export function updatePluginPopup(popupId: string, updates: Partial<PluginPopupConfig>): void {
  const existing = pluginPopupRegistry.get(popupId);
  if (existing) {
    pluginPopupRegistry.set(popupId, { ...existing, ...updates });
    notifyListeners();
  }
}

/**
 * Get all registered plugin popups.
 */
export function getPluginPopups(): PluginPopupConfig[] {
  return Array.from(pluginPopupRegistry.values());
}

/**
 * Subscribe to registry changes.
 */
export function subscribeToPluginPopups(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
