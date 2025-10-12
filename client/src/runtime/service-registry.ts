import type { SettingsService } from './settings/settings-service';
import { LocalStorageSettingsService } from './settings/local-storage-service';

class ServiceRegistry {
    readonly settings: SettingsService = new LocalStorageSettingsService();
}

const services = new ServiceRegistry();

export default services;
export type { ServiceRegistry };
