jest.mock("mudlet-map-renderer", () => ({
    MapReader: jest.fn(),
    PathFinder: jest.fn(),
}));
jest.mock("../../src/scripts/luaGags", () => jest.fn());

import type { ClientAdapter } from "../../src/Client";
import createRuntimeBootstrap from "../../src/runtime/createRuntimeBootstrap";
import { ServiceRegistry } from "../../src/runtime/service-registry";
import MockTransportAdapter from "./transport/mock-transport-adapter";

function createClientAdapter(): ClientAdapter {
    return {
        send: jest.fn(),
        output: jest.fn(),
        sendGmcp: jest.fn(),
        parseAnsiPatterns: jest.fn((text: string) => text),
        flushMessageBuffer: jest.fn(),
    };
}

describe("createRuntimeBootstrap", () => {
    test("initializes runtime services and exposes runtime handles", () => {
        const registry = new ServiceRegistry();
        const transport = new MockTransportAdapter({ emitLifecycle: false });
        const clientAdapter = createClientAdapter();
        const configureAdapter = jest.fn();

        const port = { onMessage: { addListener: jest.fn() } };

        const registerModules = jest.fn();

        const bootstrap = createRuntimeBootstrap({
            clientAdapter,
            registry,
            parseAnsiPatterns: (text) => `parsed:${text}`,
            transportFactory: () => transport,
            configureAdapter,
            port,
            registerModules,
        });

        expect(registerModules).toHaveBeenCalledTimes(1);
        expect(configureAdapter).toHaveBeenCalledTimes(1);
        expect(configureAdapter).toHaveBeenCalledWith({
            transport,
            router: registry.messageRouter,
            eventHub: registry.eventHub,
        });

        expect(bootstrap.client).toBeDefined();
        expect(bootstrap.eventHub).toBe(registry.eventHub);
        expect(bootstrap.dataCatalog).toBe(registry.dataCatalog);
        expect(bootstrap.catalogs.map).toBe(registry.mapCatalog);
        expect(bootstrap.catalogs.npc).toBe(registry.npcCatalog);
        expect(bootstrap.catalogs.people).toBe(registry.peopleCatalog);
        expect(bootstrap.catalogMetadata.map?.status).toBe("idle");
        expect(bootstrap.catalogMetadata.colors?.status).toBe("idle");
        expect(bootstrap.catalogMetadata.npc?.status).toBe("idle");
        expect(bootstrap.catalogMetadata.people?.status).toBe("idle");
        expect(bootstrap.catalogMetadata.magic).toBeUndefined();
        expect(bootstrap.catalogMetadata.magicKeys).toBeUndefined();
        expect(bootstrap.catalogMetadata.herbs).toBeUndefined();

        bootstrap.commandDispatcher.sendCommand("look", { echo: false });
        expect(clientAdapter.send).toHaveBeenCalledWith("look", false);

        expect(registry.transport).toBe(transport);
        expect(registry.messageRouter).toBe(configureAdapter.mock.calls[0][0].router);

        bootstrap.registry.messageRouter.dispose();
    });
});
