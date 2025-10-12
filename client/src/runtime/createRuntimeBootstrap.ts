import Client from "../Client";
import type { ClientAdapter } from "../Client";

import type { CommandDispatcher } from "./command-dispatcher";
import type { DefaultDataCatalog, DataCatalogEntryMetadata } from "./data";
import type { EventHub, RuntimeEvents } from "./event-hub";
import type MessageRouter from "./transport/message-router";
import type { TransportAdapter } from "./transport/types";
import services, { ServiceRegistry } from "./service-registry";

interface AdapterConfiguration {
    transport: TransportAdapter;
    router: MessageRouter;
    eventHub: EventHub<RuntimeEvents>;
}

export interface RuntimeBootstrapOptions {
    clientAdapter: ClientAdapter;
    port?: unknown;
    parseAnsiPatterns: (text: string) => string;
    transformLine?: (text: string, type: string) => string;
    registry?: ServiceRegistry;
    transportFactory?: () => TransportAdapter;
    configureAdapter?: (configuration: AdapterConfiguration) => void;
}

export interface RuntimeBootstrapResult {
    registry: ServiceRegistry;
    client: Client;
    eventHub: EventHub<RuntimeEvents>;
    commandDispatcher: CommandDispatcher;
    dataCatalog: DefaultDataCatalog;
    catalogMetadata: {
        map: DataCatalogEntryMetadata | undefined;
        npc: DataCatalogEntryMetadata | undefined;
        colors: DataCatalogEntryMetadata | undefined;
    };
}

export function createRuntimeBootstrap(options: RuntimeBootstrapOptions): RuntimeBootstrapResult {
    const registry = options.registry ?? services;

    if (options.transportFactory) {
        registry.configureTransport(options.transportFactory);
    }

    const eventHub = registry.eventHub;
    const client = new Client(options.clientAdapter, options.port, eventHub);

    const hasTransformOverride = Object.prototype.hasOwnProperty.call(options, "transformLine");
    const transformLine = hasTransformOverride ? options.transformLine : client.onLine.bind(client);

    const router = registry.configureMessageRouter({
        parseAnsiPatterns: options.parseAnsiPatterns,
        transformLine,
    });

    options.configureAdapter?.({
        transport: registry.transport,
        router,
        eventHub,
    });

    const commandDispatcher = registry.getCommandDispatcher(client);

    return {
        registry,
        client,
        eventHub,
        commandDispatcher,
        dataCatalog: registry.dataCatalog,
        catalogMetadata: registry.getCatalogMetadata(),
    };
}

export default createRuntimeBootstrap;
