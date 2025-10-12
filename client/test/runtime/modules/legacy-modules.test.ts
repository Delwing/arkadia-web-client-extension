jest.mock("mudlet-map-renderer", () => ({
    MapReader: jest.fn(),
    PathFinder: jest.fn(),
}));
jest.mock("../../../src/scripts/luaGags", () => jest.fn());

import type { ClientAdapter } from "../../../src/Client";
import Client from "../../../src/Client";
import Triggers from "../../../src/Triggers";
import createRuntimeBootstrap from "../../../src/runtime/createRuntimeBootstrap";
import { ServiceRegistry } from "../../../src/runtime/service-registry";
import { registerLegacyModules } from "../../../src/runtime/modules";
import MockTransportAdapter from "../transport/mock-transport-adapter";

function createClientAdapter(): ClientAdapter {
    return {
        send: jest.fn(),
        output: jest.fn(),
        sendGmcp: jest.fn(),
        parseAnsiPatterns: jest.fn((text: string) => text),
        flushMessageBuffer: jest.fn(),
    };
}

describe("registerLegacyModules", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("registers legacy triggers and listeners during bootstrap", () => {
        const registry = new ServiceRegistry();
        const transport = new MockTransportAdapter({ emitLifecycle: false });
        const clientAdapter = createClientAdapter();

        const registerTriggerSpy = jest.spyOn(Triggers.prototype, "registerTrigger");
        const multilineSpy = jest.spyOn(Triggers.prototype, "registerMultilineTrigger");
        const addEventListenerSpy = jest.spyOn(Client.prototype, "addEventListener");

        const port = { onMessage: { addListener: jest.fn() }, postMessage: jest.fn() };

        const bootstrap = createRuntimeBootstrap({
            clientAdapter,
            registry,
            parseAnsiPatterns: (text) => text,
            transportFactory: () => transport,
            registerModules: registerLegacyModules,
            port,
        });

        expect(registerTriggerSpy).toHaveBeenCalled();
        expect(multilineSpy).toHaveBeenCalled();
        expect(addEventListenerSpy).toHaveBeenCalled();
        expect(bootstrap.client.aliases.length).toBeGreaterThan(0);

        bootstrap.registry.messageRouter.dispose();
    });
});
