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

    test("registers and disposes plugins by URL", async () => {
        const client = createClientStub();
        const host = new PluginHost(client);
        const scriptUrl = "https://example.com/plugin.js";

        let cleanupCount = 0;
        const setup = jest.fn((api: PluginAPI) => {
            expect(api.client.extension).toBe(client);
            return () => {
                cleanupCount++;
            };
        });
        const dispose = jest.fn();

        await host.register(scriptUrl, {
            name: "sample",
            setup,
            dispose,
        });

        expect(setup).toHaveBeenCalledTimes(1);
        expect(host.getRegisteredUrls()).toEqual([scriptUrl]);
        expect(cleanupCount).toBe(0);
        expect(dispose).not.toHaveBeenCalled();

        await host.register(scriptUrl, {
            name: "sample",
            setup,
            dispose,
        });

        expect(setup).toHaveBeenCalledTimes(2);
        expect(cleanupCount).toBe(1);
        expect(dispose).toHaveBeenCalledTimes(1);
        expect(host.getRegisteredUrls()).toEqual([scriptUrl]);

        await host.dispose(scriptUrl);

        expect(cleanupCount).toBe(2);
        expect(dispose).toHaveBeenCalledTimes(2);
        expect(host.getRegisteredUrls()).toEqual([]);
    });
});
