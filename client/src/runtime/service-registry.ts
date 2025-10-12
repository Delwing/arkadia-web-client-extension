import type Client from "../Client";
import { ClientCommandDispatcher } from "./command-dispatcher";
import type { CommandDispatcher } from "./command-dispatcher";
import {
    CompositeDataCatalog,
    MapDataCatalog,
    NpcDataCatalog,
    PeopleDataCatalog,
    MagicDataCatalog,
    MagicKeysDataCatalog,
    HerbsDataCatalog,
    registerCoreLoaders,
    registerPeopleLoader,
    MAP_DATASET_KEY,
    COLORS_DATASET_KEY,
    NPC_DATASET_KEY,
    PEOPLE_DATASET_KEY,
    MAGIC_DATASET_KEY,
    MAGIC_KEYS_DATASET_KEY,
    HERBS_DATASET_KEY,
} from "./data";
import type { EventHub } from "./event-hub";
import { runtimeEventHub } from "./event-hub";
import type { RuntimeEvents } from "./event-hub";
import type { SettingsService } from "./settings/settings-service";
import { LocalStorageSettingsService } from "./settings/local-storage-service";
import type { MessageRouterOptions } from "./transport/message-router";
import MessageRouter from "./transport/message-router";
import type { TransportAdapter } from "./transport/types";
import WebSocketTransportAdapter from "./transport/websocket-adapter";

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
    private readonly catalog: CompositeDataCatalog;
    private readonly mapCatalogInstance: MapDataCatalog;
    private readonly npcCatalogInstance: NpcDataCatalog;
    private readonly peopleCatalogInstance: PeopleDataCatalog;
    private readonly magicCatalogInstance: MagicDataCatalog;
    private readonly magicKeysCatalogInstance: MagicKeysDataCatalog;
    private readonly herbsCatalogInstance: HerbsDataCatalog;
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
        this.mapCatalogInstance = new MapDataCatalog();
        this.npcCatalogInstance = new NpcDataCatalog();
        this.peopleCatalogInstance = new PeopleDataCatalog();
        this.magicCatalogInstance = new MagicDataCatalog();
        this.magicKeysCatalogInstance = new MagicKeysDataCatalog();
        this.herbsCatalogInstance = new HerbsDataCatalog();

        this.catalog = new CompositeDataCatalog([
            { keys: [MAP_DATASET_KEY, COLORS_DATASET_KEY], catalog: this.mapCatalogInstance },
            { keys: [NPC_DATASET_KEY], catalog: this.npcCatalogInstance },
            { keys: [PEOPLE_DATASET_KEY], catalog: this.peopleCatalogInstance },
            { keys: [MAGIC_DATASET_KEY], catalog: this.magicCatalogInstance },
            { keys: [MAGIC_KEYS_DATASET_KEY], catalog: this.magicKeysCatalogInstance },
            { keys: [HERBS_DATASET_KEY], catalog: this.herbsCatalogInstance },
        ]);

        registerCoreLoaders({
            mapCatalog: this.mapCatalogInstance,
            npcCatalog: this.npcCatalogInstance,
        });
        registerPeopleLoader({ catalog: this.peopleCatalogInstance });

        this.internalEventHub = options.eventHub ?? runtimeEventHub;
        this.transportFactory = options.transportFactory ?? (() => new WebSocketTransportAdapter());
        this.routerConfig = options.router ?? {
            parseAnsiPatterns: (text: string) => text,
            transformLine: undefined,
        };
        this.commandDispatcherFactory = options.commandDispatcherFactory ?? ((client) => new ClientCommandDispatcher(client));
    }

    get dataCatalog(): CompositeDataCatalog {
        return this.catalog;
    }

    get mapCatalog(): MapDataCatalog {
        return this.mapCatalogInstance;
    }

    get npcCatalog(): NpcDataCatalog {
        return this.npcCatalogInstance;
    }

    get peopleCatalog(): PeopleDataCatalog {
        return this.peopleCatalogInstance;
    }

    get magicCatalog(): MagicDataCatalog {
        return this.magicCatalogInstance;
    }

    get magicKeysCatalog(): MagicKeysDataCatalog {
        return this.magicKeysCatalogInstance;
    }

    get herbsCatalog(): HerbsDataCatalog {
        return this.herbsCatalogInstance;
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

}

const services = new ServiceRegistry();

export default services;
export { ServiceRegistry };
