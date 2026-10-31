import { AnsiAwareBuffer } from "@client/ansi/FormatState";
import type { AliasesApi } from "./aliases";
import type { BindApi, MultibindsApi } from "./binds";
import type { TeamApi, AttackQueueApi, EnemyBindsApi, CombatApi, AttackControllerApi } from "./combat";
import type { CommandApi, CommandHooksApi } from "./command";
import type { PrettyContainersApi, ContainersApi } from "./containers";
import type { EventsApi } from "./events";
import type { GmcpApi } from "./gmcp";
import type { HerbsApi } from "./herbs";
import type { KeysApi } from "./keys";
import type { LocationNotesApi } from "./locationNotes";
import type { ButtonMacrosApi, TriggerMacrosApi } from "./macros";
import type { MagicsApi, MagicKeysApi } from "./magics";
import type { MapApi } from "./map";
import type { NotificationsApi } from "./notifications";
import type { ObjectsApi, ObjectListFiltersApi } from "./objects";
import type { OutputApi, ColorsApi } from "./output";
import type { PeopleApi } from "./people";
import type { SettingsApi } from "./settings";
import type { SqliteApi } from "./sqlite";
import type { StorageApi, CharacterApi } from "./storage";
import type { TriggersApi } from "./triggers";
import type { UiApi } from "./ui/index";
import type { WalkModesApi } from "./walkModes";

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
