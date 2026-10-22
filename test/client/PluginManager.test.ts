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

  describe('dev server live reload', () => {
    class FakeEventSource {
      static CLOSED = 2;
      static instances: FakeEventSource[] = [];
      listeners: Record<string, (() => void)[]> = {};
      readyState = 0;
      closed = false;
      constructor(public url: URL) {
        FakeEventSource.instances.push(this);
      }
      addEventListener(type: string, listener: () => void) {
        (this.listeners[type] ??= []).push(listener);
      }
      close() {
        this.closed = true;
      }
      fire(type: string) {
        this.listeners[type]?.forEach(listener => listener());
      }
    }

    const load = (url: string) => {
      jest.spyOn(document, 'createElement').mockImplementation(() => makeAutoLoadingScript());
      return pluginManager.loadPlugin(url);
    };

    beforeEach(() => {
      FakeEventSource.instances = [];
      vi.stubGlobal('EventSource', FakeEventSource);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('listens to the esbuild endpoint of a plugin served from localhost', async () => {
      await load('http://localhost:5177/plugin.js');

      expect(FakeEventSource.instances).toHaveLength(1);
      expect(FakeEventSource.instances[0].url.href).toBe('http://localhost:5177/esbuild');
    });

    it('does not listen to plugins from other hosts', async () => {
      await load('https://example.com/plugin.js');

      expect(FakeEventSource.instances).toHaveLength(0);
    });

    it('reloads the plugin on a change and keeps the same stream', async () => {
      const url = 'http://127.0.0.1:5177/plugin.js';
      await load(url);
      const reload = jest.spyOn(pluginManager, 'reloadPlugin');

      FakeEventSource.instances[0].fire('change');
      await vi.waitFor(() => expect(reload).toHaveBeenCalledWith(url));
      await reload.mock.results[0].value;

      expect(FakeEventSource.instances).toHaveLength(1);
      expect(FakeEventSource.instances[0].closed).toBe(false);
    });

    it('drops a stream that never connects and tries again on the next reload', async () => {
      const url = 'http://localhost:8080/plugin.js';
      await load(url);

      FakeEventSource.instances[0].fire('error');
      expect(FakeEventSource.instances[0].closed).toBe(true);

      await pluginManager.reloadPlugin(url);
      expect(FakeEventSource.instances).toHaveLength(2);
      expect(FakeEventSource.instances[1].closed).toBe(false);
    });

    it('keeps retrying a stream that was connected, so a restarted dev server is found', async () => {
      await load('http://localhost:5177/plugin.js');
      const source = FakeEventSource.instances[0];

      source.fire('open');
      source.fire('error');

      expect(source.closed).toBe(false);
    });

    it('closes the stream when the plugin is removed', async () => {
      const url = 'http://localhost:5177/plugin.js';
      await load(url);

      await pluginManager.unloadPlugin(url);

      expect(FakeEventSource.instances[0].closed).toBe(true);
    });
  });
});
