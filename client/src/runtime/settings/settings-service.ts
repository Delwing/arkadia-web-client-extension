import { defaultSettings } from '../../defaultSettings';
import { EventHub } from '../event-hub';

export interface Observable<T> {
    subscribe(listener: (value: T) => void): { unsubscribe(): void };
}

export type SettingsSnapshot = (typeof defaultSettings & Record<string, unknown>);

export interface SettingsService {
    readonly settings$: Observable<SettingsSnapshot>;
    update(patch: Partial<SettingsSnapshot>): Promise<void>;
}

export interface SettingsEvents {
    'settings.updated': SettingsSnapshot;
    'settings.error': Error;
}

export const settingsEventHub = new EventHub<SettingsEvents>();
