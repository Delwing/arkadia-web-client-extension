import storage from '../storage';
import type { Settings } from '../defaultSettings';
import type { HerbBagsState } from '../types/herbs';
import { settingsStore } from './settingsStore';
import type { UiSettingsState } from './settingsStore';

export interface ScriptStore {
    getSettingsSnapshot(): Settings;
    updateSettings(partial: Partial<Settings>): Promise<void>;
    updateUiSettings(partial: Partial<UiSettingsState>): Promise<void>;
    setStorageItem<T>(key: string, value: T): Promise<void>;
    getStorageItem<T>(key: string): Promise<T | undefined>;
    updateHerbCounts(value: HerbBagsState): Promise<void>;
    subscribeStorage<T>(key: string, listener: (value: T | undefined) => void): () => void;
}

type ClientLike = {
    sendEvent(type: string, detail?: unknown): void;
};

function extractValue<T>(key: string, response: any): T | undefined {
    if (response && typeof response === 'object' && key in response) {
        return response[key] as T;
    }
    return undefined;
}

const domainEvents: Record<string, (client: ClientLike, value: unknown) => void> = {
    herb_counts: (client, value) => {
        client.sendEvent('herbCounts', structuredClone(value));
    },
};

export function createClientStore(client: ClientLike): ScriptStore {
    const emitDomainEvent = (key: string, value: unknown) => {
        const handler = domainEvents[key];
        if (handler) {
            handler(client, value);
        }
    };

    const getSettingsSnapshot = () => settingsStore.getState().settings;

    const updateSettings = async (partial: Partial<Settings>) => {
        await settingsStore.getState().updateSettings(partial);
    };

    const updateUiSettings = async (partial: Partial<UiSettingsState>) => {
        await settingsStore.getState().updateUiSettings(partial);
    };

    const setStorageItem = async <T>(key: string, value: T) => {
        await storage.setItem(key, value);
        emitDomainEvent(key, value);
    };

    const getStorageItem = async <T>(key: string) => {
        const response = await storage.getItem(key);
        return extractValue<T>(key, response);
    };

    const subscribeStorage = <T>(key: string, listener: (value: T | undefined) => void) => {
        const handler = (changes: { [k: string]: { newValue: unknown } }) => {
            if (key in changes) {
                const next = changes[key]?.newValue as T | undefined;
                Promise.resolve().then(() => listener(next));
            }
        };
        storage.onChanged?.addListener(handler);
        return () => {
            storage.onChanged?.removeListener?.(handler);
        };
    };

    const updateHerbCounts = async (value: HerbBagsState) => {
        await setStorageItem('herb_counts', value);
    };

    return {
        getSettingsSnapshot,
        updateSettings,
        updateUiSettings,
        setStorageItem,
        getStorageItem,
        updateHerbCounts,
        subscribeStorage,
    };
}

export function getClientStore<T extends ClientLike & { store?: ScriptStore }>(client: T): ScriptStore {
    if (client.store) {
        return client.store;
    }
    const store = createClientStore(client);
    (client as any).store = store;
    return store;
}
