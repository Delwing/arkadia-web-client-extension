import { createStore, subscribeWithSelector, useStore } from "./zustand-lite";

import { runtimeEventHub } from "@client/src/runtime/event-hub";
import type { EventHubSubscription } from "@client/src/runtime/event-hub";
import services from "@client/src/runtime/service-registry";
import type { SettingsSnapshot } from "@client/src/runtime/settings/settings-service";
import { defaultSettings } from "@client/src/defaultSettings";
import type { DataCatalogEntryMetadata } from "@client/src/runtime/data";
import { COLORS_DATASET_KEY, MAP_DATASET_KEY, NPC_DATASET_KEY } from "@client/src/runtime/data";

import type { CharStateData } from "../CharState";

type ListenerCleanup = () => void;

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
    datasets: Record<string, CatalogDatasetState>;
    dispatch: (intent: UiIntent) => Promise<void>;
}

export interface CatalogDatasetState<T = unknown> {
    readonly data?: T;
    readonly metadata?: DataCatalogEntryMetadata;
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
    datasets: {} as Record<string, CatalogDatasetState>,
};

const store = createStore(
    subscribeWithSelector<UiStoreState>(() => ({
        ...baseState,
        dispatch: handleUiIntent,
    }))
);

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

const CORE_DATASET_KEYS = [MAP_DATASET_KEY, COLORS_DATASET_KEY, NPC_DATASET_KEY];

function updateDatasetSnapshot(key: string) {
    const metadata = services.dataCatalog.metadataFor(key);
    const data = services.dataCatalog.get(key);
    store.setState((current) => ({
        datasets: {
            ...current.datasets,
            [key]: {
                data,
                metadata,
            },
        },
    }));
}

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

    const datasetSubscriptions = CORE_DATASET_KEYS.map((key) => {
        updateDatasetSnapshot(key);
        return services.dataCatalog.ready$(key).subscribe((event) => {
            store.setState((current) => ({
                datasets: {
                    ...current.datasets,
                    [key]: {
                        data: event.data,
                        metadata: event.metadata,
                    },
                },
            }));
        });
    });

    runtimeCleanup = () => {
        settingsSubscription.unsubscribe();
        gmcpSubscription.unsubscribe();
        datasetSubscriptions.forEach((subscription) => subscription.unsubscribe());
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

export const uiStore = storeWithSelector;

export function useUiSelector<Slice>(
    selector: (state: UiStoreState) => Slice,
    equalityFn?: (a: Slice, b: Slice) => boolean,
): Slice {
    return useStore(storeWithSelector, selector, equalityFn);
}

export function refreshCatalogDatasetSnapshot(key: string): void {
    updateDatasetSnapshot(key);
}

export function resetUiStoreForTesting() {
    uiSettingsCleanup?.();
    uiSettingsCleanup = null;
    uiSettingsListener = null;
    lastClient = null;
    runtimeCleanup?.();
    runtimeCleanup = null;
    store.setState({ ...baseState, dispatch: handleUiIntent });
    subscribeToRuntime();
}

export function useUiStore<T>(selector: (state: UiStoreState) => T): T {
    return useStore(storeWithSelector, selector);
}

export function useUiDispatch() {
    return useStore(storeWithSelector, (state) => state.dispatch);
}

