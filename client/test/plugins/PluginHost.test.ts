import PluginHost from "../../src/plugins/PluginHost";
import type Client from "../../src/Client";
import type { PluginAPI } from "../../src/plugins/api";

describe("PluginHost", () => {
    function createClientStub(): Client {
        const listeners = new Map<string, Set<(ev: CustomEvent) => void>>();
        return {
            sendCommand: jest.fn(),
            send: jest.fn(),
            addEventListener: jest.fn().mockImplementation((event: string, listener: (ev: CustomEvent) => void) => {
                if (!listeners.has(event)) {
                    listeners.set(event, new Set());
                }
                listeners.get(event)!.add(listener);
                return () => {
                    listeners.get(event)?.delete(listener);
                };
            }),
            removeEventListener: jest.fn().mockImplementation((event: string, listener: EventListenerOrEventListenerObject | null) => {
                if (!listener) {
                    listeners.delete(event);
                    return;
                }
                listeners.get(event)?.delete(listener as (ev: CustomEvent) => void);
            }),
            sendEvent: jest.fn(),
            print: jest.fn(),
            println: jest.fn(),
        } as unknown as Client;
    }

    async function flushPromises() {
        await Promise.resolve();
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    test("registers and disposes plugins by URL", async () => {
        const client = createClientStub();
        const host = new PluginHost(client);
        host.attachToWindow();

        const scriptUrl = "https://example.com/plugin.js";
        const script = document.createElement("script");
        script.dataset.arkadiaPluginUrl = scriptUrl;
        Object.defineProperty(document, "currentScript", {
            configurable: true,
            value: script,
        });

        let cleanupCount = 0;
        const setup = jest.fn((_api: PluginAPI) => {
            return () => {
                cleanupCount++;
            };
        });
        const dispose = jest.fn();

        window.registerArkadiaPlugin?.({
            name: "sample",
            setup,
            dispose,
        });
        await flushPromises();

        expect(setup).toHaveBeenCalledTimes(1);
        expect(host.getRegisteredUrls()).toEqual([scriptUrl]);
        expect(cleanupCount).toBe(0);
        expect(dispose).not.toHaveBeenCalled();

        window.registerArkadiaPlugin?.({
            name: "sample",
            setup,
            dispose,
        });
        await flushPromises();

        expect(setup).toHaveBeenCalledTimes(2);
        expect(cleanupCount).toBe(1);
        expect(dispose).toHaveBeenCalledTimes(1);
        expect(host.getRegisteredUrls()).toEqual([scriptUrl]);

        await host.dispose(scriptUrl);
        await flushPromises();

        expect(cleanupCount).toBe(2);
        expect(dispose).toHaveBeenCalledTimes(2);
        expect(host.getRegisteredUrls()).toEqual([]);
    });
});
