import type Client from '../Client';
import storage from '../storage';
import type { Settings } from '../defaultSettings';
import {
    settingsStore,
    subscribeToSettings,
    subscribeToUiSettings,
    subscribeToBinds,
} from './settingsStore';

const SETTINGS_KEYS = new Set(['settings', 'uiSettings', 'binds'] as const);

type StorageChanges = {
    [key: string]: { oldValue: unknown; newValue: unknown };
};

export interface ClientStorageBridge {
    initialize(): Promise<void>;
    bindClient(client: Client): () => void;
    getSettingsSnapshot(): Settings;
    loadCharacterScopedData(client: Client, keys: string[]): Promise<void>;
    loadScripts(client: Client): Promise<void>;
    setItem(key: string, value: unknown): Promise<void>;
}

function ensureRecord(value: unknown) {
    if (value === undefined || value === null) {
        return {};
    }
    return value;
}

function extractValue(result: any, key: string) {
    if (result && typeof result === 'object' && key in result) {
        return result[key];
    }
    return {};
}

export function createStorageBridge(): ClientStorageBridge {
    let detachFns: Array<() => void> = [];

    return {
        async initialize() {
            await settingsStore.getState().initializeFromStorage();
        },
        bindClient(client: Client) {
            detachFns.forEach(fn => fn());
            detachFns = [];

            const unsubSettings = subscribeToSettings(
                settings => settings,
                (next) => {
                    client.sendEvent('settings', next);
                    client.sendEvent('storage', { key: 'settings', value: next });
                },
                { fireImmediately: true },
            );
            const unsubUi = subscribeToUiSettings(
                ui => ui,
                (next) => {
                    client.sendEvent('uiSettings', next);
                    client.sendEvent('storage', { key: 'uiSettings', value: next });
                },
                { fireImmediately: true },
            );
            const unsubBinds = subscribeToBinds(
                binds => binds,
                (next) => {
                    client.sendEvent('binds', next);
                    client.sendEvent('storage', { key: 'binds', value: next });
                },
                { fireImmediately: true },
            );

            detachFns.push(unsubSettings, unsubUi, unsubBinds);

            const storageListener = (changes: StorageChanges) => {
                Object.entries(changes).forEach(([key, { newValue }]) => {
                    if (SETTINGS_KEYS.has(key as any)) {
                        return;
                    }
                    client.sendEvent('storage', { key, value: newValue });
                });
            };

            storage.onChanged?.addListener(storageListener);

            detachFns.push(() => {
                storage.onChanged?.removeListener?.(storageListener);
            });

            return () => {
                detachFns.forEach(fn => fn());
                detachFns = [];
            };
        },
        getSettingsSnapshot(): Settings {
            return settingsStore.getState().settings;
        },
        async loadCharacterScopedData(client: Client, keys: string[]) {
            const uniqueKeys = Array.from(new Set(keys)).filter(Boolean);
            await Promise.all(uniqueKeys.map(async (key) => {
                const response = await storage.getItem(key);
                const value = extractValue(response, key);
                client.sendEvent('storage', { key, value: ensureRecord(value) });
                if (SETTINGS_KEYS.has(key as any)) {
                    client.sendEvent(key, ensureRecord(value));
                }
            }));
        },
        async loadScripts(client: Client) {
            await this.loadCharacterScopedData(client, ['scripts']);
        },
        async setItem(key: string, value: unknown) {
            await storage.setItem(key, value);
        },
    };
}

export default createStorageBridge;
