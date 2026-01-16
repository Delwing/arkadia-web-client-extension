/**
 * Plugin Popup Registry - Manages registration of plugin popups
 *
 * Separated from pluginPopupRenderer.tsx to satisfy React Fast Refresh
 * which requires files to only export components.
 *
 * Design: Registration is separate from opening. Plugins register their popups
 * on load, and the layout manager decides whether to open them based on
 * persisted state (docked/pinned).
 */

import type React from 'react';
import type { PluginPopupType } from './types';

export type PopupContent = string | Node | React.ReactNode;

export interface PluginPopupConfig {
  popupId: string;
  popupType: PluginPopupType;
  title: string;
  /** Factory function to create popup content (called when popup opens) */
  createContent: () => PopupContent | Promise<PopupContent>;
  /** Current content (set after createContent is called) */
  body?: PopupContent;
  /** Custom actions to display in the popup header (buttons, etc.) */
  headerActions?: Node | React.ReactNode;
  isPinned: boolean;
  /** Whether the popup is currently open */
  isOpen: boolean;
  onClose: () => void;
  onPinnedChange: (pinned: boolean) => void;
  onLockedChange?: (locked: boolean) => void;
  onPanelRef?: (element: HTMLDivElement | null) => void;
}

// Registry of plugin popups (registered popups, may or may not be open)
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
 * Register a plugin popup. The popup starts closed unless isOpen is true.
 */
export function registerPluginPopup(config: PluginPopupConfig): void {
  pluginPopupRegistry.set(config.popupId, config);
  notifyListeners();
}

/**
 * Unregister a plugin popup completely.
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
 * Open a registered popup. Calls createContent if body is not set.
 */
export async function openPluginPopup(popupId: string): Promise<void> {
  const config = pluginPopupRegistry.get(popupId);
  if (!config) return;

  // If already open, do nothing
  if (config.isOpen) return;

  // Create content if not already created
  if (config.body === undefined) {
    const content = await Promise.resolve(config.createContent());
    pluginPopupRegistry.set(popupId, { ...config, body: content, isOpen: true });
  } else {
    pluginPopupRegistry.set(popupId, { ...config, isOpen: true });
  }
  notifyListeners();
}

/**
 * Close a popup (but keep it registered).
 */
export function closePluginPopup(popupId: string): void {
  const config = pluginPopupRegistry.get(popupId);
  if (!config || !config.isOpen) return;

  pluginPopupRegistry.set(popupId, { ...config, isOpen: false });
  notifyListeners();
}

/**
 * Check if a popup is registered.
 */
export function isPluginPopupRegistered(popupId: string): boolean {
  return pluginPopupRegistry.has(popupId);
}

/**
 * Get a specific popup config.
 */
export function getPluginPopup(popupId: string): PluginPopupConfig | undefined {
  return pluginPopupRegistry.get(popupId);
}

/**
 * Get all registered plugin popups.
 */
export function getPluginPopups(): PluginPopupConfig[] {
  return Array.from(pluginPopupRegistry.values());
}

/**
 * Get all open plugin popups (for rendering).
 */
export function getOpenPluginPopups(): PluginPopupConfig[] {
  return Array.from(pluginPopupRegistry.values()).filter(p => p.isOpen);
}

/**
 * Subscribe to registry changes.
 */
export function subscribeToPluginPopups(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
