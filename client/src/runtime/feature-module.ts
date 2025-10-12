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
    DataCatalogEntryMetadata,
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
    catalogMetadata: {
        map: DataCatalogEntryMetadata | undefined;
        npc: DataCatalogEntryMetadata | undefined;
        colors: DataCatalogEntryMetadata | undefined;
        people: DataCatalogEntryMetadata | undefined;
        magic: DataCatalogEntryMetadata | undefined;
        magicKeys: DataCatalogEntryMetadata | undefined;
        herbs: DataCatalogEntryMetadata | undefined;
    };
}

export interface FeatureModule {
    id: string;
    register(context: FeatureModuleContext): void | (() => void);
}

export type ModuleRegistry = FeatureModule[];
