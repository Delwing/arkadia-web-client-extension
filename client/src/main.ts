import Client from "./Client";
import ClientRuntime from "./runtime/client-runtime";
import type { ClientContext } from "./runtime/client-runtime";
import type { CommandDispatcher } from "./runtime/command-dispatcher";
import { ClientCommandDispatcher } from "./runtime/command-dispatcher";
import type { DefaultDataCatalog } from "./runtime/data";
import { runtimeEventHub, type EventHub, type RuntimeEvents } from "./runtime/event-hub";
import { registerLegacyModules } from "./runtime/modules/legacy-modules";
import services from "./runtime/service-registry";
import type { SettingsService } from "./runtime/settings/settings-service";

export interface RuntimeDependencies {
    client: Client;
    eventHub?: EventHub<RuntimeEvents>;
    settingsService?: SettingsService;
    dataCatalog?: DefaultDataCatalog;
    commandDispatcher?: CommandDispatcher;
}

function buildContext({
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
    const context = buildContext(options);
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
