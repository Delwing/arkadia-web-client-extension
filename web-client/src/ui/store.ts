import { createStore } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";
import { useStore } from "zustand";
import type { Subscription } from "rxjs";

import { runtimeEventHub } from "@client/src/runtime/event-hub";
import type { EventHubSubscription } from "@client/src/runtime/event-hub";
import services from "@client/src/runtime/service-registry";
import { COLORS_DATASET_KEY, MAP_DATASET_KEY, NPC_DATASET_KEY } from "@client/src/runtime/data";
import type { DataCatalogEntryMetadata, DataCatalogReadyEvent } from "@client/src/runtime/data";
import type { SettingsSnapshot } from "@client/src/runtime/settings/settings-service";
import { defaultSettings } from "@client/src/defaultSettings";
import type { CommandDispatcher, ExtensionCommand } from "@client/src/runtime/command-dispatcher";

import type { CharStateData } from "../CharState";

type ListenerCleanup = () => void;

const trackedCatalogKeys = [MAP_DATASET_KEY, COLORS_DATASET_KEY, NPC_DATASET_KEY];

export interface CatalogDatasetSlice<T = unknown> {
    readonly data?: T;
    readonly metadata: DataCatalogEntryMetadata;
}

export interface CatalogLoadOptions {
    readonly force?: boolean;
}

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
    commandDispatcher: CommandDispatcher | null;
    setCommandDispatcher: (dispatcher: CommandDispatcher | null) => void;
    dispatch: (intent: UiIntent) => Promise<void>;
    datasets: Record<string, CatalogDatasetSlice<unknown>>;
    loadDataset: (key: string, options?: CatalogLoadOptions) => Promise<void>;
    ensureDataset: <T>(key: string, options?: CatalogLoadOptions) => Promise<T>;
    syncDataset: (key: string) => void;
}

export type UiIntent =
    | { type: "settings/update"; patch: Partial<SettingsSnapshot> }
    | { type: "command/send"; command: string; echo?: boolean }
    | { type: "event/send"; event: string; payload?: unknown }
    | { type: "extension/command"; command: ExtensionCommand };

const defaultPreferences: UiPreferences = {
    emojiLabels: null,
    footerMode: null,
    fightTitleIcon: null,
};

async function handleUiIntent(intent: UiIntent, get: () => UiStoreState): Promise<void> {
    switch (intent.type) {
        case "settings/update":
            await services.settings.update(intent.patch);
            return;
        case "command/send": {
            const dispatcher = get().commandDispatcher;
            if (!dispatcher) {
                throw new Error("Command dispatcher not configured");
            }
            dispatcher.sendCommand(intent.command, { echo: intent.echo });
            return;
        }
        case "event/send": {
            const dispatcher = get().commandDispatcher;
            if (!dispatcher) {
                throw new Error("Command dispatcher not configured");
            }
            dispatcher.sendEvent(intent.event, intent.payload);
            return;
        }
        case "extension/command": {
            const dispatcher = get().commandDispatcher;
            if (!dispatcher) {
                throw new Error("Command dispatcher not configured");
            }
            dispatcher.sendExtensionCommand(intent.command);
            return;
        }
        default:
            throw new Error(`Unhandled UI intent: ${JSON.stringify(intent)}`);
    }
}

const baseState = {
    settings: { ...defaultSettings } as SettingsSnapshot,
    charState: {},
    charOptions: {},
    uiPreferences: { ...defaultPreferences },
    datasets: {} as Record<string, CatalogDatasetSlice<unknown>>,
};

const store = createStore(
    subscribeWithSelector<UiStoreState>((set, get) => ({
        ...baseState,
        commandDispatcher: null,
        setCommandDispatcher: (dispatcher) => set({ commandDispatcher: dispatcher }),
        dispatch: (intent) => handleUiIntent(intent, get),
        loadDataset: (key, options) => loadCatalogDataset(key, options),
        ensureDataset: (key, options) => ensureCatalogDataset(key, options),
        syncDataset: (key) => syncDatasetState(key),
    }))
);

const pendingCatalogLoads = new Map<string, Promise<void>>();
let catalogSubscription: Subscription | null = null;

type StoreWithSelector = typeof store & {
    subscribe: typeof store.subscribe & {
        <Slice>(
            selector: (state: UiStoreState) => Slice,
            listener: (selectedState: Slice, previousSelectedState: Slice) => void,
            options?: {
                equalityFn?: (a: Slice, b: Slice) => boolean;
                fireImmediately?: boolean;
            },
        ): () => void;
    };
};

const storeWithSelector = store as StoreWithSelector;

function buildDatasetState(key: string): CatalogDatasetSlice<unknown> | undefined {
    const metadata = services.dataCatalog.metadataFor(key);
    if (!metadata) {
        return undefined;
    }

    return {
        data: services.dataCatalog.get(key),
        metadata,
    };
}

function syncDatasetState(key: string): void {
    const dataset = buildDatasetState(key);
    store.setState((current) => {
        const nextDatasets = { ...current.datasets };
        if (dataset) {
            nextDatasets[key] = dataset;
        } else {
            delete nextDatasets[key];
        }
        return { datasets: nextDatasets };
    });
}

async function loadCatalogDataset(key: string, options: CatalogLoadOptions = {}): Promise<void> {
    const { force = false } = options;
    const catalog = services.dataCatalog;
    const existingMetadata = catalog.metadataFor(key);

    if (!force) {
        if (existingMetadata?.status === "ready") {
            return;
        }

        const existingPending = pendingCatalogLoads.get(key);
        if (existingPending) {
            await existingPending;
            return;
        }
    } else {
        const existingPending = pendingCatalogLoads.get(key);
        if (existingPending) {
            await existingPending;
        }
    }

    const loadingMetadata: DataCatalogEntryMetadata = {
        ...(existingMetadata ?? { key, status: "idle" as const }),
        status: "loading",
        error: undefined,
    };

    store.setState((current) => ({
        datasets: {
            ...current.datasets,
            [key]: {
                data: current.datasets[key]?.data,
                metadata: loadingMetadata,
            },
        },
    }));

    const loadPromise = (async () => {
        try {
            await catalog.load(key);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const meta = catalog.metadataFor(key) ?? { key, status: "error" as const };
            const errorMetadata: DataCatalogEntryMetadata = {
                ...meta,
                status: "error",
                error: message,
            };
            store.setState((current) => ({
                datasets: {
                    ...current.datasets,
                    [key]: {
                        data: catalog.get(key),
                        metadata: errorMetadata,
                    },
                },
            }));
            throw error;
        }
    })();

    pendingCatalogLoads.set(key, loadPromise);

    try {
        await loadPromise;
    } finally {
        pendingCatalogLoads.delete(key);
    }
}

async function ensureCatalogDataset<T>(key: string, options: CatalogLoadOptions = {}): Promise<T> {
    const { force = false } = options;
    const catalog = services.dataCatalog;
    const metadata = catalog.metadataFor(key);
    const cached = catalog.get<T>(key);

    if (!force && metadata?.status === "ready" && typeof cached !== "undefined") {
        return cached;
    }

    await loadCatalogDataset(key, options);

    const value = catalog.get<T>(key);
    if (typeof value === "undefined") {
        throw new Error(`Dataset ${key} is unavailable after load.`);
    }

    return value;
}

function subscribeToCatalog(): void {
    if (catalogSubscription) {
        return;
    }

    const initialDatasets: Record<string, CatalogDatasetSlice<unknown>> = {};
    for (const key of trackedCatalogKeys) {
        const dataset = buildDatasetState(key);
        if (dataset) {
            initialDatasets[key] = dataset;
        }
    }

    if (Object.keys(initialDatasets).length > 0) {
        store.setState((current) => ({
            datasets: { ...current.datasets, ...initialDatasets },
        }));
    }

    catalogSubscription = services.dataCatalog.ready$().subscribe((event: DataCatalogReadyEvent) => {
        store.setState((current) => ({
            datasets: {
                ...current.datasets,
                [event.key]: {
                    data: event.data,
                    metadata: event.metadata,
                },
            },
        }));
    });
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
subscribeToCatalog();
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

export const uiStore = storeWithSelector;

export function resetUiStoreForTesting() {
    uiSettingsCleanup?.();
    uiSettingsCleanup = null;
    uiSettingsListener = null;
    lastClient = null;
    runtimeCleanup?.();
    runtimeCleanup = null;
    catalogSubscription?.unsubscribe();
    catalogSubscription = null;
    pendingCatalogLoads.clear();
    store.setState({ ...baseState, commandDispatcher: null });
    subscribeToRuntime();
    subscribeToCatalog();
}

export function useUiStore<T>(selector: (state: UiStoreState) => T): T {
    return useStore(storeWithSelector, selector);
}

export function selectCatalogDataset<T = unknown>(key: string) {
    return (state: UiStoreState) => state.datasets[key] as CatalogDatasetSlice<T> | undefined;
}

export function useCatalogDataset<T = unknown>(key: string): CatalogDatasetSlice<T> | undefined {
    return useUiStore(selectCatalogDataset<T>(key));
}

export function useUiDispatch() {
    return useStore(storeWithSelector, (state) => state.dispatch);
}

