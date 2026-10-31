import type Client from "@client/Client";
import { AnsiAwareBuffer } from "@client/ansi/FormatState";
import { createPluginApiContext, type PluginApiLifecycle } from "./context";
import type { PluginApi } from "./PluginApi";
import { createAliasesApi } from "./aliases";
import { createBindApi, createMultibindsApi } from "./binds";
import { createAttackControllerApi, createAttackQueueApi, createCombatApi, createEnemyBindsApi, createTeamApi } from "./combat";
import { createCommandApi, createCommandHooksApi } from "./command";
import { createContainersApi, createPrettyContainersApi } from "./containers";
import { createEventsApi } from "./events";
import { createGmcpApi } from "./gmcp";
import { createHerbsApi } from "./herbs";
import { createKeysApi } from "./keys";
import { createLocationNotesApi } from "./locationNotes";
import { createButtonMacrosApi, createTriggerMacrosApi } from "./macros";
import { createMagicKeysApi, createMagicsApi } from "./magics";
import { createMapApi } from "./map";
import { createNotificationsApi } from "./notifications";
import { createObjectListFiltersApi, createObjectsApi } from "./objects";
import { createColorsApi, createOutputApi } from "./output";
import { createPeopleApi } from "./people";
import { createSettingsApi } from "./settings";
import { createSqliteApi } from "./sqlite";
import { createCharacterApi, createStorageApi } from "./storage";
import { createTriggersApi } from "./triggers";
import { createUiApi } from "./ui";
import { createWalkModesApi } from "./walkModes";

/**
 * Plugin API Implementation
 *
 * Assembles the PluginApi from one factory per domain (./<domain>.ts). Each
 * factory keeps the registrations it makes and undoes them in cleanup().
 */
export class PluginApiImpl implements PluginApi {
  private readonly lifecycle: PluginApiLifecycle;

  public triggers;
  public aliases;
  public events;
  public map;
  public output;
  public ui;
  public colors;
  public bind;
  public multibinds;
  public team;
  public gmcp;
  public attackQueue;
  public objects;
  public command;
  public commandHooks;
  public prettyContainers;
  public containers;
  public magics;
  public magicKeys;
  public herbs;
  public objectListFilters;
  public enemyBinds;
  public buttonMacros;
  public triggerMacros;
  public settings;
  public attackController;
  public combat;
  public locationNotes;
  public people;
  public walkModes;
  public storage;
  public character;
  public keys;
  public sqlite;
  public notifications;
  public readonly AnsiAwareBuffer = AnsiAwareBuffer;

  /**
   * @param options.stableId What the plugin's saved state (storage, persistent
   *   windows) is kept under instead of its id. The id is the plugin's URL, so
   *   state kept under it is lost when the plugin moves to another address.
   */
  constructor(client: Client, pluginId: string = 'unknown', options: { stableId?: string } = {}) {
    this.lifecycle = createPluginApiContext(client, pluginId, options.stableId ?? pluginId);
    const ctx = this.lifecycle.context;

    this.triggers = createTriggersApi(ctx);
    this.aliases = createAliasesApi(ctx);
    this.events = createEventsApi(ctx);
    this.map = createMapApi(ctx);
    this.output = createOutputApi(ctx);
    this.ui = createUiApi(ctx);
    this.colors = createColorsApi();
    this.bind = createBindApi(ctx);
    this.multibinds = createMultibindsApi(ctx);
    this.team = createTeamApi(ctx);
    this.gmcp = createGmcpApi();
    this.attackQueue = createAttackQueueApi(ctx);
    this.objects = createObjectsApi(ctx);
    this.command = createCommandApi(ctx);
    this.commandHooks = createCommandHooksApi(ctx);
    this.prettyContainers = createPrettyContainersApi();
    this.containers = createContainersApi(ctx);
    this.magics = createMagicsApi();
    this.magicKeys = createMagicKeysApi();
    this.herbs = createHerbsApi(ctx);
    this.objectListFilters = createObjectListFiltersApi();
    this.enemyBinds = createEnemyBindsApi();
    this.buttonMacros = createButtonMacrosApi(ctx);
    this.triggerMacros = createTriggerMacrosApi(ctx);
    this.settings = createSettingsApi();
    this.attackController = createAttackControllerApi(ctx);
    this.combat = createCombatApi(ctx);
    this.locationNotes = createLocationNotesApi(ctx);
    this.people = createPeopleApi(ctx);
    this.walkModes = createWalkModesApi(ctx);
    this.storage = createStorageApi(ctx);
    this.character = createCharacterApi(ctx);
    this.keys = createKeysApi(ctx);
    this.sqlite = createSqliteApi();
    this.notifications = createNotificationsApi(ctx);
  }

  /**
   * Set the plugin name (called by PluginManager after init). Updates what was
   * registered during init, before the name was known.
   */
  setPluginName(name: string): void {
    this.lifecycle.setName(name);
  }

  /** The plugin's name, or its id while the name is not known yet */
  get pluginName(): string {
    return this.lifecycle.context.displayName;
  }

  /** Undo everything the plugin registered; called when it unloads */
  cleanup(): void {
    this.lifecycle.cleanup();
  }
}
