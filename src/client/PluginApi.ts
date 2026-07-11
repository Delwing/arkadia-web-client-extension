/**
 * Plugin API - Bridge between Client and Plugins
 *
 * Provides a stable, versioned API surface for external plugins.
 * This abstraction layer:
 * - Hides internal Client implementation details
 * - Provides a controlled interface for plugin capabilities
 * - Makes it easier to maintain backward compatibility
 */

/**
 * Plugin API - Bridge between Client and Plugins
 *
 * Provides a stable, versioned API surface for external plugins.
 * This abstraction layer:
 * - Hides internal Client implementation details
 * - Provides a controlled interface for plugin capabilities
 * - Makes it easier to maintain backward compatibility
 */
import type React from 'react';
import type Client from "./Client";
import type { CommandHookCallback } from "./Client";
import type {ClientEvents} from "@shared/events";
import type {FormatStateSnapshot} from "@client/ansi/FormatState";
import {AnsiAwareBuffer} from "@client/ansi/FormatState";
import type {Trigger, TriggerCallback, TriggerOptions, TriggerPattern} from "./Triggers";
import {gmcp} from "./gmcp";
import type {Settings} from "@modules/core/defaultSettings";
import {defaultSettings} from "@modules/core/defaultSettings";
import { characterStorage, globalStorage } from "@modules/core/storage";
import type {UiSettings, PluginPopupConfig} from "@client/ports";
import {getPluginHostPort} from "@client/ports";
import {getShellSettings, getRenderSettings, getMapSettings, getBehaviorSettings} from "@modules/core/settings";
import {
  registerContextMenuEntry,
  registerPopupMenuEntry,
  setPopupMenuEntryDisabled,
  unregisterContextMenuEntry,
  unregisterPopupMenuEntry,
  updateContextMenuEntry,
  updatePopupMenuEntryLabel
} from "@modules/core/pluginUiRegistry";
import {
  registerFooterComponent,
  unregisterFooterComponent,
  updateFooterComponent,
  setFooterComponentVisible,
  type FooterContent
} from "@modules/core/pluginFooterRegistry";
import type { ReactElement } from "react";
import {
  addGroupDefinition,
  addTransformDefinition,
  getGroupDefinitions,
  getTransformDefinitions
} from "./scripts/prettyContainers";
import {containerAction, getContainer, getContainerForms} from "./scripts/bagManager";
import loadMagics, { loadMagicsRaw } from "./scripts/magicsLoader";
import loadMagicKeys, { loadMagicKeysRaw } from "./scripts/magicKeyLoader";
import loadHerbs from "./scripts/herbsLoader";
import {
  type EntryContent,
  type EntryContext,
  type EntryStyle,
  type FilterResult,
  type ObjectData,
  type ObjectListEntryFilter,
  objectListFilters
} from "@modules/core/objectListFilters";
import {
  type EnemyBindCandidate,
  type EnemyBindLocationObject,
  type EnemyBindResolver,
  enemyBindResolvers
} from "@client/scripts/enemyBindResolvers";
import {
  type ButtonMacroClickContext,
  getButtonMacroById,
  getButtonMacroState,
  type MacroConfigField,
  type MacroState,
  type MacroStateContext,
  onButtonMacroStateChange,
  type PluginButtonMacro,
  registerButtonMacro,
  setButtonMacroState,
  unregisterButtonMacro,
  updateButtonMacroPluginName
} from "@modules/core/pluginButtonMacroRegistry";
import {
  type PluginTriggerMacro,
  registerTriggerMacro,
  type TriggerMacroContext,
  unregisterTriggerMacro,
  updateTriggerMacroPluginName
} from "@modules/core/pluginTriggerMacroRegistry";
import type {MobileButtonSetting} from "@web/buttonSettings";

// Plugin-host capabilities (default UI settings + plugin-popup lifecycle) are
// provided by the surrounding UI through the injected PluginHostPort, so this
// file no longer imports `@web` for them. These thin, module-local bindings
// resolve the port lazily (at call time) and preserve every existing call site.
const shouldPopupAutoOpen = (popupId: string) => getPluginHostPort().shouldPopupAutoOpen(popupId);
const getPopupPinnedState = (popupId: string) => getPluginHostPort().getPopupPinnedState(popupId);
const registerPluginPopup = (config: PluginPopupConfig) => getPluginHostPort().registerPluginPopup(config);
const unregisterPluginPopup = (popupId: string) => getPluginHostPort().unregisterPluginPopup(popupId);
const updatePluginPopup = (popupId: string, updates: Partial<PluginPopupConfig>) => getPluginHostPort().updatePluginPopup(popupId, updates);
const openPluginPopup = (popupId: string) => getPluginHostPort().openPluginPopup(popupId);
const closePluginPopup = (popupId: string) => getPluginHostPort().closePluginPopup(popupId);
const getPluginPopup = (popupId: string) => getPluginHostPort().getPluginPopup(popupId);
import {
  setPluginLocationNote,
  removePluginLocationNote,
  removeAllPluginNotes,
  getPluginLocationNotes,
  updatePluginNotesName,
  type PluginLocationNote
} from "@modules/core/pluginLocationNotesRegistry";
import {
  addLocalPerson,
  editPerson,
  deleteLocalPerson,
  ignorePerson,
  restorePerson,
  markAsEnemy,
  unmarkAsEnemy,
  markAsAlly,
  unmarkAsAlly,
  setPersonColor,
  clearPersonColor,
  getMergedSnapshot,
  makePersonKey,
  type PersonListEntry
} from "@modules/data/peopleLoader";

// Re-export filter types for plugin developers
export type {
  ObjectListEntryFilter,
  EntryContext,
  FilterResult,
  EntryStyle,
  EntryContent,
  ObjectData,
  EnemyBindCandidate,
  EnemyBindLocationObject,
  EnemyBindResolver
};

// Re-export macro types for plugin developers
export type {
  MacroConfigField,
  MacroState,
  MacroStateContext,
  ButtonMacroClickContext,
  TriggerMacroContext,
  MobileButtonSetting
};

// Re-export location note types for plugin developers
export type { PluginLocationNote };

// Re-export people types for plugin developers
export type { PersonListEntry };

// Re-export command hook type for plugin developers
export type { CommandHookCallback } from "./Client";

// Event system types
/**
 * Valid event names from ClientEvents
 */
export type EventKey = keyof ClientEvents;

/**
 * Event parameters for a given event key
 */
export type EventParams<K extends EventKey> = [ClientEvents[K]] extends [void]
  ? []
  : [ClientEvents[K]] extends [any[]]
    ? ClientEvents[K]
    : [ClientEvents[K]];

/**
 * Event listener function type for a given event key
 */
export type EventListener<K extends EventKey> = (...args: EventParams<K>) => void;

/**
 * Alias definition for command aliases
 */
export interface PluginAlias {
  id: string;
  pattern: RegExp;
  callback: (matches?: RegExpMatchArray) => boolean;
}

/**
 * Triggers API - Manage pattern-based triggers
 */
export interface TriggersApi {
  /**
   * Register a trigger that fires when a pattern matches
   * @param pattern - Pattern(s) to match
   * @param callback - Function to call on match
   * @param tag - Optional tag for grouping/removal
   * @param options - Trigger options
   * @returns The registered trigger instance
   */
  register(
    pattern: TriggerPattern,
    callback?: TriggerCallback,
    tag?: string,
    options?: TriggerOptions
  ): Trigger;

  /**
   * Register a one-time trigger (auto-removed after first match)
   * @param pattern - Pattern(s) to match
   * @param callback - Function to call on match
   * @param tag - Optional tag for grouping/removal
   * @param options - Trigger options
   * @returns The registered trigger instance
   */
  registerOneTime(
    pattern: TriggerPattern,
    callback: TriggerCallback,
    tag?: string,
    options?: TriggerOptions
  ): Trigger;

  /**
   * Register a token-based trigger (matches whole words/tokens)
   * Token triggers are optimized for matching whole words rather than regex patterns.
   * They split the line into tokens and match complete token sequences.
   * @param token - Token or phrase to match (will be split by spaces/punctuation)
   * @param callback - Function to call on match
   * @param tag - Optional tag for grouping/removal
   * @param options - Trigger options
   * @returns The registered trigger instance
   *
   * @example
   * ```typescript
   * // Match single word
   * api.triggers.registerToken("zloto", (line, matches) => {
   *   return line.color([0, line.text.length], api.colors.fromHex('#ffd700'));
   * }, "myPlugin");
   *
   * // Match phrase (multiple tokens)
   * api.triggers.registerToken("magiczny miecz", (line, matches) => {
   *   api.output.print("Found magic sword!", "system");
   *   return line;
   * }, "myPlugin");
   * ```
   */
  registerToken(
    token: string,
    callback?: TriggerCallback,
    tag?: string,
    options?: TriggerOptions
  ): Trigger;

  /**
   * Remove a specific trigger
   * @param trigger - Trigger instance to remove
   */
  remove(trigger: Trigger): void;

  /**
   * Remove all triggers with a specific tag
   * @param tag - Tag to filter by
   */
  removeByTag(tag: string): void;
}

/**
 * Aliases API - Manage command aliases
 */
export interface AliasesApi {
  /**
   * Register a command alias
   * @param pattern - Regex pattern to match user input
   * @param callback - Function to execute when pattern matches
   * @returns Alias ID for later removal
   */
  register(
    pattern: RegExp,
    callback: (matches?: RegExpMatchArray) => boolean
  ): string;

  /**
   * Remove a command alias by ID
   * @param id - Alias ID returned from register
   */
  remove(id: string): void;
}

/**
 * Events API - Subscribe to and emit events
 */
export interface EventsApi {
  /**
   * Subscribe to an event
   * @param event - Event name (see ClientEvents for available events)
   * @param listener - Event listener function
   * @param options - Listener options (once, signal)
   *
   * @example
   * ```typescript
   * // Subscribe to map movement
   * api.events.on("mapMove", () => {
   *   console.log("Player moved!");
   * });
   *
   * // Subscribe to GMCP with typed payload
   * api.events.on("gmcp", (data) => {
   *   console.log("GMCP:", data.path, data.value);
   * });
   *
   * // Subscribe to specific GMCP path
   * api.events.on("gmcp.room.info", (roomData) => {
   *   console.log("Room info:", roomData);
   * });
   * ```
   */
  on<K extends EventKey>(
    event: K,
    listener: EventListener<K>,
    options?: boolean | { once?: boolean; signal?: AbortSignal }
  ): void;

  /**
   * Unsubscribe from an event
   * @param event - Event name
   * @param listener - Event listener function to remove
   */
  off<K extends EventKey>(event: K, listener: EventListener<K>): void;

  /**
   * Emit an event
   * @param event - Event name
   * @param args - Event arguments
   *
   * @example
   * ```typescript
   * // Emit an in-app notification (toast in the notification center)
   * api.events.emit("notify", { text: "Hello!", time: 5000 });
   *
   * // Also fire an OS/browser notification (when the user granted permission)
   * api.events.emit("notify", { text: "Hello!", system: true });
   *
   * // Send a command
   * api.events.emit("sendCommand", { command: "look", echo: true });
   * ```
   */
  emit<K extends EventKey>(event: K, ...args: EventParams<K>): void;
}

/**
 * Options for creating a location highlighter
 */
export interface LocationHighlighterOptions {
  /** Highlight color (CSS color string). Defaults to "yellow" */
  color?: string;
  /** Whether the highlighter starts enabled. Defaults to true */
  enabled?: boolean;
}

/**
 * A location highlighter that can highlight rooms on the map.
 * Multiple highlighters can be active simultaneously with different colors.
 */
export interface LocationHighlighter {
  /**
   * Add room(s) to the highlight set
   * @param roomIds - Single room ID or array of room IDs to highlight
   *
   * @example
   * highlighter.add(12345);
   * highlighter.add([100, 200, 300]);
   */
  add(roomIds: number | number[]): void;

  /**
   * Remove room(s) from the highlight set
   * @param roomIds - Single room ID or array of room IDs to remove
   *
   * @example
   * highlighter.remove(12345);
   * highlighter.remove([100, 200]);
   */
  remove(roomIds: number | number[]): void;

  /**
   * Clear all rooms from the highlight set
   *
   * @example
   * highlighter.clear();
   */
  clear(): void;

  /**
   * Enable this highlighter (shows highlights on map)
   *
   * @example
   * highlighter.enable();
   */
  enable(): void;

  /**
   * Disable this highlighter (hides highlights without removing them)
   *
   * @example
   * highlighter.disable();
   */
  disable(): void;

  /**
   * Check if the highlighter is currently enabled
   * @returns true if enabled, false if disabled
   */
  isEnabled(): boolean;

  /**
   * Set the highlight color
   * @param color - CSS color string (e.g., "red", "#FF0000", "rgb(255,0,0)")
   *
   * @example
   * highlighter.setColor("#FF5500");
   * highlighter.setColor("cyan");
   */
  setColor(color: string): void;

  /**
   * Get the current highlight color
   * @returns The current CSS color string
   */
  getColor(): string;

  /**
   * Get all room IDs currently in the highlight set
   * @returns Array of room IDs
   */
  getRoomIds(): number[];

  /**
   * Destroy this highlighter and remove all its highlights from the map.
   * After calling destroy(), the highlighter should not be used.
   *
   * @example
   * highlighter.destroy();
   */
  destroy(): void;
}

/**
 * Area information exposed via Map API
 */
export interface AreaInfo {
  /** Numeric area ID */
  areaId: number;
  /** Area display name */
  areaName: string;
  /** Array of rooms in this area */
  rooms: MapData.Room[];
}

/**
 * Map API - Access and modify map location
 */
export interface MapApi {
  /**
   * Get current room information
   * @returns Current room with full details or undefined if not in a room
   *
   * @example
   * const room = api.map.getRoom();
   * if (room) {
   *   console.log(`Current room: ${room.name} (${room.id})`);
   *   console.log(`Coordinates: ${room.x}, ${room.y}, ${room.z}`);
   *   console.log(`Area: ${room.areaId}`);
   * }
   */
  getRoom(): MapData.Room | undefined;

  /**
   * Get room information by ID
   * @param roomId - Room ID to look up
   * @returns Room with full details or null if not found
   *
   * @example
   * const room = api.map.getRoomById(12345);
   * if (room) {
   *   console.log(`Room: ${room.name} (${room.id})`);
   *   console.log(`Hash: ${room.hash}`);
   * }
   */
  getRoomById(roomId: number): MapData.Room | null;

  /**
   * Get all areas with their rooms
   * @returns Array of area information objects
   *
   * @example
   * const areas = api.map.getAreas();
   * areas.forEach(area => {
   *   console.log(`Area: ${area.areaName} (${area.areaId})`);
   *   console.log(`Rooms: ${area.rooms.length}`);
   * });
   */
  getAreas(): AreaInfo[];

  /**
   * Find shortest path between two rooms
   * @param fromId - Starting room ID
   * @param toId - Destination room ID
   * @returns Array of room IDs representing the path, or null if no path exists
   *
   * @example
   * const path = api.map.findPath(100, 200);
   * if (path) {
   *   console.log(`Path length: ${path.length - 1} steps`);
   *   console.log(`Route: ${path.join(" -> ")}`);
   * }
   */
  findPath(fromId: number, toId: number): number[] | null;

  /**
   * Set map location programmatically
   * @param roomId - Room ID to navigate to
   *
   * @example
   * api.map.setLocation(12345);
   */
  setLocation(roomId: number): void;

  /**
   * Step back to previous map location
   *
   * @example
   * api.map.stepBack();
   */
  stepBack(): void;

  /**
   * Create a location highlighter for highlighting rooms on the map.
   * Multiple highlighters can exist simultaneously with different colors.
   * Each highlighter can be enabled/disabled independently.
   *
   * @param options - Optional configuration for the highlighter
   * @returns A LocationHighlighter instance
   *
   * @example
   * // Create a red highlighter for quest locations
   * const questHighlighter = api.map.createHighlighter({ color: "red" });
   * questHighlighter.add([100, 200, 300]);
   *
   * // Create a blue highlighter for shops
   * const shopHighlighter = api.map.createHighlighter({ color: "blue" });
   * shopHighlighter.add([400, 500]);
   *
   * // Toggle visibility
   * questHighlighter.disable();
   * questHighlighter.enable();
   *
   * // Clean up when done
   * questHighlighter.destroy();
   */
  createHighlighter(options?: LocationHighlighterOptions): LocationHighlighter;
}

/**
 * Output API - Print to game window
 */
export interface OutputApi {
  /**
   * Print text to the game output
   * @param text - Text or buffer to display
   */
  print(text: string | AnsiAwareBuffer): void;
}

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
 * Configuration for creating a persistent popup
 */
export interface PersistentPopupConfig {
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
 * Handle for context menu entries
 */
export interface ContextMenuEntryHandle {
  /**
   * Update the entry label
   * @param label - String or DOM node for rich content
   */
  setLabel(label: string | Node): void;

  /**
   * Update the entry action
   */
  setAction(action: () => void): void;

  /**
   * Remove the entry from the menu
   */
  remove(): void;
}

/**
 * Handle for footer components
 */
export interface FooterComponentHandle {
  /**
   * The DOM element for this footer component.
   * Can be used for direct DOM manipulation when using HTML or DOM node content.
   */
  readonly element: HTMLSpanElement;

  /**
   * Update the component content.
   * Accepts HTML strings, DOM nodes, or React elements.
   * When using React, the component will be re-rendered with the new element.
   * @param content - HTML string, DOM node, or React element
   */
  setContent(content: string | Node | ReactElement): void;

  /**
   * Set component visibility
   * @param visible - Whether the component should be visible
   */
  setVisible(visible: boolean): void;

  /**
   * Remove the component from the footer
   */
  remove(): void;
}

/**
 * UI helpers for plugins
 */
export interface UiApi {
  /**
   * Create a draggable popup window.
   *
   * @deprecated Use {@link registerPersistentPopup} instead for popups that need
   * docking and persistence across page reloads. This method generates popup IDs
   * from title hashes, which are not stable and prevent proper state restoration.
   *
   * @param title - Popup title text
   * @param body - Popup body content (string or DOM node)
   * @returns Promise that resolves with handle for controlling the popup once mounted
   */
  createPopup(title: string, body: PopupContent): Promise<PopupHandle>;

  /**
   * Register a persistent popup that can be docked and restored on page reload.
   *
   * If the popup was docked or pinned in a previous session, it will be
   * automatically opened when this method is called. The `wasRestored` property
   * on the returned handle indicates whether this happened.
   *
   * @param config - Popup configuration including ID, title, and content factory
   * @returns Promise that resolves with handle for controlling the popup
   *
   * @example
   * ```typescript
   * const popup = await api.ui.registerPersistentPopup({
   *   id: 'myInventory',
   *   title: 'My Inventory',
   *   createContent: async () => {
   *     const items = await loadInventoryData();
   *     return createInventoryView(items);
   *   }
   * });
   *
   * // Check if popup was restored from previous session
   * if (popup.wasRestored) {
   *   console.log('Popup was restored');
   * }
   *
   * // Toggle popup with menu entry
   * api.ui.addPopupMenuEntry('My Inventory', () => {
   *   popup.isOpen ? popup.close() : popup.open();
   * });
   * ```
   */
  registerPersistentPopup(config: PersistentPopupConfig): Promise<PersistentPopupHandle>;

  /**
   * Add an entry to the popup (⋮) menu
   * @param label - Entry label (string or DOM node for rich content like SVG icons)
   * @param onSelect - Callback invoked when entry is selected
   * @returns Handle for updating or removing the entry
   */
  addPopupMenuEntry(label: string | Node, onSelect: () => void): PopupMenuEntryHandle;

  /**
   * Add an entry to the output context menu
   * @param label - Entry label (string or DOM node for rich content like SVG icons)
   * @param action - Callback invoked when entry is selected
   * @returns Handle for updating or removing the entry
   */
  addContextMenuEntry(label: string | Node, action: () => void): ContextMenuEntryHandle;

  /**
   * Register a footer bar component.
   * Adds a custom component to the footer bar (next to built-in components like
   * Rozkaz timer, Clock, Attack mode, etc.)
   *
   * Supports three content types:
   * - HTML strings: Simple inline HTML
   * - DOM nodes: Pre-created DOM elements
   * - React elements: Full React components with state and hooks
   *
   * @param id - Unique identifier for this component (will be namespaced by plugin)
   * @param content - HTML string, DOM node, or React element
   * @param position - Where to insert: 'start', 'end' (default), or numeric index
   * @returns Handle for updating, hiding, or removing the component
   *
   * @example
   * ```typescript
   * // Simple HTML string
   * const timer = api.ui.registerFooterComponent(
   *   'myTimer',
   *   '<span style="color: yellow;">Timer: 0</span>'
   * );
   *
   * // Update content periodically
   * let seconds = 0;
   * setInterval(() => {
   *   seconds++;
   *   timer.setContent(`<span style="color: yellow;">Timer: ${seconds}</span>`);
   * }, 1000);
   * ```
   *
   * @example
   * ```typescript
   * // DOM node
   * const statusSpan = document.createElement('span');
   * statusSpan.style.color = 'springgreen';
   * statusSpan.textContent = 'Ready';
   *
   * const status = api.ui.registerFooterComponent('status', statusSpan);
   *
   * // Direct DOM manipulation
   * status.element.style.color = 'red';
   * status.element.textContent = 'Busy';
   * ```
   *
   * @example
   * ```typescript
   * // React component with state
   * import { useState, useEffect } from 'react';
   *
   * const MyTimer: React.FC = () => {
   *   const [seconds, setSeconds] = useState(0);
   *
   *   useEffect(() => {
   *     const interval = setInterval(() => setSeconds(s => s + 1), 1000);
   *     return () => clearInterval(interval);
   *   }, []);
   *
   *   return <span style={{ color: 'yellow' }}>Timer: {seconds}</span>;
   * };
   *
   * // Register React component
   * const timer = api.ui.registerFooterComponent('myTimer', <MyTimer />);
   *
   * // Can also update with new React element
   * timer.setContent(<MyTimer key="reset" />);
   * ```
   *
   * @example
   * ```typescript
   * // React component using client events (like built-in OrderTimer)
   * import { useState } from 'react';
   * import { useClientEvent } from '@web/hooks';
   *
   * const AttackStatus: React.FC = () => {
   *   const [isAttacking, setIsAttacking] = useState(false);
   *
   *   useClientEvent('combatStart', () => setIsAttacking(true));
   *   useClientEvent('combatEnd', () => setIsAttacking(false));
   *
   *   if (!isAttacking) return null;
   *   return <span style={{ color: 'red' }}>COMBAT</span>;
   * };
   *
   * api.ui.registerFooterComponent('attackStatus', <AttackStatus />);
   * ```
   */
  registerFooterComponent(
    id: string,
    content: string | Node | ReactElement,
    position?: 'start' | 'end' | number
  ): FooterComponentHandle;
}

/**
 * Colors API - Create and manage colors
 */
export interface ColorsApi {
  /**
   * Create a color from hex string
   * @param hex - Hex color string (e.g., "#ff0000")
   * @returns Format state with the color applied
   */
  fromHex(hex: string): FormatStateSnapshot;

  /**
   * Create a color from RGB values
   * @param r - Red (0-255)
   * @param g - Green (0-255)
   * @param b - Blue (0-255)
   * @returns Format state with the color applied
   */
  fromRgb(r: number, g: number, b: number): FormatStateSnapshot;
}

/**
 * Function Bind API - Manage keyboard bindings
 */
export interface BindApi {
  /**
   * Set a function bind - binds a command or callback to a key
   * When the configured key is pressed, either the command will be sent
   * or the callback will be executed.
   *
   * @param printable - Command string to execute (or null to just use callback)
   * @param callback - Optional callback function to execute instead of sending command
   * @param clearAfterUse - If true, clear the bind after it's used once
   *
   * @example
   * ```typescript
   * // Bind a command to the function key
   * api.bind.set("attack goblin");
   *
   * // Bind a callback function
   * api.bind.set(null, () => {
   *   api.output.print("Custom action triggered!", "system");
   * });
   *
   * // Bind with auto-clear after use
   * api.bind.set("use potion", undefined, true);
   * ```
   */
  set(printable: string | null, callback?: () => void, clearAfterUse?: boolean): void;

  /**
   * Clear the current function bind
   *
   * @example
   * ```typescript
   * api.bind.clear();
   * ```
   */
  clear(): void;

  /**
   * Get the current bind label (key combination)
   * Returns the configured key combination like "CTRL+]" or "ALT+SHIFT+K"
   *
   * @returns Label string representing the key combination
   *
   * @example
   * ```typescript
   * const label = api.bind.getLabel();
   * api.output.print(`Function bind key: ${label}`, "system");
   * ```
   */
  getLabel(): string;
}

/**
 * Team API - Access team information
 */
export interface TeamApi {
  /**
   * Get list of team member names
   * @returns Array of team member names
   *
   * @example
   * ```typescript
   * const members = api.team.getMembers();
   * api.output.print(`Team has ${members.length} members`, "system");
   * ```
   */
  getMembers(): string[];

  /**
   * Get the team leader's name
   * @returns Leader name or undefined if not in a team
   *
   * @example
   * ```typescript
   * const leader = api.team.getLeader();
   * if (leader) {
   *   api.output.print(`Team leader: ${leader}`, "system");
   * }
   * ```
   */
  getLeader(): string | undefined;

  /**
   * Get the team leader's object ID
   * @returns Leader object ID or undefined if not in a team
   */
  getLeaderId(): number | undefined;

  /**
   * Get the player's object number
   * @returns Player object number or undefined
   */
  getPlayerNum(): number | undefined;
}

/**
 * GMCP API - Access GMCP data
 */
export interface GmcpApi {
  /**
   * Get the current GMCP data object
   * Contains all GMCP data received from the server
   * @returns GMCP data object
   *
   * @example
   * ```typescript
   * const gmcp = api.gmcp.get();
   * const hp = gmcp?.char?.vitals?.hp;
   * const roomName = gmcp?.room?.info?.name;
   * ```
   */
  get(): Record<string, any>;
}

/**
 * Attack Queue API - Manage attack queue
 */
export interface AttackQueueApi {
  /**
   * Add an enemy to the attack queue
   * @param id - Object ID of the enemy
   * @returns True if added successfully, false if already in queue
   *
   * @example
   * ```typescript
   * const added = api.attackQueue.add("12345");
   * if (added) {
   *   api.output.print("Enemy added to queue", "system");
   * }
   * ```
   */
  add(id: number): boolean;

  /**
   * Remove an enemy from the attack queue
   * @param id - Object ID of the enemy
   * @returns True if removed successfully, false if not found
   *
   * @example
   * ```typescript
   * api.attackQueue.remove("12345");
   * ```
   */
  remove(id: number): boolean;

  /**
   * Clear the entire attack queue
   *
   * @example
   * ```typescript
   * api.attackQueue.clear();
   * api.output.print("Attack queue cleared", "system");
   * ```
   */
  clear(): void;

  /**
   * Get the current attack queue
   * @returns Array of enemy object IDs in queue order
   *
   * @example
   * ```typescript
   * const queue = api.attackQueue.get();
   * api.output.print(`Queue has ${queue.length} enemies`, "system");
   * ```
   */
  get(): number[];
}

/**
 * Location object information
 */
export interface LocationObject {
  /** Object number */
  num: number;
  /** Object description/name */
  desc?: string;
  /** HP */
  hp?: number;
  /** Attack number or boolean indicating combat status */
  attack_num?: boolean | number;
  /** Whether avatar is targeting this object */
  avatar_target?: boolean;
  /** Whether this is an attack target */
  attack_target?: boolean;
  /** Whether this is a defense target */
  defense_target?: boolean;
  /** Shortcut key for this object (e.g., '@', 'A', '1') */
  shortcut?: string;
  /** Category: player, team member, enemy, or non-combat entity */
  __category?: 'player' | 'team' | 'rest' | 'rest-noncombat';
}

/**
 * Objects API - Access objects in current location
 */
export interface ObjectsApi {
  /**
   * Get all objects in current location
   * Returns objects organized by category (player, team, enemies, non-combat)
   * with shortcuts assigned for easy targeting
   *
   * @returns Array of location objects with shortcuts and categories
   *
   * @example
   * ```typescript
   * const objects = api.objects.getObjectsOnLocation();
   *
   * // Find player object
   * const player = objects.find(o => o.__category === 'player');
   *
   * // Find all enemies
   * const enemies = objects.filter(o => o.__category === 'rest');
   *
   * // Find object by shortcut
   * const target = objects.find(o => o.shortcut === '1');
   * if (target) {
   *   api.output.print(`Target: ${target.desc} (${target.num})`, "system");
   * }
   * ```
   */
  getObjectsOnLocation(): LocationObject[];
}

/**
 * Command API - Send commands to the server
 */
export interface CommandApi {
  /**
   * Send a command to the server
   * @param command - Command string to send
   * @param echo - Whether to echo the command in the output (default: true)
   * @param options - Additional command options
   *
   * @example
   * ```typescript
   * // Send a simple command
   * api.command.send("look");
   *
   * // Send a command without echoing it
   * api.command.send("attack goblin", false);
   *
   * // Send multiple commands in a sequence
   * await api.command.send("get sword");
   * await api.command.send("wield sword");
   * ```
   */
  send(command: string, echo?: boolean, options?: any): Promise<void>;

  /**
   * Add words to the command line tab-completion suggestions.
   * These suggestions appear alongside words extracted from the output buffer
   * when the user presses Tab in the command input.
   * Duplicate words are ignored.
   *
   * @param words - Words to add as tab-completion suggestions
   *
   * @example
   * ```typescript
   * api.command.addSuggestions("goblin", "dragon", "potezny");
   * ```
   */
  addSuggestions(...words: string[]): void;

  /**
   * Remove words previously added via {@link addSuggestions}.
   *
   * @param words - Words to remove from tab-completion suggestions
   *
   * @example
   * ```typescript
   * api.command.removeSuggestions("goblin");
   * ```
   */
  removeSuggestions(...words: string[]): void;
}

/**
 * Command Hooks API - Intercept and modify commands before processing
 */
export interface CommandHooksApi {
  /**
   * Register a command hook that can alter or suppress commands.
   * Hooks are called early in sendCommand, before any processing
   * (before Polish character stripping, map parsing, alias matching, etc).
   *
   * @param callback - Hook callback function that receives the command and can:
   *   - Return a modified command string to alter the command
   *   - Return null to suppress/cancel the command
   *   - Return undefined to keep the original command unchanged
   * @param priority - Hook priority (higher runs first, default: 0)
   * @returns Hook ID for later removal
   *
   * @example
   * ```typescript
   * // Modify a command
   * const hookId = api.commandHooks.register((command, echo, options) => {
   *   if (command === "atakuj") {
   *     return "atakuj ob_12345"; // Replace with specific target
   *   }
   *   return undefined; // Keep original for other commands
   * });
   *
   * // Suppress a command
   * api.commandHooks.register((command) => {
   *   if (command.startsWith("niebezpieczne")) {
   *     api.output.print("Command blocked!");
   *     return null; // Suppress the command
   *   }
   *   return undefined;
   * });
   *
   * // Later: remove the hook
   * api.commandHooks.unregister(hookId);
   * ```
   */
  register(callback: CommandHookCallback, priority?: number): string;

  /**
   * Unregister a previously registered command hook
   * @param hookId - Hook ID returned from register
   * @returns true if hook was found and removed
   */
  unregister(hookId: string): boolean;
}

/**
 * Group definition for categorizing container items
 */
export interface GroupDefinition {
  /** Group name */
  name: string;
  /** Filter function to check if item belongs to this group */
  filter: (item: string) => boolean;
}

/**
 * Transform definition for styling container items
 */
export interface TransformDefinition {
  /**
   * Transform item buffer with optional formatting
   * @param buffer - The AnsiAwareBuffer containing the item name
   * @param item - The container item with name and count
   * @param group - The group name this item belongs to
   * @returns The buffer (modified or unmodified)
   */
  transform: (buffer: AnsiAwareBuffer, item: { name: string; count: string | number }, group: string) => AnsiAwareBuffer;
}

/**
 * Herb bag state - contains herbs and optional condition
 */
export interface HerbBagState {
  /** Map of herb ID to count */
  herbs: Record<string, number>;
  /** Bag condition (1-5, where 5 is best) */
  condition?: number;
}

/**
 * All herb bags state - map of bag number to bag state
 */
export type HerbBagsState = Record<number, HerbBagState>;

/**
 * Options for moving herbs between bags
 */
export interface HerbMoveOptions {
  /** Herb ID to move */
  herbId: string;
  /** Amount to move */
  amount: number;
  /** Source bag number */
  fromBag: number;
  /** Destination bag number */
  toBag: number;
}

/**
 * Herb grammatical forms (Polish declensions)
 */
export interface HerbForms {
  /** Nominative singular (mianownik) */
  mianownik: string;
  /** Genitive singular (dopelniacz) */
  dopelniacz: string;
  /** Accusative singular (biernik) */
  biernik: string;
  /** Nominative plural (mnoga mianownik) */
  mnoga_mianownik: string;
  /** Genitive plural (mnoga dopelniacz) */
  mnoga_dopelniacz: string;
  /** Accusative plural (mnoga biernik) */
  mnoga_biernik: string;
  /** Instrumental singular (narzednik) - used by "nabij fajke <herb>" */
  narzednik: string;
}

/**
 * Herb use/effect definition
 */
export interface HerbUse {
  /** Action command (e.g., "jedz", "pal") */
  action: string;
  /** Effect description */
  effect: string;
  /** If true, herb should not be bound when used */
  dont_bind?: boolean;
  /** If true, the herb can be smoked; such entries carry no real action/effect */
  smokable?: boolean;
}

/**
 * Complete herb database structure
 */
export interface HerbsData {
  /** Map of herb ID to grammatical forms */
  herb_id_to_odmiana: Record<string, HerbForms>;
  /** Database version number */
  version: number;
  /** Map of herb ID to array of uses/effects */
  herb_id_to_use: Record<string, HerbUse[]>;
}

/**
 * Pretty Containers API - Access and extend container formatting
 */
export interface PrettyContainersApi {
  /**
   * Get current group definitions for categorizing items
   * Groups determine how items are organized in container displays
   *
   * @returns Read-only array of group definitions
   *
   * @example
   * ```typescript
   * const groups = api.prettyContainers.getFilters();
   * console.log("Available groups:", groups.map(g => g.name));
   * ```
   */
  getFilters(): ReadonlyArray<Readonly<GroupDefinition>>;

  /**
   * Get current transform definitions for styling items
   * Transforms apply colors, links, and formatting to matching items
   *
   * @returns Read-only array of transform definitions
   *
   * @example
   * ```typescript
   * const transforms = api.prettyContainers.getTransforms();
   * console.log(`${transforms.length} transforms registered`);
   * ```
   */
  getTransforms(): ReadonlyArray<Readonly<TransformDefinition>>;

  /**
   * Add a new group definition for categorizing items
   * New groups will appear in container displays
   *
   * @param definition - Group definition with name and filter function
   *
   * @example
   * ```typescript
   * // Add a group for potions
   * api.prettyContainers.addFilter({
   *   name: "mikstury",
   *   filter: (item) => /eliksir|mikstur/.test(item)
   * });
   * ```
   */
  addFilter(definition: GroupDefinition): void;

  /**
   * Add a new transform definition for styling items
   * New transforms will be applied to all items in containers
   *
   * @param definition - Transform definition with transform function
   *
   * @example
   * ```typescript
   * // Highlight potions in green
   * api.prettyContainers.addTransform({
   *   transform: (buffer, item, group) => {
   *     if (/eliksir|mikstur/.test(item.name)) {
   *       buffer.color([0, buffer.length], api.colors.fromHex('#00ff00'));
   *     }
   *     return buffer;
   *   }
   * });
   * ```
   */
  addTransform(definition: TransformDefinition): void;
}

/**
 * Single magic item entry
 */
export interface MagicEntry {
  type: string[];
  regexps?: string[];
}

/**
 * Raw magics data structure
 */
export interface MagicsFile {
  magics: Record<string, MagicEntry>;
}

/**
 * Magics API - Access magic item patterns
 */
export interface MagicsApi {
  /**
   * Get current magic item patterns
   * Returns patterns used to identify magic items in game output
   *
   * @returns Promise resolving to array of regex pattern strings
   *
   * @example
   * ```typescript
   * const patterns = await api.magics.getPatterns();
   * console.log(`${patterns.length} magic patterns loaded`);
   *
   * // Check if an item matches magic patterns
   * const item = "magiczny miecz";
   * const ismagic = patterns.some(p => new RegExp(p, 'i').test(item));
   * ```
   */
  getPatterns(): Promise<string[]>;

  /**
   * Get raw magics data
   * Returns the complete magics data structure with item names, types, and patterns
   *
   * @returns Promise resolving to raw MagicsFile data or undefined if not loaded
   *
   * @example
   * ```typescript
   * const rawData = await api.magics.getRawData();
   * if (rawData) {
   *   for (const [name, magic] of Object.entries(rawData.magics)) {
   *     console.log(`${name}: types=${magic.type.join(',')}, patterns=${magic.regexps?.length || 0}`);
   *   }
   * }
   * ```
   */
  getRawData(): Promise<MagicsFile | undefined>;
}

/**
 * Raw magic keys data structure
 */
export interface MagicKeysData {
  magic_keys: string[];
}

/**
 * Magic Keys API - Access magic key patterns
 */
export interface MagicKeysApi {
  /**
   * Get current magic key patterns
   * Returns patterns used to identify magic keys in game output
   *
   * @returns Promise resolving to array of pattern strings
   *
   * @example
   * ```typescript
   * const patterns = await api.magicKeys.getPatterns();
   * console.log(`${patterns.length} magic key patterns loaded`);
   *
   * // Check if an item is a magic key
   * const item = "klucz ze srebra";
   * const isMagicKey = patterns.some(p => new RegExp(p, 'i').test(item));
   * ```
   */
  getPatterns(): Promise<string[]>;

  /**
   * Get raw magic keys data
   * Returns the complete magic keys data structure
   *
   * @returns Promise resolving to raw MagicKeysData or undefined if not loaded
   *
   * @example
   * ```typescript
   * const rawData = await api.magicKeys.getRawData();
   * if (rawData) {
   *   console.log(`${rawData.magic_keys.length} magic keys loaded`);
   * }
   * ```
   */
  getRawData(): Promise<MagicKeysData | undefined>;
}

/**
 * Container type for bag assignment
 * - "money" - money container
 * - "gems" - gems container
 * - "food" - food container
 * - "other" - general items container
 */
export type ContainerType = "money" | "gems" | "food" | "other";

/**
 * Grammatical forms for a container bag name
 */
export interface ContainerForms {
  /** Nominative form (mianownik) - e.g., "plecak", "torba" */
  mianownik: string;
  /** Genitive form (dopelniacz) - e.g., "plecaka", "torby" */
  dopelniacz: string;
  /** Accusative form (biernik) - e.g., "plecak", "torbe" */
  biernik: string;
}

/**
 * Containers API - Put items into and take items from assigned bags
 */
export interface ContainersApi {
  /**
   * Get the assigned bag name for a container type
   *
   * @param type - Container type ("money", "gems", "food", "other")
   * @returns The bag name (e.g., "plecak", "torba")
   *
   * @example
   * ```typescript
   * const moneyBag = api.containers.getContainer("money");
   * console.log(`Money is stored in: ${moneyBag}`);
   * ```
   */
  getContainer(type: ContainerType): string;

  /**
   * Get grammatical forms for a container type's bag
   * Returns mianownik, dopelniacz, and biernik forms
   *
   * @param type - Container type ("money", "gems", "food", "other")
   * @returns Object with mianownik, dopelniacz, biernik forms, or null if bag is unknown
   *
   * @example
   * ```typescript
   * const forms = api.containers.getContainerForms("other");
   * if (forms) {
   *   console.log(`mianownik: ${forms.mianownik}`);   // "plecak"
   *   console.log(`dopelniacz: ${forms.dopelniacz}`);   // "plecaka"
   *   console.log(`biernik: ${forms.biernik}`);         // "plecak"
   * }
   * ```
   */
  getContainerForms(type: ContainerType): ContainerForms | null;

  /**
   * Put items into a container bag
   * Opens the bag, puts items in, and closes the bag
   *
   * @param type - Container type ("money", "gems", "food", "other")
   * @param item - Item name(s) to put in, comma-separated for multiple
   *
   * @example
   * ```typescript
   * // Put money into money bag
   * api.containers.put("money", "monety");
   *
   * // Put multiple items into other bag
   * api.containers.put("other", "miecz, tarcza");
   * ```
   */
  put(type: ContainerType, item: string): void;

  /**
   * Take items from a container bag
   * Opens the bag, takes items out, and closes the bag
   *
   * @param type - Container type ("money", "gems", "food", "other")
   * @param item - Item name(s) to take out, comma-separated for multiple
   *
   * @example
   * ```typescript
   * // Take money from money bag
   * api.containers.take("money", "monety");
   *
   * // Take multiple items from other bag
   * api.containers.take("other", "miecz, tarcza");
   * ```
   */
  take(type: ContainerType, item: string): void;
}

/**
 * Herbs API - Access herb inventory in bags
 */
export interface HerbsApi {
  /**
   * Get current state of all herb bags
   * Returns a copy of the herb bags state with herb counts and conditions
   *
   * @returns Object mapping bag number to bag state
   *
   * @example
   * ```typescript
   * const bags = api.herbs.getBags();
   * console.log("Bag 1:", bags[1]?.herbs);
   *
   * // Count total herbs
   * const totals: Record<string, number> = {};
   * Object.values(bags).forEach(bag => {
   *   Object.entries(bag.herbs).forEach(([herb, count]) => {
   *     totals[herb] = (totals[herb] || 0) + count;
   *   });
   * });
   * ```
   */
  getBags(): HerbBagsState;

  /**
   * Take herbs from bags
   * Removes herbs from inventory and executes appropriate game commands
   *
   * @param herbId - Herb identifier (e.g., "ziolo_many", "czosnek")
   * @param amount - Number of herbs to take
   * @param fromBag - Optional specific bag number to take from
   * @returns Promise resolving to number of herbs actually taken
   *
   * @example
   * ```typescript
   * // Take 3 herbs from any bag
   * const taken = await api.herbs.take("ziolo_many", 3);
   * console.log(`Took ${taken} ziolo_many`);
   *
   * // Take from specific bag
   * const taken = await api.herbs.take("czosnek", 1, 2);
   * ```
   */
  take(herbId: string, amount: number, fromBag?: number): Promise<number>;

  /**
   * Put herbs into a bag
   * Adds herbs to inventory and executes appropriate game commands
   *
   * @param herbId - Herb identifier
   * @param amount - Number of herbs to put
   * @param bag - Bag number to put herbs into
   * @returns Promise resolving to number of herbs actually put
   *
   * @example
   * ```typescript
   * // Put 5 herbs into bag 1
   * const put = await api.herbs.put("ziolo_many", 5, 1);
   * console.log(`Put ${put} ziolo_many into bag 1`);
   * ```
   */
  put(herbId: string, amount: number, bag: number): Promise<number>;

  /**
   * Move herbs between bags
   * Convenience method that takes from one bag and puts into another
   *
   * @param options - Move options with herbId, amount, fromBag, toBag
   * @returns Promise resolving when move is complete
   *
   * @example
   * ```typescript
   * // Move 3 herbs from bag 1 to bag 2
   * await api.herbs.move({
   *   herbId: "ziolo_many",
   *   amount: 3,
   *   fromBag: 1,
   *   toBag: 2
   * });
   * ```
   */
  move(options: HerbMoveOptions): Promise<void>;

  /**
   * Get the herb database containing herb forms and uses
   * Returns data about herb conjugations (forms) and effects
   *
   * @returns Promise resolving to herb database or null if unavailable
   *
   * @example
   * ```typescript
   * const data = await api.herbs.getData();
   * if (data) {
   *   // Get herb forms for "ziolo_many"
   *   const forms = data.herb_id_to_odmiana["ziolo_many"];
   *   console.log("Nominative:", forms.mianownik);
   *   console.log("Genitive:", forms.dopelniacz);
   *
   *   // Get herb uses
   *   const uses = data.herb_id_to_use["ziolo_many"];
   *   uses?.forEach(use => {
   *     console.log(`Action: ${use.action}, Effect: ${use.effect}`);
   *   });
   * }
   * ```
   */
  getData(): Promise<HerbsData | null>;
}

/**
 * Object List Filters API - Customize object list entry rendering
 *
 * Allows plugins to register filters that modify how objects are displayed
 * in the object list. Filters can change colors, add icons, modify text, etc.
 *
 * Types are available for import:
 * ```typescript
 * import type { ObjectListEntryFilter, EntryContext, FilterResult } from "@web/objectListFilters";
 * ```
 */
export interface ObjectListFiltersApi {
  /**
   * Register an object list entry filter
   *
   * Filters receive context about the object and can modify its appearance
   * by mutating the result parameter. Multiple filters can compose together.
   *
   * @param name - Unique identifier for this filter
   * @param filter - Filter function that modifies entry appearance
   * @param priority - Optional priority (higher = runs first, default: 0)
   *
   * @example
   * ```typescript
   * // Highlight dragons in red with icon
   * api.objectListFilters.register("dragons", (context, result) => {
   *   if (context.rawDescription.toLowerCase().includes("smok")) {
   *     result.style.descriptionColor = "#ff0000";
   *     result.style.prefix = (result.style.prefix || "") + "🐉 ";
   *   }
   * }, 10);
   *
   * // Warn about low HP enemies
   * api.objectListFilters.register("lowHp", (context, result) => {
   *   if (context.object.hp && context.object.maxhp) {
   *     const percent = context.object.hp / context.object.maxhp;
   *     if (percent < 0.2) {
   *       result.style.hpBarColor = "#ff0000";
   *       result.style.suffix = (result.style.suffix || "") + " ☠️";
   *     }
   *   }
   * }, 5);
   * ```
   */
  register(name: string, filter: ObjectListEntryFilter, priority?: number): void;

  /**
   * Unregister an object list entry filter
   *
   * @param name - Filter identifier to remove
   * @returns True if filter was found and removed
   *
   * @example
   * ```typescript
   * api.objectListFilters.unregister("dragons");
   * ```
   */
  unregister(name: string): boolean;

  /**
   * Get list of registered filter names
   *
   * @returns Array of filter names in priority order
   *
   * @example
   * ```typescript
   * const filters = api.objectListFilters.getFilterNames();
   * console.log("Active filters:", filters);
   * ```
   */
  getFilterNames(): string[];

  /**
   * Clear all registered filters
   *
   * @example
   * ```typescript
   * api.objectListFilters.clear();
   * ```
   */
  clear(): void;
}

/**
 * Enemy Binds API - Customize which enemies get assigned to the bind slots (F1/F2/F3)
 *
 * The enemy binds feature scans objects on the current location, builds a candidate
 * list of those matching the built-in enemy check, and fills the bind slots in order.
 * Resolvers run as a pipeline on that candidate list (re-run on every object update),
 * letting plugins reorder targets and inject enemies the built-in check would miss.
 */
export interface EnemyBindsApi {
  /**
   * Register an enemy bind resolver
   *
   * Resolvers compose in priority order (higher runs first). Each receives the
   * current ordered candidate list and every object on the location, and returns
   * the candidate list to use going forward. The first three candidates map to the
   * F1/F2/F3 slots (subject to per-slot enable settings). Duplicate `num`s are
   * dropped automatically (first wins).
   *
   * @param name - Unique identifier (re-registering the same name replaces it)
   * @param resolver - Resolver function; return a new array, or nothing to leave the list unchanged
   * @param priority - Optional priority (higher = runs first, default: 0)
   *
   * @example
   * ```typescript
   * // Order targets by your own threat/affinity list (weakest known mobs first,
   * // unknown mobs last). Useful when you know a mob is easier than the others.
   * const AFFINITY_ORDER = ["szczur", "goblin", "wilk", "ork", "troll"];
   * const rank = (desc: string) => {
   *   const i = AFFINITY_ORDER.findIndex(name => desc.toLowerCase().includes(name));
   *   return i === -1 ? Infinity : i;
   * };
   * api.enemyBinds.register("affinity", (candidates) =>
   *   [...candidates].sort((a, b) => rank(a.desc) - rank(b.desc)));
   *
   * // Also bind a specific summoned mob the built-in check ignores
   * api.enemyBinds.register("bind-totems", (candidates, allObjects) => {
   *   const extra = allObjects
   *     .filter(o => o.desc?.toLowerCase().includes("totem"))
   *     .map(o => ({ num: o.num, desc: o.desc! }));
   *   return [...candidates, ...extra];
   * });
   * ```
   */
  register(name: string, resolver: EnemyBindResolver, priority?: number): void;

  /**
   * Unregister an enemy bind resolver
   *
   * @param name - Resolver identifier to remove
   * @returns True if a resolver was found and removed
   */
  unregister(name: string): boolean;

  /**
   * Get list of registered resolver names in priority order
   *
   * @returns Array of resolver names
   */
  getResolverNames(): string[];

  /**
   * Clear all registered resolvers
   */
  clear(): void;
}

/**
 * Handle returned by buttonMacros.register() for controlling macro state
 */
export interface ButtonMacroHandle {
  /** Get current state ID (for stateful macros) */
  getState(): string | undefined;

  /** Set state by ID (for stateful macros) */
  setState(stateId: string): boolean;

  /** Cycle to next state, wraps around (for stateful macros) */
  cycleState(): void;

  /**
   * Subscribe to state changes
   * @param listener - Callback when state changes
   * @returns Unsubscribe function
   */
  onStateChange(listener: (newState: string, oldState: string | undefined) => void): () => void;
}

/**
 * Button Macros API - Register custom button macros
 *
 * Allows plugins to define custom macros that can be assigned to mobile and desktop buttons.
 * Macros can be stateless (simple click actions) or stateful (toggle/mode buttons).
 */
export interface ButtonMacrosApi {
  /**
   * Register a custom button macro
   *
   * @param options - Macro configuration
   * @param options.id - Unique identifier (will be prefixed with "plugin:")
   * @param options.label - Display label shown in button configuration
   * @param options.onClick - Handler called when button is clicked
   * @param options.configFields - Optional custom configuration fields
   * @param options.states - For stateful macros: array of possible states
   * @param options.initialState - Initial state ID (defaults to first state)
   *
   * @example Simple macro
   * ```typescript
   * api.buttonMacros.register({
   *   id: "myAction",
   *   label: "My Custom Action",
   *   onClick: (button, client, config) => {
   *     client.sendCommand(config.command || "look");
   *   },
   *   configFields: [
   *     { name: "command", type: "text", label: "Command" }
   *   ]
   * });
   * ```
   *
   * @example Stateful toggle macro
   * ```typescript
   * api.buttonMacros.register({
   *   id: "autoHeal",
   *   label: "Auto Heal Toggle",
   *   states: [
   *     { id: "off", label: "OFF", color: "#666666" },
   *     { id: "on", label: "ON", color: "#00ff00" }
   *   ],
   *   initialState: "off",
   *   onClick: (ctx) => {
   *     // ctx.stateCtx is available for stateful macros
   *     ctx.stateCtx.cycleState(); // Toggle to next state
   *     if (ctx.stateCtx.state === "off") {
   *       // Turning on
   *       ctx.client.sendCommand("autoheal on");
   *     } else {
   *       // Turning off
   *       ctx.client.sendCommand("autoheal off");
   *     }
   *   }
   * });
   * ```
   *
   * @example Stateful mode macro
   * ```typescript
   * api.buttonMacros.register({
   *   id: "combatMode",
   *   label: "Combat Mode",
   *   states: [
   *     { id: "defensive", label: "DEF", color: "#0066ff" },
   *     { id: "balanced", label: "BAL", color: "#ffff00" },
   *     { id: "aggressive", label: "AGR", color: "#ff0000" }
   *   ],
   *   onClick: (ctx) => {
   *     ctx.stateCtx.cycleState();
   *     ctx.client.sendCommand(`combat ${ctx.stateCtx.state}`);
   *   }
   * });
   * ```
   */
  register(options: {
    id: string;
    label: string;
    onClick: ((context: ButtonMacroClickContext) => void) | ((button: MobileButtonSetting, client: Client, config: Record<string, any>) => void);
    configFields?: MacroConfigField[];
    states?: MacroState[];
    initialState?: string;
  }): ButtonMacroHandle;

  /**
   * Unregister a previously registered button macro
   * @param id - Macro ID (without "plugin:" prefix)
   */
  unregister(id: string): void;

  /**
   * Get the current state of a stateful macro
   * @param id - Macro ID (without "plugin:" prefix)
   * @returns Current state ID or undefined if not stateful
   *
   * @example
   * ```typescript
   * const state = api.buttonMacros.getState("autoHeal");
   * if (state === "on") {
   *   // Auto-heal is enabled
   * }
   * ```
   */
  getState(id: string): string | undefined;

  /**
   * Set the state of a stateful macro programmatically
   * This will update all buttons using this macro across the UI
   *
   * @param id - Macro ID (without "plugin:" prefix)
   * @param stateId - State ID to set (must be valid for this macro)
   * @returns True if state was set successfully
   *
   * @example
   * ```typescript
   * // Turn off auto-heal programmatically
   * api.buttonMacros.setState("autoHeal", "off");
   * ```
   */
  setState(id: string, stateId: string): boolean;

  /**
   * Subscribe to state changes for a macro
   * Useful for syncing state with game events
   *
   * @param id - Macro ID (without "plugin:" prefix)
   * @param listener - Callback called when state changes
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * // Listen for auto-heal state changes
   * const unsubscribe = api.buttonMacros.onStateChange("autoHeal", (macroType, newState, oldState) => {
   *   console.log(`Auto-heal changed from ${oldState} to ${newState}`);
   * });
   *
   * // Later: stop listening
   * unsubscribe();
   * ```
   */
  onStateChange(id: string, listener: (macroType: string, newState: string, oldState: string | undefined) => void): () => void;
}

/**
 * Trigger Macros API - Register custom trigger macros
 *
 * Allows plugins to define custom macros that can be used in user triggers.
 */
export interface TriggerMacrosApi {
  /**
   * Register a custom trigger macro
   *
   * @param options - Macro configuration
   * @param options.id - Unique identifier (will be prefixed with "plugin:")
   * @param options.label - Display label shown in trigger configuration
   * @param options.onMatch - Handler called when trigger pattern matches
   * @param options.configFields - Optional custom configuration fields
   *
   * @example
   * ```typescript
   * api.triggerMacros.register({
   *   id: "customHighlight",
   *   label: "Custom Highlight",
   *   onMatch: (context) => {
   *     const color = context.config.color || "#ff0000";
   *     context.line.color(context.matchRange, api.colors.fromHex(color));
   *   },
   *   configFields: [
   *     { name: "color", type: "text", label: "Color (hex)", defaultValue: "#ff0000" }
   *   ]
   * });
   * ```
   */
  register(options: {
    id: string;
    label: string;
    onMatch: (context: TriggerMacroContext) => void;
    configFields?: MacroConfigField[];
  }): void;

  /**
   * Unregister a previously registered trigger macro
   * @param id - Macro ID (without "plugin:" prefix)
   */
  unregister(id: string): void;
}

/**
 * Settings API - Access character and UI settings
 *
 * Provides read-only access to character settings (scoped to current character)
 * and UI settings (global).
 */
export interface SettingsApi {
  /**
   * Get all character settings
   * @returns Current character settings merged with defaults
   *
   * @example
   * ```typescript
   * const settings = await api.settings.getCharacterSettings();
   * console.log(`Attack command: ${settings.attackCommand}`);
   * console.log(`Guilds: ${settings.guilds?.join(", ")}`);
   * ```
   */
  getCharacterSettings(): Promise<Settings>;

  /**
   * Get a specific character setting
   * @param key - Setting key (e.g., "attackCommand", "guilds", "collectMode")
   * @returns The value of the setting
   *
   * @example
   * ```typescript
   * const guilds = await api.settings.getCharacterSetting("guilds");
   * const attackCommand = await api.settings.getCharacterSetting("attackCommand");
   * ```
   */
  getCharacterSetting<K extends keyof Settings>(key: K): Promise<Settings[K]>;

  /**
   * Get all UI settings
   * @returns Current UI settings merged with defaults
   *
   * @example
   * ```typescript
   * const uiSettings = await api.settings.getUiSettings();
   * console.log(`Font size: ${uiSettings.contentFontSize}`);
   * console.log(`Map position: ${uiSettings.mapPosition}`);
   * ```
   */
  getUiSettings(): Promise<UiSettings>;

  /**
   * Get a specific UI setting
   * @param key - Setting key (e.g., "contentFontSize", "mapPosition", "showButtons")
   * @returns The value of the setting
   *
   * @example
   * ```typescript
   * const fontSize = await api.settings.getUiSetting("contentFontSize");
   * const mapPosition = await api.settings.getUiSetting("mapPosition");
   * ```
   */
  getUiSetting<K extends keyof UiSettings>(key: K): Promise<UiSettings[K]>;
}

/**
 * Combat API - Access combat-related settings and commands
 *
 * Provides access to combat settings like weapon draw commands.
 */
export interface CombatApi {
  /**
   * Draw all weapons using the configured draw weapon command
   *
   * Sends the appropriate command based on character settings
   * (e.g., "dobadz wszystkich broni", "wyciagnij wszystkich broni")
   *
   * @example
   * ```typescript
   * api.combat.drawWeapon();
   * ```
   */
  drawWeapon(): void;
}

/**
 * Location Notes API - Add plugin-contributed notes to locations
 *
 * Plugins can add notes to locations that appear alongside user notes.
 * Plugin notes are read-only for users and displayed with the plugin name.
 */
export interface LocationNotesApi {
  /**
   * Set a note for a location
   *
   * Setting an empty note removes it.
   *
   * @param roomId - Room ID to add note to
   * @param note - Note content (empty string to remove)
   *
   * @example
   * ```typescript
   * // Add a note to room 12345
   * api.locationNotes.set(12345, "Quest NPC here");
   *
   * // Remove the note
   * api.locationNotes.set(12345, "");
   * ```
   */
  set(roomId: number, note: string): void;

  /**
   * Remove a note for a location
   *
   * @param roomId - Room ID to remove note from
   *
   * @example
   * ```typescript
   * api.locationNotes.remove(12345);
   * ```
   */
  remove(roomId: number): void;

  /**
   * Get all plugin notes for a location (from all plugins)
   *
   * @param roomId - Room ID to get notes for
   * @returns Array of plugin notes for the location
   *
   * @example
   * ```typescript
   * const notes = api.locationNotes.get(12345);
   * notes.forEach(n => console.log(`${n.pluginId}: ${n.note}`));
   * ```
   */
  get(roomId: number): PluginLocationNote[];
}

/**
 * Attack Controller API - Execute attacks with proper team coordination
 *
 * Provides methods to attack targets by their object ID, respecting
 * attack mode settings and team coordination (leader commands).
 */
export interface AttackControllerApi {
  /**
   * Attack a target by its object ID
   *
   * When attack mode is "AW" or "AWR" and user is team leader:
   * - "AW": Also marks target as team attack target
   * - "AWR": Marks target and orders team to attack
   *
   * @param id - Object ID of the target
   * @param command - Optional attack command override (uses character setting if not provided)
   *
   * @example
   * ```typescript
   * // Attack object with ID 123
   * api.attackController.attackById(123);
   *
   * // Attack with custom command
   * api.attackController.attackById(123, "kopnij");
   * ```
   */
  attackById(id: number, command?: string): void;

  /**
   * Support the team leader by attacking their target
   *
   * Sends the support command (default: "wesprzyj") and also
   * sends the command targeting the leader's object ID.
   *
   * @param command - Optional support command override (uses character setting if not provided)
   *
   * @example
   * ```typescript
   * // Support the leader
   * api.attackController.support();
   *
   * // Support with custom command
   * api.attackController.support("pomoz");
   * ```
   */
  support(command?: string): void;

  /**
   * Get the current attack command from character settings
   *
   * @returns The configured attack command (e.g., "zabij", "zaatakuj")
   *
   * @example
   * ```typescript
   * const cmd = api.attackController.getAttackCommand();
   * console.log(`Current attack command: ${cmd}`);
   * ```
   */
  getAttackCommand(): string;

  /**
   * Get the current support command from character settings
   *
   * @returns The configured support command (e.g., "wesprzyj")
   *
   * @example
   * ```typescript
   * const cmd = api.attackController.getSupportCommand();
   * console.log(`Current support command: ${cmd}`);
   * ```
   */
  getSupportCommand(): string;
}

/**
 * People API - Manage people database entries
 */
export interface PeopleApi {
  add(entry: { name: string; description: string; guild: string }): void;
  edit(targetKey: string, entry: { name: string; description: string; guild: string }): void;
  remove(eventId: string): void;
  ignore(targetKey: string): void;
  restore(targetKey: string): void;
  markEnemy(targetKey: string): void;
  unmarkEnemy(targetKey: string): void;
  markAlly(targetKey: string): void;
  unmarkAlly(targetKey: string): void;
  setColor(targetKey: string, color: string): void;
  clearColor(targetKey: string): void;
  find(name: string, description: string): PersonListEntry | undefined;
  findByKey(key: string): PersonListEntry | undefined;
  getAll(): PersonListEntry[];
  makeKey(name: string, description: string): string;
}

/**
 * Plugin API Interface
 *
 * This is the main interface that plugins interact with.
 * Provides controlled access to client functionality organized by domain.
 *
 * @example
 * ```typescript
 * export async function init(api: PluginApi): Promise<PluginInfo> {
 *   // Register a trigger
 *   api.triggers.register(/pattern/i, (line, matches) => {
 *     return line.prepend(">> ");
 *   }, "myPlugin");
 *
 *   // Register an alias
 *   api.aliases.register(/^\/cmd$/, () => {
 *     api.output.print("Command executed!", "system");
 *     return true;
 *   });
 *
 *   // Subscribe to events (fully typed!)
 *   api.events.on("mapMove", () => {
 *     console.log("Player moved!");
 *   });
 *
 *   api.events.on("gmcp", (data) => {
 *     console.log("GMCP data:", data.path, data.value);
 *   });
 *
 *   // Get current room
 *   const room = api.map.getRoom();
 *   if (room) console.log(`In ${room.name}`);
 *
 *   // Create colors
 *   const redColor = api.colors.fromHex("#ff0000");
 *   const blueColor = api.colors.fromRgb(0, 128, 255);
 *
 *   // Create a popup (Promise-based)
 *   const popup = await api.ui.createPopup("My Popup", "Hello World!");
 *   console.log("Popup element:", popup.element); // Element is guaranteed to exist
 *
 *   // Listen for close events
 *   popup.onClose(() => {
 *     console.log("Popup was closed!");
 *   });
 *
 *   // Add context menu entry with SVG icon
 *   const menuItem = document.createElement('span');
 *   menuItem.innerHTML = '<svg width="16" height="16">...</svg> Action';
 *   api.ui.addContextMenuEntry(menuItem, () => {
 *     console.log("Context menu action!");
 *   });
 *
 *   // Add popup menu entry with icon
 *   const popupMenuItem = document.createElement('span');
 *   popupMenuItem.innerHTML = '⚙️ Settings';
 *   api.ui.addPopupMenuEntry(popupMenuItem, () => {
 *     console.log("Settings!");
 *   });
 *
 *   return {
 *     name: "My Plugin",
 *     version: "1.0.0"
 *   };
 * }
 * ```
 */
export interface PluginApi {
  /** Trigger management */
  triggers: TriggersApi;
  /** Command alias management */
  aliases: AliasesApi;
  /** Event subscription and emission */
  events: EventsApi;
  /** Map position access */
  map: MapApi;
  /** Output to game window */
  output: OutputApi;
  /** UI helpers */
  ui: UiApi;
  /** Color creation helpers */
  colors: ColorsApi;
  /** Function bind management */
  bind: BindApi;
  /** Team management */
  team: TeamApi;
  /** GMCP data access */
  gmcp: GmcpApi;
  /** Attack queue management */
  attackQueue: AttackQueueApi;
  /** Objects in location */
  objects: ObjectsApi;
  /** Command sending */
  command: CommandApi;
  /** Command hooks - intercept and modify commands before processing */
  commandHooks: CommandHooksApi;
  /** Pretty containers - container formatting and filtering */
  prettyContainers: PrettyContainersApi;
  /** Containers - put and take items from assigned bags */
  containers: ContainersApi;
  /** Magics - magic item patterns */
  magics: MagicsApi;
  /** Magic keys - magic key patterns */
  magicKeys: MagicKeysApi;
  /** Herbs - herb inventory management in bags */
  herbs: HerbsApi;
  /** Object list filters - customize object list entry rendering */
  objectListFilters: ObjectListFiltersApi;
  /** Enemy binds - customize which enemies get the F1/F2/F3 bind slots */
  enemyBinds: EnemyBindsApi;
  /** Button macros - register custom button macros */
  buttonMacros: ButtonMacrosApi;
  /** Trigger macros - register custom trigger macros */
  triggerMacros: TriggerMacrosApi;
  /** Settings - access character and UI settings */
  settings: SettingsApi;
  /** Attack controller - execute attacks with team coordination */
  attackController: AttackControllerApi;
  /** Combat - access combat-related settings */
  combat: CombatApi;
  /** Location notes - add plugin-contributed notes to locations */
  locationNotes: LocationNotesApi;
  /** People database - manage people entries */
  people: PeopleApi;
  /**
   * AnsiAwareBuffer class for creating formatted text buffers
   *
   * Use this to create custom formatted output for api.output.print()
   *
   * @example
   * // Create a formatted buffer
   * const buffer = new api.AnsiAwareBuffer("Hello ", api.colors.fromHex('#00ff00'));
   * buffer.append("world!", api.colors.fromHex('#ff0000'));
   * api.output.print(buffer);
   */
  AnsiAwareBuffer: typeof AnsiAwareBuffer;
}

/**
 * Plugin API Implementation
 *
 * Wraps the Client instance and provides the PluginApi interface.
 */
export class PluginApiImpl implements PluginApi {
  private client: Client;
  private pluginId: string;
  private _pluginName?: string;
  private aliasMap: Map<string, PluginAlias> = new Map();
  private popupHandles: Set<PopupHandle> = new Set();
  private popupMenuEntryIds: Set<string> = new Set();
  private contextMenuEntryIds: Set<string> = new Set();
  private buttonMacroIds: Set<string> = new Set();
  private triggerMacroIds: Set<string> = new Set();
  private commandHookIds: Set<string> = new Set();
  private footerComponentIds: Set<string> = new Set();
  private commandLineSuggestions: Set<string> = new Set();
  private stateChangeUnsubscribers: (() => void)[] = [];
  private persistentPopupHandles: Map<string, PersistentPopupHandle> = new Map();

  public triggers: TriggersApi;
  public aliases: AliasesApi;
  public events: EventsApi;
  public map: MapApi;
  public output: OutputApi;
  public ui: UiApi;
  public colors: ColorsApi;
  public bind: BindApi;
  public team: TeamApi;
  public gmcp: GmcpApi;
  public attackQueue: AttackQueueApi;
  public objects: ObjectsApi;
  public command: CommandApi;
  public commandHooks: CommandHooksApi;
  public prettyContainers: PrettyContainersApi;
  public containers: ContainersApi;
  public magics: MagicsApi;
  public magicKeys: MagicKeysApi;
  public herbs: HerbsApi;
  public objectListFilters: ObjectListFiltersApi;
  public enemyBinds: EnemyBindsApi;
  public buttonMacros: ButtonMacrosApi;
  public triggerMacros: TriggerMacrosApi;
  public settings: SettingsApi;
  public attackController: AttackControllerApi;
  public combat: CombatApi;
  public locationNotes: LocationNotesApi;
  public people: PeopleApi;
  public AnsiAwareBuffer: typeof AnsiAwareBuffer;

  constructor(client: Client, pluginId: string = 'unknown') {
    this.client = client;
    this.pluginId = pluginId;

    // Initialize namespaced APIs
    this.triggers = this.createTriggersApi();
    this.aliases = this.createAliasesApi();
    this.events = this.createEventsApi();
    this.map = this.createMapApi();
    this.output = this.createOutputApi();
    this.ui = this.createUiApi();
    this.colors = this.createColorsApi();
    this.bind = this.createBindApi();
    this.team = this.createTeamApi();
    this.gmcp = this.createGmcpApi();
    this.attackQueue = this.createAttackQueueApi();
    this.objects = this.createObjectsApi();
    this.command = this.createCommandApi();
    this.commandHooks = this.createCommandHooksApi();
    this.prettyContainers = this.createPrettyContainersApi();
    this.containers = this.createContainersApi();
    this.magics = this.createMagicsApi();
    this.magicKeys = this.createMagicKeysApi();
    this.herbs = this.createHerbsApi();
    this.objectListFilters = this.createObjectListFiltersApi();
    this.enemyBinds = this.createEnemyBindsApi();
    this.buttonMacros = this.createButtonMacrosApi();
    this.triggerMacros = this.createTriggerMacrosApi();
    this.settings = this.createSettingsApi();
    this.attackController = this.createAttackControllerApi();
    this.combat = this.createCombatApi();
    this.locationNotes = this.createLocationNotesApi();
    this.people = this.createPeopleApi();

    // Expose AnsiAwareBuffer class
    this.AnsiAwareBuffer = AnsiAwareBuffer;
  }

  /**
   * Set the plugin name (called by PluginManager after init)
   * Also updates any macros that were registered during init
   */
  setPluginName(name: string): void {
    this._pluginName = name;
    // Update any macros that were registered during init (before name was set)
    updateButtonMacroPluginName(this.pluginId, name);
    updateTriggerMacroPluginName(this.pluginId, name);
    // Update any location notes that were registered during init
    updatePluginNotesName(this.pluginId, name);
  }

  /**
   * Get the plugin name (or pluginId if name is not set)
   */
  get pluginName(): string {
    return this._pluginName || this.pluginId;
  }

  // ============================================================================
  // Triggers API
  // ============================================================================

  private createTriggersApi(): TriggersApi {
    return {
      register: (pattern, callback, tag, options) => {
        return this.client.Triggers.registerTrigger(pattern, callback, tag, options);
      },

      registerOneTime: (pattern, callback, tag, options) => {
        return this.client.Triggers.registerOneTimeTrigger(pattern, callback, tag, options);
      },

      registerToken: (token, callback, tag, options) => {
        return this.client.Triggers.registerTokenTrigger(token, callback, tag, options);
      },

      remove: (trigger) => {
        this.client.Triggers.removeTrigger(trigger);
      },

      removeByTag: (tag) => {
        this.client.Triggers.removeByTag(tag);
      }
    };
  }

  // ============================================================================
  // Aliases API
  // ============================================================================

  private createAliasesApi(): AliasesApi {
    return {
      register: (pattern, callback) => {
        const id = Math.random().toString(36).slice(2);
        const alias: PluginAlias = { id, pattern, callback };

        this.aliasMap.set(id, alias);
        this.client.aliases.push({ pattern, callback });

        return id;
      },

      remove: (id) => {
        const alias = this.aliasMap.get(id);
        if (!alias) return;

        // Remove from client aliases array
        const index = this.client.aliases.findIndex(
          a => a.pattern === alias.pattern && a.callback === alias.callback
        );
        if (index !== -1) {
          this.client.aliases.splice(index, 1);
        }

        this.aliasMap.delete(id);
      }
    };
  }

  // ============================================================================
  // Events API
  // ============================================================================

  private createEventsApi(): EventsApi {
    return {
      on: (event, listener, options) => {
        this.client.on(event, listener as any, options);
      },

      off: (event, listener) => {
        this.client.off(event, listener as any);
      },

      emit: (event, ...args) => {
        this.client.sendEvent(event, ...args);
      }
    };
  }

  // ============================================================================
  // Map API
  // ============================================================================

  private createMapApi(): MapApi {
    return {
      getRoom: () => {
        return this.client.Map.currentRoom;
      },

      getRoomById: (roomId: number) => {
        return this.client.Map.getRoomById(roomId);
      },

      getAreas: (): AreaInfo[] => {
        const mapReader = this.client.Map.tryGetMapReader();
        if (!mapReader) {
          return [];
        }
        return mapReader.getAreas().map(area => ({
          areaId: area.getAreaId(),
          areaName: area.getAreaName(),
          rooms: area.getRooms()
        }));
      },

      findPath: (fromId: number, toId: number) => {
        return this.client.Map.findPath(fromId, toId);
      },

      setLocation: (roomId: number) => {
        this.client.Map.setMapRoomById(roomId);
      },

      stepBack: () => {
        this.client.Map.moveBack();
      },

      createHighlighter: (options?: LocationHighlighterOptions): LocationHighlighter => {
        const handle = this.client.Map.createHighlighter(options);
        return {
          add: handle.add,
          remove: handle.remove,
          clear: handle.clear,
          enable: handle.enable,
          disable: handle.disable,
          isEnabled: handle.isEnabled,
          setColor: handle.setColor,
          getColor: handle.getColor,
          getRoomIds: handle.getRoomIds,
          destroy: handle.destroy
        };
      }
    };
  }

  // ============================================================================
  // Output API
  // ============================================================================

  private createOutputApi(): OutputApi {
    return {
      print: (text) => {
        this.client.print(text);
      }
    };
  }

  // ============================================================================
  // UI API
  // ============================================================================

  private createUiApi(): UiApi {
    return {
      createPopup: (title, body) => this.createPopup(title, body),
      registerPersistentPopup: (config) => this.registerPersistentPopup(config),
      addPopupMenuEntry: (label, onSelect) => this.addPopupMenuEntry(label, onSelect),
      addContextMenuEntry: (label, action) => this.addContextMenuEntry(label, action),
      registerFooterComponent: (id, content, position) => this.registerFooterComponent(id, content, position)
    };
  }

  // ============================================================================
  // Colors API
  // ============================================================================

  private createColorsApi(): ColorsApi {
    return {
      fromHex: (hex) => {
        return { foreground: { space: "hex", color: hex } };
      },

      fromRgb: (r, g, b) => {
        return { foreground: { space: "rgb", r, g, b } };
      }
    };
  }

  // ============================================================================
  // Bind API
  // ============================================================================

  private createBindApi(): BindApi {
    return {
      set: (printable, callback, clearAfterUse) => {
        this.client.FunctionalBind.set(printable, callback, clearAfterUse);
      },

      clear: () => {
        this.client.FunctionalBind.clear();
      },

      getLabel: () => {
        return this.client.FunctionalBind.getLabel();
      }
    };
  }

  // ============================================================================
  // Team API
  // ============================================================================

  private createTeamApi(): TeamApi {
    return {
      getMembers: () => {
        return this.client.TeamManager.getTeamMembers();
      },

      getLeader: () => {
        return this.client.TeamManager.getLeader();
      },

      getLeaderId: () => {
        return this.client.TeamManager.getLeaderId();
      },

      getPlayerNum: () => {
        return this.client.TeamManager.playerNum;
      }
    };
  }

  // ============================================================================
  // GMCP API
  // ============================================================================

  private createGmcpApi(): GmcpApi {
    return {
      get: () => {
        return gmcp;
      }
    };
  }

  // ============================================================================
  // Attack Queue API
  // ============================================================================

  private createAttackQueueApi(): AttackQueueApi {
    return {
      add: (id) => {
        return this.client.TeamManager.addEnemyToQueue(id);
      },

      remove: (id) => {
        return this.client.TeamManager.removeEnemyFromQueue(id);
      },

      clear: () => {
        this.client.TeamManager.clearEnemyQueue();
      },

      get: () => {
        return this.client.TeamManager.getEnemyQueue();
      }
    };
  }

  // ============================================================================
  // Objects API
  // ============================================================================

  private createObjectsApi(): ObjectsApi {
    return {
      getObjectsOnLocation: () => {
        return this.client.ObjectManager.getObjectsOnLocation();
      }
    };
  }

  // ============================================================================
  // Command API
  // ============================================================================

  private createCommandApi(): CommandApi {
    return {
      send: async (command, echo, options) => {
        await this.client.sendCommand(command, echo, options);
      },

      addSuggestions: (...words: string[]) => {
        for (const word of words) {
          if (word && !this.commandLineSuggestions.has(word)) {
            this.commandLineSuggestions.add(word);
            this.client.commandLineSuggestions.push(word);
          }
        }
      },

      removeSuggestions: (...words: string[]) => {
        for (const word of words) {
          if (this.commandLineSuggestions.delete(word)) {
            const idx = this.client.commandLineSuggestions.indexOf(word);
            if (idx !== -1) {
              this.client.commandLineSuggestions.splice(idx, 1);
            }
          }
        }
      }
    };
  }

  // ============================================================================
  // Command Hooks API
  // ============================================================================

  private createCommandHooksApi(): CommandHooksApi {
    return {
      register: (callback: CommandHookCallback, priority?: number): string => {
        const hookId = `plugin:${this.pluginId}:${this.generateId('hook')}`;
        this.client.registerCommandHook(hookId, callback, priority);
        this.commandHookIds.add(hookId);
        return hookId;
      },

      unregister: (hookId: string): boolean => {
        const removed = this.client.unregisterCommandHook(hookId);
        if (removed) {
          this.commandHookIds.delete(hookId);
        }
        return removed;
      }
    };
  }

  // ============================================================================
  // Pretty Containers API
  // ============================================================================

  private createPrettyContainersApi(): PrettyContainersApi {
    return {
      getFilters: () => {
        return getGroupDefinitions();
      },
      getTransforms: () => {
        return getTransformDefinitions();
      },
      addFilter: (definition: GroupDefinition) => {
        addGroupDefinition(definition);
      },
      addTransform: (definition: TransformDefinition) => {
        addTransformDefinition(definition);
      }
    };
  }

  // ============================================================================
  // Containers API
  // ============================================================================

  private createContainersApi(): ContainersApi {
    return {
      getContainer: (type: ContainerType) => {
        return getContainer(type);
      },
      getContainerForms: (type: ContainerType) => {
        return getContainerForms(type);
      },
      put: (type: ContainerType, item: string) => {
        containerAction(this.client, type, "put", item);
      },
      take: (type: ContainerType, item: string) => {
        containerAction(this.client, type, "take", item);
      }
    };
  }

  // ============================================================================
  // Magics API
  // ============================================================================

  private createMagicsApi(): MagicsApi {
    return {
      getPatterns: async () => {
        return await loadMagics();
      },
      getRawData: async () => {
        return await loadMagicsRaw();
      }
    };
  }

  // ============================================================================
  // Magic Keys API
  // ============================================================================

  private createMagicKeysApi(): MagicKeysApi {
    return {
      getPatterns: async () => {
        return await loadMagicKeys();
      },
      getRawData: async () => {
        return await loadMagicKeysRaw();
      }
    };
  }

  // ============================================================================
  // Herbs API
  // ============================================================================

  private createHerbsApi(): HerbsApi {
    return {
      getBags: () => {
        return this.client.herbManager?.getBags() ?? {};
      },

      take: async (herbId: string, amount: number, fromBag?: number) => {
        if (!this.client.herbManager) {
          console.warn('Herb manager not initialized');
          return 0;
        }
        return await this.client.herbManager.take(herbId, amount, fromBag);
      },

      put: async (herbId: string, amount: number, bag: number) => {
        if (!this.client.herbManager) {
          console.warn('Herb manager not initialized');
          return 0;
        }
        return await this.client.herbManager.put(herbId, amount, bag);
      },

      move: async (options: HerbMoveOptions) => {
        if (!this.client.herbManager) {
          console.warn('Herb manager not initialized');
          return;
        }
        return await this.client.herbManager.move(options);
      },

      getData: async () => {
        return await loadHerbs();
      }
    };
  }

  // ============================================================================
  // Object List Filters API
  // ============================================================================

  private createObjectListFiltersApi(): ObjectListFiltersApi {
    return {
      register: (name: string, filter: ObjectListEntryFilter, priority?: number) => {
        objectListFilters.register(name, filter, priority);
      },

      unregister: (name: string): boolean => {
        return objectListFilters.unregister(name);
      },

      getFilterNames: (): string[] => {
        return objectListFilters.getFilterNames();
      },

      clear: () => {
        objectListFilters.clear();
      }
    };
  }

  // ============================================================================
  // Enemy Binds API
  // ============================================================================

  private createEnemyBindsApi(): EnemyBindsApi {
    return {
      register: (name: string, resolver: EnemyBindResolver, priority?: number) => {
        enemyBindResolvers.register(name, resolver, priority);
      },

      unregister: (name: string): boolean => {
        return enemyBindResolvers.unregister(name);
      },

      getResolverNames: (): string[] => {
        return enemyBindResolvers.getResolverNames();
      },

      clear: () => {
        enemyBindResolvers.clear();
      }
    };
  }

  // ============================================================================
  // Button Macros API
  // ============================================================================

  private createButtonMacrosApi(): ButtonMacrosApi {
    return {
      register: (options): ButtonMacroHandle => {
        const fullId = `plugin:${this.pluginId}:${options.id}`;
        const macro: PluginButtonMacro = {
          id: fullId,
          label: options.label,
          pluginId: this.pluginId,
          pluginName: this._pluginName,
          onClick: options.onClick,
          configFields: options.configFields,
          states: options.states,
          initialState: options.initialState
        };
        registerButtonMacro(macro);
        this.buttonMacroIds.add(fullId);

        // Return handle for controlling macro state
        return {
          getState: () => getButtonMacroState(fullId),
          setState: (stateId) => setButtonMacroState(fullId, stateId),
          cycleState: () => {
            const m = getButtonMacroById(fullId);
            if (!m?.states?.length) return;
            const currentState = getButtonMacroState(fullId);
            const currentIndex = m.states.findIndex(s => s.id === currentState);
            const nextIndex = (currentIndex + 1) % m.states.length;
            setButtonMacroState(fullId, m.states[nextIndex].id);
          },
          onStateChange: (listener) => {
            const unsubscribe = onButtonMacroStateChange(fullId, (_, newState, oldState) => {
              listener(newState, oldState);
            });
            this.stateChangeUnsubscribers.push(unsubscribe);
            return unsubscribe;
          }
        };
      },

      unregister: (id) => {
        const fullId = `plugin:${this.pluginId}:${id}`;
        unregisterButtonMacro(fullId);
        this.buttonMacroIds.delete(fullId);
      },

      getState: (id) => {
        const fullId = `plugin:${this.pluginId}:${id}`;
        return getButtonMacroState(fullId);
      },

      setState: (id, stateId) => {
        const fullId = `plugin:${this.pluginId}:${id}`;
        return setButtonMacroState(fullId, stateId);
      },

      onStateChange: (id, listener) => {
        const fullId = `plugin:${this.pluginId}:${id}`;
        const unsubscribe = onButtonMacroStateChange(fullId, listener);
        this.stateChangeUnsubscribers.push(unsubscribe);
        return unsubscribe;
      }
    };
  }

  // ============================================================================
  // Trigger Macros API
  // ============================================================================

  private createTriggerMacrosApi(): TriggerMacrosApi {
    return {
      register: (options) => {
        const fullId = `plugin:${this.pluginId}:${options.id}`;
        const macro: PluginTriggerMacro = {
          id: fullId,
          label: options.label,
          pluginId: this.pluginId,
          pluginName: this._pluginName,
          onMatch: options.onMatch,
          configFields: options.configFields
        };
        registerTriggerMacro(macro);
        this.triggerMacroIds.add(fullId);
      },

      unregister: (id) => {
        const fullId = `plugin:${this.pluginId}:${id}`;
        unregisterTriggerMacro(fullId);
        this.triggerMacroIds.delete(fullId);
      }
    };
  }

  // ============================================================================
  // Settings API
  // ============================================================================

  private createSettingsApi(): SettingsApi {
    return {
      getCharacterSettings: async (): Promise<Settings> => {
        const stored = characterStorage.get("settings");
        return { ...defaultSettings, ...stored };
      },

      getCharacterSetting: async <K extends keyof Settings>(key: K): Promise<Settings[K]> => {
        const settings = await this.settings.getCharacterSettings();
        return settings[key];
      },

      getUiSettings: async (): Promise<UiSettings> => {
        // Compose the unified view from the concern slices (which hold the moved
        // fields) plus the uiSettings blob (stock chrome), so plugins see the
        // full settings shape regardless of the physical storage split.
        return {
          ...getPluginHostPort().getDefaultUiSettings(),
          ...getShellSettings(),
          ...getRenderSettings(),
          ...getMapSettings(),
          ...getBehaviorSettings(),
          ...(globalStorage.get("uiSettings") ?? {}),
        };
      },

      getUiSetting: async <K extends keyof UiSettings>(key: K): Promise<UiSettings[K]> => {
        const uiSettings = await this.settings.getUiSettings();
        return uiSettings[key];
      }
    };
  }

  // ============================================================================
  // Attack Controller API
  // ============================================================================

  private createAttackControllerApi(): AttackControllerApi {
    return {
      attackById: (id: number, command?: string): void => {
        this.client.AttackController.attackById(id, command);
      },

      support: (command?: string): void => {
        this.client.AttackController.support(command);
      },

      getAttackCommand: (): string => {
        return this.client.AttackController.getAttackCommand();
      },

      getSupportCommand: (): string => {
        return this.client.AttackController.getSupportCommand();
      }
    };
  }

  // ============================================================================
  // Combat API
  // ============================================================================

  private createCombatApi(): CombatApi {
    return {
      drawWeapon: (): void => {
        this.client.drawWeapon();
      }
    };
  }

  // ============================================================================
  // Location Notes API
  // ============================================================================

  private createLocationNotesApi(): LocationNotesApi {
    return {
      set: (roomId: number, note: string): void => {
        setPluginLocationNote(this.pluginId, this.pluginName, roomId, note);
      },

      remove: (roomId: number): void => {
        removePluginLocationNote(this.pluginId, roomId);
      },

      get: (roomId: number): PluginLocationNote[] => {
        return getPluginLocationNotes(roomId);
      }
    };
  }

  private createPeopleApi(): PeopleApi {
    return {
      add: (entry: { name: string; description: string; guild: string }): void => {
        addLocalPerson(entry);
      },

      edit: (targetKey: string, entry: { name: string; description: string; guild: string }): void => {
        editPerson(targetKey, entry);
      },

      remove: (eventId: string): void => {
        deleteLocalPerson(eventId);
      },

      ignore: (targetKey: string): void => {
        ignorePerson(targetKey);
      },

      restore: (targetKey: string): void => {
        restorePerson(targetKey);
      },

      markEnemy: (targetKey: string): void => {
        markAsEnemy(targetKey);
      },

      unmarkEnemy: (targetKey: string): void => {
        unmarkAsEnemy(targetKey);
      },

      markAlly: (targetKey: string): void => {
        markAsAlly(targetKey);
      },

      unmarkAlly: (targetKey: string): void => {
        unmarkAsAlly(targetKey);
      },

      setColor: (targetKey: string, color: string): void => {
        setPersonColor(targetKey, color);
      },

      clearColor: (targetKey: string): void => {
        clearPersonColor(targetKey);
      },

      find: (name: string, description: string): PersonListEntry | undefined => {
        const key = makePersonKey(name, description);
        const snapshot = getMergedSnapshot();
        if (!snapshot) return undefined;
        return snapshot.find((p) => makePersonKey(p.name, p.description) === key);
      },

      findByKey: (key: string): PersonListEntry | undefined => {
        const snapshot = getMergedSnapshot();
        if (!snapshot) return undefined;
        return snapshot.find((p) => makePersonKey(p.name, p.description) === key);
      },

      getAll: (): PersonListEntry[] => {
        return getMergedSnapshot() ?? [];
      },

      makeKey: (name: string, description: string): string => {
        return makePersonKey(name, description);
      }
    };
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Cleanup method called when plugin is unloaded
   * Removes all registered aliases, macros, and UI elements
   */
  cleanup(): void {
    // Remove all aliases registered by this plugin
    for (const id of this.aliasMap.keys()) {
      this.aliases.remove(id);
    }
    this.aliasMap.clear();

    for (const popup of Array.from(this.popupHandles)) {
      popup.close();
    }
    this.popupHandles.clear();

    // Close all persistent popups registered by this plugin
    for (const handle of this.persistentPopupHandles.values()) {
      if (handle.isOpen) {
        handle.close();
      }
    }
    this.persistentPopupHandles.clear();

    for (const id of Array.from(this.popupMenuEntryIds)) {
      unregisterPopupMenuEntry(id);
    }
    this.popupMenuEntryIds.clear();

    for (const id of Array.from(this.contextMenuEntryIds)) {
      unregisterContextMenuEntry(id);
    }
    this.contextMenuEntryIds.clear();

    // Remove all footer components registered by this plugin
    for (const id of Array.from(this.footerComponentIds)) {
      unregisterFooterComponent(id);
    }
    this.footerComponentIds.clear();

    // Remove all button macros registered by this plugin
    for (const id of Array.from(this.buttonMacroIds)) {
      unregisterButtonMacro(id);
    }
    this.buttonMacroIds.clear();

    // Remove all trigger macros registered by this plugin
    for (const id of Array.from(this.triggerMacroIds)) {
      unregisterTriggerMacro(id);
    }
    this.triggerMacroIds.clear();

    // Remove all command hooks registered by this plugin
    for (const id of Array.from(this.commandHookIds)) {
      this.client.unregisterCommandHook(id);
    }
    this.commandHookIds.clear();

    // Remove all command line suggestions registered by this plugin
    for (const word of this.commandLineSuggestions) {
      const idx = this.client.commandLineSuggestions.indexOf(word);
      if (idx !== -1) {
        this.client.commandLineSuggestions.splice(idx, 1);
      }
    }
    this.commandLineSuggestions.clear();

    // Unsubscribe from all state change listeners
    for (const unsubscribe of this.stateChangeUnsubscribers) {
      unsubscribe();
    }
    this.stateChangeUnsubscribers = [];

    // Remove all location notes registered by this plugin
    removeAllPluginNotes(this.pluginId);
  }

  private createPopup(title: string, body: PopupContent): Promise<PopupHandle> {
    return new Promise((resolve) => {
      // Generate stable popup ID based on title for state persistence
      // Use a simple hash of the title to create a consistent identifier
      const titleHash = title.split('').reduce((hash, char) => {
        return ((hash << 5) - hash + char.charCodeAt(0)) | 0;
      }, 0).toString(36).replace('-', 'n');
      const popupType = `plugin:${this.pluginId}:${titleHash}` as const;
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
        this.popupHandles.delete(handle);
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

      this.popupHandles.add(handle);
    });
  }

  private async registerPersistentPopup(config: PersistentPopupConfig): Promise<PersistentPopupHandle> {
    // Generate stable popup ID from plugin ID and user-provided ID
    const popupType = `plugin:${this.pluginId}:${config.id}` as const;
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
      isPinned: currentPinned,
      isOpen: false, // Start closed, PluginPopupRenderer will auto-open if needed
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
      onClose: (callback) => {
        closeCallbacks.add(callback);
      },
      close: closePopup,
      open: openPopup
    };

    // Store in our tracking map
    this.persistentPopupHandles.set(config.id, persistentHandle);

    return persistentHandle;
  }

  private addPopupMenuEntry(label: string | Node, onSelect: () => void): PopupMenuEntryHandle {
    const id = this.generateId("popup-menu");
    registerPopupMenuEntry(id, label, onSelect);
    this.popupMenuEntryIds.add(id);

    return {
      setLabel: (value) => {
        updatePopupMenuEntryLabel(id, value);
      },
      setDisabled: (disabled) => {
        setPopupMenuEntryDisabled(id, disabled);
      },
      remove: () => {
        unregisterPopupMenuEntry(id);
        this.popupMenuEntryIds.delete(id);
      }
    };
  }

  private addContextMenuEntry(label: string | Node, action: () => void): ContextMenuEntryHandle {
    const id = this.generateId("context-menu");
    registerContextMenuEntry(id, label, action);
    this.contextMenuEntryIds.add(id);

    return {
      setLabel: (value) => {
        updateContextMenuEntry(id, { label: value });
      },
      setAction: (callback) => {
        updateContextMenuEntry(id, { action: callback });
      },
      remove: () => {
        unregisterContextMenuEntry(id);
        this.contextMenuEntryIds.delete(id);
      }
    };
  }

  private registerFooterComponent(
    id: string,
    content: FooterContent,
    position?: 'start' | 'end' | number
  ): FooterComponentHandle {
    const fullId = `plugin:${this.pluginId}:${id}`;

    // Register the component - registry handles element creation and content rendering
    const record = registerFooterComponent(fullId, content, position);
    this.footerComponentIds.add(fullId);

    return {
      get element(): HTMLSpanElement {
        return record.element;
      },
      setContent: (newContent: FooterContent) => {
        updateFooterComponent(fullId, newContent);
      },
      setVisible: (visible) => {
        setFooterComponentVisible(fullId, visible);
      },
      remove: () => {
        unregisterFooterComponent(fullId);
        this.footerComponentIds.delete(fullId);
      }
    };
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
