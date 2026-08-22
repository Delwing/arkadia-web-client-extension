/**
 * Integration tests for the PluginManager plugin lifecycle:
 * load → init → destroy
 *
 * These tests verify the interaction between PluginManager, PluginApiImpl,
 * and the event system at integration boundaries. External modules (registries,
 * storage, Firebase, etc.) are mocked, but PluginManager and PluginApiImpl
 * run as real code.
 */

// ============================================================================
// External module mocks (must appear before any imports that pull them in)
// ============================================================================

vi.mock('@modules/core/eventBus', () => ({
  __esModule: true,
  default: {
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  },
}));

vi.mock('@client/utils/pluginStorage', () => ({
  isStoredPluginId: jest.fn(() => false),
  getPluginScript: jest.fn(),
  updatePluginScript: jest.fn(),
}));

vi.mock('@modules/core/pluginButtonMacroRegistry', () => ({
  registerButtonMacro: jest.fn(),
  unregisterButtonMacro: jest.fn(),
  updateButtonMacroPluginName: jest.fn(),
  getButtonMacroState: jest.fn(),
  setButtonMacroState: jest.fn(),
  onButtonMacroStateChange: jest.fn(),
  getButtonMacroById: jest.fn(),
}));

vi.mock('@modules/core/pluginTriggerMacroRegistry', () => ({
  registerTriggerMacro: jest.fn(),
  unregisterTriggerMacro: jest.fn(),
  updateTriggerMacroPluginName: jest.fn(),
}));

vi.mock('@modules/core/pluginFooterRegistry', () => ({
  registerFooterComponent: jest.fn(),
  unregisterFooterComponent: jest.fn(),
  updateFooterComponent: jest.fn(),
  setFooterComponentVisible: jest.fn(),
}));

vi.mock('@modules/core/pluginLocationNotesRegistry', () => ({
  setPluginLocationNote: jest.fn(),
  removePluginLocationNote: jest.fn(),
  removeAllPluginNotes: jest.fn(),
  getPluginLocationNotes: jest.fn(() => []),
  updatePluginNotesName: jest.fn(),
}));

vi.mock('@modules/core/pluginUiRegistry', () => ({
  registerPopupMenuEntry: jest.fn(),
  unregisterPopupMenuEntry: jest.fn(),
  updatePopupMenuEntryLabel: jest.fn(),
  setPopupMenuEntryDisabled: jest.fn(),
  registerContextMenuEntry: jest.fn(),
  unregisterContextMenuEntry: jest.fn(),
  updateContextMenuEntry: jest.fn(),
}));

vi.mock('@modules/core/storage', () => ({
  characterStorage: {
    get: jest.fn(),
    set: jest.fn(),
    getCharacter: jest.fn(),
    onChange: jest.fn(),
  },
  globalStorage: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

vi.mock('@modules/core/defaultSettings', () => ({
  defaultSettings: {},
}));

vi.mock('@web/defaultUiSettings', () => ({
  defaultUiSettings: {},
}));

vi.mock('@web/layout/pluginPopupRegistry', () => ({
  registerPluginPopup: jest.fn(),
  unregisterPluginPopup: jest.fn(),
  updatePluginPopup: jest.fn(),
  openPluginPopup: jest.fn(),
  closePluginPopup: jest.fn(),
  getPluginPopup: jest.fn(),
}));

vi.mock('@web/layout/utils/layoutStorage', () => ({
  shouldPopupAutoOpen: jest.fn(() => false),
  getPopupPinnedState: jest.fn(() => false),
}));

vi.mock('@client/scripts/prettyContainers', () => ({
  addGroupDefinition: jest.fn(),
  addTransformDefinition: jest.fn(),
  getGroupDefinitions: jest.fn(() => []),
  getTransformDefinitions: jest.fn(() => []),
}));

vi.mock('@client/scripts/bagManager', () => ({
  containerAction: jest.fn(),
  getContainer: jest.fn(),
  getContainerForms: jest.fn(),
}));

vi.mock('@client/scripts/lib/magicsLoader', () => ({
  __esModule: true,
  default: jest.fn(),
  loadMagicsRaw: jest.fn(),
}));

vi.mock('@client/scripts/lib/magicKeyLoader', () => ({
  __esModule: true,
  default: jest.fn(),
  loadMagicKeysRaw: jest.fn(),
}));

vi.mock('@client/scripts/lib/herbsLoader', () => ({
  __esModule: true,
  default: jest.fn(),
}));

vi.mock('@web/objectListFilters', () => ({
  objectListFilters: {
    register: jest.fn(),
    unregister: jest.fn(),
    getFilterNames: jest.fn(() => []),
    clear: jest.fn(),
  },
}));

vi.mock('@client/gmcp', () => ({
  gmcp: {},
}));

vi.mock('@modules/data/peopleLoader', () => ({
  addLocalPerson: jest.fn(),
  editPerson: jest.fn(),
  deleteLocalPerson: jest.fn(),
  ignorePerson: jest.fn(),
  restorePerson: jest.fn(),
  markAsEnemy: jest.fn(),
  unmarkAsEnemy: jest.fn(),
  markAsAlly: jest.fn(),
  unmarkAsAlly: jest.fn(),
  setPersonColor: jest.fn(),
  clearPersonColor: jest.fn(),
  getMergedSnapshot: jest.fn(() => []),
  makePersonKey: jest.fn(),
}));

// ============================================================================
// Imports (after all jest.mock calls)
// ============================================================================

import { PluginManager } from '@client/PluginManager';
import { PluginApiImpl } from '@client/PluginApi';
import type Client from '@client/Client';
import type { Plugin, PluginInfo } from '@shared/types/Plugin';
import eventBus from '@modules/core/eventBus';
import { removeAllPluginNotes, updatePluginNotesName } from '@modules/core/pluginLocationNotesRegistry';
import { updateButtonMacroPluginName } from '@modules/core/pluginButtonMacroRegistry';
import { updateTriggerMacroPluginName } from '@modules/core/pluginTriggerMacroRegistry';

// ============================================================================
// Helpers
// ============================================================================

function makePluginInfo(overrides?: Partial<PluginInfo>): PluginInfo {
  return {
    name: 'Test Plugin',
    version: '1.0.0',
    author: 'Test Author',
    description: 'A test plugin',
    ...overrides,
  };
}

function makePlugin(
  info: PluginInfo = makePluginInfo(),
  overrides?: Partial<Plugin>
): Plugin {
  return {
    init: jest.fn().mockResolvedValue(info),
    destroy: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeMockClient(): Client {
  return {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    sendEvent: jest.fn(),
    print: jest.fn(),
    Triggers: {
      registerTrigger: jest.fn(() => ({ id: 'trigger-1' })),
      registerOneTimeTrigger: jest.fn(() => ({ id: 'trigger-2' })),
      registerTokenTrigger: jest.fn(() => ({ id: 'trigger-3' })),
      removeTrigger: jest.fn(),
      removeByTag: jest.fn(),
    },
    aliases: [] as any[],
    commandLineSuggestions: [] as string[],
    unregisterCommandHook: jest.fn(() => true),
    sendCommand: jest.fn().mockResolvedValue(undefined),
    Map: {
      currentRoom: null,
      getRoomById: jest.fn(() => null),
      setMapRoomById: jest.fn(),
      moveBack: jest.fn(),
      tryGetMapReader: jest.fn(() => null),
      createHighlighter: jest.fn(() => ({
        add: jest.fn(),
        remove: jest.fn(),
        clear: jest.fn(),
        enable: jest.fn(),
        disable: jest.fn(),
        isEnabled: jest.fn(() => true),
        setColor: jest.fn(),
        getColor: jest.fn(() => 'yellow'),
        getRoomIds: jest.fn(() => []),
        destroy: jest.fn(),
      })),
    },
  } as unknown as Client;
}

// ============================================================================
// Tests
// ============================================================================

describe('PluginManager integration — plugin lifecycle', () => {
  const PLUGIN_URL = 'https://example.com/plugin.js';

  let pluginManager: PluginManager;
  let mockClient: Client;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = makeMockClient();
    pluginManager = new PluginManager(mockClient);
  });

  // ==========================================================================
  // 1. Full lifecycle: load → init → destroy
  // ==========================================================================

  describe('full lifecycle — load, init, destroy', () => {
    it('calls init() on the plugin module with a PluginApiImpl instance', async () => {
      const info = makePluginInfo();
      const plugin = makePlugin(info);

      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);

      await pluginManager.loadPlugin(PLUGIN_URL);

      expect(plugin.init).toHaveBeenCalledTimes(1);
      const apiArg = (plugin.init as jest.Mock).mock.calls[0][0];
      expect(apiArg).toBeInstanceOf(PluginApiImpl);
    });

    it('sets plugin status to "loaded" after successful init', async () => {
      const plugin = makePlugin();
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);

      const loaded = await pluginManager.loadPlugin(PLUGIN_URL);

      expect(loaded.status).toBe('loaded');
    });

    it('stores the PluginInfo returned by init() on the LoadedPlugin entry', async () => {
      const info = makePluginInfo({ name: 'My Plugin', version: '2.3.4' });
      const plugin = makePlugin(info);
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);

      const loaded = await pluginManager.loadPlugin(PLUGIN_URL);

      expect(loaded.info).toEqual(info);
    });

    it('emits plugin:loaded with url and info after successful init', async () => {
      const info = makePluginInfo();
      const plugin = makePlugin(info);
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);

      await pluginManager.loadPlugin(PLUGIN_URL);

      expect(eventBus.emit).toHaveBeenCalledWith('plugin:loaded', {
        url: PLUGIN_URL,
        info,
      });
    });

    it('adds the plugin to getLoadedPlugins() after load', async () => {
      const plugin = makePlugin();
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);

      await pluginManager.loadPlugin(PLUGIN_URL);

      const all = pluginManager.getLoadedPlugins();
      expect(all).toHaveLength(1);
      expect(all[0].url).toBe(PLUGIN_URL);
    });

    it('calls destroy() on the plugin instance when unloading', async () => {
      const plugin = makePlugin();
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);
      await pluginManager.loadPlugin(PLUGIN_URL);

      await pluginManager.unloadPlugin(PLUGIN_URL);

      expect(plugin.destroy).toHaveBeenCalledTimes(1);
    });

    it('emits plugin:destroyed with the url after unload', async () => {
      const plugin = makePlugin();
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);
      await pluginManager.loadPlugin(PLUGIN_URL);

      await pluginManager.unloadPlugin(PLUGIN_URL);

      expect(eventBus.emit).toHaveBeenCalledWith('plugin:destroyed', {
        url: PLUGIN_URL,
      });
    });

    it('removes the plugin from getLoadedPlugins() after unload', async () => {
      const plugin = makePlugin();
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);
      await pluginManager.loadPlugin(PLUGIN_URL);

      await pluginManager.unloadPlugin(PLUGIN_URL);

      expect(pluginManager.getLoadedPlugins()).toHaveLength(0);
      expect(pluginManager.isLoaded(PLUGIN_URL)).toBe(false);
    });
  });

  // ==========================================================================
  // 2. Plugin init error handling
  // ==========================================================================

  describe('when plugin init() throws', () => {
    it('sets plugin status to "error"', async () => {
      const plugin: Plugin = {
        init: jest.fn().mockRejectedValue(new Error('init boom')),
        destroy: jest.fn(),
      };
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);

      const loaded = await pluginManager.loadPlugin(PLUGIN_URL);

      expect(loaded.status).toBe('error');
    });

    it('stores the error message on the LoadedPlugin entry', async () => {
      const plugin: Plugin = {
        init: jest.fn().mockRejectedValue(new Error('init boom')),
        destroy: jest.fn(),
      };
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);

      const loaded = await pluginManager.loadPlugin(PLUGIN_URL);

      expect(loaded.error).toContain('init boom');
    });

    it('emits plugin:error with url and error message', async () => {
      const errorMessage = 'init exploded';
      const plugin: Plugin = {
        init: jest.fn().mockRejectedValue(new Error(errorMessage)),
        destroy: jest.fn(),
      };
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);

      await pluginManager.loadPlugin(PLUGIN_URL);

      expect(eventBus.emit).toHaveBeenCalledWith('plugin:error', {
        url: PLUGIN_URL,
        error: errorMessage,
      });
    });

    it('does NOT emit plugin:loaded when init throws', async () => {
      const plugin: Plugin = {
        init: jest.fn().mockRejectedValue(new Error('init boom')),
        destroy: jest.fn(),
      };
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);

      await pluginManager.loadPlugin(PLUGIN_URL);

      const loadedCalls = (eventBus.emit as jest.Mock).mock.calls.filter(
        ([event]) => event === 'plugin:loaded'
      );
      expect(loadedCalls).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 3. API cleanup on destroy
  // ==========================================================================

  describe('API cleanup on unload', () => {
    it('calls cleanup() on the apiInstance when unloading', async () => {
      const plugin = makePlugin();
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);
      await pluginManager.loadPlugin(PLUGIN_URL);

      const loaded = pluginManager.getPlugin(PLUGIN_URL)!;
      const cleanupSpy = jest.spyOn(loaded.apiInstance, 'cleanup');

      await pluginManager.unloadPlugin(PLUGIN_URL);

      expect(cleanupSpy).toHaveBeenCalledTimes(1);
    });

    it('removes aliases registered during init when the plugin is unloaded', async () => {
      // During init, the plugin registers an alias via the API
      const aliasPattern = /^test alias$/;
      const plugin: Plugin = {
        init: jest.fn().mockImplementation(async (api: PluginApiImpl) => {
          api.aliases.register(aliasPattern, () => true);
          return makePluginInfo();
        }),
        destroy: jest.fn(),
      };

      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);
      await pluginManager.loadPlugin(PLUGIN_URL);

      // The alias is now in client.aliases
      const clientAliases = (mockClient as any).aliases as any[];
      expect(clientAliases.some((a: any) => a.pattern === aliasPattern)).toBe(true);

      await pluginManager.unloadPlugin(PLUGIN_URL);

      // The alias must be removed after unload
      expect(clientAliases.some((a: any) => a.pattern === aliasPattern)).toBe(false);
    });

    it('calls removeAllPluginNotes for the plugin id on cleanup', async () => {
      const plugin = makePlugin(makePluginInfo({ name: 'NotePlugin' }));
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);
      await pluginManager.loadPlugin(PLUGIN_URL);

      await pluginManager.unloadPlugin(PLUGIN_URL);

      expect(removeAllPluginNotes).toHaveBeenCalledWith(PLUGIN_URL);
    });
  });

  // ==========================================================================
  // 4. Plugin destroy() error handling
  // ==========================================================================

  describe('when plugin destroy() throws', () => {
    it('still removes the plugin from the loaded list', async () => {
      const plugin: Plugin = {
        init: jest.fn().mockResolvedValue(makePluginInfo()),
        destroy: jest.fn().mockRejectedValue(new Error('destroy kaboom')),
      };
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);
      await pluginManager.loadPlugin(PLUGIN_URL);

      await pluginManager.unloadPlugin(PLUGIN_URL);

      expect(pluginManager.isLoaded(PLUGIN_URL)).toBe(false);
      expect(pluginManager.getLoadedPlugins()).toHaveLength(0);
    });

    it('still emits plugin:destroyed even when destroy() throws', async () => {
      const plugin: Plugin = {
        init: jest.fn().mockResolvedValue(makePluginInfo()),
        destroy: jest.fn().mockRejectedValue(new Error('destroy kaboom')),
      };
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);
      await pluginManager.loadPlugin(PLUGIN_URL);

      await pluginManager.unloadPlugin(PLUGIN_URL);

      expect(eventBus.emit).toHaveBeenCalledWith('plugin:destroyed', {
        url: PLUGIN_URL,
      });
    });

    it('still calls API cleanup even when destroy() throws', async () => {
      const plugin: Plugin = {
        init: jest.fn().mockResolvedValue(makePluginInfo()),
        destroy: jest.fn().mockRejectedValue(new Error('destroy kaboom')),
      };
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);
      await pluginManager.loadPlugin(PLUGIN_URL);

      const loaded = pluginManager.getPlugin(PLUGIN_URL)!;
      const cleanupSpy = jest.spyOn(loaded.apiInstance, 'cleanup');

      await pluginManager.unloadPlugin(PLUGIN_URL);

      expect(cleanupSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 5. Idempotent load: already-loaded plugin
  // ==========================================================================

  describe('when loading a plugin that is already loaded', () => {
    it('returns the existing LoadedPlugin without calling init() again', async () => {
      const plugin = makePlugin();
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);

      const first = await pluginManager.loadPlugin(PLUGIN_URL);
      const second = await pluginManager.loadPlugin(PLUGIN_URL);

      expect(second).toBe(first);
      expect(plugin.init).toHaveBeenCalledTimes(1);
    });

    it('does not emit an additional plugin:loaded event on the second call', async () => {
      const plugin = makePlugin();
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);

      await pluginManager.loadPlugin(PLUGIN_URL);
      await pluginManager.loadPlugin(PLUGIN_URL);

      const loadedCalls = (eventBus.emit as jest.Mock).mock.calls.filter(
        ([event]) => event === 'plugin:loaded'
      );
      expect(loadedCalls).toHaveLength(1);
    });

    it('keeps exactly one plugin entry in getLoadedPlugins()', async () => {
      const plugin = makePlugin();
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);

      await pluginManager.loadPlugin(PLUGIN_URL);
      await pluginManager.loadPlugin(PLUGIN_URL);

      expect(pluginManager.getLoadedPlugins()).toHaveLength(1);
    });
  });

  // ==========================================================================
  // 6. reloadAll()
  // ==========================================================================

  describe('reloadAll()', () => {
    it('unloads then reloads all plugins', async () => {
      const URL_A = 'https://example.com/plugin-a.js';
      const URL_B = 'https://example.com/plugin-b.js';
      const pluginA = makePlugin(makePluginInfo({ name: 'Plugin A' }));
      const pluginB = makePlugin(makePluginInfo({ name: 'Plugin B' }));

      jest
        .spyOn(pluginManager as any, 'loadAsModule')
        .mockImplementation(async (url: string) => {
          if (url.startsWith(URL_A)) return pluginA;
          if (url.startsWith(URL_B)) return pluginB;
          return null;
        });

      await pluginManager.loadPlugin(URL_A);
      await pluginManager.loadPlugin(URL_B);
      jest.clearAllMocks();

      await pluginManager.reloadAll();

      // Both plugins should have been initialised again (reload = destroy + load)
      expect(pluginA.init).toHaveBeenCalledTimes(1);
      expect(pluginB.init).toHaveBeenCalledTimes(1);

      // Both plugins should be present after reload
      expect(pluginManager.isLoaded(URL_A)).toBe(true);
      expect(pluginManager.isLoaded(URL_B)).toBe(true);
      expect(pluginManager.getLoadedPlugins()).toHaveLength(2);
    });

    it('calls destroy() on every plugin during reload', async () => {
      const URL_A = 'https://example.com/plugin-a.js';
      const URL_B = 'https://example.com/plugin-b.js';
      const pluginA = makePlugin(makePluginInfo({ name: 'Plugin A' }));
      const pluginB = makePlugin(makePluginInfo({ name: 'Plugin B' }));

      jest
        .spyOn(pluginManager as any, 'loadAsModule')
        .mockImplementation(async (url: string) => {
          if (url.startsWith(URL_A)) return pluginA;
          if (url.startsWith(URL_B)) return pluginB;
          return null;
        });

      await pluginManager.loadPlugin(URL_A);
      await pluginManager.loadPlugin(URL_B);
      jest.clearAllMocks();

      await pluginManager.reloadAll();

      expect(pluginA.destroy).toHaveBeenCalledTimes(1);
      expect(pluginB.destroy).toHaveBeenCalledTimes(1);
    });

    it('emits plugin:destroyed and plugin:loaded for each plugin during reload', async () => {
      const URL_A = 'https://example.com/plugin-a.js';
      const plugin = makePlugin(makePluginInfo({ name: 'Plugin A' }));

      jest
        .spyOn(pluginManager as any, 'loadAsModule')
        .mockResolvedValue(plugin);

      await pluginManager.loadPlugin(URL_A);
      jest.clearAllMocks();

      await pluginManager.reloadAll();

      expect(eventBus.emit).toHaveBeenCalledWith('plugin:destroyed', { url: URL_A });
      expect(eventBus.emit).toHaveBeenCalledWith(
        'plugin:loaded',
        expect.objectContaining({ url: URL_A })
      );
    });
  });

  // ==========================================================================
  // 7. Plugin name propagation via setPluginName
  // ==========================================================================

  describe('plugin name propagation', () => {
    it('calls setPluginName() on the API with the name returned by init()', async () => {
      const info = makePluginInfo({ name: 'Awesome Plugin' });
      const plugin = makePlugin(info);
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);
      await pluginManager.loadPlugin(PLUGIN_URL);

      const loaded = pluginManager.getPlugin(PLUGIN_URL)!;
      expect(loaded.apiInstance.pluginName).toBe('Awesome Plugin');
    });

    it('calls updateButtonMacroPluginName with the plugin identifier and name', async () => {
      const info = makePluginInfo({ name: 'Button Macro Plugin' });
      const plugin = makePlugin(info);
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);

      await pluginManager.loadPlugin(PLUGIN_URL);

      expect(updateButtonMacroPluginName).toHaveBeenCalledWith(
        PLUGIN_URL,
        'Button Macro Plugin'
      );
    });

    it('calls updateTriggerMacroPluginName with the plugin identifier and name', async () => {
      const info = makePluginInfo({ name: 'Trigger Macro Plugin' });
      const plugin = makePlugin(info);
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);

      await pluginManager.loadPlugin(PLUGIN_URL);

      expect(updateTriggerMacroPluginName).toHaveBeenCalledWith(
        PLUGIN_URL,
        'Trigger Macro Plugin'
      );
    });

    it('calls updatePluginNotesName with the plugin identifier and name', async () => {
      const info = makePluginInfo({ name: 'Notes Plugin' });
      const plugin = makePlugin(info);
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);

      await pluginManager.loadPlugin(PLUGIN_URL);

      expect(updatePluginNotesName).toHaveBeenCalledWith(
        PLUGIN_URL,
        'Notes Plugin'
      );
    });
  });

  // ==========================================================================
  // 8. Module without init() — legacy status
  // ==========================================================================

  describe('module that does not implement Plugin interface', () => {
    it('sets plugin status to "legacy" for a module without an init() function', async () => {
      const legacyModule = { someExport: 'value' }; // no init()
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(legacyModule);

      const loaded = await pluginManager.loadPlugin(PLUGIN_URL);

      expect(loaded.status).toBe('legacy');
    });

    it('does NOT emit plugin:loaded for a legacy module', async () => {
      const legacyModule = { someExport: 'value' };
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(legacyModule);

      await pluginManager.loadPlugin(PLUGIN_URL);

      const loadedCalls = (eventBus.emit as jest.Mock).mock.calls.filter(
        ([event]) => event === 'plugin:loaded'
      );
      expect(loadedCalls).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 9. Unloading a plugin that was never loaded
  // ==========================================================================

  describe('unloading a non-existent plugin', () => {
    it('resolves without throwing', async () => {
      await expect(
        pluginManager.unloadPlugin('https://not-loaded.example.com/plugin.js')
      ).resolves.not.toThrow();
    });

    it('does NOT emit plugin:destroyed for a non-existent plugin', async () => {
      await pluginManager.unloadPlugin('https://not-loaded.example.com/plugin.js');

      const destroyedCalls = (eventBus.emit as jest.Mock).mock.calls.filter(
        ([event]) => event === 'plugin:destroyed'
      );
      expect(destroyedCalls).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 10. Plugin instance and apiInstance stored on LoadedPlugin
  // ==========================================================================

  describe('LoadedPlugin entry contents', () => {
    it('stores the plugin module instance on LoadedPlugin.instance', async () => {
      const plugin = makePlugin();
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);

      const loaded = await pluginManager.loadPlugin(PLUGIN_URL);

      expect(loaded.instance).toBe(plugin);
    });

    it('stores a PluginApiImpl on LoadedPlugin.apiInstance', async () => {
      const plugin = makePlugin();
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);

      const loaded = await pluginManager.loadPlugin(PLUGIN_URL);

      expect(loaded.apiInstance).toBeInstanceOf(PluginApiImpl);
    });

    it('records the plugin url on LoadedPlugin.url', async () => {
      const plugin = makePlugin();
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);

      const loaded = await pluginManager.loadPlugin(PLUGIN_URL);

      expect(loaded.url).toBe(PLUGIN_URL);
    });

    it('records a loadedAt timestamp', async () => {
      const before = Date.now();
      const plugin = makePlugin();
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);

      const loaded = await pluginManager.loadPlugin(PLUGIN_URL);

      expect(loaded.loadedAt).toBeGreaterThanOrEqual(before);
      expect(loaded.loadedAt).toBeLessThanOrEqual(Date.now());
    });
  });

  // ==========================================================================
  // 11. getPlugin() / isLoaded() query methods
  // ==========================================================================

  describe('query methods', () => {
    it('isLoaded() returns true after loading', async () => {
      const plugin = makePlugin();
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);
      await pluginManager.loadPlugin(PLUGIN_URL);

      expect(pluginManager.isLoaded(PLUGIN_URL)).toBe(true);
    });

    it('isLoaded() returns false for a URL that was never loaded', () => {
      expect(pluginManager.isLoaded('https://not-here.example.com/x.js')).toBe(false);
    });

    it('getPlugin() returns the LoadedPlugin entry by URL', async () => {
      const plugin = makePlugin();
      jest.spyOn(pluginManager as any, 'loadAsModule').mockResolvedValue(plugin);
      await pluginManager.loadPlugin(PLUGIN_URL);

      expect(pluginManager.getPlugin(PLUGIN_URL)).toBeDefined();
      expect(pluginManager.getPlugin(PLUGIN_URL)!.url).toBe(PLUGIN_URL);
    });

    it('getPlugin() returns undefined for an unknown URL', () => {
      expect(pluginManager.getPlugin('https://not-here.example.com/x.js')).toBeUndefined();
    });
  });
});
