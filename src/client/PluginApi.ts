/**
 * Plugin API - Bridge between Client and Plugins
 *
 * Provides a stable, versioned API surface for external plugins.
 * This abstraction layer:
 * - Hides internal Client implementation details
 * - Provides a controlled interface for plugin capabilities
 * - Makes it easier to maintain backward compatibility
 */

import type Client from "./Client";
import type { ClientEvents } from "@shared/events";
import { AnsiAwareBuffer } from "@client/ansi/FormatState";
import type { FormatStateSnapshot } from "@client/ansi/FormatState";
import type {
  Trigger,
  TriggerCallback,
  TriggerPattern,
  TriggerOptions
} from "./Triggers";
import { gmcp } from "./gmcp";
import {
  registerPopupMenuEntry,
  setPopupMenuEntryDisabled,
  unregisterPopupMenuEntry,
  updatePopupMenuEntryLabel,
  registerContextMenuEntry,
  unregisterContextMenuEntry,
  updateContextMenuEntry
} from "@modules/core/pluginUiRegistry";
import React from "react";
import { createRoot } from "react-dom/client";
import { PluginPopup } from "../ui/web/components/PluginPopup";
import {
  getGroupDefinitions,
  getTransformDefinitions,
  addGroupDefinition,
  addTransformDefinition
} from "./scripts/prettyContainers";
import loadMagics from "./scripts/magicsLoader";
import loadMagicKeys from "./scripts/magicKeyLoader";

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
   * // Emit a notification
   * api.events.emit("notify", { text: "Hello!", time: 5000 });
   *
   * // Send a command
   * api.events.emit("sendCommand", { command: "look", echo: true });
   * ```
   */
  emit<K extends EventKey>(event: K, ...args: EventParams<K>): void;
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
 * Popup content that can be rendered inside plugin popups
 */
export type PopupContent = string | Node;

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
 * UI helpers for plugins
 */
export interface UiApi {
  /**
   * Create a draggable popup window
   * @param title - Popup title text
   * @param body - Popup body content (string or DOM node)
   * @returns Promise that resolves with handle for controlling the popup once mounted
   */
  createPopup(title: string, body: PopupContent): Promise<PopupHandle>;

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
  getLeaderId(): string | undefined;

  /**
   * Get the player's object number
   * @returns Player object number or undefined
   */
  getPlayerNum(): string | undefined;
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
  add(id: string): boolean;

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
  remove(id: string): boolean;

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
  get(): string[];
}

/**
 * Location object information
 */
export interface LocationObject {
  /** Object number */
  num: number;
  /** Object description/name */
  desc?: string;
  /** Object state (typically HP) */
  state?: any;
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
  /** Pretty containers - container formatting and filtering */
  prettyContainers: PrettyContainersApi;
  /** Magics - magic item patterns */
  magics: MagicsApi;
  /** Magic keys - magic key patterns */
  magicKeys: MagicKeysApi;
  /** Herbs - herb inventory management in bags */
  herbs: HerbsApi;
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
  private aliasMap: Map<string, PluginAlias> = new Map();
  private popupHandles: Set<PopupHandle> = new Set();
  private popupMenuEntryIds: Set<string> = new Set();
  private contextMenuEntryIds: Set<string> = new Set();

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
  public prettyContainers: PrettyContainersApi;
  public magics: MagicsApi;
  public magicKeys: MagicKeysApi;
  public herbs: HerbsApi;
  public AnsiAwareBuffer: typeof AnsiAwareBuffer;

  constructor(client: Client) {
    this.client = client;

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
    this.prettyContainers = this.createPrettyContainersApi();
    this.magics = this.createMagicsApi();
    this.magicKeys = this.createMagicKeysApi();
    this.herbs = this.createHerbsApi();

    // Expose AnsiAwareBuffer class
    this.AnsiAwareBuffer = AnsiAwareBuffer;
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

      setLocation: (roomId: number) => {
        this.client.Map.setMapRoomById(roomId);
      },

      stepBack: () => {
        this.client.Map.moveBack();
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
      addPopupMenuEntry: (label, onSelect) => this.addPopupMenuEntry(label, onSelect),
      addContextMenuEntry: (label, action) => this.addContextMenuEntry(label, action)
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
  // Magics API
  // ============================================================================

  private createMagicsApi(): MagicsApi {
    return {
      getPatterns: async () => {
        return await loadMagics();
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
      }
    };
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Cleanup method called when plugin is unloaded
   * Removes all registered aliases
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

    for (const id of Array.from(this.popupMenuEntryIds)) {
      unregisterPopupMenuEntry(id);
    }
    this.popupMenuEntryIds.clear();

    for (const id of Array.from(this.contextMenuEntryIds)) {
      unregisterContextMenuEntry(id);
    }
    this.contextMenuEntryIds.clear();
  }

  private createPopup(title: string, body: PopupContent): Promise<PopupHandle> {
    return new Promise((resolve) => {
      // Create container for React root
      const container = document.createElement("div");
      document.body.appendChild(container);

      // Create React root
      const root = createRoot(container);

      let setTitleFn: ((title: string) => void) | null = null;
      let setBodyFn: ((body: string | Node) => void) | null = null;
      let setPinnedFn: ((pinned: boolean) => void) | null = null;
      let panelRef: HTMLDivElement | null = null;
      let isPinned = false;
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

        root.unmount();
        container.remove();
        this.popupHandles.delete(handle);
      };

      const renderPopup = (isOpen: boolean) => {
        root.render(
          React.createElement(PluginPopup, {
            title,
            body,
            isOpen,
            isPinned,
            onClose: closePopup,
            onTitleChange: (callback) => { setTitleFn = callback; },
            onBodyChange: (callback) => { setBodyFn = callback; },
            onPinChange: (callback) => {
              // Wrap the callback to update our local isPinned state
              setPinnedFn = (pinned: boolean) => {
                isPinned = pinned;
                callback(pinned);
              };
            },
            onPanelRef: (element) => {
              panelRef = element;
              // Resolve the promise once the panel is mounted
              if (element) {
                resolve(handle);
              }
            }
          })
        );
      };

      // Initial render
      renderPopup(true);

      const handle: PopupHandle = {
        get element(): HTMLDivElement {
          // panelRef will always be set when handle is resolved
          return panelRef!;
        },
        get isPinned(): boolean {
          return isPinned;
        },
        setTitle: (value) => {
          title = value;
          setTitleFn?.(value);
        },
        setBody: (content) => {
          body = content;
          setBodyFn?.(content);
        },
        setPinned: (pinned: boolean) => {
          isPinned = pinned;
          setPinnedFn?.(pinned);
        },
        onClose: (callback: () => void) => {
          closeCallbacks.add(callback);
        },
        close: closePopup
      };

      this.popupHandles.add(handle);
    });
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

  private generateId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
