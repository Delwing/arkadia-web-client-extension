import { PluginManager } from '@client/PluginManager';
import Client from '@client/Client';
import eventBus from '@modules/core/eventBus';

// Mock eventBus
vi.mock('@modules/core/eventBus', () => ({
  __esModule: true,
  default: {
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  },
}));

// Mock Client
const mockClient = {
  on: jest.fn(),
  emit: jest.fn(),
  Triggers: {},
} as unknown as Client;

// Creates a script element that fires 'load' as soon as an onload handler is
// attached. Avoids the timer race where the event fires before the
// PluginManager's onload listener is wired up.
function makeAutoLoadingScript(): HTMLScriptElement {
  const el = document.createElement('script');
  Object.defineProperty(el, 'onload', {
    configurable: true,
    set(fn: (() => void) | null) {
      if (fn) queueMicrotask(fn);
    },
  });
  return el;
}

describe('PluginManager', () => {
  let pluginManager: PluginManager;

  beforeEach(() => {
    pluginManager = new PluginManager(mockClient);
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create a PluginManager instance', () => {
      expect(pluginManager).toBeInstanceOf(PluginManager);
    });

    it('should start with no loaded plugins', () => {
      expect(pluginManager.getLoadedPlugins()).toEqual([]);
    });
  });

  describe('getLoadedPlugins', () => {
    it('should return empty array initially', () => {
      const plugins = pluginManager.getLoadedPlugins();
      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins.length).toBe(0);
    });
  });

  describe('isLoaded', () => {
    it('should return false for non-loaded plugin', () => {
      expect(pluginManager.isLoaded('https://example.com/plugin.js')).toBe(false);
    });
  });

  describe('getPlugin', () => {
    it('should return undefined for non-existent plugin', () => {
      expect(pluginManager.getPlugin('https://example.com/plugin.js')).toBeUndefined();
    });
  });

  describe('loadPlugin', () => {
    it('should handle loading a legacy script', async () => {
      const url = 'https://example.com/legacy-script.js';

      const mockScriptElement = makeAutoLoadingScript();
      jest.spyOn(document, 'createElement').mockReturnValueOnce(mockScriptElement);

      const plugin = await pluginManager.loadPlugin(url);

      expect(plugin).toBeDefined();
      expect(plugin.url).toBe(url);
      expect(plugin.status).toBe('legacy');
    });

    it('should track loading state', async () => {
      const url = 'https://example.com/script.js';

      const mockScriptElement = makeAutoLoadingScript();
      jest.spyOn(document, 'createElement').mockReturnValueOnce(mockScriptElement);

      const loadPromise = pluginManager.loadPlugin(url);

      // Should be in loading state
      expect(pluginManager.isLoaded(url)).toBe(true);

      await loadPromise;

      // Should still be loaded
      expect(pluginManager.isLoaded(url)).toBe(true);
    });
  });

  describe('unloadPlugin', () => {
    it('should handle unloading non-existent plugin', async () => {
      await expect(pluginManager.unloadPlugin('https://example.com/not-loaded.js')).resolves.not.toThrow();
    });

    it('should emit destroyed event when unloading', async () => {
      const url = 'https://example.com/script.js';

      const mockScriptElement = makeAutoLoadingScript();
      jest.spyOn(document, 'createElement').mockReturnValueOnce(mockScriptElement);

      await pluginManager.loadPlugin(url);
      await pluginManager.unloadPlugin(url);

      expect(eventBus.emit).toHaveBeenCalledWith('plugin:destroyed', { url });
      expect(pluginManager.isLoaded(url)).toBe(false);
    });
  });
});
