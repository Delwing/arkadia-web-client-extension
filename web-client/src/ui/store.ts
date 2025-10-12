import { useSyncExternalStore } from "react";

import { runtimeEventHub } from "@client/src/runtime/event-hub";
import type { EventHubSubscription } from "@client/src/runtime/event-hub";
import services from "@client/src/runtime/service-registry";
import type { SettingsSnapshot } from "@client/src/runtime/settings/settings-service";
import { defaultSettings } from "@client/src/defaultSettings";

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

export interface TeamState {
    inTeam: boolean;
    isLeader: boolean;
}

export interface MapState {
    currentRoomId: number | null;
}

export interface UiStoreState {
    settings: SettingsSnapshot;
    charState: Partial<CharStateData>;
    charOptions: CharOptionsState;
    uiPreferences: UiPreferences;
    teamStatus: TeamState;
    map: MapState;
    dispatch: (intent: UiIntent) => Promise<void>;
}

export type UiIntent =
    | { type: "settings/update"; patch: Partial<SettingsSnapshot> };

const defaultPreferences: UiPreferences = {
    emojiLabels: null,
    footerMode: null,
    fightTitleIcon: null,
};

const defaultTeamState: TeamState = {
    inTeam: false,
    isLeader: false,
};

const defaultMapState: MapState = {
    currentRoomId: null,
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
    teamStatus: { ...defaultTeamState },
    map: { ...defaultMapState },
};

const initialState: UiStoreState = {
    ...baseState,
    dispatch: handleUiIntent,
};

type PartialState<TState> = Partial<TState> | ((state: TState) => Partial<TState>);

type StoreListener<TState> = (state: TState, prevState: TState) => void;

class SimpleStore<TState> {
    private state: TState;
    private listeners: Set<StoreListener<TState>> = new Set();

    constructor(initialState: TState) {
        this.state = initialState;
    }

    getState = () => this.state;

    setState = (partial: PartialState<TState>, replace = false) => {
        const partialState = typeof partial === "function" ? partial(this.state) : partial;
        const nextState = replace
            ? (partialState as TState)
            : ({ ...(this.state as Record<string, unknown>), ...(partialState as Record<string, unknown>) } as TState);
        const previousState = this.state;
        this.state = nextState;
        if (previousState === nextState) {
            return;
        }
        this.listeners.forEach((listener) => listener(this.state, previousState));
    };

    subscribe = (listener: StoreListener<TState>) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };
}

type Selector<T> = (state: UiStoreState) => T;
type Listener<T> = (value: T, previousValue: T) => void;
type SubscribeOptions<T> = {
    fireImmediately?: boolean;
    equalityFn?: (a: T, b: T) => boolean;
};

const defaultEquality = <T>(a: T, b: T) => Object.is(a, b);

const store = new SimpleStore<UiStoreState>({
    ...baseState,
    dispatch: handleUiIntent,
});

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
            case "room.info":
                if (value && typeof value === "object") {
                    const potentialId = (value as any)?.id ?? (value as any)?.num ?? null;
                    const parsedId =
                        typeof potentialId === "number"
                            ? potentialId
                            : typeof potentialId === "string"
                              ? Number.parseInt(potentialId, 10)
                              : null;
                    store.setState((current) => ({
                        map: {
                            ...current.map,
                            currentRoomId: Number.isNaN(parsedId as number) ? current.map.currentRoomId : parsedId,
                        },
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
    TeamManager?: {
        isInAnyTeam?: () => boolean;
        isLeader?: () => boolean;
    };
};

function updateTeamState(client: ClientLike) {
    const manager = client.TeamManager;
    const inTeam = !!manager?.isInAnyTeam?.();
    const isLeader = !!manager?.isLeader?.();
    const current = store.getState().teamStatus;
    if (current.inTeam !== inTeam || current.isLeader !== isLeader) {
        store.setState({ teamStatus: { inTeam, isLeader } });
    }
}

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

    const cleanups: ListenerCleanup[] = [];

    client.addEventListener("uiSettings", listener);
    uiSettingsListener = listener;
    cleanups.push(() => {
        if (typeof client.removeEventListener === "function") {
            client.removeEventListener("uiSettings", listener);
        }
    });

    const teamChangeListener: EventListener = () => updateTeamState(client);
    client.addEventListener("teamChange", teamChangeListener);
    cleanups.push(() => {
        if (typeof client.removeEventListener === "function") {
            client.removeEventListener("teamChange", teamChangeListener);
        }
    });

    updateTeamState(client);
    lastClient = client;
    uiSettingsCleanup = () => {
        cleanups.forEach((cleanup) => {
            try {
                cleanup();
            } catch (error) {
                if (typeof console !== "undefined" && typeof console.warn === "function") {
                    console.warn("Failed to clean up UI store listener", error);
                }
            }
        });
        uiSettingsListener = null;
        lastClient = null;
    };
}

export const uiStore = {
    getState: store.getState,
    setState: store.setState,
    subscribe: store.subscribe,
};

export function subscribeToUiStore<T>(
    selector: Selector<T>,
    listener: Listener<T>,
    options?: SubscribeOptions<T>,
) {
    const equality = options?.equalityFn ?? defaultEquality;
    if (options?.fireImmediately) {
        const initialValue = selector(store.getState());
        listener(initialValue, initialValue);
    }
    return store.subscribe((nextState, prevState) => {
        const nextValue = selector(nextState);
        const previousValue = selector(prevState);
        if (!equality(nextValue, previousValue)) {
            listener(nextValue, previousValue);
        }
    });
}

export function resetUiStoreForTesting() {
    uiSettingsCleanup?.();
    uiSettingsCleanup = null;
    uiSettingsListener = null;
    lastClient = null;
    runtimeCleanup?.();
    runtimeCleanup = null;
    store.setState({ ...baseState, dispatch: handleUiIntent }, true);
    subscribeToRuntime();
}

export function useUiStore<T>(selector: (state: UiStoreState) => T): T {
    return useSyncExternalStore(
        (notify) =>
            subscribeToUiStore(
                selector,
                (next, prev) => {
                    if (!Object.is(next, prev)) {
                        notify();
                    }
                },
            ),
        () => selector(store.getState()),
        () => selector(store.getState()),
    );
}

export function useUiDispatch() {
    return useUiStore((state) => state.dispatch);
}

