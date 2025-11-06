/**
 * TypeScript Type Definitions for Arkadia Web Client Plugins
 *
 * This package provides TypeScript type definitions for developing
 * plugins for the Arkadia Web Client.
 *
 * MAINTAINER NOTE: This file should be kept in sync with src/client/PluginApi.ts
 * which is the single source of truth. When adding new API methods or types to
 * PluginApi.ts, update this file accordingly.
 *
 * @packageDocumentation
 */

// ============================================================================
// Plugin Interface
// ============================================================================

/**
 * Plugin metadata returned by the init function
 */
export interface PluginInfo {
  /** Name of the plugin */
  name: string;
  /** Version string (e.g., "1.0.0") */
  version: string;
  /** Optional author information */
  author?: string;
  /** Optional description of plugin functionality */
  description?: string;
}

/**
 * Plugin interface that all plugins must implement
 */
export interface Plugin {
  /**
   * Initialize the plugin with access to the Plugin API
   * @param api - The Plugin API instance
   * @returns Promise resolving to plugin metadata
   */
  init(api: PluginApi): Promise<PluginInfo>;

  /**
   * Optional cleanup function called when plugin is unloaded
   */
  destroy?(): Promise<void> | void;
}

// ============================================================================
// Color Types
// ============================================================================

/**
 * Indexed color (0-255)
 */
export interface IndexedColor {
  space: "indexed";
  index: number;
}

/**
 * RGB color
 */
export interface RgbColor {
  space: "rgb";
  r: number;
  g: number;
  b: number;
}

/**
 * Hexadecimal color
 */
export interface HexColor {
  space: "hex";
  color: string;
}

/**
 * Union type for all color formats
 */
export type FormatColor = IndexedColor | RgbColor | HexColor;

/**
 * Hyperlink with callbacks
 */
export interface FormatHyperlink {
  onClick?: (ev: MouseEvent) => void;
  onContextMenu?: (ev: MouseEvent) => void;
  title?: string;
}

/**
 * Complete formatting state for text
 */
export interface FormatStateSnapshot {
  foreground?: FormatColor;
  background?: FormatColor;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
  strikethrough?: boolean;
  hyperlink?: FormatHyperlink;
}


/**
 * Text range [start, end] for applying formatting
 */
export type TextRange = [start: number, end: number];

/**
 * Buffer segment with text and optional formatting state
 */
export interface BufferSegment {
  text: string;
  state?: FormatStateSnapshot;
}

// ============================================================================
// AnsiAwareBuffer - Line Manipulation
// ============================================================================

/**
 * Buffer for text with ANSI formatting
 * Represents a line of text with color and style information
 */
export declare class AnsiAwareBuffer {
  /**
   * Create a new AnsiAwareBuffer
   * @param initial - Initial text with ANSI codes, array of segments, or undefined
   * @param state - Optional default formatting state
   *
   * @example
   * // Create empty buffer
   * const buffer = new AnsiAwareBuffer();
   *
   * // Create from plain text
   * const buffer = new AnsiAwareBuffer("Hello world");
   *
   * // Create from text with default formatting
   * const buffer = new AnsiAwareBuffer("Hello", api.colors.fromHex('#ff0000'));
   *
   * // Create from ANSI string
   * const buffer = new AnsiAwareBuffer("\x1b[31mRed text\x1b[0m");
   *
   * // Create from segments
   * const segments: BufferSegment[] = [
   *   { text: "Hello ", state: api.colors.fromHex('#00ff00') },
   *   { text: "world", state: api.colors.fromHex('#0000ff') }
   * ];
   * const buffer = new AnsiAwareBuffer(segments);
   */
  constructor(initial?: string | BufferSegment[], state?: FormatStateSnapshot);
  /**
   * Get the plain text content without formatting
   */
  readonly text: string;

  /**
   * Get the total character length
   */
  readonly length: number;

  /**
   * Create a deep copy of this buffer
   */
  clone(): AnsiAwareBuffer;

  /**
   * Clear all content from the buffer
   */
  clear(): this;

  /**
   * Replace text in a range
   * @param range - [start, end] indices
   * @param text - New text to insert
   * @param state - Optional formatting to apply
   */
  replace(range: TextRange, text: string, state?: FormatStateSnapshot): this;

  /**
   * Insert text at an index
   * @param index - Position to insert at
   * @param text - Text to insert
   * @param state - Optional formatting to apply
   */
  insert(index: number, text: string, state?: FormatStateSnapshot): this;

  /**
   * Insert another buffer at an index
   * @param index - Position to insert at
   * @param buffer - Buffer to insert
   */
  insertBuffer(index: number, buffer: AnsiAwareBuffer): this;

  /**
   * Append another buffer to the end
   * @param buffer - Buffer to append
   */
  appendBuffer(buffer: AnsiAwareBuffer): this;

  /**
   * Prepend another buffer to the beginning
   * @param buffer - Buffer to prepend
   */
  prependBuffer(buffer: AnsiAwareBuffer): this;

  /**
   * Add text to the beginning of the line
   * @param text - Text to prepend
   * @param state - Optional formatting to apply
   */
  prepend(text: string, state?: FormatStateSnapshot): this;

  /**
   * Add text to the end of the line
   * @param text - Text to append
   * @param state - Optional formatting to apply
   */
  append(text: string, state?: FormatStateSnapshot): this;

  /**
   * Apply color/formatting to a text range
   * @param range - [start, end] indices
   * @param color - Color index (0-255) or full FormatStateSnapshot
   */
  color(range: TextRange, color: number | FormatStateSnapshot): this;

  /**
   * Apply color/formatting to specific words throughout the buffer
   * @param words - Single word or array of words to colorize
   * @param color - Color index (0-255) or full FormatStateSnapshot
   * @param options - Search options (caseInsensitive)
   *
   * @example
   * ```typescript
   * // Color a single word
   * line.colorWords("gold", api.colors.fromHex('#ffd700'));
   *
   * // Color multiple words
   * line.colorWords(["red", "blue"], 196, { caseInsensitive: true });
   * ```
   */
  colorWords(
    words: string | string[],
    color: number | FormatStateSnapshot,
    options?: { caseInsensitive?: boolean }
  ): this;

  /**
   * Make a text range clickable with event handlers
   * @param range - [start, end] indices
   * @param options - Link options (onClick, onContextMenu, title)
   *
   * @example
   * ```typescript
   * const text = "Click here";
   * const start = line.text.indexOf(text);
   * line.createLink([start, start + text.length], {
   *   onClick: () => api.output.print("Clicked!", "system"),
   *   title: "Click to execute"
   * });
   * ```
   */
  createLink(
    range: TextRange,
    options: {
      onClick?: (ev: MouseEvent) => void;
      onContextMenu?: (ev: MouseEvent) => void;
      title?: string;
    }
  ): this;

  /**
   * Make all occurrences of a text string clickable
   * @param text - Text to make clickable
   * @param options - Link options (onClick, onContextMenu, title)
   * @param searchOptions - Search options (caseInsensitive)
   *
   * @example
   * ```typescript
   * line.createLinksForText("potion", {
   *   onClick: () => api.output.print("Use potion", "system"),
   *   title: "Click to use"
   * }, { caseInsensitive: true });
   * ```
   */
  createLinksForText(
    text: string,
    options: {
      onClick?: (ev: MouseEvent) => void;
      onContextMenu?: (ev: MouseEvent) => void;
      title?: string;
    },
    searchOptions?: { caseInsensitive?: boolean }
  ): this;

  /**
   * Remove text in a range
   * @param range - [start, end] indices
   */
  remove(range: TextRange): this;
}

// ============================================================================
// Trigger System
// ============================================================================

/**
 * Callback function for triggers
 * @param line - The line buffer to potentially modify
 * @param matches - Regex match results
 * @param type - Line type (e.g., "prompt", "info", "error")
 * @returns Modified line or null to suppress the line
 */
export type TriggerCallback = (
  line: AnsiAwareBuffer,
  matches: RegExpMatchArray,
  type: string
) => AnsiAwareBuffer | null;

/**
 * Custom match function for advanced trigger patterns
 */
export type TriggerMatchFunction = (
  line: AnsiAwareBuffer,
  matches: RegExpMatchArray,
  type: string
) => RegExpMatchArray | undefined;

/**
 * Trigger pattern types
 */
export type TriggerSubPattern = string | RegExp | TriggerMatchFunction;
export type TriggerPattern = TriggerSubPattern | TriggerSubPattern[];

/**
 * Options for trigger behavior
 */
export interface TriggerOptions {
  /** Number of lines to keep child triggers active after parent matches */
  stayOpenLines?: number;
  /** Make regex case-insensitive */
  caseInsensitive?: boolean;
}

/**
 * Trigger instance
 */
export interface Trigger {
  /** Unique trigger ID */
  readonly id: string;

  /**
   * Register a child trigger (active after parent matches)
   * @param pattern - Pattern(s) to match
   * @param callback - Function to call on match
   * @param tag - Optional tag for grouping/removal
   * @param options - Trigger options
   */
  registerChild(
    pattern: TriggerPattern,
    callback?: TriggerCallback,
    tag?: string,
    options?: TriggerOptions
  ): Trigger;

  /**
   * Register a one-time child trigger (auto-removed after first match)
   * @param pattern - Pattern(s) to match
   * @param callback - Function to call on match
   * @param tag - Optional tag for grouping/removal
   * @param options - Trigger options
   */
  registerOneTimeChild(
    pattern: TriggerPattern,
    callback: TriggerCallback,
    tag?: string,
    options?: TriggerOptions
  ): Trigger;
}

/**
 * Helper function to match on line type
 * @param type - Line type to match (e.g., "prompt", "info")
 */
export function isType(type: string): TriggerMatchFunction;

// ============================================================================
// Map Position
// ============================================================================

/**
 * Map direction type
 */
export type MapDirection =
  | "north"
  | "south"
  | "east"
  | "west"
  | "northwest"
  | "northeast"
  | "southeast"
  | "southwest"
  | "up"
  | "down"
  | "in"
  | "out";

/**
 * Map room information
 */
export interface Room {
  /** Room ID */
  id: number;
  /** Area ID (numeric) */
  area: number;
  /** X coordinate */
  x: number;
  /** Y coordinate */
  y: number;
  /** Z coordinate (level) */
  z: number;
  /** Area identifier string */
  areaId: string;
  /** Room name */
  name: string;
  /** Room weight for pathfinding */
  weight: number;
  /** Room symbol */
  symbol: string;
  /** User-defined data */
  userData: Record<string, string>;
  /** Custom lines */
  customLines: Record<string, any>;
  /** Stub exits */
  stubs: number[];
  /** Room hash */
  hash: string;
  /** Environment ID */
  env: number;
  /** Exit connections to room IDs */
  exits: Record<MapDirection, number>;
  /** Door types (1=open, 2=closed, 3=locked) */
  doors: Record<MapDirection, 1 | 2 | 3>;
  /** Special exits with custom commands */
  specialExits: Record<string, number>;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Send command event payload
 */
export interface SendCommandEvent {
  command: string;
  echo?: boolean;
  options?: {
    mode?: string;
    [key: string]: any;
  };
}

/**
 * Notification event payload
 */
export interface NotificationPayload {
  text: string;
  time?: number;
}

/**
 * Storage event payload
 */
export interface StorageEventPayload {
  key: string;
  value: unknown;
}

/**
 * Multibind list event payload
 */
export interface MultibindList {
  list: { index: number; action: string; label: string }[];
}

/**
 * Message event payload (output text)
 */
export type MessageEventPayload = [text: string | AnsiAwareBuffer, type?: string, timestamp?: number];

/**
 * Recording auto-stop event payload
 */
export type RecordingAutoStopPayload = [name: string | null, save?: boolean];

/**
 * Playback index event payload
 */
export type PlaybackIndexPayload = [current: number, total: number];

/**
 * Knowledge report action
 */
export type KnowledgeReportAction =
  | { type: "completeLibrary"; libraryId: string }
  | { type: "resetLibrary"; libraryId: string };

/**
 * Package status event payload
 */
export interface PackageStatus {
  recipient: string;
  seconds?: number;
}

/**
 * Plugin loaded event payload
 */
export interface PluginLoadedPayload {
  url: string;
  info: {
    name: string;
    version: string;
    author?: string;
    description?: string;
  };
}

/**
 * Plugin error event payload
 */
export interface PluginErrorPayload {
  url: string;
  error: string;
}

/**
 * Plugin destroyed event payload
 */
export interface PluginDestroyedPayload {
  url: string;
}

/**
 * Known client events with their payloads
 * Subscribe to these events using api.events.on()
 */
export interface ClientEvents {
  /** Command sent to the MUD server */
  "command": string;
  /** Port connection established */
  "port-connected": void;
  /** Output line sent to display */
  "output-sent": number;
  /** Buffer sent */
  "buffer-sent": number;
  /** Map position changed */
  "mapMove": void;
  /** Step back in location history */
  "stepBack": void;
  /** Lead to specific room ID */
  "leadTo": number;
  /** Clear lead to destination */
  "clearLeadTo": void;
  /** Display notification */
  "notify": NotificationPayload;
  /** Lamp timer updated */
  "lampTimer": number | null;
  /** Cover timer updated */
  "coverTimer": number | null;
  /** Break item warning */
  "breakItem": { text: string; command?: string } | null;
  /** Package delivery status */
  "packageStatus": PackageStatus | null;
  /** Release guard status */
  "releaseGuard": boolean;
  /** Attack mode changed */
  "attackMode": "A" | "AW" | "AWR";
  /** Content width changed */
  "contentWidth": number;
  /** Entered a location */
  "enterLocation": { id: number; room: unknown };
  /** Highlights updated */
  "highlights": number[];
  /** Multibind list updated */
  "multibinds": MultibindList;
  /** Letter composer state */
  "letterComposer": { open: boolean };
  /** Letter composer submit */
  "letterComposer.submit": unknown;
  /** Letter composer preview */
  "letterComposer.preview": unknown;
  /** NPC information */
  "npc": unknown;
  /** Zask timer status */
  "zaskTimer": { seconds: number; ok: boolean } | null;
  /** Move mode changed */
  "moveModeChanged": number;
  /** Ping measurement */
  "ping": number | null;
  /** Transport timer status */
  "transportTimer": unknown;
  /** Combat timer */
  "combatTimer": number | null;
  /** Team leader target without avatar */
  "teamLeaderTargetNoAvatar": string;
  /** Team leader target with avatar */
  "teamLeaderTargetAvatar": void;
  /** Team composition changed */
  "teamChange": void;
  /** Is team leader status */
  "isTeamLeader": boolean;
  /** Reset client state */
  "reset": void;
  /** Refresh map position when able */
  "refreshPositionWhenAble": void;
  /** Knowledge report */
  "knowledgeReport": unknown | null;
  /** Knowledge details report */
  "knowledgeDetailsReport": unknown | null;
  /** Knowledge report action */
  "knowledgeReportAction": KnowledgeReportAction;
  /** Send command to server */
  "sendCommand": SendCommandEvent;
  /** Request herb counts */
  "requestHerbCounts": void;
  /** Herb manager closed */
  "herbManagerClose": void;
  /** Herb counts data */
  "herbCounts": unknown;
  /** Herb manager opened */
  "herbManagerOpen": void;
  /** Play sound effect */
  "sound:play": { key: string };
  /** Play beep sound */
  "playBeep": void;
  /** Line start marker */
  "line-start": void;
  /** Storage value changed */
  "storage": StorageEventPayload;
  /** Settings updated */
  "settings": unknown;
  /** Binds updated */
  "binds": unknown;
  /** UI settings updated */
  "uiSettings": unknown;
  /** Mobile buttons settings updated */
  "mobileButtonsSettings": unknown;
  /** Pauser started */
  "pauserStart": void;
  /** Pauser ended */
  "pauserEnd": void;
  /** Client connected to server */
  "client.connect": void;
  /** Client disconnected from server */
  "client.disconnect": void;
  /** WebSocket opened */
  "open": Event;
  /** WebSocket closed */
  "close": CloseEvent;
  /** Error occurred */
  "error": unknown;
  /** GMCP data received */
  "gmcp": { path: string; value: unknown };
  /** Recording started */
  "recording.start": string;
  /** Recording stopped */
  "recording.stop": boolean | undefined;
  /** Auto-recording started */
  "recording.auto.start": string | null | undefined;
  /** Auto-recording stopped */
  "recording.auto.stop": RecordingAutoStopPayload;
  /** Playback stopped */
  "playback.stop": void;
  /** Playback paused */
  "playback.pause": void;
  /** Playback resumed */
  "playback.resume": void;
  /** Playback started */
  "playback.start": number | undefined;
  /** Playback speed changed */
  "playback.speed": number;
  /** Playback index changed */
  "playback.index": PlaybackIndexPayload;
  /** Message output */
  "message": MessageEventPayload;
  /** Attack queue changed */
  "attackQueueChange": string[];
  /** Clear attack queue */
  "clearAttackQueue": void;
  /** Add to attack queue */
  "addToAttackQueue": string;
  /** Remove from attack queue */
  "removeFromAttackQueue": string;
  /** Objects parsed */
  "parsedObjects": void;
  /** Numbers parsed */
  "parsedNums": { nums: number[] };
  /** Kill event */
  "kill": { killer: "ME" | "TEAM" | "OTHER" };
  /** Enemy killed */
  "enemyKilled": { objNum: number; killer: "ME" | "TEAM" | "OTHER"; hasBody?: boolean };
  /** All enemies killed */
  "allEnemiesKilled": void;
  /** Plugin loaded successfully */
  "plugin:loaded": PluginLoadedPayload;
  /** Plugin error occurred */
  "plugin:error": PluginErrorPayload;
  /** Plugin destroyed */
  "plugin:destroyed": PluginDestroyedPayload;
  /** GMCP events with dynamic paths (e.g., gmcp.room.info, gmcp.char.vitals) */
  [key: `gmcp.${string}`]: unknown;
  /** GMCP message events */
  [key: `gmcp_msg.${string}`]: string;
}

// ============================================================================
// API Namespaces
// ============================================================================

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
  on<K extends keyof ClientEvents>(
    event: K,
    listener: (payload: ClientEvents[K]) => void,
    options?: boolean | { once?: boolean; signal?: AbortSignal }
  ): void;

  /**
   * Unsubscribe from an event
   * @param event - Event name
   * @param listener - Event listener function to remove
   */
  off<K extends keyof ClientEvents>(
    event: K,
    listener: (payload: ClientEvents[K]) => void
  ): void;

  /**
   * Emit an event
   * @param event - Event name
   * @param payload - Event payload
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
  emit<K extends keyof ClientEvents>(
    event: K,
    payload: ClientEvents[K]
  ): void;
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
  getRoom(): Room | undefined;

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

// ============================================================================
// Plugin API
// ============================================================================

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

// ============================================================================
// Exports
// ============================================================================

export default PluginApi;
