import type Client from "../../src/Client";
import type { DefaultDataCatalog } from "../../src/runtime/data";
import type { CommandDispatcher } from "../../src/runtime/command-dispatcher";
import type { SettingsService } from "../../src/runtime/settings/settings-service";
import { ClientCommandDispatcher } from "../../src/runtime/command-dispatcher";
import ClientRuntime from "../../src/runtime/client-runtime";
import {
    createClientContext,
    createClientRuntime,
    registerScripts,
} from "../../src/runtime/bootstrap";
import { runtimeEventHub, EventHub, type RuntimeEvents } from "../../src/runtime/event-hub";
import services from "../../src/runtime/service-registry";

jest.mock("../../src/runtime/modules/legacy-modules", () => ({
    __esModule: true,
    registerLegacyModules: jest.fn(),
}));

const { registerLegacyModules } = jest.requireMock("../../src/runtime/modules/legacy-modules") as {
    registerLegacyModules: jest.Mock;
};

describe("runtime bootstrap", () => {
    const createStubClient = (): Client => ({
        sendCommand: jest.fn(),
        sendEvent: jest.fn(),
        port: undefined,
    } as unknown as Client);

    beforeEach(() => {
        registerLegacyModules.mockClear();
    });

    it("creates a client context with default services", () => {
        const client = createStubClient();

        const context = createClientContext({ client });

        expect(context.client).toBe(client);
        expect(context.eventHub).toBe(runtimeEventHub);
        expect(context.settings).toBe(services.settings);
        expect(context.dataCatalog).toBe(services.dataCatalog);
        expect(context.commands).toBeInstanceOf(ClientCommandDispatcher);

        const second = createClientContext({ client });
        expect(second.commands).not.toBe(context.commands);
        expect(second.commands).toBeInstanceOf(ClientCommandDispatcher);
    });

    it("allows overriding dependencies when creating the context", () => {
        const client = createStubClient();
        const eventHub = new EventHub<RuntimeEvents>();
        const settingsService = {
            settings$: {
                subscribe: () => ({ unsubscribe() {} }),
            },
            update: jest.fn(),
        } as unknown as SettingsService;
        const dataCatalog = {} as DefaultDataCatalog;
        const commandDispatcher = {
            sendCommand: jest.fn(),
            sendEvent: jest.fn(),
            sendExtensionCommand: jest.fn(() => true),
        } as unknown as CommandDispatcher;

        const context = createClientContext({
            client,
            eventHub,
            settingsService,
            dataCatalog,
            commandDispatcher,
        });

        expect(context.eventHub).toBe(eventHub);
        expect(context.settings).toBe(settingsService);
        expect(context.dataCatalog).toBe(dataCatalog);
        expect(context.commands).toBe(commandDispatcher);
    });

    it("creates a runtime and registers legacy modules", () => {
        const client = createStubClient();
        const eventHub = new EventHub<RuntimeEvents>();
        const settingsService = {
            settings$: {
                subscribe: () => ({ unsubscribe() {} }),
            },
            update: jest.fn(),
        } as unknown as SettingsService;
        const dataCatalog = {} as DefaultDataCatalog;
        const commandDispatcher = {
            sendCommand: jest.fn(),
            sendEvent: jest.fn(),
            sendExtensionCommand: jest.fn(() => true),
        } as unknown as CommandDispatcher;

        const runtime = createClientRuntime({
            client,
            eventHub,
            settingsService,
            dataCatalog,
            commandDispatcher,
        });

        expect(runtime).toBeInstanceOf(ClientRuntime);
        expect(registerLegacyModules).toHaveBeenCalledWith(runtime);
        expect(runtime.getContext()).toEqual({
            client,
            eventHub,
            settings: settingsService,
            dataCatalog,
            commands: commandDispatcher,
        });
    });

    it("initialises modules when registerScripts is invoked", () => {
        const client = createStubClient();
        const initialiseSpy = jest.spyOn(ClientRuntime.prototype, "initialise");

        try {
            const runtime = registerScripts(client);
            expect(runtime).toBeInstanceOf(ClientRuntime);
            expect(initialiseSpy).toHaveBeenCalled();
        } finally {
            initialiseSpy.mockRestore();
        }
    });
});
