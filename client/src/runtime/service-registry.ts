import type { DataCatalog } from './data';
import { DefaultDataCatalog, registerCoreLoaders } from './data';
import type { SettingsService } from './settings/settings-service';
import { LocalStorageSettingsService } from './settings/local-storage-service';

class ServiceRegistry {
    readonly settings: SettingsService;
    readonly dataCatalog: DataCatalog;
    private readonly defaultCatalog: DefaultDataCatalog;

    constructor() {
        this.settings = new LocalStorageSettingsService();
        this.defaultCatalog = new DefaultDataCatalog();
        this.dataCatalog = registerCoreLoaders({ catalog: this.defaultCatalog });
    }

    get defaultDataCatalog(): DefaultDataCatalog {
        return this.defaultCatalog;
    }
}

const services = new ServiceRegistry();

export default services;
export type { ServiceRegistry };
