import type Client from "../Client";
import type { CommandDispatcher } from "./command-dispatcher";
import type {
    CompositeDataCatalog,
    MapDataCatalog,
    NpcDataCatalog,
    PeopleDataCatalog,
    MagicDataCatalog,
    MagicKeysDataCatalog,
    HerbsDataCatalog,
} from "./data";
import type { EventHub, RuntimeEvents } from "./event-hub";
import type { SettingsService } from "./settings/settings-service";

export interface FeatureModuleContext {
    client: Client;
    eventHub: EventHub<RuntimeEvents>;
    settings: SettingsService;
    commandDispatcher: CommandDispatcher;
    dataCatalog: CompositeDataCatalog;
    catalogs: {
        map: MapDataCatalog;
        npc: NpcDataCatalog;
        people: PeopleDataCatalog;
        magic: MagicDataCatalog;
        magicKeys: MagicKeysDataCatalog;
        herbs: HerbsDataCatalog;
    };
}

export interface FeatureModule {
    id: string;
    register(context: FeatureModuleContext): void | (() => void);
}

export type ModuleRegistry = FeatureModule[];
