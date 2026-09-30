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
 * Options for creating a location highlighter
 */
interface LocationHighlighterOptions {
  color?: string;
  enabled?: boolean;
}

/**
 * A location highlighter that can highlight rooms on the map.
 * Multiple highlighters can be active simultaneously with different colors.
 */
interface LocationHighlighter {
  add(roomIds: number | number[]): void;

  remove(roomIds: number | number[]): void;

  clear(): void;

  enable(): void;

  disable(): void;

  isEnabled(): boolean;

  setColor(color: string): void;

  getColor(): string;

  getRoomIds(): number[];

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
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  dash?: number[];
  alpha?: number;
}

/**
 * A shape drawn by a map overlay, in map coordinates.
 */
type MapOverlayShape = (
  | { type: "circle"; cx: number; cy: number; radius: number; paint: MapOverlayPaint }

/**
 * What a map overlay sees when it renders.
 */
interface MapOverlayRenderState {
  currentRoomId?: number;
  areaId?: number;
  z?: number;
  settings: Readonly<MapRenderer.Settings>;
  getRoom(roomId: number): MapData.Room | undefined;
}

/**
 * Definition of a custom map overlay, see {@link MapApi.addOverlay}.
 */
interface MapOverlayDefinition {
  render(state: MapOverlayRenderState): MapOverlayShape | MapOverlayShape[] | void;
}

/**
 * Handle returned by {@link MapApi.addOverlay}.
 */
interface MapOverlayHandle {
  readonly id: string;
  invalidate(): void;
  remove(): void;
}

/**
 * Area information exposed via Map API
 */
interface AreaInfo {
  areaId: number;
  areaName: string;
  rooms: MapData.Room[];
}

/**
 * Map API - Access and modify map location
 */
interface MapApi {
  getRoom(): MapData.Room | undefined;

  getRoomById(roomId: number): MapData.Room | null;

  getAreas(): AreaInfo[];

  findPath(fromId: number, toId: number): number[] | null;

  setLocation(roomId: number): void;

  stepBack(): void;

  createHighlighter(options?: LocationHighlighterOptions): LocationHighlighter;

  addOverlay(id: string, overlay: MapOverlayDefinition): MapOverlayHandle;

  applyChanges(changes: RoomChange[], options?: ApplyChangesOptions): number;

  syncAreas(areas: MapAreaData[]): number;

  replaceMap(mapData: MapData.Map, colors?: MapData.Env[]): boolean;
}

/**
 * Output API - Print to game window
 */
interface OutputApi {
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
  readonly element: HTMLDivElement;

  readonly isPinned: boolean;

  setTitle(title: string): void;

  setBody(content: PopupContent): void;

  setPinned(pinned: boolean): void;

  onClose(callback: () => void): void;

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
  id: string;

  title: string;

  createContent: () => PopupContent | Promise<PopupContent>;

  headerActions?: Node | React.ReactNode;

  pinned?: boolean;
}

/**
 * Handle returned when registering a persistent popup.
 * Extends PopupHandle with additional persistence features.
 */
interface PersistentPopupHandle extends PopupHandle {
  readonly id: string;

  readonly wasRestored: boolean;

  readonly isOpen: boolean;

  open(): Promise<void>;

  setHeaderActions(actions: Node | React.ReactNode): void;
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
 * Handle for footer components
 */
interface FooterComponentHandle {
  readonly element: HTMLSpanElement;

  setContent(content: string | Node | ReactElement): void;

  setVisible(visible: boolean): void;

  remove(): void;
}

/**
 * UI helpers for plugins
 */
interface UiApi {
  createPopup(title: string, body: PopupContent, options?: PopupSizeOptions): Promise<PopupHandle>;

  registerPersistentPopup(config: PersistentPopupConfig): Promise<PersistentPopupHandle>;

  addPopupMenuEntry(label: string | Node, onSelect: () => void): PopupMenuEntryHandle;

  addContextMenuEntry(label: string | Node, action: () => void): ContextMenuEntryHandle;

  registerFooterComponent(
    id: string,
    content: string | Node | ReactElement,
    position?: 'start' | 'end' | number
  ): FooterComponentHandle;

  registerFooterButton(id: string, button: FooterButtonOptions): FooterButtonHandle;

  setFooterButtonState(name: string, on: boolean): void;
}

/** What a plugin's footer button is. */
interface FooterButtonOptions {
  label: string;
  command: string;
  tone?: FooterButtonTone;
  state?: string;
  order?: number;
}

interface FooterButtonHandle {
  update(button: Partial<FooterButtonOptions>): void;
  remove(): void;
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
 * Options for api.multibinds.addTemporary()
 */
interface TemporaryMultibindOptions {
  action: string;
  label?: string;
  roomId?: number;
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
  update(patch: TemporaryMultibindUpdateOptions): void;
  remove(): void;
}

/**
 * Multibinds API - put temporary commands on the multibind bar (ALT+1..4)
 */
interface MultibindsApi {
  addTemporary(opts: TemporaryMultibindOptions): TemporaryMultibindHandle;
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

  addSuggestions(...words: string[]): void;

  removeSuggestions(...words: string[]): void;
}

/**
 * Command Hooks API - Intercept and modify commands before processing
 */
interface CommandHooksApi {
  register(callback: CommandHookCallback, priority?: number): string;

  unregister(hookId: string): boolean;
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
 * Herb grammatical forms (Polish declensions)
 */
interface HerbForms {
  mianownik: string;
  dopelniacz: string;
  biernik: string;
  mnoga_mianownik: string;
  mnoga_dopelniacz: string;
  mnoga_biernik: string;
  narzednik: string;
}

/**
 * Herb use/effect definition
 */
interface HerbUse {
  action: string;
  effect: string;
  dont_bind?: boolean;
  smokable?: boolean;
}

/**
 * Complete herb database structure
 */
interface HerbsData {
  herb_id_to_odmiana: Record<string, HerbForms>;
  version: number;
  herb_id_to_use: Record<string, HerbUse[]>;
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
  odmiana?: MagicForms;
  dodatkowe_regexps?: string[];
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
  getPatterns(): Promise<string[]>;

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
  getPatterns(): Promise<string[]>;

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
  label?: string;
  fallback?: ContainerType;
}

/**
 * Grammatical forms for a container bag name
 */
interface ContainerForms {
  mianownik: string;
  dopelniacz: string;
  biernik: string;
}

/**
 * Containers API - Put items into and take items from assigned bags
 */
interface ContainersApi {
  registerType(type: string, options?: ContainerTypeOptions): void;

  getContainer(type: ContainerType): string;

  getContainerForms(type: ContainerType): ContainerForms | null;

  put(type: ContainerType, item: string): void;

  take(type: ContainerType, item: string): void;

  inspect(type: ContainerType, options?: { silent?: boolean; timeout?: number }): Promise<{ name: string; count: string | number }[] | null>;
}

/**
 * Herbs API - Access herb inventory in bags
 */
interface HerbsApi {
  getBags(): HerbBagsState;

  take(herbId: string, amount: number, fromBag?: number): Promise<number>;

  put(herbId: string, amount: number, bag: number): Promise<number>;

  move(options: HerbMoveOptions): Promise<void>;

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
interface ObjectListFiltersApi {
  register(name: string, filter: ObjectListEntryFilter, priority?: number): void;

  unregister(name: string): boolean;

  getFilterNames(): string[];

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
  register(name: string, resolver: EnemyBindResolver, priority?: number): void;

  unregister(name: string): boolean;

  getResolverNames(): string[];

  clear(): void;
}

/**
 * Handle returned by buttonMacros.register() for controlling macro state
 */
interface ButtonMacroHandle {
  getState(): string | undefined;

  setState(stateId: string): boolean;

  cycleState(): void;

  onStateChange(listener: (newState: string, oldState: string | undefined) => void): () => void;
}

/**
 * Button Macros API - Register custom button macros
 *
 * Allows plugins to define custom macros that can be assigned to mobile and desktop buttons.
 * Macros can be stateless (simple click actions) or stateful (toggle/mode buttons).
 */
interface ButtonMacrosApi {
  register(options: {
    id: string;
    label: string;
    onClick: ((context: ButtonMacroClickContext) => void) | ((button: MobileButtonSetting, client: Client, config: Record<string, any>) => void);
    configFields?: MacroConfigField[];
    states?: MacroState[];
    initialState?: string;
  }): ButtonMacroHandle;

  unregister(id: string): void;

  getState(id: string): string | undefined;

  setState(id: string, stateId: string): boolean;

  onStateChange(id: string, listener: (macroType: string, newState: string, oldState: string | undefined) => void): () => void;
}

/**
 * Trigger Macros API - Register custom trigger macros
 *
 * Allows plugins to define custom macros that can be used in user triggers.
 */
interface TriggerMacrosApi {
  register(options: {
    id: string;
    label: string;
    onMatch: (context: TriggerMacroContext) => void;
    configFields?: MacroConfigField[];
  }): void;

  unregister(id: string): void;
}

/**
 * Settings API - Access character and UI settings
 *
 * Provides read-only access to character settings (scoped to current character)
 * and UI settings (global).
 */
interface SettingsApi {
  getCharacterSettings(): Promise<Settings>;

  getCharacterSetting<K extends keyof Settings>(key: K): Promise<Settings[K]>;

  getUiSettings(): Promise<UiSettings>;

  getUiSetting<K extends keyof UiSettings>(key: K): Promise<UiSettings[K]>;
}

/**
 * Combat API - Access combat-related settings and commands
 *
 * Provides access to combat settings like weapon draw commands.
 */
interface CombatApi {
  drawWeapon(): void;
}

/**
 * Location Notes API - Add plugin-contributed notes to locations
 *
 * Plugins can add notes to locations that appear alongside user notes.
 * Plugin notes are read-only for users and displayed with the plugin name.
 */
interface LocationNotesApi {
  set(roomId: number, note: string): void;

  remove(roomId: number): void;

  get(roomId: number): PluginLocationNote[];
}

/**
 * Attack Controller API - Execute attacks with proper team coordination
 *
 * Provides methods to attack targets by their object ID, respecting
 * attack mode settings and team coordination (leader commands).
 */
interface AttackControllerApi {
  attackById(id: number, command?: string): void;

  support(command?: string): void;

  getAttackCommand(): string;

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
  register(id: string, options: WalkModeOptions): WalkModeHandle;
}

interface WalkModeOptions {
  label: string;
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
  multibinds: MultibindsApi;
  team: TeamApi;
  gmcp: GmcpApi;
  attackQueue: AttackQueueApi;
  objects: ObjectsApi;
  command: CommandApi;
  commandHooks: CommandHooksApi;
  prettyContainers: PrettyContainersApi;
  containers: ContainersApi;
  magics: MagicsApi;
  magicKeys: MagicKeysApi;
  herbs: HerbsApi;
  objectListFilters: ObjectListFiltersApi;
  enemyBinds: EnemyBindsApi;
  buttonMacros: ButtonMacrosApi;
  triggerMacros: TriggerMacrosApi;
  settings: SettingsApi;
  attackController: AttackControllerApi;
  combat: CombatApi;
  locationNotes: LocationNotesApi;
  people: PeopleApi;
  walkModes: WalkModesApi;
  AnsiAwareBuffer: typeof AnsiAwareBuffer;
}

// ============================================================================
// Global API Instance
// ============================================================================

/** Global Plugin API instance available to all plugins */
declare const api: PluginApi;
