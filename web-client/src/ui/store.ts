import { createStore } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";
import { useStore } from "zustand";
import type { Subscription } from "rxjs";

import { runtimeEventHub } from "@client/src/runtime/event-hub";
import type { EventHubSubscription } from "@client/src/runtime/event-hub";
import services from "@client/src/runtime/service-registry";
import type { SettingsSnapshot } from "@client/src/runtime/settings/settings-service";
import { defaultSettings } from "@client/src/defaultSettings";
import type { DataCatalogEntryMetadata } from "@client/src/runtime/data";
import {
    COLORS_DATASET_KEY,
    MAP_DATASET_KEY,
    NPC_DATASET_KEY,
    ensureDatasetReady,
} from "@client/src/runtime/data";

import type { CharStateData } from "../CharState";

type ListenerCleanup = () => void;

export interface CatalogEntryState<T = unknown> {
    data?: T;
    metadata?: DataCatalogEntryMetadata;
}

type CatalogState = Record<string, CatalogEntryState>;
type CatalogEntrySource = DataCatalogEntryMetadata["source"];

export interface UiPreferences {
    emojiLabels: boolean | null;
    footerMode: number | null;
    fightTitleIcon: boolean | null;
}

export interface CharOptionsState {
    form?: number;
}

export interface UiStoreState {
    settings: SettingsSnapshot;
    charState: Partial<CharStateData>;
    charOptions: CharOptionsState;
    uiPreferences: UiPreferences;
    dataCatalog: Record<string, CatalogEntryState>;
    dispatch: (intent: UiIntent) => Promise<void>;
}

export type UiIntent =
    | { type: "settings/update"; patch: Partial<SettingsSnapshot> };

const defaultPreferences: UiPreferences = {
    emojiLabels: null,
    footerMode: null,
    fightTitleIcon: null,
};

async function handleUiIntent(intent: UiIntent): Promise<void> {
    if (intent.type === "settings/update") {
        await services.settings.update(intent.patch);
        return;
    }
    throw new Error(`Unhandled UI intent: ${JSON.stringify(intent)}`);
}

const baseState = {
    settings: { ...defaultSettings } as SettingsSnapshot,
    charState: {},
    charOptions: {},
    uiPreferences: { ...defaultPreferences },
    dataCatalog: {} as Record<string, CatalogEntryState>,
};

const initialState: UiStoreState = {
    ...baseState,
    dispatch: handleUiIntent,
};

const store = createStore(
    subscribeWithSelector<UiStoreState>(() => ({
        ...baseState,
        dispatch: handleUiIntent,
    }))
);

type UiStoreSubscribe = <T>(
    selector: (state: UiStoreState) => T,
    listener: (selectedState: T, previousSelectedState: T) => void,
    options?: {
        equalityFn?: (a: T, b: T) => boolean;
        fireImmediately?: boolean;
    }
) => () => void;

function updateCatalogEntry<T>(key: string, partial: CatalogEntryState<T>): void {
    store.setState((current) => ({
        dataCatalog: {
            ...current.dataCatalog,
            [key]: {
                ...current.dataCatalog[key],
                ...partial,
            },
        } as CatalogState,
    }));
}

function refreshCatalogEntry(key: string): void {
    const catalog = services.defaultDataCatalog;
    const metadata = catalog.metadataFor(key);
    const data = catalog.get(key);

    updateCatalogEntry(key, {
        data,
        metadata,
    });
}

let catalogSubscription: Subscription | null = null;
const catalogKeys = new Set<string>();
const pendingCatalogLoads = new Map<string, Promise<unknown>>();

function subscribeToCatalog() {
    if (catalogSubscription) {
        return;
    }

    catalogSubscription = services.defaultDataCatalog.ready$().subscribe((event) => {
        updateCatalogEntry(event.key, {
            data: event.data,
            metadata: event.metadata,
        });
    });
}

function ensureCatalogTracking(key: string): void {
    subscribeToCatalog();
    if (catalogKeys.has(key)) {
        return;
    }

    catalogKeys.add(key);
    refreshCatalogEntry(key);
}

function selectCatalogEntryInternal<T = unknown>(key: string) {
    ensureCatalogTracking(key);
    return (state: UiStoreState): CatalogEntryState<T> | undefined =>
        state.dataCatalog[key] as CatalogEntryState<T> | undefined;
}

function getCatalogEntrySnapshotInternal<T = unknown>(key: string): CatalogEntryState<T> | undefined {
    ensureCatalogTracking(key);
    return store.getState().dataCatalog[key] as CatalogEntryState<T> | undefined;
}

function loadCatalogEntryInternal<T = unknown>(key: string): Promise<T> {
    ensureCatalogTracking(key);

    const catalog = services.defaultDataCatalog;
    const metadata = catalog.metadataFor(key);
    const cached = catalog.get<T>(key);

    if (metadata?.status === "ready" && typeof cached !== "undefined") {
        updateCatalogEntry(key, { data: cached, metadata });
        return Promise.resolve(cached);
    }

    const pending = pendingCatalogLoads.get(key) as Promise<T> | undefined;
    if (pending) {
        return pending;
    }

    const loadPromise = ensureDatasetReady<T>(catalog, key)
        .then((data) => {
            refreshCatalogEntry(key);
            return data;
        })
        .catch((error) => {
            refreshCatalogEntry(key);
            throw error;
        });

    pendingCatalogLoads.set(key, loadPromise);
    refreshCatalogEntry(key);

    void loadPromise.finally(() => {
        pendingCatalogLoads.delete(key);
    });

    return loadPromise;
}

async function clearCatalogEntryInternal(key: string): Promise<void> {
    ensureCatalogTracking(key);
    await services.defaultDataCatalog.clear(key);
    refreshCatalogEntry(key);
}

async function setCatalogEntryInternal<T>(
    key: string,
    value: T,
    source?: CatalogEntrySource,
): Promise<void> {
    ensureCatalogTracking(key);
    await services.defaultDataCatalog.set(key, value, source);
    refreshCatalogEntry(key);
}

function createCatalogSelector<T = unknown>(key: string) {
    return selectCatalogEntryInternal<T>(key);
}

export const selectMapCatalogEntry = createCatalogSelector<MapData.Map>(MAP_DATASET_KEY);

export function getMapCatalogEntrySnapshot(): CatalogEntryState<MapData.Map> | undefined {
    return getCatalogEntrySnapshotInternal<MapData.Map>(MAP_DATASET_KEY);
}

export function loadMapCatalogEntry(): Promise<MapData.Map> {
    return loadCatalogEntryInternal<MapData.Map>(MAP_DATASET_KEY);
}

export const selectColorCatalogEntry = createCatalogSelector<MapData.Env[]>(COLORS_DATASET_KEY);

export function loadColorCatalogEntry(): Promise<MapData.Env[]> {
    return loadCatalogEntryInternal<MapData.Env[]>(COLORS_DATASET_KEY);
}

export function clearColorCatalogEntry(): Promise<void> {
    return clearCatalogEntryInternal(COLORS_DATASET_KEY);
}

export interface NpcRecord {
    name: string;
    loc: number;
}

export const selectNpcCatalogEntry = createCatalogSelector<NpcRecord[]>(NPC_DATASET_KEY);

export function loadNpcCatalogEntry(): Promise<NpcRecord[]> {
    return loadCatalogEntryInternal<NpcRecord[]>(NPC_DATASET_KEY);
}

export function getNpcCatalogEntrySnapshot(): CatalogEntryState<NpcRecord[]> | undefined {
    return getCatalogEntrySnapshotInternal<NpcRecord[]>(NPC_DATASET_KEY);
}

export function clearNpcCatalogEntry(): Promise<void> {
    return clearCatalogEntryInternal(NPC_DATASET_KEY);
}

export function setNpcCatalogEntry(data: NpcRecord[], source?: CatalogEntrySource): Promise<void> {
    return setCatalogEntryInternal(NPC_DATASET_KEY, data, source);
}

function updatePreferencesFromSnapshot(snapshot: SettingsSnapshot) {
    const next: Partial<UiPreferences> = {};
    if (typeof (snapshot as any).emojiLabels === "boolean") {
        next.emojiLabels = Boolean((snapshot as any).emojiLabels);
    }
    if (typeof (snapshot as any).footerMode === "number") {
        next.footerMode = (snapshot as any).footerMode as number;
    }
    if (typeof (snapshot as any).fightTitleIcon === "boolean") {
        next.fightTitleIcon = Boolean((snapshot as any).fightTitleIcon);
    }
    if (Object.keys(next).length > 0) {
        store.setState((current) => ({
            uiPreferences: { ...current.uiPreferences, ...next },
        }));
    }
}

let subscriptionsInitialised = false;
let runtimeCleanup: ListenerCleanup | null = null;

function subscribeToRuntime() {
    if (subscriptionsInitialised) {
        return;
    }
    subscriptionsInitialised = true;

    const settingsSubscription = services.settings.settings$.subscribe((snapshot) => {
        store.setState({ settings: snapshot });
        updatePreferencesFromSnapshot(snapshot);
    });

    const gmcpSubscription: EventHubSubscription = runtimeEventHub.on("gmcp", ({ path, value }) => {
        if (typeof path !== "string") {
            return;
        }
        switch (path) {
            case "char.state":
                if (value && typeof value === "object") {
                    store.setState((current) => ({
                        charState: { ...current.charState, ...(value as Partial<CharStateData>) },
                    }));
                }
                break;
            case "char.options":
                if (value && typeof value === "object") {
                    store.setState((current) => ({
                        charOptions: { ...current.charOptions, ...(value as CharOptionsState) },
                    }));
                }
                break;
            default:
                break;
        }
    });

    runtimeCleanup = () => {
        settingsSubscription.unsubscribe();
        gmcpSubscription.unsubscribe();
        subscriptionsInitialised = false;
    };
}

subscribeToRuntime();
let uiSettingsCleanup: ListenerCleanup | null = null;
let uiSettingsListener: EventListener | null = null;
let lastClient: ClientLike | null = null;

type ClientLike = {
    addEventListener: (
        event: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
    ) => void;
    removeEventListener?: (
        event: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions,
    ) => void;
};

export function bindUiStoreToClientEvents(client: ClientLike | null | undefined) {
    if (!client || typeof client.addEventListener !== "function") {
        return;
    }

    uiSettingsCleanup?.();

    const listener: EventListener = (event: Event) => {
        const detail = (event as CustomEvent).detail ?? {};
        const next: Partial<UiPreferences> = {};
        if (typeof detail.emojiLabels === "boolean") {
            next.emojiLabels = Boolean(detail.emojiLabels);
        }
        if (typeof detail.footerMode === "number") {
            next.footerMode = Number(detail.footerMode);
        }
        if (typeof detail.fightTitleIcon === "boolean") {
            next.fightTitleIcon = Boolean(detail.fightTitleIcon);
        }
        if (Object.keys(next).length > 0) {
            store.setState((current) => ({
                uiPreferences: { ...current.uiPreferences, ...next },
            }));
        }
    };

    client.addEventListener("uiSettings", listener);
    uiSettingsListener = listener;
    lastClient = client;
    uiSettingsCleanup = () => {
        if (typeof client.removeEventListener === "function") {
            client.removeEventListener("uiSettings", listener);
        }
        uiSettingsListener = null;
        lastClient = null;
    };
}

export const uiStore = store as typeof store & { subscribe: UiStoreSubscribe };

export function resetUiStoreForTesting() {
    uiSettingsCleanup?.();
    uiSettingsCleanup = null;
    uiSettingsListener = null;
    lastClient = null;
    runtimeCleanup?.();
    runtimeCleanup = null;
    catalogSubscription?.unsubscribe();
    catalogSubscription = null;
    catalogKeys.clear();
    pendingCatalogLoads.clear();
    store.setState({ ...baseState, dispatch: handleUiIntent });
    subscribeToRuntime();
}

export function useUiStore<T>(selector: (state: UiStoreState) => T): T {
    return useStore(store, selector);
}

export function useUiDispatch() {
    return useStore(store, (state) => state.dispatch);
}

