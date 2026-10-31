import type React from "react";
import type { PluginPopupConfig } from "@client/ports";
import { getPluginHostPort } from "@client/ports";
import {
  registerPopupMenuEntry,
  setPopupMenuEntryDisabled,
  unregisterPopupMenuEntry,
  updatePopupMenuEntryLabel,
} from "@modules/core/pluginUiRegistry";
import type { PluginApiContext } from "../context";

/**
 * Popup content that can be rendered inside plugin popups.
 * Can be:
 * - string: HTML string rendered via dangerouslySetInnerHTML
 * - Node: DOM node appended to container
 * - React.ReactNode: React component/element rendered directly
 */
export type PopupContent = string | Node | React.ReactNode;

/**
 * Handle returned when creating a popup window
 */
export interface PopupHandle {
  /**
   * Root popup element (for further customization)
   */
  readonly element: HTMLDivElement;

  /**
   * Check if popup is pinned
   */
  readonly isPinned: boolean;

  /**
   * Update popup title
   */
  setTitle(title: string): void;

  /**
   * Update popup body content
   */
  setBody(content: PopupContent): void;

  /**
   * Set pinned state
   */
  setPinned(pinned: boolean): void;

  /**
   * Register a callback to be called when popup closes
   * @param callback - Function to call when popup closes
   */
  onClose(callback: () => void): void;

  /**
   * Close and remove the popup
   */
  close(): void;
}

/**
 * Starting size of a popup along one axis:
 * - a number - pixels (`420`)
 * - any CSS length - `'420px'`, `'30em'`, `'40%'` / `'50vw'` (of the game window),
 *   `'min(600px, 80vw)'`
 * - `'content'` - fit the popup's content
 *
 * The result is kept on screen (with a small margin) and never below the
 * resize minimum (300x150). It is used when the popup first opens and when the
 * user resets it - a size the user set by resizing always wins.
 */
export type PopupSize = number | string;

/**
 * Starting size of a popup. Leave a field out to get the default
 * (half the game window width, 40% of its height).
 */
export interface PopupSizeOptions {
  initialWidth?: PopupSize;
  initialHeight?: PopupSize;
}

/**
 * Configuration for creating a persistent popup
 */
export interface PersistentPopupConfig extends PopupSizeOptions {
  /**
   * Unique identifier for this popup (will be namespaced by plugin).
   * Use a consistent ID across sessions to enable persistence.
   */
  id: string;

  /**
   * Popup title (can be updated later via handle)
   */
  title: string;

  /**
   * Factory function to create popup content.
   * Called when popup is created or restored from a previous session.
   * Can be async to support loading data before rendering.
   */
  createContent: () => PopupContent | Promise<PopupContent>;

  /**
   * Custom actions to display in the popup header (buttons, etc.).
   * These appear before the built-in lock/pin/close buttons.
   * Can be a DOM node or React element.
   */
  headerActions?: Node | React.ReactNode;

  /**
   * Initial pinned state (default: false).
   * When pinned, popup will be restored on page reload.
   */
  pinned?: boolean;

  /**
   * Fields for the popup's settings cog. Pass the same array every time.
   * Read and write the values with the handle's getSetting / setSetting.
   */
  settingsFields?: PluginWindowSettingField[];
}

/**
 * Handle returned when registering a persistent popup.
 * Extends PopupHandle with additional persistence features.
 */
export interface PersistentPopupHandle extends PopupHandle {
  /**
   * The stable popup ID (namespaced by plugin)
   */
  readonly id: string;

  /**
   * Whether this popup was restored from a previous session.
   * True if the popup was docked or pinned when the page was last closed.
   */
  readonly wasRestored: boolean;

  /**
   * Whether the popup is currently open
   */
  readonly isOpen: boolean;

  /**
   * Open the popup (if closed).
   * Calls createContent() to generate fresh content.
   */
  open(): Promise<void>;

  /**
   * Update the header actions (buttons displayed in popup header)
   * @param actions - DOM node or React element for header actions
   */
  setHeaderActions(actions: Node | React.ReactNode): void;

  /**
   * Replace the fields in the popup's settings cog, for options that are only
   * known later (e.g. a list loaded after login). Stored values are kept.
   */
  setSettingsFields(fields: PluginWindowSettingField[]): void;

  /**
   * Read a value from the popup's settings, kept with its window layout
   * (the keys of `settingsFields`, or any other key the plugin chooses).
   */
  getSetting<T>(key: string, defaultValue: T): T;

  /** Store a value in the popup's settings. */
  setSetting<T>(key: string, value: T): void;

  /**
   * Listen for changes to one setting - from the settings cog, another
   * setSetting call, or a layout import.
   * @returns Function that removes the listener
   */
  onSettingChange<T>(key: string, listener: (value: T) => void): () => void;
}

/**
 * Handle for popup menu entries
 */
export interface PopupMenuEntryHandle {
  /**
   * Update the entry label
   * @param label - String or DOM node for rich content
   */
  setLabel(label: string | Node): void;

  /**
   * Enable or disable the entry
   */
  setDisabled(disabled: boolean): void;

  /**
   * Remove the entry from the menu
   */
  remove(): void;
}

/**
 * A field in a plugin popup's settings cog (⚙ in the window header), shown
 * under the shared font settings. The value is kept in the window's settings
 * and read back with {@link PersistentPopupHandle.getSetting}.
 */
export type PluginWindowSettingField =
  | { type: 'toggle'; key: string; label: string; default: boolean; /** The stored flag is the opposite of the label */ inverted?: boolean }
  | { type: 'select'; key: string; label: string; default: string; options: { value: string; label: string }[] }
  | { type: 'number'; key: string; label: string; default: number; min?: number; max?: number; step?: number };

// Plugin-host capabilities (plugin-popup lifecycle) are provided by the
// surrounding UI through the injected PluginHostPort, resolved at call time.
const shouldPopupAutoOpen = (popupId: string) => getPluginHostPort().shouldPopupAutoOpen(popupId);
const getPopupPinnedState = (popupId: string) => getPluginHostPort().getPopupPinnedState(popupId);
const registerPluginPopup = (config: PluginPopupConfig) => getPluginHostPort().registerPluginPopup(config);
const unregisterPluginPopup = (popupId: string) => getPluginHostPort().unregisterPluginPopup(popupId);
const updatePluginPopup = (popupId: string, updates: Partial<PluginPopupConfig>) => getPluginHostPort().updatePluginPopup(popupId, updates);
const openPluginPopup = (popupId: string) => getPluginHostPort().openPluginPopup(popupId);
const closePluginPopup = (popupId: string) => getPluginHostPort().closePluginPopup(popupId);
const getPluginPopup = (popupId: string) => getPluginHostPort().getPluginPopup(popupId);

export function createPopupApi(ctx: PluginApiContext) {
  const popupHandles = new Set<PopupHandle>();
  const persistentPopupHandles = new Map<string, PersistentPopupHandle>();
  const popupMenuEntryIds = new Set<string>();
  ctx.onCleanup(() => {
    for (const popup of Array.from(popupHandles)) popup.close();
    popupHandles.clear();
    for (const handle of persistentPopupHandles.values()) {
      if (handle.isOpen) handle.close();
    }
    persistentPopupHandles.clear();
    for (const id of Array.from(popupMenuEntryIds)) unregisterPopupMenuEntry(id);
    popupMenuEntryIds.clear();
  });

  function createPopup(title: string, body: PopupContent, options?: PopupSizeOptions): Promise<PopupHandle> {
    return new Promise((resolve) => {
      // Generate stable popup ID based on title for state persistence
      // Use a simple hash of the title to create a consistent identifier
      const titleHash = title.split('').reduce((hash, char) => {
        return ((hash << 5) - hash + char.charCodeAt(0)) | 0;
      }, 0).toString(36).replace('-', 'n');
      const popupType = `plugin:${ctx.pluginId}:${titleHash}` as const;
      const popupId = `popup:${popupType}`;

      let currentTitle = title;
      let currentBody = body;
      let isPinned = false;
      let panelRef: HTMLDivElement | null = null;
      const closeCallbacks = new Set<() => void>();

      const closePopup = () => {
        // Call all registered close callbacks
        closeCallbacks.forEach(callback => {
          try {
            callback();
          } catch (error) {
            console.error('[PluginApi] Error in popup close callback:', error);
          }
        });

        // For non-persistent popups, unregister completely on close
        unregisterPluginPopup(popupId);
        popupHandles.delete(handle);
      };

      // Register popup to be rendered by PluginPopupRenderer inside LayoutProvider
      // Non-persistent popups open immediately (isOpen: true)
      const popupConfig: PluginPopupConfig = {
        popupId,
        popupType,
        title: currentTitle,
        createContent: () => currentBody,
        body: currentBody,
        isPinned,
        isOpen: true, // Open immediately for non-persistent popups
        initialWidth: options?.initialWidth,
        initialHeight: options?.initialHeight,
        onClose: closePopup,
        onPinnedChange: (pinned) => {
          isPinned = pinned;
        },
        onPanelRef: (element) => {
          panelRef = element;
          // Resolve the promise once the panel is mounted
          if (element) {
            resolve(handle);
          }
        }
      };

      registerPluginPopup(popupConfig);

      const handle: PopupHandle = {
        get element(): HTMLDivElement {
          // panelRef will always be set when handle is resolved
          return panelRef!;
        },
        get isPinned(): boolean {
          return isPinned;
        },
        setTitle: (value) => {
          currentTitle = value;
          updatePluginPopup(popupId, { title: value });
        },
        setBody: (content) => {
          currentBody = content;
          updatePluginPopup(popupId, { body: content });
        },
        setPinned: (pinned: boolean) => {
          isPinned = pinned;
          updatePluginPopup(popupId, { isPinned: pinned });
        },
        onClose: (callback: () => void) => {
          closeCallbacks.add(callback);
        },
        close: closePopup
      };

      popupHandles.add(handle);
    });
  }

  async function registerPersistentPopup(config: PersistentPopupConfig): Promise<PersistentPopupHandle> {
    // Generate stable popup ID from plugin ID and user-provided ID
    const popupType = `plugin:${ctx.stateKey}:${config.id}` as const;
    const popupId = `popup:${popupType}`;

    // Get persisted pinned state from storage (for restoring after reload)
    const persistedPinned = getPopupPinnedState(popupId);

    // Internal state tracking
    let currentTitle = config.title;
    // Restore pinned state from storage, or use config value, or default to false
    let currentPinned = persistedPinned || config.pinned || false;
    let panelRef: HTMLDivElement | null = null;
    const closeCallbacks = new Set<() => void>();

    // Close handler - called when popup is closed (but stays registered)
    const closePopup = () => {
      closeCallbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          console.error('[PluginApi] Error in popup close callback:', error);
        }
      });
      closePluginPopup(popupId);
    };

    // Open handler - opens the popup (creates content if needed)
    const openPopup = async (): Promise<void> => {
      const current = getPluginPopup(popupId);
      if (current?.isOpen) return;
      await openPluginPopup(popupId);
    };

    // Register the popup config immediately (but don't open it yet)
    // The PluginPopupRenderer will check shouldPopupAutoOpen and open it if needed
    const popupConfig: PluginPopupConfig = {
      popupId,
      popupType,
      title: currentTitle,
      createContent: config.createContent,
      headerActions: config.headerActions,
      settingsFields: config.settingsFields,
      isPinned: currentPinned,
      isOpen: false, // Start closed, PluginPopupRenderer will auto-open if needed
      initialWidth: config.initialWidth,
      initialHeight: config.initialHeight,
      onClose: closePopup,
      onPinnedChange: (pinned) => {
        currentPinned = pinned;
        updatePluginPopup(popupId, { isPinned: pinned });
      },
      onPanelRef: (element) => {
        panelRef = element;
      }
    };

    registerPluginPopup(popupConfig);

    // Create the persistent handle
    const persistentHandle: PersistentPopupHandle = {
      id: popupId,
      // wasRestored will be true if the popup auto-opens (checked by PluginPopupRenderer)
      get wasRestored(): boolean {
        return shouldPopupAutoOpen(popupId);
      },
      get element(): HTMLDivElement {
        if (!panelRef) {
          throw new Error('Popup is not open. Call open() first.');
        }
        return panelRef;
      },
      get isPinned(): boolean {
        return currentPinned;
      },
      get isOpen(): boolean {
        const current = getPluginPopup(popupId);
        return current?.isOpen ?? false;
      },
      setTitle: (value) => {
        currentTitle = value;
        updatePluginPopup(popupId, { title: value });
      },
      setBody: (content) => {
        updatePluginPopup(popupId, { body: content });
      },
      setPinned: (pinned) => {
        currentPinned = pinned;
        updatePluginPopup(popupId, { isPinned: pinned });
      },
      setHeaderActions: (actions) => {
        updatePluginPopup(popupId, { headerActions: actions });
      },
      setSettingsFields: (fields) => {
        updatePluginPopup(popupId, { settingsFields: fields });
      },
      getSetting: (key, defaultValue) => getPluginHostPort().getWindowSetting(popupId, key, defaultValue),
      setSetting: (key, value) => getPluginHostPort().setWindowSetting(popupId, key, value),
      onSettingChange: (key, listener) => {
        const unsubscribe = getPluginHostPort().subscribeToWindowSetting(popupId, key, value => listener(value as never));
        ctx.track(unsubscribe);
        return unsubscribe;
      },
      onClose: (callback) => {
        closeCallbacks.add(callback);
      },
      close: closePopup,
      open: openPopup
    };

    // Store in our tracking map
    persistentPopupHandles.set(config.id, persistentHandle);

    return persistentHandle;
  }

  function addPopupMenuEntry(label: string | Node, onSelect: () => void): PopupMenuEntryHandle {
    const id = ctx.generateId("popup-menu");
    registerPopupMenuEntry(id, label, onSelect);
    popupMenuEntryIds.add(id);

    return {
      setLabel: (value) => {
        updatePopupMenuEntryLabel(id, value);
      },
      setDisabled: (disabled) => {
        setPopupMenuEntryDisabled(id, disabled);
      },
      remove: () => {
        unregisterPopupMenuEntry(id);
        popupMenuEntryIds.delete(id);
      }
    };
  }

  return { createPopup, registerPersistentPopup, addPopupMenuEntry };
}
