/**
 * Behavioural tests for the GMCP inspector example plugin.
 *
 * The plugin is driven through a PluginApi double rather than the real
 * PluginApiImpl (that lifecycle is already covered by
 * test/client/PluginManager.integration.test.ts). What matters here is the
 * plugin's own contract: it must not listen to GMCP until the user opens the
 * window, and it must unsubscribe on destroy — `api.events.on` is a plain
 * passthrough to `client.on`, so nothing cleans the listener up for it.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

type GmcpListener = (data: { path?: string; value?: unknown }) => void;

interface PopupDouble {
    id: string;
    title: string;
    createContent: () => Node | Promise<Node>;
    open: ReturnType<typeof vi.fn>;
    wasRestored: boolean;
}

function makeApi(opts: { wasRestored?: boolean } = {}) {
    const listeners = new Map<string, Set<GmcpListener>>();
    let popup: PopupDouble | null = null;
    let menuEntry: { label: string; onSelect: () => void } | null = null;

    const api = {
        events: {
            on: vi.fn((event: string, listener: GmcpListener) => {
                if (!listeners.has(event)) listeners.set(event, new Set());
                listeners.get(event)!.add(listener);
            }),
            off: vi.fn((event: string, listener: GmcpListener) => {
                listeners.get(event)?.delete(listener);
            }),
            emit: vi.fn(),
        },
        ui: {
            registerPersistentPopup: vi.fn(async (config: any) => {
                popup = {
                    id: config.id,
                    title: config.title,
                    createContent: config.createContent,
                    open: vi.fn(async () => {}),
                    wasRestored: !!opts.wasRestored,
                };
                return popup;
            }),
            addPopupMenuEntry: vi.fn((label: string, onSelect: () => void) => {
                menuEntry = { label, onSelect };
                return { remove: vi.fn() };
            }),
        },
    };

    return {
        api,
        listenerCount: (event: string) => listeners.get(event)?.size ?? 0,
        fire: (event: string, payload: { path?: string; value?: unknown }) => {
            listeners.get(event)?.forEach(l => l(payload));
        },
        getPopup: () => popup,
        getMenuEntry: () => menuEntry,
    };
}

async function loadPlugin() {
    vi.resetModules();
    return import('../../examples/gmcp-inspector-plugin');
}

describe('gmcp-inspector example plugin', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('registers a persistent popup and a menu entry on init', async () => {
        const plugin = await loadPlugin();
        const h = makeApi();

        const info = await plugin.init(h.api as any);

        expect(h.getPopup()?.id).toBe('gmcp-inspector');
        expect(h.getMenuEntry()?.label).toBe('Inspektor GMCP');
        expect(info.name).toBe('Inspektor GMCP');

        await plugin.destroy();
    });

    test('does not subscribe to gmcp until the window is opened', async () => {
        const plugin = await loadPlugin();
        const h = makeApi();

        await plugin.init(h.api as any);
        expect(h.listenerCount('gmcp')).toBe(0);

        h.getMenuEntry()!.onSelect();
        expect(h.listenerCount('gmcp')).toBe(1);
        expect(h.getPopup()!.open).toHaveBeenCalled();

        await plugin.destroy();
    });

    test('subscribes immediately when the popup was restored from a previous session', async () => {
        const plugin = await loadPlugin();
        const h = makeApi({ wasRestored: true });

        await plugin.init(h.api as any);

        expect(h.listenerCount('gmcp')).toBe(1);

        await plugin.destroy();
    });

    test('opening twice does not stack duplicate listeners', async () => {
        const plugin = await loadPlugin();
        const h = makeApi();

        await plugin.init(h.api as any);
        h.getMenuEntry()!.onSelect();
        h.getMenuEntry()!.onSelect();

        expect(h.listenerCount('gmcp')).toBe(1);

        await plugin.destroy();
    });

    test('renders received gmcp events into the popup content', async () => {
        const plugin = await loadPlugin();
        const h = makeApi();

        await plugin.init(h.api as any);
        h.getMenuEntry()!.onSelect();

        const content = (await h.getPopup()!.createContent()) as HTMLElement;
        h.fire('gmcp', { path: 'char.vitals', value: { hp: 100 } });

        const log = content.querySelector('pre')!;
        expect(log.textContent).toContain('char.vitals');
        expect(log.textContent).toContain('"hp": 100');

        await plugin.destroy();
    });

    test('destroy unsubscribes the gmcp listener', async () => {
        const plugin = await loadPlugin();
        const h = makeApi();

        await plugin.init(h.api as any);
        h.getMenuEntry()!.onSelect();
        expect(h.listenerCount('gmcp')).toBe(1);

        await plugin.destroy();

        expect(h.api.events.off).toHaveBeenCalledWith('gmcp', expect.any(Function));
        expect(h.listenerCount('gmcp')).toBe(0);
    });

    test('destroy is safe when the window was never opened', async () => {
        const plugin = await loadPlugin();
        const h = makeApi();

        await plugin.init(h.api as any);
        await expect(plugin.destroy()).resolves.toBeUndefined();
        expect(h.api.events.off).not.toHaveBeenCalled();
    });
});
