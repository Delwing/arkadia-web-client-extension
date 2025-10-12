import type Client from "../Client";
import ClientRuntime, { type ClientContext } from "./client-runtime";
import type { CommandDispatcher } from "./command-dispatcher";
import { ClientCommandDispatcher } from "./command-dispatcher";
import type { DefaultDataCatalog } from "./data";
import { runtimeEventHub, type EventHub, type RuntimeEvents } from "./event-hub";
import { registerLegacyModules } from "./modules/legacy-modules";
import services from "./service-registry";
import type { SettingsService } from "./settings/settings-service";

export interface RuntimeDependencies {
    client: Client;
    eventHub?: EventHub<RuntimeEvents>;
    settingsService?: SettingsService;
    dataCatalog?: DefaultDataCatalog;
    commandDispatcher?: CommandDispatcher;
}

export function createClientContext({
    client,
    eventHub = runtimeEventHub,
    settingsService = services.settings,
    dataCatalog = services.dataCatalog,
    commandDispatcher = new ClientCommandDispatcher(client),
}: RuntimeDependencies): ClientContext {
    return {
        client,
        eventHub,
        settings: settingsService,
        dataCatalog,
        commands: commandDispatcher,
    };
}

export function createClientRuntime(options: RuntimeDependencies): ClientRuntime {
    const context = createClientContext(options);
    const runtime = new ClientRuntime(context);
    registerLegacyModules(runtime);
    return runtime;
}

export function registerScripts(client: Client): ClientRuntime {
    const runtime = createClientRuntime({ client });
    runtime.initialise();
    return runtime;
}

export type { ClientContext };
