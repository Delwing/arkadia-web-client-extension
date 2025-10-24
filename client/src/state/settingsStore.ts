import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';

import storage, { getItemSync } from '../storage';
import { defaultSettings, Settings } from '../defaultSettings';

export type StoreStatus = 'idle' | 'loading' | 'ready' | 'error';

export type UiSettingsState = Record<string, unknown>;
export type BindsState = Record<string, unknown>;

type InternalKey = 'settings' | 'uiSettings' | 'binds';

export type SubscribeOptions<T> = {
    fireImmediately?: boolean;
    equalityFn?: (a: T, b: T) => boolean;
};

export interface SettingsStoreState {
    settings: Settings;
    uiSettings: UiSettingsState;
    binds: BindsState;
    status: StoreStatus;
    initializeFromStorage: () => Promise<void>;
    updateSettings: (partial: Partial<Settings>) => Promise<void>;
    updateUiSettings: (partial: Partial<UiSettingsState>) => Promise<void>;
    updateBinds: (partial: Partial<BindsState>) => Promise<void>;
}

const internalUpdates = new Set<InternalKey>();

function markInternalUpdate(key: InternalKey) {
    internalUpdates.add(key);
    Promise.resolve().then(() => internalUpdates.delete(key));
}

function isInternalUpdate(key: InternalKey) {
    return internalUpdates.has(key);
}

function parseMaybeObject<T extends Record<string, unknown>>(value: unknown): Partial<T> | undefined {
    if (!value) {
        return undefined;
    }
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as Partial<T>;
            }
        } catch {
            return undefined;
        }
        return undefined;
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
        return { ...(value as Partial<T>) };
    }
    return undefined;
}

function mergeWithDefaults(overrides?: Partial<Settings>): Settings {
    return { ...defaultSettings, ...(overrides || {}) };
}

function normalizeSettings(value: unknown): Settings {
    return mergeWithDefaults(parseMaybeObject<Settings>(value));
}

function normalizeRecord(value: unknown): Record<string, unknown> {
    return { ...(parseMaybeObject<Record<string, unknown>>(value) || {}) };
}

export const settingsStore = createStore<SettingsStoreState>()(
    subscribeWithSelector((set, get) => ({
        settings: { ...defaultSettings },
        uiSettings: {},
        binds: {},
        status: 'idle',
        initializeFromStorage: async () => {
            const currentStatus = get().status;
            if (currentStatus === 'loading') {
                return;
            }
            const syncSettings = normalizeSettings(getItemSync('settings')?.settings);
            const syncUiSettings = normalizeRecord(getItemSync('uiSettings')?.uiSettings);
            const syncBinds = normalizeRecord(getItemSync('binds')?.binds);
            set(state => ({
                ...state,
                status: 'loading',
                settings: syncSettings,
                uiSettings: Object.keys(syncUiSettings).length > 0
                    ? { ...state.uiSettings, ...syncUiSettings }
                    : state.uiSettings,
                binds: Object.keys(syncBinds).length > 0
                    ? { ...state.binds, ...syncBinds }
                    : state.binds,
            }));
            try {
                const [settingsData, uiData, bindsData] = await Promise.all([
                    storage.getItem('settings'),
                    storage.getItem('uiSettings'),
                    storage.getItem('binds'),
                ]);
                const normalizedUi = uiData && 'uiSettings' in uiData
                    ? normalizeRecord(uiData.uiSettings)
                    : undefined;
                const normalizedBinds = bindsData && 'binds' in bindsData
                    ? normalizeRecord(bindsData.binds)
                    : undefined;
                set(state => ({
                    ...state,
                    settings: normalizeSettings(settingsData?.settings ?? state.settings),
                    uiSettings: normalizedUi
                        ? { ...state.uiSettings, ...normalizedUi }
                        : state.uiSettings,
                    binds: normalizedBinds
                        ? { ...state.binds, ...normalizedBinds }
                        : state.binds,
                    status: 'ready',
                }));
            } catch (error) {
                set(state => ({ ...state, status: 'error' }));
                throw error;
            }
        },
        updateSettings: async (partial) => {
            const current = get().settings;
            const next = mergeWithDefaults({ ...current, ...partial });
            markInternalUpdate('settings');
            await storage.setItem('settings', next);
            set(state => ({ ...state, settings: next }));
        },
        updateUiSettings: async (partial) => {
            const current = get().uiSettings;
            const next = { ...current, ...partial };
            markInternalUpdate('uiSettings');
            await storage.setItem('uiSettings', next);
            set(state => ({ ...state, uiSettings: next }));
        },
        updateBinds: async (partial) => {
            const current = get().binds;
            const next = { ...current, ...partial };
            markInternalUpdate('binds');
            await storage.setItem('binds', next);
            set(state => ({ ...state, binds: next }));
        },
    }))
);

if (storage.onChanged?.addListener) {
    storage.onChanged.addListener((changes) => {
        const updates: Partial<SettingsStoreState> = {};
        const settingsChange = changes.settings;
        if (settingsChange && !isInternalUpdate('settings')) {
            updates.settings = normalizeSettings(settingsChange.newValue);
        }
        const uiSettingsChange = changes.uiSettings;
        if (uiSettingsChange && !isInternalUpdate('uiSettings')) {
            updates.uiSettings = normalizeRecord(uiSettingsChange.newValue);
        }
        const bindsChange = changes.binds;
        if (bindsChange && !isInternalUpdate('binds')) {
            updates.binds = normalizeRecord(bindsChange.newValue);
        }
        if (Object.keys(updates).length > 0) {
            settingsStore.setState((state) => ({
                ...state,
                ...updates,
                status: 'ready',
            }));
        }
    });
}

export function subscribeToSettings<T>(
    selector: (settings: Settings) => T,
    listener: (slice: T, previousSlice: T) => void,
    options?: SubscribeOptions<T>,
) {
    return settingsStore.subscribe(
        state => selector(state.settings),
        listener,
        options,
    );
}

export function subscribeToUiSettings<T>(
    selector: (ui: UiSettingsState) => T,
    listener: (slice: T, previousSlice: T) => void,
    options?: SubscribeOptions<T>,
) {
    return settingsStore.subscribe(
        state => selector(state.uiSettings),
        listener,
        options,
    );
}

export function subscribeToBinds<T>(
    selector: (binds: BindsState) => T,
    listener: (slice: T, previousSlice: T) => void,
    options?: SubscribeOptions<T>,
) {
    return settingsStore.subscribe(
        state => selector(state.binds),
        listener,
        options,
    );
}

export function useSettingsSlice<T>(
    selector: (settings: Settings) => T,
    equalityFn?: (a: T, b: T) => boolean,
) {
    return useStore(settingsStore, state => selector(state.settings), equalityFn);
}

export function useUiSettingsSlice<T>(
    selector: (uiSettings: UiSettingsState) => T,
    equalityFn?: (a: T, b: T) => boolean,
) {
    return useStore(settingsStore, state => selector(state.uiSettings), equalityFn);
}

export function useBindsSlice<T>(
    selector: (binds: BindsState) => T,
    equalityFn?: (a: T, b: T) => boolean,
) {
    return useStore(settingsStore, state => selector(state.binds), equalityFn);
}

export function useSettingsStore<T>(
    selector: (state: SettingsStoreState) => T,
    equalityFn?: (a: T, b: T) => boolean,
) {
    return useStore(settingsStore, selector, equalityFn);
}
