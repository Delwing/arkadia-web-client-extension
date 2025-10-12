import { DefaultDataCatalog, registerCoreLoaders, registerPeopleLoader } from "./data";
import type { DataCatalogEntryMetadata } from "./data";
import type { EventHub } from "./event-hub";
import { runtimeEventHub } from "./event-hub";
import type { RuntimeEvents } from "./event-hub";
import { ClientCommandDispatcher } from "./command-dispatcher";
import type { CommandDispatcher } from "./command-dispatcher";
import WebSocketTransportAdapter from "./transport/websocket-adapter";
import MessageRouter from "./transport/message-router";
import type { MessageRouterOptions } from "./transport/message-router";
import type { TransportAdapter } from "./transport/types";
import type Client from "../Client";
import type { SettingsService } from "./settings/settings-service";
import { LocalStorageSettingsService } from "./settings/local-storage-service";

export type RouterConfiguration = Pick<MessageRouterOptions, "parseAnsiPatterns" | "transformLine">;
type TransportFactory = () => TransportAdapter;
type CommandDispatcherFactory = (client: Client) => CommandDispatcher;

export interface ServiceRegistryOptions {
    transportFactory?: TransportFactory;
    eventHub?: EventHub<RuntimeEvents>;
    commandDispatcherFactory?: CommandDispatcherFactory;
    router?: RouterConfiguration;
}

class ServiceRegistry {
    readonly settings: SettingsService;
    private readonly catalog: DefaultDataCatalog;
    private readonly internalEventHub: EventHub<RuntimeEvents>;

    private transportFactory: TransportFactory;
    private transportInstance?: TransportAdapter;

    private routerConfig: RouterConfiguration;
    private router?: MessageRouter;

    private readonly commandDispatcherFactory: CommandDispatcherFactory;
    private commandDispatcher?: CommandDispatcher;
    private commandDispatcherClient?: Client;

    constructor(options: ServiceRegistryOptions = {}) {
        this.settings = new LocalStorageSettingsService();
        this.catalog = new DefaultDataCatalog();
        registerCoreLoaders({ catalog: this.catalog });
        registerPeopleLoader({ catalog: this.catalog });

        this.internalEventHub = options.eventHub ?? runtimeEventHub;
        this.transportFactory = options.transportFactory ?? (() => new WebSocketTransportAdapter());
        this.routerConfig = options.router ?? {
            parseAnsiPatterns: (text: string) => text,
            transformLine: undefined,
        };
        this.commandDispatcherFactory = options.commandDispatcherFactory ?? ((client) => new ClientCommandDispatcher(client));
    }

    get dataCatalog(): DefaultDataCatalog {
        return this.catalog;
    }

    get eventHub(): EventHub<RuntimeEvents> {
        return this.internalEventHub;
    }

    get transport(): TransportAdapter {
        if (!this.transportInstance) {
            this.transportInstance = this.transportFactory();
        }
        return this.transportInstance;
    }

    get messageRouter(): MessageRouter {
        if (!this.router) {
            this.router = new MessageRouter(this.transport, this.internalEventHub, {
                parseAnsiPatterns: this.routerConfig.parseAnsiPatterns,
                transformLine: this.routerConfig.transformLine,
            });
        }
        return this.router;
    }

    configureTransport(factory: TransportFactory): void {
        if (this.transportInstance) {
            throw new Error("Transport adapter has already been instantiated.");
        }
        this.transportFactory = factory;
    }

    configureMessageRouter(options: RouterConfiguration): MessageRouter {
        this.routerConfig = {
            parseAnsiPatterns: options.parseAnsiPatterns,
            transformLine: Object.prototype.hasOwnProperty.call(options, "transformLine")
                ? options.transformLine
                : this.routerConfig.transformLine,
        };

        if (!this.router) {
            this.router = new MessageRouter(this.transport, this.internalEventHub, {
                parseAnsiPatterns: this.routerConfig.parseAnsiPatterns,
                transformLine: this.routerConfig.transformLine,
            });
        } else if (Object.prototype.hasOwnProperty.call(options, "transformLine")) {
            this.router.setLineTransform(this.routerConfig.transformLine);
        }

        return this.router;
    }

    getCommandDispatcher(client: Client): CommandDispatcher {
        if (!this.commandDispatcher || this.commandDispatcherClient !== client) {
            this.commandDispatcher = this.commandDispatcherFactory(client);
            this.commandDispatcherClient = client;
        }
        return this.commandDispatcher;
    }

    getCatalogMetadata(): {
        map: DataCatalogEntryMetadata | undefined;
        npc: DataCatalogEntryMetadata | undefined;
        colors: DataCatalogEntryMetadata | undefined;
    } {
        return {
            map: this.catalog.getMapMetadata(),
            npc: this.catalog.getNpcMetadata(),
            colors: this.catalog.getColorMetadata(),
        };
    }
}

const services = new ServiceRegistry();

export default services;
export { ServiceRegistry };
