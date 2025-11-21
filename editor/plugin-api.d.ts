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
  name: string
  version: string
  author?: string
  description?: string
}

/**
 * Plugin interface that external scripts should implement
 */
interface Plugin {
  init(api: PluginApi): Promise<PluginInfo>

  destroy?(): Promise<void> | void
}

/**
 * Internal representation of a loaded plugin
 */
interface LoadedPlugin {
  url: string
  info?: PluginInfo
  status: PluginStatus
  error?: string
  instance?: Plugin
  apiInstance?: any // PluginApiImpl, but avoiding circular dependency
  scriptElement?: HTMLScriptElement
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
    hyperlink?: FormatHyperlink;
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
  register(
    pattern: TriggerPattern,
    callback?: TriggerCallback,
    tag?: string,
    options?: TriggerOptions
  ): Trigger;

  registerOneTime(
    pattern: TriggerPattern,
    callback: TriggerCallback,
    tag?: string,
    options?: TriggerOptions
  ): Trigger;

  registerToken(
    token: string,
    callback?: TriggerCallback,
    tag?: string,
    options?: TriggerOptions
  ): Trigger;

  remove(trigger: Trigger): void;

  removeByTag(tag: string): void;
}

/**
 * Aliases API - Manage command aliases
 */
interface AliasesApi {
  register(
    pattern: RegExp,
    callback: (matches?: RegExpMatchArray) => boolean
  ): string;

  remove(id: string): void;
}

/**
 * Events API - Subscribe to and emit events
 */
interface EventsApi {
  on<K extends EventKey>(
    event: K,
    listener: EventListener<K>,
    options?: boolean | { once?: boolean; signal?: AbortSignal }
  ): void;

  off<K extends EventKey>(event: K, listener: EventListener<K>): void;

  emit<K extends EventKey>(event: K, ...args: EventParams<K>): void;
}

/**
 * Map API - Access and modify map location
 */
interface MapApi {
  getRoom(): MapData.Room | undefined;

  setLocation(roomId: number): void;

  stepBack(): void;
}

/**
 * Output API - Print to game window
 */
interface OutputApi {
  print(text: string | AnsiAwareBuffer): void;
}

/**
 * Popup content that can be rendered inside plugin popups
 */
type PopupContent = string | Node;

/**
 * Handle returned when creating a popup window
 */
interface PopupHandle {
  readonly element: HTMLDivElement;

  readonly isPinned: boolean;

  setTitle(title: string): void;

  setBody(content: PopupContent): void;

  setPinned(pinned: boolean): void;

  onClose(callback: () => void): void;

  close(): void;
}

/**
 * Handle for popup menu entries
 */
interface PopupMenuEntryHandle {
  setLabel(label: string | Node): void;

  setDisabled(disabled: boolean): void;

  remove(): void;
}

/**
 * Handle for context menu entries
 */
interface ContextMenuEntryHandle {
  setLabel(label: string | Node): void;

  setAction(action: () => void): void;

  remove(): void;
}

/**
 * UI helpers for plugins
 */
interface UiApi {
  createPopup(title: string, body: PopupContent): Promise<PopupHandle>;

  addPopupMenuEntry(label: string | Node, onSelect: () => void): PopupMenuEntryHandle;

  addContextMenuEntry(label: string | Node, action: () => void): ContextMenuEntryHandle;
}

/**
 * Colors API - Create and manage colors
 */
interface ColorsApi {
  fromHex(hex: string): FormatStateSnapshot;

  fromRgb(r: number, g: number, b: number): FormatStateSnapshot;
}

/**
 * Function Bind API - Manage keyboard bindings
 */
interface BindApi {
  set(printable: string | null, callback?: () => void, clearAfterUse?: boolean): void;

  clear(): void;

  getLabel(): string;
}

/**
 * Team API - Access team information
 */
interface TeamApi {
  getMembers(): string[];

  getLeader(): string | undefined;

  getLeaderId(): number | undefined;

  getPlayerNum(): number | undefined;
}

/**
 * GMCP API - Access GMCP data
 */
interface GmcpApi {
  get(): Record<string, any>;
}

/**
 * Attack Queue API - Manage attack queue
 */
interface AttackQueueApi {
  add(id: number): boolean;

  remove(id: number): boolean;

  clear(): void;

  get(): number[];
}

/**
 * Location object information
 */
interface LocationObject {
  num: number;
  desc?: string;
  hp?: number;
  attack_num?: boolean | number;
  avatar_target?: boolean;
  attack_target?: boolean;
  defense_target?: boolean;
  shortcut?: string;
  __category?: 'player' | 'team' | 'rest' | 'rest-noncombat';
}

/**
 * Objects API - Access objects in current location
 */
interface ObjectsApi {
  getObjectsOnLocation(): LocationObject[];
}

/**
 * Command API - Send commands to the server
 */
interface CommandApi {
  send(command: string, echo?: boolean, options?: any): Promise<void>;
}

/**
 * Group definition for categorizing container items
 */
interface GroupDefinition {
  name: string;
  filter: (item: string) => boolean;
}

/**
 * Transform definition for styling container items
 */
interface TransformDefinition {
  transform: (buffer: AnsiAwareBuffer, item: { name: string; count: string | number }, group: string) => AnsiAwareBuffer;
}

/**
 * Herb bag state - contains herbs and optional condition
 */
interface HerbBagState {
  herbs: Record<string, number>;
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
  herbId: string;
  amount: number;
  fromBag: number;
  toBag: number;
}

/**
 * Pretty Containers API - Access and extend container formatting
 */
interface PrettyContainersApi {
  getFilters(): ReadonlyArray<Readonly<GroupDefinition>>;

  getTransforms(): ReadonlyArray<Readonly<TransformDefinition>>;

  addFilter(definition: GroupDefinition): void;

  addTransform(definition: TransformDefinition): void;
}

/**
 * Magics API - Access magic item patterns
 */
interface MagicsApi {
  getPatterns(): Promise<string[]>;
}

/**
 * Magic Keys API - Access magic key patterns
 */
interface MagicKeysApi {
  getPatterns(): Promise<string[]>;
}

/**
 * Herbs API - Access herb inventory in bags
 */
interface HerbsApi {
  getBags(): HerbBagsState;

  take(herbId: string, amount: number, fromBag?: number): Promise<number>;

  put(herbId: string, amount: number, bag: number): Promise<number>;

  move(options: HerbMoveOptions): Promise<void>;
}

/**
 * Object List Filters API - Customize object list entry rendering
 *
 * Allows plugins to register filters that modify how objects are displayed
 * in the object list. Filters can change colors, add icons, modify text, etc.
 *
 * Types are available for import:
 * ```typescript
 *  * ```
 */
interface ObjectListFiltersApi {
  register(name: string, filter: ObjectListEntryFilter, priority?: number): void;

  unregister(name: string): boolean;

  getFilterNames(): string[];

  clear(): void;
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
  triggers: TriggersApi;
  aliases: AliasesApi;
  events: EventsApi;
  map: MapApi;
  output: OutputApi;
  ui: UiApi;
  colors: ColorsApi;
  bind: BindApi;
  team: TeamApi;
  gmcp: GmcpApi;
  attackQueue: AttackQueueApi;
  objects: ObjectsApi;
  command: CommandApi;
  prettyContainers: PrettyContainersApi;
  magics: MagicsApi;
  magicKeys: MagicKeysApi;
  herbs: HerbsApi;
  objectListFilters: ObjectListFiltersApi;
  AnsiAwareBuffer: typeof AnsiAwareBuffer;
}

// ============================================================================
// Global API Instance
// ============================================================================

/** Global Plugin API instance available to all plugins */
declare const api: PluginApi;
