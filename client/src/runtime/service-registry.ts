import type { DataCatalog } from './data';
import { DefaultDataCatalog, registerCoreLoaders } from './data';
import type { SettingsService } from './settings/settings-service';
import { LocalStorageSettingsService } from './settings/local-storage-service';

class ServiceRegistry {
    readonly settings: SettingsService;
    readonly dataCatalog: DataCatalog;

    constructor() {
        this.settings = new LocalStorageSettingsService();
        this.dataCatalog = registerCoreLoaders({ catalog: new DefaultDataCatalog() });
    }
}

const services = new ServiceRegistry();

export default services;
export type { ServiceRegistry };
