import { DefaultDataCatalog, registerCoreLoaders, registerPeopleLoader } from './data';
import type { SettingsService } from './settings/settings-service';
import { LocalStorageSettingsService } from './settings/local-storage-service';

class ServiceRegistry {
    readonly settings: SettingsService;
    private readonly catalog: DefaultDataCatalog;

    constructor() {
        this.settings = new LocalStorageSettingsService();
        this.catalog = new DefaultDataCatalog();
        registerCoreLoaders({ catalog: this.catalog });
        registerPeopleLoader({ catalog: this.catalog });
    }

    get dataCatalog(): DefaultDataCatalog {
        return this.catalog;
    }
}

const services = new ServiceRegistry();

export default services;
export type { ServiceRegistry };
