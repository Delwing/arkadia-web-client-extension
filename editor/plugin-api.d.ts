/**
 * Plugin API Type Definitions
 *
 * This file is auto-generated from source TypeScript files.
 * Do not edit directly - run 'node scripts/generate-plugin-types.js' to regenerate.
 *
 * Source files:
 * - src/client/PluginApi.ts
 * - src/shared/types/Plugin.ts
 * - src/client/Triggers.ts
 * - src/client/ansi/FormatState.ts
 */

// ============================================================================
// Plugin Core Types
// ============================================================================

/**
 * Information about a loaded plugin
 */
interface PluginInfo {
  /** Plugin name */
  name: string
  /** Plugin version (semantic versioning recommended) */
  version: string
  /** Plugin author information */
  author?: string
  /** Brief description of plugin functionality */
  description?: string
}

/**
 * Plugin interface that external scripts should implement
 */
interface Plugin {
  /**
   * Optional stable id (`export const stableId = 'jubiler'`): the plugin's
   * storage and windows are kept under it instead of its URL, so they survive
   * the plugin moving to another address. 1-64 letters, digits, '.', '_', '-'.
   */
  stableId?: string

  /**
   * Initialize the plugin with the Plugin API
   * @param api - The Plugin API instance providing controlled access to client functionality
   * @returns Promise resolving to plugin information
   */
  init(api: PluginApi): Promise<PluginInfo>

  /**
   * Optional cleanup method called when plugin is unloaded
   */
  destroy?(): Promise<void> | void
}

interface LoadedPlugin {
  /** Script URL or stored plugin ID (if stored in IndexedDB) */
  url: string
  /** Plugin information (if available) */
  info?: PluginInfo
  /** Plugin status */
  status: PluginStatus
  /** Error message (if status is 'error') */
  error?: string
  /** Plugin instance (if implements Plugin interface) */
  instance?: Plugin
  /** Plugin API instance provided to the plugin */
  apiInstance?: any // PluginApiImpl, but avoiding circular dependency
  /** The plugin's accepted stableId, which its saved state is kept under */
  stableId?: string
  /** Script element (for legacy scripts loaded via URL) */
  scriptElement?: HTMLScriptElement
  /** Timestamp when plugin was loaded */
  loadedAt: number
}

// ============================================================================
// Trigger Types
// ============================================================================

type TriggerCallback = (
    line: AnsiAwareBuffer,
    matches: RegExpMatchArray,
    type: string, //TODO I guess we can try to list values
    originalLine: string,
) => AnsiAwareBuffer | null;

type TriggerMatchFunction = (
    line: AnsiAwareBuffer,
    matches: RegExpMatchArray,
    type: string
) => RegExpMatchArray | undefined;

type TriggerSubPattern = string | RegExp | TriggerMatchFunction;

type TriggerPattern = TriggerSubPattern | TriggerSubPattern[];

interface TriggerOptions {
    stayOpenLines?: number;
    caseInsensitive?: boolean;
}

// ============================================================================
// Format State Types
// ============================================================================

interface FormatStateSnapshot {
    foreground?: FormatColor;
    background?: FormatColor;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    inverse?: boolean;
    strikethrough?: boolean;
    slowBlink?: boolean;
    rapidBlink?: boolean;
    dim?: DimEffect;
    hyperlink?: FormatHyperlink;
    cssClass?: string;
}

interface BufferSegment {
    text: string;
    state?: FormatStateSnapshot;
}

// ============================================================================
// AnsiAwareBuffer Class
// ============================================================================

/**
 * ANSI-aware text buffer for formatted output
 *
 * Used to manipulate text with ANSI formatting (colors, styles).
 * Provides methods to insert, append, color, and transform text segments.
 */
declare class AnsiAwareBuffer {
  /**
   * Create a new buffer
   * @param initial - Initial text or segments
   * @param state - Initial format state
   */
  constructor(initial?: string, state?: FormatStateSnapshot);

  /** Check if buffer is marked as deleted */
  readonly deleted: boolean;

  /** Mark buffer as deleted (for trigger processing) */
  markAsDeleted(): this;

  /** Create a copy of this buffer */
  clone(): AnsiAwareBuffer;

  /** Get raw text content without formatting */
  get text(): string;

  /** Get formatted text with ANSI codes */
  toString(): string;

  /**
   * Prepend text to the buffer
   * @param text - Text to add at the start
   * @param state - Format to apply
   */
  prepend(text: string, state?: FormatStateSnapshot): this;

  /**
   * Append text to the buffer
   * @param text - Text to add at the end
   * @param state - Format to apply
   */
  append(text: string, state?: FormatStateSnapshot): this;

  /**
   * Insert text at a specific position
   * @param text - Text to insert
   * @param charIndex - Position to insert at
   * @param state - Format to apply
   */
  insert(text: string, charIndex: number, state?: FormatStateSnapshot): this;

  /**
   * Apply color/formatting to a text range
   * @param range - [start, end] character indices
   * @param state - Format to apply
   */
  color(range: [number, number], state: FormatStateSnapshot): this;

  /**
   * Remove text in a range
   * @param range - [start, end] character indices
   */
  delete(range: [number, number]): this;

  /**
   * Replace text in a range
   * @param range - [start, end] character indices
   * @param replacement - New text
   * @param state - Format to apply
   */
  replace(range: [number, number], replacement: string, state?: FormatStateSnapshot): this;
}

// ============================================================================
// Plugin API Interfaces
// ============================================================================

/**
 * Valid event names from ClientEvents
 */
type EventKey = keyof ClientEvents;

/**
 * Event parameters for a given event key
 */
type EventParams<K extends EventKey> = [ClientEvents[K]] extends [void]
  ? []
  : [ClientEvents[K]] extends [any[]]
    ? ClientEvents[K]
    : [ClientEvents[K]];

/**
 * Event listener function type for a given event key
 */
type EventListener<K extends EventKey> = (...args: EventParams<K>) => void;

/**
 * Alias definition for command aliases
 */
interface PluginAlias {
  id: string;
  pattern: RegExp;
  callback: (matches?: RegExpMatchArray) => boolean;
}

/**
 * Triggers API - Manage pattern-based triggers
 */
interface TriggersApi {
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

  /**
   * Wait for the first game line that matches one of the patterns.
   *
   * The temporary triggers are removed as soon as one matches, the timeout
   * passes, or the signal aborts. Lines are not changed or gagged.
   *
   * @param patterns - One pattern, or alternatives; the first to match wins
   * @param options - Timeout in ms (none by default), abort signal, trigger tag
   * @returns Which pattern matched, its match and the line text
   * @throws An Error named `TimeoutError` when the timeout passes, and the
   *         signal's reason (an `AbortError` by default) when it aborts
   *
   * @example
   * ```typescript
   * api.command.send('otworz drzwi');
   * const r = await api.triggers.waitFor(
   *   [/^Otwierasz (.*)\.$/, /^Drzwi sa zamkniete na klucz\./],
   *   { timeout: 15000, signal }
   * );
   * if (r.index === 0) console.log('opened', r.match[1]);
   * ```
   */
  waitFor(patterns: TriggerSubPattern | TriggerSubPattern[], options?: WaitForOptions): Promise<WaitForResult>;
}

/** Options for {@link TriggersApi.waitFor} */
interface WaitForOptions {
  /** Give up after this many milliseconds */
  timeout?: number;
  /** Abort the wait (e.g. when the user presses Stop) */
  signal?: AbortSignal;
  /**
   * Tag for the temporary triggers. Note that removeByTag only removes them;
   * use `signal` to cancel the wait itself.
   */
  tag?: string;
}

/** Result of {@link TriggersApi.waitFor} */
interface WaitForResult {
  /** Index of the pattern that matched */
  index: number;
  /** The match (capture groups for regex patterns) */
  match: RegExpMatchArray;
  /** Plain text of the matched line */
  line: string;
}

/**
 * A plugin's own key-value store. Values are JSON and stay in this browser,
 * namespaced by plugin id. Keep it small (settings, lists); use IndexedDB for
 * large or growing data.
 */
interface PluginKeyValueStore {
  /** Read a value, or `defaultValue` when there is none */
  get<T>(key: string, defaultValue: T): T;
  get<T = unknown>(key: string): T | undefined;
  /** Store a JSON-serialisable value */
  set<T>(key: string, value: T): void;
  /** Remove a value */
  remove(key: string): void;
  /** All keys this plugin has stored here */
  keys(): string[];
  /**
   * Listen for changes to one key, including the character switching
   * (for the character store).
   * @returns Function that removes the listener
   */
  onChange<T = unknown>(key: string, listener: (value: T | undefined) => void): () => void;
}

/** Plugin storage, see {@link PluginKeyValueStore} */
interface StorageApi {
  /** Values kept per character; reads follow the active character */
  character: PluginKeyValueStore;
  /** Values shared by all characters in this browser */
  global: PluginKeyValueStore;
}

/** The active character */
interface CharacterApi {
  /** Name of the active character, or null before one has logged in */
  getName(): string | null;
  /**
   * Listen for the active character changing
   * @returns Function that removes the listener
   */
  onChange(listener: (name: string | null) => void): () => void;
}

/**
 * Aliases API - Manage command aliases
 */
interface AliasesApi {
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
interface EventsApi {
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
   * // Emit an in-app notification (a toast; see also api.notifications)
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
interface LocationHighlighterOptions {
  /** Highlight color (CSS color string). Defaults to "yellow" */
  color?: string;
  /** Whether the highlighter starts enabled. Defaults to true */
  enabled?: boolean;
}

/**
 * A location highlighter that can highlight rooms on the map.
 * Multiple highlighters can be active simultaneously with different colors.
 */
interface LocationHighlighter {
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
 * Drawing layer for map overlay shapes. "room" draws among the rooms,
 * "overlay" above them (default), "top" above everything including the
 * player marker.
 */
type MapOverlayLayer = "room" | "overlay" | "top";

/**
 * Fill/stroke of a map overlay shape. Sizes are in map units (one grid step
 * is 1) unless the shape sets `noScale`.
 */
interface MapOverlayPaint {
  /** Fill color (CSS color string) */
  fill?: string;
  /** Stroke color (CSS color string) */
  stroke?: string;
  /** Stroke width in map units */
  strokeWidth?: number;
  /** Dash pattern, e.g. [0.2, 0.1] */
  dash?: number[];
  /** Opacity 0..1 */
  alpha?: number;
}

/**
 * A shape drawn by a map overlay, in map coordinates.
 */
type MapOverlayShape = (
  | { type: "circle"; cx: number; cy: number; radius: number; paint: MapOverlayPaint }
  | { type: "rect"; x: number; y: number; width: number; height: number; cornerRadius?: number; paint: MapOverlayPaint }
  | {
      type: "line";
      /** Flat list of [x0, y0, x1, y1, ...] */
      points: number[];
      paint: MapOverlayPaint;
      lineCap?: "butt" | "round" | "square";
      lineJoin?: "miter" | "round" | "bevel";
    }
  | {
      type: "polygon";
      /** Flat list of [x0, y0, x1, y1, ...] */
      vertices: number[];
      paint: MapOverlayPaint;
    }
  | {
      type: "text";
      x: number;
      y: number;
      text: string;
      fontSize: number;
      fontFamily?: string;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      align?: "left" | "center" | "right";
      verticalAlign?: "top" | "middle" | "bottom";
    }
) & {
  /** Drawing layer, defaults to "overlay" */
  layer?: MapOverlayLayer;
  /** Keep a fixed on-screen size regardless of zoom */
  noScale?: boolean;
};

/**
 * What a map overlay sees when it renders.
 */
interface MapOverlayRenderState {
  /** Room the player marker is on, if any */
  currentRoomId?: number;
  /** Area currently displayed on the map */
  areaId?: number;
  /** Z-level currently displayed on the map */
  z?: number;
  /**
   * The map renderer's live settings (user map appearance: `lineWidth`,
   * `roomSize`, `lineColor`, `roomShape`, ...). Sizes are in map units - use
   * them so the overlay matches the map. Read-only.
   */
  settings: Readonly<MapRenderer.Settings>;
  /** Look up a room of the loaded map */
  getRoom(roomId: number): MapData.Room | undefined;
}

/**
 * Definition of a custom map overlay, see {@link MapApi.addOverlay}.
 */
interface MapOverlayDefinition {
  /**
   * Return the shapes to draw (or nothing). Shapes of rooms outside the
   * displayed area/z-level are the overlay's own responsibility to skip.
   */
  render(state: MapOverlayRenderState): MapOverlayShape | MapOverlayShape[] | void;
}

/**
 * Handle returned by {@link MapApi.addOverlay}.
 */
interface MapOverlayHandle {
  /** Overlay id as passed to addOverlay */
  readonly id: string;
  /** Request a redraw, e.g. after the overlay's own data changed */
  invalidate(): void;
  /** Remove the overlay from the map */
  remove(): void;
}

/**
 * Area information exposed via Map API
 */
interface AreaInfo {
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
interface MapApi {
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

  /**
   * Draw custom shapes on the map. The overlay's `render` is called whenever
   * the map redraws, when the player moves or the displayed area changes, and
   * whenever you call `handle.invalidate()`. Coordinates are map (room)
   * coordinates - read them from `state.getRoom(id)`; one grid step is 1.
   *
   * Registering again with the same id replaces the previous overlay. Overlays
   * are removed automatically when the plugin unloads.
   *
   * @param id - Overlay id, unique within this plugin
   * @param overlay - Overlay definition with a `render` function
   * @returns Handle to redraw or remove the overlay
   *
   * @example
   * // Ring around every room next to the player
   * const radar = api.map.addOverlay("radar", {
   *   render(state) {
   *     const room = state.currentRoomId !== undefined ? state.getRoom(state.currentRoomId) : undefined;
   *     if (!room) return;
   *     return Object.values(room.exits).map((id) => state.getRoom(id)).filter(Boolean).map((next) => ({
   *       type: "circle", cx: next!.x, cy: next!.y, radius: 0.6,
   *       paint: { stroke: "#00ff00", strokeWidth: 0.1 },
   *     }));
   *   },
   * });
   * radar.invalidate(); // redraw after your own data changed
   * radar.remove();
   */
  addOverlay(id: string, overlay: MapOverlayDefinition): MapOverlayHandle;

  /**
   * Apply live edits to the loaded map for the current session.
   *
   * Rooms returned by {@link getRoom} / {@link getRoomById} are live references,
   * so a plugin can already mutate their fields — but the renderer caches area
   * geometry and the pathfinder caches exits, so a raw mutation either does not
   * show up or leaves pathfinding stale. This applies the change *and* performs
   * the rebuild/redraw the internal map scripts do (see `labyrinth.ts`,
   * `tideSystem.ts`), which is the part a plugin cannot reach on its own.
   *
   * Changes live in memory only: they are lost when the map data reloads.
   *
   * @param changes - Room patches to apply. Each entry names a room and the
   *   fields to overwrite; `userData` is merged key-by-key, with `null` values
   *   deleting a key. Unknown room IDs are skipped.
   * @param options - Control how much gets rebuilt. Defaults are safe but do
   *   more work than a cosmetic change needs.
   * @returns Number of rooms actually changed.
   *
   * @example
   * // Rename a room and redraw
   * api.map.applyChanges([{ roomId: 3554, name: "Kowal, Daevon" }]);
   *
   * @example
   * // Cosmetic-only change: skip the pathfinder rebuild
   * api.map.applyChanges(
   *   [{ roomId: 3554, roomChar: "K" }],
   *   { rebuildPaths: false }
   * );
   *
   * @example
   * // Structural change — exits need both rebuilds (the default)
   * api.map.applyChanges([{ roomId: 100, exits: { north: 101 } }]);
   *
   * @example
   * // Moving a room; coordinates need the area geometry rebuild
   * api.map.applyChanges([{ roomId: 100, x: 12, y: -3, z: 0 }]);
   */
  applyChanges(changes: RoomChange[], options?: ApplyChangesOptions): number;

  /**
   * Replace whole areas of the loaded map for the current session.
   *
   * The complete counterpart to {@link applyChanges}: an area carries its rooms
   * *and* its labels, and the renderer caches geometry per area, so swapping one
   * covers every kind of edit — moved rooms, added or deleted rooms, custom
   * lines, labels — without the caller having to describe what changed.
   *
   * Pass areas in the same shape as the published map export
   * (`{ areaId, areaName, rooms, labels }`) with coordinates in source
   * orientation; y is flipped for you, exactly as when the map first loads.
   * Areas the map does not already contain are skipped, since adding one needs a
   * full reload. Leave `labels` out to keep the area's current labels - handy
   * when adding rooms to an area read through {@link getAreas}, which returns
   * rooms only (with y already flipped: negate it back before passing them in).
   *
   * Changes live in memory only: they are lost when the map data reloads.
   *
   * @returns Number of areas replaced.
   *
   * @example
   * const replaced = api.map.syncAreas([{ areaId: 12, areaName: "Rinde", rooms, labels }]);
   */
  syncAreas(areas: MapAreaData[]): number;

  /**
   * Replace the whole loaded map for the current session.
   *
   * The heaviest of the three live-edit entry points, and the only one that can
   * change the *set* of areas — {@link syncAreas} can replace an area's contents
   * but not add one, because the renderer builds its area wrappers at load time.
   * Everything is rebuilt: reader, pathfinder, hashes, area index.
   *
   * Takes the same shape the map is published in (an array of areas, as in
   * `mapExport.json`) with coordinates in source orientation. The player's
   * position is kept when the new map still contains that room, and the current
   * colour palette is reused unless you pass a new one.
   *
   * In-memory only: the next map data refresh replaces this again.
   *
   * @returns false when the payload contained no areas; nothing changed.
   *
   * @example
   * api.map.replaceMap(mapData, colors);
   */
  replaceMap(mapData: MapData.Map, colors?: MapData.Env[]): boolean;

  /**
   * Room id for a room's `internal_id` (its user data), the id that stays the
   * same across map versions and the Mudlet mapper. Null when no room has it.
   *
   * @example
   * ```typescript
   * const roomId = api.map.getRoomIdByInternalId("i385831173");
   * ```
   */
  getRoomIdByInternalId(internalId: string): number | null;

  /**
   * Walking distance in steps from one room to each of several others, in one
   * search (the same weights as findPath). Unreachable rooms map to null.
   *
   * @example
   * ```typescript
   * const here = api.map.getRoom()?.id;
   * const steps = api.map.getRoomDistances(here, foundRooms);
   * ```
   */
  getRoomDistances(fromId: number, toIds: number[]): Map<number, number | null>;

  /**
   * Lead the player to a room, as the map's "Prowadź" does: the route is drawn
   * on the map and followed by the direction keys.
   */
  leadTo(roomId: number): void;

  /** Stop leading (clears the drawn route) */
  clearLeadTo(): void;

  /**
   * Add an entry to the room menu (right click on the map or on a room link),
   * under "Pluginy". The action gets the room the menu was opened for.
   * Removed when the plugin unloads.
   *
   * @example
   * ```typescript
   * api.map.addRoomMenuEntry("Jubiler: oznacz sklep", (roomId) => markShop(roomId));
   * ```
   */
  addRoomMenuEntry(label: string, action: (roomId: number) => void): RoomMenuEntryHandle;
}

/** Handle for a room menu entry, see {@link MapApi.addRoomMenuEntry} */
interface RoomMenuEntryHandle {
  setLabel(label: string): void;
  setAction(action: (roomId: number) => void): void;
  remove(): void;
}

/** A key combination for {@link KeysApi.register} */
interface PluginKeyBind {
  /**
   * The key: a letter or digit ("h", "4"), or a KeyboardEvent.code for other
   * keys ("F6", "Backquote", "Numpad5"). Letters and digits match the physical
   * key, so Alt+J also works on layouts where Alt changes the character.
   */
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
}

/** A key action for {@link KeysApi.register} */
interface PluginKeyActionOptions {
  /**
   * Stable id; the player's key is stored under it, so keep it the same across
   * versions. Prefix it with the plugin's name: "jubiler.appraise".
   */
  id: string;
  /** What the action does, as shown in Klawisze: "Wyceń kamienie" */
  label: string;
  /** The key suggested until the player picks one; leave out for no key */
  defaultKey?: PluginKeyBind;
  /** Runs when the action's key is pressed; the key's default action is prevented */
  onPress: (event: KeyboardEvent) => void;
}

/** Handle for a registered key action, see {@link KeysApi.register} */
interface PluginKeyHandle {
  /** The key the action listens on now (the player's choice or the default), or null */
  getKey(): PluginKeyBind | null;
  remove(): void;
}

/**
 * Keys API - plugin key actions, listed and rebindable in Klawisze
 */
interface KeysApi {
  /**
   * Register an action the player can trigger with a key. It is listed in
   * Klawisze under "Pluginy", where the player can move it to another key or
   * switch it off; that choice is stored in their keymap. Until then the
   * action listens on `defaultKey`. Removed when the plugin unloads.
   *
   * @returns null when another plugin already registered this id
   *
   * @example
   * ```typescript
   * api.keys.register({
   *   id: 'jubiler.appraise',
   *   label: 'Wyceń kamienie',
   *   defaultKey: { key: 'j', alt: true },
   *   onPress: () => appraise(),
   * });
   * ```
   */
  register(action: PluginKeyActionOptions): PluginKeyHandle | null;
}

/**
 * SQLite API - read a SQLite file the player picks, such as a Mudlet database
 * (Database_<nazwa>.db in the Mudlet profile folder), to import its data.
 */
interface SqliteApi {
  /**
   * Run named queries against a SQLite file. The file is opened in memory, so
   * nothing a query does reaches it.
   *
   * @param file - The file (e.g. from an `<input type="file">`) or its bytes
   * @param queries - SQL by a name of your choice
   * @returns The rows of each query under its name, every row an object keyed by column
   * @throws When the file is not a SQLite database or a query fails
   *
   * @example
   * ```typescript
   * const { notes } = await api.sqlite.read(file, {
   *   notes: 'SELECT character, room, text FROM notes',
   * });
   * for (const row of notes) console.log(row.character, row.room, row.text);
   * ```
   */
  read(file: Blob | ArrayBuffer, queries: Record<string, string>): Promise<Record<string, Record<string, unknown>[]>>;
}

/**
 * Output API - Print to game window
 */
interface OutputApi {
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
type PopupContent = string | Node | React.ReactNode;

/**
 * Handle returned when creating a popup window
 */
interface PopupHandle {
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
type PopupSize = number | string;

/**
 * Starting size of a popup. Leave a field out to get the default
 * (half the game window width, 40% of its height).
 */
interface PopupSizeOptions {
  initialWidth?: PopupSize;
  initialHeight?: PopupSize;
}

/**
 * Configuration for creating a persistent popup
 */
interface PersistentPopupConfig extends PopupSizeOptions {
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
interface PersistentPopupHandle extends PopupHandle {
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
interface PopupMenuEntryHandle {
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
interface ContextMenuEntryHandle {
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
interface FooterComponentHandle {
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

/** Options for {@link UiApi.registerWidget}. */
interface WidgetOptions {
  /** Name in the "Dodaj widżet" list and the widget's right-click menu; defaults to the plugin's name. */
  label?: string;
  /** Corner of the game output a newly added copy lands in: top/bottom + left/right. Defaults to 'tr'. */
  corner?: 'tl' | 'tr' | 'bl' | 'br';
}

/** Handle for a widget registered with {@link UiApi.registerWidget}. */
interface WidgetHandle {
  /**
   * The widget's DOM element. Every placed copy shows this one element (only
   * one copy of a plugin widget is drawn at a time).
   */
  readonly element: HTMLDivElement;

  /** Replace the content: HTML string, DOM node, or React element. */
  setContent(content: string | Node | ReactElement): void;

  /** Withdraw the widget. Where the player placed it is kept for next time. */
  remove(): void;
}

/**
 * A field in a plugin popup's settings cog (⚙ in the window header), shown
 * under the shared font settings. The value is kept in the window's settings
 * and read back with {@link PersistentPopupHandle.getSetting}.
 */
type PluginWindowSettingField =
  | { type: 'toggle'; key: string; label: string; default: boolean; /** The stored flag is the opposite of the label */ inverted?: boolean }
  | { type: 'select'; key: string; label: string; default: string; options: { value: string; label: string }[] }
  | { type: 'number'; key: string; label: string; default: number; min?: number; max?: number; step?: number };

/**
 * The host's React, as handed to plugins on `api.ui.react`.
 * Use it (or a bundler mapping of `react` to it) instead of bundling React.
 */
type PluginReact = typeof import('react');

/** @experimental Props may change between client versions. */
interface PluginButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** solid = the one main action; secondary = default; ghost = quiet; danger = destructive */
  variant?: 'solid' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}

/** @experimental Props may change between client versions. */
interface PluginHeaderButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** A toggle that is on */
  active?: boolean;
  /** Destructive, or arming one (a second click confirms) */
  danger?: boolean;
}

/** @experimental Props may change between client versions. */
interface PluginSegmentedProps<T extends string = string> {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (value: T) => void;
  name?: string;
  /** sm = window header size */
  size?: 'sm' | 'md';
}

/** @experimental Props may change between client versions. */
interface PluginFieldProps {
  label?: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** @experimental Props may change between client versions. */
interface PluginCheckProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  type?: 'checkbox' | 'radio';
}

/** @experimental Props may change between client versions. */
interface PluginInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Monospace with typing aids off - for patterns and commands */
  mono?: boolean;
}

/** @experimental Props may change between client versions. */
interface PluginNoticeProps {
  variant?: 'success' | 'warning' | 'danger';
  onClose?: () => void;
  className?: string;
  children: React.ReactNode;
}

/** @experimental Props may change between client versions. */
interface PluginMenuButtonProps {
  label: React.ReactNode;
  items: { label: React.ReactNode; hint?: React.ReactNode; onSelect: () => void; disabled?: boolean }[];
  size?: 'sm' | 'md';
  title?: string;
  /** Makes it a split button: the label runs this, the chevron opens the list */
  onClick?: () => void;
  menuWidth?: number;
  disabled?: boolean;
}

/**
 * The client's own UI components, styled like its built-in windows in every theme.
 *
 * @experimental This set and its props may change between client versions.
 * Only components rendered inside a plugin popup or footer are supported.
 */
interface PluginUiComponents {
  Button: React.ComponentType<PluginButtonProps>;
  HeaderButton: React.ComponentType<PluginHeaderButtonProps>;
  Segmented: <T extends string>(props: PluginSegmentedProps<T>) => React.ReactElement;
  Select: React.ComponentType<React.SelectHTMLAttributes<HTMLSelectElement>>;
  Input: React.ComponentType<PluginInputProps>;
  Field: React.ComponentType<PluginFieldProps>;
  Check: React.ComponentType<PluginCheckProps>;
  MenuButton: React.ComponentType<PluginMenuButtonProps>;
  Notice: React.ComponentType<PluginNoticeProps>;
}

/**
 * UI helpers for plugins
 */
interface UiApi {
  /**
   * The host's React. Build popup content with it so hooks work: a plugin
   * that bundles its own React gets a second copy, and hooks then fail.
   * Throws when no UI host is running.
   *
   * @example
   * ```typescript
   * const { createElement: h, useState } = api.ui.react;
   * function Counter() {
   *   const [n, setN] = useState(0);
   *   return h(api.ui.components.Button, { onClick: () => setN(n + 1) }, `Klik ${n}`);
   * }
   * await api.ui.registerPersistentPopup({ id: 'counter', title: 'Licznik', createContent: () => h(Counter) });
   * ```
   */
  readonly react: PluginReact;

  /**
   * The client's own UI components (Button, HeaderButton, Segmented, …).
   * Throws when no UI host is running.
   *
   * @experimental This set and its props may change between client versions.
   */
  readonly components: PluginUiComponents;

  /**
   * Create a draggable popup window.
   *
   * @deprecated Use {@link registerPersistentPopup} instead for popups that need
   * docking and persistence across page reloads. This method generates popup IDs
   * from title hashes, which are not stable and prevent proper state restoration.
   *
   * @param title - Popup title text
   * @param body - Popup body content (string or DOM node)
   * @param options - Starting size of the popup
   * @returns Promise that resolves with handle for controlling the popup once mounted
   */
  createPopup(title: string, body: PopupContent, options?: PopupSizeOptions): Promise<PopupHandle>;

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
   * Add an entry to the main (☰) menu
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
   * The content is drawn as it is, with no frame around it. To look like the
   * built-in chips, use their classes:
   * `<span class="chip"><span class="chip__ico">…</span><span class="chip__text">`
   * `<span class="chip__lab">Label</span><span class="chip__val">value</span></span></span>`
   * (add `chip--warn` / `chip--danger` for urgency).
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

  /**
   * Offer a widget: a small frameless piece the player can lay over the game
   * output wherever they like (Menu → Widżety → Dodaj, or `/widzety`). The
   * plugin only provides the content; placing, moving, sizing and removing it
   * is the player's, and where they put it is remembered, so it comes back there
   * whenever the plugin loads. Widgets are withdrawn with the plugin.
   *
   * The content is drawn on a soft see-through plate; keep it small. A widget
   * whose element is empty is hidden until it has something to show.
   *
   * @example
   * ```typescript
   * const widget = api.ui.registerWidget('licznik', '<b>0</b> zabitych', { label: 'Licznik zabitych', corner: 'tl' });
   * let kills = 0;
   * api.on('allEnemiesKilled', () => widget.setContent(`<b>${++kills}</b> zabitych`));
   * ```
   */
  registerWidget(id: string, content: string | Node | ReactElement, options?: WidgetOptions): WidgetHandle;

  /**
   * Add a button beside the command line, alongside the player's own
   * (Ustawienia -> Stopka). The button sends `command` when clicked; give it a
   * `state` name and it lights up whenever {@link UiApi.setFooterButtonState}
   * turns that state on. Plugin buttons are drawn dashed, and only the plugin
   * adds or removes them.
   *
   * @example
   * ```typescript
   * api.ui.registerFooterButton('podroz', {
   *   label: 'Tryb: podroz',
   *   command: 'tryb podroz',
   *   tone: 'accent',
   *   state: 'podroz',
   * });
   * api.ui.setFooterButtonState('podroz', true);
   * ```
   */
  registerFooterButton(id: string, button: FooterButtonOptions): FooterButtonHandle;

  /**
   * Turn a footer button's state on or off. Any button - the plugin's or the
   * player's own - whose state carries this name draws itself as on.
   */
  setFooterButtonState(name: string, on: boolean): void;

  /**
   * Give an element a hover card in the client's own tooltip, the one the
   * built-in footer chips, herbs and books use, instead of a browser `title`.
   * Shown above the element once the mouse rests on it for about half a second,
   * like a `title`; clicking the element leaves it up. Pass a string for one line, or a card with a header,
   * label/value rows and click / hold hints.
   *
   * The card is redrawn at once when you call `update()` while it is shown, so
   * a ticking value can follow along. Tooltips are removed with the plugin.
   *
   * @example
   * ```typescript
   * const chip = api.ui.registerFooterComponent('timer', '<span class="chip">…</span>');
   * const tip = api.ui.setTooltip(chip.element, {
   *   header: 'Mój licznik',
   *   rows: [{ label: 'Pozostało', content: '0:42' }],
   *   click: 'zresetuj licznik',
   * });
   * tip.update({ header: 'Mój licznik', rows: [{ label: 'Pozostało', content: '0:41' }] });
   * ```
   */
  setTooltip(element: Element, tooltip: string | PluginTooltip | null): PluginTooltipHandle;

  /**
   * Make a scrolling list behave like the game output and the built-in chat
   * window: it stays pinned to the bottom as lines arrive, and once the player
   * scrolls up to read, the newest lines stay in sight in a pane at the bottom
   * (the split view) with a handle to resize it.
   *
   * Give it the element that scrolls (`overflow-y: auto`, no bottom padding)
   * and add, remove or replace its children as you like - every change re-pins
   * it. Children are cloned into the pane, which drops their event listeners;
   * pass `renderSplit` when the lines need live handlers. Removed with the plugin.
   *
   * @example
   * ```typescript
   * const list = document.createElement('div');
   * list.style.cssText = 'height: 100%; overflow-y: auto';
   * const scrollback = api.ui.attachScrollback(list, {
   *   splitHeight: popup.getSetting('splitHeight', 120),
   *   onSplitResize: (height) => popup.setSetting('splitHeight', height),
   * });
   * list.append(lineElement); // pinned, or mirrored into the pane
   * ```
   */
  attachScrollback(element: HTMLElement, options?: PluginScrollbackOptions): PluginScrollbackHandle;
}

/** Options for {@link UiApi.attachScrollback}. */
interface PluginScrollbackOptions {
  /** Newest lines mirrored into the split pane (default 40). */
  splitLines?: number;
  /** Starting pane height in px (default 120). */
  splitHeight?: number;
  /** Called with the pane height once the player finishes dragging its handle - store it to keep the size. */
  onSplitResize?: (heightPx: number) => void;
  /**
   * Builds the pane's lines, newest last, at most `lines` of them. Without it
   * the last children are cloned, so their event listeners are not carried over.
   */
  renderSplit?: (lines: number) => Node[];
  /** Called when the split view opens (true) or closes (false). */
  onSplitViewChange?: (open: boolean) => void;
  /** How close to the bottom, in px, still counts as "at the bottom" (default 50). */
  bottomThreshold?: number;
}

/** Handle for a scrollback made with {@link UiApi.attachScrollback}. */
interface PluginScrollbackHandle {
  /** Whether the player is scrolled up and the split pane is showing. */
  isSplitView(): boolean;
  /** Re-pin and redraw the pane after changing a line in place (the children stayed the same). */
  refresh(): void;
  /** Resize the split pane. */
  setSplitHeight(heightPx: number): void;
  /** Close the split view and jump to the newest line. */
  scrollToBottom(): void;
  /** Stop managing the element. Its content stays. */
  remove(): void;
}

/** A hover card for {@link UiApi.setTooltip}. */
interface PluginTooltip {
  /** Bold first line. */
  header?: string;
  /**
   * Rows of the card: a grey label beside its content (text, or a DOM node for
   * colour or icons), or a bare DOM node laid out full width (a bar, a chart).
   */
  rows?: Array<{ label: string; content: string | Node } | Node>;
  /** What a click does, dimmed at the foot after "kliknij". */
  click?: string;
  /** What a long press does, after "przytrzymaj". */
  hold?: string;
}

/** Handle for a tooltip set with {@link UiApi.setTooltip}. */
interface PluginTooltipHandle {
  /** Replace the card; null leaves the element without one. */
  update(tooltip: string | PluginTooltip | null): void;
  /** Take the tooltip off the element. */
  remove(): void;
}

/** What a plugin's footer button is. */
interface FooterButtonOptions {
  label: string;
  /** Sent on click: a command, an alias, anything the command line accepts. */
  command: string;
  tone?: FooterButtonTone;
  /** Name of the state that lights this button up, if it stands for a mode. */
  state?: string;
  /** Where it sits among the buttons; higher is further right. Default 1000. */
  order?: number;
}

interface FooterButtonHandle {
  /** Replace what the button says or does. */
  update(button: Partial<FooterButtonOptions>): void;
  remove(): void;
}

/**
 * Colors API - Create and manage colors
 */
interface ColorsApi {
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
interface BindApi {
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
   * Get the command currently set on the function bind
   * Returns null when nothing is bound (or the bind was set with a callback only).
   * Lets a plugin skip re-setting (and re-printing) a bind that is already in place.
   *
   * @returns The bound command, or null
   *
   * @example
   * ```typescript
   * if (api.bind.get() !== "otul sie plaszczem") {
   *   api.bind.set("otul sie plaszczem");
   * }
   * ```
   */
  get(): string | null;

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
 * Options for api.multibinds.addTemporary()
 */
interface TemporaryMultibindOptions {
  /** Command sent when the multibind key is pressed (or the bar entry clicked) */
  action: string;
  /** Optional name shown on the bar instead of the action */
  label?: string;
  /** Only show the bind when the current room id equals this. Omit to show it in every room. */
  roomId?: number;
  /** Highlight the bar entry (visible border) */
  highlight?: boolean;
}

/**
 * Fields that can be changed on a temporary multibind
 */
interface TemporaryMultibindUpdateOptions {
  action?: string;
  label?: string;
  highlight?: boolean;
}

/**
 * Handle returned by api.multibinds.addTemporary()
 */
interface TemporaryMultibindHandle {
  /** Change the action, label and/or highlight; the bar refreshes */
  update(patch: TemporaryMultibindUpdateOptions): void;
  /** Remove the bind; the bar refreshes. Safe to call more than once. */
  remove(): void;
}

/**
 * Multibinds API - put temporary commands on the multibind bar (ALT+1..4 by default; players can add slots)
 */
interface MultibindsApi {
  /**
   * Add a temporary multibind.
   *
   * Temporary binds live in memory only - they are never saved, never synced and
   * never change the per-room binds created with `/mbind`. They are removed
   * automatically when the plugin is unloaded.
   *
   * Slots are assigned on every bar refresh, in the order the binds were added:
   * - a saved bind in the current room with the same action is reused (and gets
   *   the highlight) instead of taking a new slot; the same goes for an earlier
   *   temporary bind with the same action,
   * - otherwise the lowest free slot of the player's slots (1..4 by default) is taken; when all slots are used the
   *   bind is not shown and its key does nothing.
   *
   * @example
   * ```typescript
   * const handle = api.multibinds.addTemporary({
   *   action: "otworz skrzynie",
   *   label: "Skrzynia",
   *   roomId: 12345,
   *   highlight: true,
   * });
   * handle.update({ action: "wez wszystko ze skrzyni", label: "Lup" });
   * handle.remove();
   * ```
   */
  addTemporary(opts: TemporaryMultibindOptions): TemporaryMultibindHandle;
}

/**
 * Team API - Access team information
 */
interface TeamApi {
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
interface GmcpApi {
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
interface AttackQueueApi {
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
interface LocationObject {
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
interface ObjectsApi {
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
interface CommandApi {
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
interface CommandHooksApi {
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
interface GroupDefinition {
  /** Group name */
  name: string;
  /** Filter function to check if item belongs to this group */
  filter: (item: string) => boolean;
}

/**
 * Transform definition for styling container items
 */
interface TransformDefinition {
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
interface HerbBagState {
  /** Map of herb ID to count */
  herbs: Record<string, number>;
  /** Bag condition (1-5, where 5 is best) */
  condition?: number;
}

/**
 * All herb bags state - map of bag number to bag state
 */
type HerbBagsState = Record<number, HerbBagState>;

/**
 * Options for moving herbs between bags
 */
interface HerbMoveOptions {
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
interface HerbForms {
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
interface HerbUse {
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
interface HerbsData {
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
interface PrettyContainersApi {
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
 * Grammatical case of a magic item form; `mnoga_` prefixes the plural.
 */
type MagicCase =
  | 'mianownik'
  | 'dopelniacz'
  | 'celownik'
  | 'biernik'
  | 'narzednik'
  | 'miejscownik'
  | 'mnoga_mianownik'
  | 'mnoga_dopelniacz'
  | 'mnoga_celownik'
  | 'mnoga_biernik'
  | 'mnoga_narzednik'
  | 'mnoga_miejscownik';

/**
 * Forms of one item per case. A case holds a list because variants of the same
 * item share it - "otwarta"/"zamknieta" containers and alternate phrasings.
 */
type MagicForms = Partial<Record<MagicCase, string[]>>;

/**
 * Single magic item entry
 */
interface MagicEntry {
  type: string[];
  /** Declined forms grouped by case (magics data v3). */
  odmiana?: MagicForms;
  /** Forms that fit no case - irregular phrases and typos kept for matching. */
  dodatkowe_regexps?: string[];
  /** Every form in one flat list (magics data v2, still read from a stale cache). */
  regexps?: string[];
}

/**
 * Raw magics data structure
 */
interface MagicsFile {
  version?: number;
  magics: Record<string, MagicEntry>;
}

/**
 * Magics API - Access magic item patterns
 */
interface MagicsApi {
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
   *     const biernik = magic.odmiana?.biernik?.[0];
   *     console.log(`${name}: types=${magic.type.join(',')}, biernik=${biernik}`);
   *   }
   * }
   * ```
   */
  getRawData(): Promise<MagicsFile | undefined>;
}

/**
 * Raw magic keys data structure
 */
interface MagicKeysData {
  magic_keys: string[];
}

/**
 * Magic Keys API - Access magic key patterns
 */
interface MagicKeysApi {
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
 * - any type registered with api.containers.registerType()
 */
type ContainerType = "money" | "gems" | "food" | "other" | (string & {});

/**
 * Options for a plugin-defined container type
 */
interface ContainerTypeOptions {
  /** Name shown in /pojemnik and /pojemniki (defaults to the type id) */
  label?: string;
  /**
   * Type whose bag is used until the player picks one for this type in /pojemnik
   * (default "other"). May be another registered type.
   */
  fallback?: ContainerType;
}

/**
 * Grammatical forms for a container bag name
 */
interface ContainerForms {
  /** Nominative form (mianownik) - e.g., "plecak", "torba" */
  mianownik: string;
  /** Genitive form (dopelniacz) - e.g., "plecaka", "torby" */
  dopelniacz: string;
  /** Accusative form (biernik) - e.g., "plecak", "torbe" */
  biernik: string;
  /**
   * Worn on the back or at the belt - address it as `zalozonego ${dopelniacz}`
   * (`zalozonej` for a feminine bag), numbered among the worn ones when several are.
   */
  worn?: boolean;
  /**
   * Which of several same-named bags, when the player carries more than one -
   * address it as `${index}. swojej ${dopelniacz}`. Absent means the first one.
   */
  index?: number;
}

/**
 * Containers API - Put items into and take items from assigned bags
 */
interface ContainersApi {
  /**
   * Register a plugin container type. It shows up in /pojemnik and /pojemniki next to the
   * built-in ones and uses its fallback type's bag until the player assigns one to it.
   * The player's choice is stored per character. The type is unregistered with the plugin.
   *
   * Pick an id unlikely to clash with other plugins (e.g. prefixed with the plugin name).
   *
   * @param type - Type id, used with getContainer / put / take / inspect
   * @param options - Label and fallback type
   *
   * @example
   * ```typescript
   * // Gems for gem sockets - the "gems" bag unless the player sets another one
   * api.containers.registerType("mc-gem-sockets", { label: "kamienie do gniazd", fallback: "gems" });
   * await api.containers.inspect("mc-gem-sockets", { silent: true });
   * ```
   */
  registerType(type: string, options?: ContainerTypeOptions): void;

  /**
   * Get the assigned bag name for a container type
   *
   * @param type - Container type ("money", "gems", "food", "other")
   * @returns The bag name (e.g., "plecak", "torba", or "2. sakiewka" for the second of several)
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

  /**
   * Look into a container bag and get its contents
   * Sends "zajrzyj do <bag>" and resolves with the parsed items of the listing.
   * Every listing (inspected or not) is also announced as the "containers.listed" event.
   *
   * @param type - Container type ("money", "gems", "food", "other")
   * @param options.silent - Hide the command echo and the listing line
   * @param options.timeout - Milliseconds to wait for the listing (default 5000)
   * @returns Items in the bag (empty for an empty bag), or null when no listing
   *   arrived in time (bag not carried, no bag assigned)
   *
   * @example
   * ```typescript
   * const gems = await api.containers.inspect("gems", { silent: true });
   * gems?.forEach(item => console.log(item.count, item.name));
   * ```
   */
  inspect(type: ContainerType, options?: { silent?: boolean; timeout?: number }): Promise<{ name: string; count: string | number }[] | null>;

  /**
   * Bag nouns the client can build commands for ("plecak", "torba", "worek", ...),
   * e.g. to offer them in a dropdown.
   */
  listBags(): string[];

  /**
   * Assign a bag to one of this plugin's types, as the player would with /pojemnik.
   * Pass `"2. torba"` for the second of several same bags, or null to go back to
   * the fallback type's bag. The choice is stored per character.
   * @returns false for a bag the client does not know or a type this plugin did not register
   */
  setContainer(type: string, bag: string | null): boolean;

  /**
   * Ready-to-send forms of the type's bag, with pronoun and ordinal:
   * `{ biernik: "swoj plecak", dopelniacz: "swojego plecaka", from: "ze" }`.
   * Null when the type has no known bag.
   *
   * @example
   * ```typescript
   * const box = api.containers.getCommandForms("jubiler-kamienie");
   * if (box) api.command.send(`wez otwarty woreczek ${box.from} ${box.dopelniacz}`);
   * ```
   */
  getCommandForms(type: ContainerType): ContainerCommandForms | null;
}

/** See {@link ContainersApi.getCommandForms} */
interface ContainerCommandForms {
  /** After otworz / zamknij / ob: "swoj plecak", "2. swoja sakiewke" */
  biernik: string;
  /** After do / z: "swojego plecaka" */
  dopelniacz: string;
  /** Preposition for taking out: "ze" before "swojego", "z" before an ordinal */
  from: 'z' | 'ze';
}

/**
 * Herbs API - Access herb inventory in bags
 */
interface HerbsApi {
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
   * Replace the whole herb bag state, as if `/ziola_buduj` had just counted it.
   * Saved for the character and shown in the "Ziola" window right away; no
   * game commands are sent. Bags missing from `bags` are dropped.
   *
   * @example
   * ```typescript
   * // Keep the counted state as "magazyn" and bring it back later
   * const magazyn = api.herbs.getBags();
   * // ... /ziola_buduj counts another set ...
   * api.herbs.setBags(magazyn);
   * ```
   */
  setBags(bags: HerbBagsState): void;

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

  /**
   * Herb id for a description as the game prints it, in any case form, with or
   * without a count: "zolty jasny kwiat", "dwa zolte jasne kwiaty". Null when it
   * is not a herb.
   *
   * @example
   * ```typescript
   * api.triggers.register(/^Dostajesz (.*) od /, (line, m) => {
   *   api.herbs.resolve(m[1]).then(id => id && received.push(id));
   *   return line;
   * });
   * ```
   */
  resolve(text: string): Promise<string | null>;

  /**
   * The herb's form that follows a count in a command: `form("deliona", 1)` gives
   * the accusative, 2-4 the plural accusative, 5+ the plural genitive. Unknown
   * herbs return the id unchanged.
   *
   * @example
   * ```typescript
   * api.command.send(`wez 5 ${await api.herbs.form("deliona", 5)} z 2. swojego woreczka`);
   * ```
   */
  form(herbId: string, count: number): Promise<string>;

  /**
   * Look into one herb bag and read what is in it. `target` is the rest of the
   * `zajrzyj do` command: "swojego woreczka", "2. swojego woreczka",
   * "swojego zamknietego woreczka". The bag must be at hand, not inside a container.
   * Resolves with null when there is no such bag or no listing within the
   * timeout (5 s by default); rejects with the signal's reason when aborted.
   *
   * @example
   * ```typescript
   * const bag = await api.herbs.inspectBag("swojego zamknietego woreczka");
   * if (bag && bag.total > 40) { ... use another bag ... }
   * ```
   */
  inspectBag(target: string, options?: { timeout?: number; signal?: AbortSignal }): Promise<HerbBagInspection | null>;
}

/** Result of {@link HerbsApi.inspectBag} */
interface HerbBagInspection {
  /** Herbs by id; names that are not known herbs are under their own name */
  herbs: Record<string, number>;
  /** All herbs in the bag ("wiele" counts as the player's herb setting, 25 by default) */
  total: number;
  /** True when the bag holds nothing */
  empty: boolean;
  /** Names in the bag that are not known herbs */
  unknown: string[];
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
interface ObjectListFiltersApi {
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
interface EnemyBindsApi {
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
interface ButtonMacroHandle {
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
interface ButtonMacrosApi {
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
interface TriggerMacrosApi {
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
interface SettingsApi {
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
interface CombatApi {
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

  /**
   * Whether `coveredId` is covered (zaslona) against `attackerId` - attacks from
   * `attackerId` land on the coverer instead. Covers are inferred from game text
   * and GMCP; false when nothing is known.
   *
   * @example
   * ```typescript
   * const me = api.team.getPlayerNum();
   * if (me !== undefined && api.combat.isCoveredFor(targetId, me)) {
   *   // attacking targetId is wasted until the cover is broken
   * }
   * ```
   */
  isCoveredFor(coveredId: number, attackerId: number): boolean;

  /** Everyone `attackerId` currently cannot reach because of a cover */
  getCoveredForAttacker(attackerId: number): number[];
}

/**
 * Location Notes API - Add plugin-contributed notes to locations
 *
 * Plugins can add notes to locations that appear alongside user notes.
 * Plugin notes are read-only for users and displayed with the plugin name.
 */
interface LocationNotesApi {
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
interface AttackControllerApi {
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
 * Walk modes API - walk a step your own way when the player holds a modifier
 * with a direction key.
 *
 * A walk mode rides on the direction keys (numpad by default, or wherever the
 * player moved them). The player picks its modifier in Klawisze, next to the
 * built-in "Przemknij", so Alt+numpad can sneak while Ctrl+numpad runs your
 * mode. It does not change the move mode the ` key cycles.
 */
interface WalkModesApi {
  /**
   * Register a walk mode. `onMove` gets the step: a short direction (`n`, `ne`,
   * `u`) or, for the special-exit key, that exit's command. Send it however you
   * like - `api.command.send` still applies the current ` move mode.
   *
   * The id keys the player's chosen modifier, so keep it stable across
   * versions, and make it yours (`mc.walk`) - built-in ids are refused.
   *
   * @example
   * ```typescript
   * api.walkModes.register('mc.walk', {
   *   label: 'MC: chodzenie',
   *   defaultModifiers: { ctrl: true },
   *   onMove: (direction) => api.command.send(pickExit(direction), true),
   * });
   * ```
   */
  register(id: string, options: WalkModeOptions): WalkModeHandle;
}

interface WalkModeOptions {
  /** Name in Klawisze. */
  label: string;
  /** Modifier used until the player picks one. Without it the mode starts unassigned. */
  defaultModifiers?: { ctrl?: boolean; alt?: boolean; shift?: boolean };
  onMove(direction: string): void;
}

interface WalkModeHandle {
  remove(): void;
}

/**
 * People API - Manage people database entries
 */
interface PeopleApi {
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
  /**
   * Called with the merged people list now (if loaded) and on every change.
   * Returns an unsubscribe function; subscriptions end when the plugin unloads.
   */
  subscribe(listener: (people: PersonListEntry[]) => void): () => void;
  /** Loads the people database if nothing has yet, or refreshes a stale copy. */
  refresh(): Promise<void>;
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
interface PluginApi {
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
  /** Temporary multibinds on the multibind bar */
  multibinds: MultibindsApi;
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
  /** Walk modes - walk a direction key your own way under a player-chosen modifier */
  walkModes: WalkModesApi;
  /** Storage - the plugin's own per-character and global values */
  storage: StorageApi;
  /** The active character */
  character: CharacterApi;
  /** Keys - plugin-owned keyboard shortcuts */
  keys: KeysApi;
  /** Read SQLite files, e.g. to import a Mudlet database */
  sqlite: SqliteApi;
  /** Toasts over the game output */
  notifications: NotificationsApi;
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

/** A button on a toast. */
interface NotificationButton {
  label: string;
  /** Sent like a typed command when clicked. */
  command?: string;
  onClick?: () => void;
  /** Drawn as the main button. */
  primary?: boolean;
  /** Leave the toast up after the click. */
  keepOpen?: boolean;
}

interface NotificationOptions {
  text: string;
  /** Bold first line; `text` then reads as the body under it. */
  title?: string;
  /** Defaults to 'info'. Warnings and errors still show under "do not disturb". */
  level?: 'info' | 'success' | 'warning' | 'error';
  /** Milliseconds on screen (scaled by the player's setting). */
  time?: number;
  /** Stays until closed or dismissed. */
  sticky?: boolean;
  /** A progress bar, e.g. `{ value: 3, max: 10 }`. */
  progress?: { value: number; max: number };
  actions?: NotificationButton[];
  /** Also fire an OS/browser notification (when the user granted permission). */
  system?: boolean;
}

interface NotificationHandle {
  /** Change the toast in place; if the player already closed it, nothing shows. */
  update(patch: Partial<NotificationOptions>): void;
  /** Show it again as a repeat (counts ×2, ×3…) and restart its timer. */
  repeat(patch?: Partial<NotificationOptions>): void;
  dismiss(): void;
}

/**
 * Notifications API - toasts over the game output. The player can mute all
 * plugin toasts in the settings.
 */
interface NotificationsApi {
  /**
   * Show a toast.
   *
   * @example
   * ```typescript
   * api.notifications.show("Zapisano");
   *
   * const task = api.notifications.show({
   *   title: "Liczę zioła",
   *   text: "0 z 12",
   *   sticky: true,
   *   progress: { value: 0, max: 12 },
   *   actions: [{ label: "Przerwij", command: "/stop-ziola" }],
   * });
   * task.update({ text: "5 z 12", progress: { value: 5, max: 12 } });
   * task.dismiss();
   * ```
   */
  show(options: NotificationOptions | string): NotificationHandle;
}

// ============================================================================
// Global API Instance
// ============================================================================

/** Global Plugin API instance available to all plugins */
declare const api: PluginApi;
