import { runtimeEventHub } from "@client/src/runtime/event-hub";
import type { EventHubSubscription } from "@client/src/runtime/event-hub";
import { useCallback } from "react";
import { createStore } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";
import { useStore } from "zustand";
import type { Subscription } from "rxjs";

import services from "@client/src/runtime/service-registry";
import { COLORS_DATASET_KEY, MAP_DATASET_KEY, NPC_DATASET_KEY } from "@client/src/runtime/data";
import type { DataCatalogEntryMetadata, DataCatalogReadyEvent, NpcDefinition } from "@client/src/runtime/data";
import type { SettingsSnapshot } from "@client/src/runtime/settings/settings-service";
import { defaultSettings } from "@client/src/defaultSettings";
import type { CommandDispatcher, ExtensionCommand } from "@client/src/runtime/command-dispatcher";
import toTitleCase from "@client/src/utils/toTitleCase";

import type { CharStateData } from "../CharState";

interface RuntimeObjectData {
    desc?: string;
    hp?: number;
    state?: number;
    attack_num?: boolean | number;
    attack_target?: boolean;
    defense_target?: boolean;
    avatar_target?: boolean;
    living?: boolean;
    team?: boolean;
    team_leader?: boolean;
    shortcut?: string;
    [key: string]: unknown;
}

export interface NearbyObject {
    readonly id: string;
    readonly num: number;
    readonly desc?: string;
    readonly state?: number;
    readonly attackNum?: boolean | number;
    readonly attackTarget?: boolean;
    readonly defenseTarget?: boolean;
    readonly avatarTarget?: boolean;
    readonly living?: boolean;
    readonly team?: boolean;
    readonly teamLeader?: boolean;
    readonly shortcut?: string;
}

export interface TeamStatus {
    readonly inTeam: boolean;
    readonly isLeader: boolean;
    readonly leaderId?: string;
}

interface ObjectsState {
    readonly data: Record<string, RuntimeObjectData>;
    readonly nums: readonly string[];
    readonly playerId?: string;
}

type ListenerCleanup = () => void;

const trackedCatalogKeys = [MAP_DATASET_KEY, COLORS_DATASET_KEY, NPC_DATASET_KEY];

const defaultObjectsState: ObjectsState = { data: {}, nums: [], playerId: undefined };
const emptyTeamStatus: TeamStatus = { inTeam: false, isLeader: false, leaderId: undefined };

function normalizeObjectNums(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((entry) => String(entry));
    }
    if (value && typeof value === "object") {
        const detail = value as { nums?: unknown; objects?: unknown };
        if (Array.isArray(detail.nums)) {
            return detail.nums.map((entry) => String(entry));
        }
        if (Array.isArray(detail.objects)) {
            return detail.objects.map((entry) => String(entry));
        }
    }
    return [];
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

function shallowEqualObjects(a: RuntimeObjectData, b: RuntimeObjectData): boolean {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) {
        return false;
    }
    for (const key of aKeys) {
        if (a[key] !== b[key]) {
            return false;
        }
    }
    return true;
}

function deriveObjects(state: ObjectsState): { nearbyObjects: NearbyObject[]; teamStatus: TeamStatus } {
    const { data, nums, playerId } = state;

    const buildObject = (id: string): NearbyObject => {
        const entry = data[id] ?? {};
        const parsed = Number.parseInt(id, 10);
        const numericId = Number.isNaN(parsed) ? Number(id) : parsed;
        return {
            id,
            num: Number.isNaN(numericId) ? 0 : numericId,
            desc: typeof entry.desc === "string" ? entry.desc : undefined,
            state: typeof entry.state === "number" ? entry.state : typeof entry.hp === "number" ? entry.hp : undefined,
            attackNum: entry.attack_num,
            attackTarget: entry.attack_target,
            defenseTarget: entry.defense_target,
            avatarTarget: entry.avatar_target,
            living: entry.living,
            team: entry.team,
            teamLeader: entry.team_leader,
        };
    };

    const playerObject = playerId ? buildObject(playerId) : undefined;
    const teamObjects: NearbyObject[] = [];
    const restObjects: NearbyObject[] = [];

    nums.forEach((id) => {
        if (playerId && id === playerId) {
            return;
        }
        const entry = buildObject(id);
        if (data[id]?.team) {
            teamObjects.push(entry);
        } else {
            restObjects.push(entry);
        }
    });

    const combined = [playerObject, ...teamObjects, ...restObjects].filter(Boolean) as NearbyObject[];
    const inCombat = combined.some((obj) => typeof obj.attackNum !== "undefined" && obj.attackNum !== false);

    const combatRest = inCombat
        ? restObjects.filter((obj) => typeof obj.attackNum !== "undefined" && obj.attackNum !== false)
        : restObjects;
    const nonCombatRest = inCombat
        ? restObjects.filter((obj) => typeof obj.attackNum === "undefined" || obj.attackNum === false)
        : [];

    const ordered: NearbyObject[] = [];
    if (playerObject) {
        ordered.push({ ...playerObject, shortcut: "@" });
    }

    let teamIndex = 0;
    const firstLetterCode = "A".charCodeAt(0);
    teamObjects.forEach((obj) => {
        ordered.push({ ...obj, shortcut: String.fromCharCode(firstLetterCode + teamIndex) });
        teamIndex += 1;
    });

    let restIndex = 1;
    combatRest.forEach((obj) => {
        ordered.push({ ...obj, shortcut: String(restIndex) });
        restIndex += 1;
    });

    let nonCombatIndex = 50;
    nonCombatRest.forEach((obj) => {
        ordered.push({ ...obj, shortcut: String(nonCombatIndex) });
        nonCombatIndex += 1;
    });

    const leaderEntry = Object.entries(data).find(([, value]) => value?.team_leader);
    const leaderId = leaderEntry?.[0];
    const playerEntry = playerId ? data[playerId] : undefined;
    const hasTeamMembers = Object.entries(data).some(([id, value]) => id !== playerId && value?.team === true);
    const isLeader = Boolean(leaderId && playerId && leaderId === playerId);
    const playerTeamFlag = playerEntry?.team;
    const inTeam = Boolean(
        playerTeamFlag === true ||
            (playerTeamFlag !== false && hasTeamMembers) ||
            isLeader
    );

    return {
        nearbyObjects: ordered,
        teamStatus: {
            inTeam,
            isLeader,
            leaderId,
        },
    };
}

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
    objectData: Record<string, RuntimeObjectData>;
    objectNums: readonly string[];
    playerObjectId?: string;
    nearbyObjects: readonly NearbyObject[];
    teamStatus: TeamStatus;
    attackQueue: readonly string[];
    commandDispatcher: CommandDispatcher | null;
    setCommandDispatcher: (dispatcher: CommandDispatcher | null) => void;
    sendCommand: (command: string, options?: { echo?: boolean }) => void;
    sendEvent: (event: string, payload?: unknown) => void;
    sendExtensionCommand: (command: ExtensionCommand) => boolean;
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
    objectData: { ...defaultObjectsState.data },
    objectNums: [...defaultObjectsState.nums],
    playerObjectId: defaultObjectsState.playerId,
    nearbyObjects: [] as NearbyObject[],
    teamStatus: { ...emptyTeamStatus },
    attackQueue: [] as string[],
    datasets: {} as Record<string, CatalogDatasetSlice<unknown>>,
};

const store = createStore(
    subscribeWithSelector<UiStoreState>((set, get) => ({
        ...baseState,
        commandDispatcher: null,
        setCommandDispatcher: (dispatcher) => set({ commandDispatcher: dispatcher }),
        sendCommand: (command, options) => {
            const dispatcher = get().commandDispatcher;
            if (!dispatcher) {
                throw new Error("Command dispatcher not configured");
            }
            dispatcher.sendCommand(command, options);
        },
        sendEvent: (event, payload) => {
            const dispatcher = get().commandDispatcher;
            if (!dispatcher) {
                throw new Error("Command dispatcher not configured");
            }
            dispatcher.sendEvent(event, payload);
        },
        sendExtensionCommand: (command) => {
            const dispatcher = get().commandDispatcher;
            if (!dispatcher) {
                throw new Error("Command dispatcher not configured");
            }
            return dispatcher.sendExtensionCommand(command);
        },
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

function updateObjectsState(updater: (prev: ObjectsState) => ObjectsState): void {
    store.setState((current) => {
        const prev: ObjectsState = {
            data: current.objectData,
            nums: current.objectNums,
            playerId: current.playerObjectId,
        };
        const next = updater(prev);
        if (next === prev) {
            return {};
        }
        const { nearbyObjects, teamStatus } = deriveObjects(next);
        return {
            objectData: next.data,
            objectNums: next.nums,
            playerObjectId: next.playerId,
            nearbyObjects,
            teamStatus,
        };
    });
}

function updateObjectsFromData(detail: unknown): void {
    if (!detail || typeof detail !== "object") {
        return;
    }
    const entries = Object.entries(detail as Record<string, unknown>);
    if (entries.length === 0) {
        return;
    }
    updateObjectsState((prev) => {
        let changed = false;
        const nextData: Record<string, RuntimeObjectData> = { ...prev.data };
        for (const [id, raw] of entries) {
            if (!raw || typeof raw !== "object") {
                continue;
            }
            const key = String(id);
            const existing = nextData[key] ?? {};
            const merged = { ...existing, ...(raw as RuntimeObjectData) };
            if (!shallowEqualObjects(existing, merged)) {
                nextData[key] = merged;
                changed = true;
            } else if (!(key in nextData)) {
                nextData[key] = merged;
                changed = true;
            }
        }
        if (!changed) {
            return prev;
        }
        return {
            data: nextData,
            nums: prev.nums,
            playerId: prev.playerId,
        };
    });
}

function updateObjectNumsFromDetail(value: unknown): void {
    const nums = normalizeObjectNums(value);
    updateObjectsState((prev) => {
        if (arraysEqual(prev.nums, nums)) {
            return prev;
        }
        return {
            data: prev.data,
            nums,
            playerId: prev.playerId,
        };
    });
}

function updatePlayerInfoFromGmcp(detail: unknown): void {
    if (!detail || typeof detail !== "object") {
        return;
    }
    const info = detail as { object_num?: unknown; name?: unknown };
    if (typeof info.object_num === "undefined" || info.object_num === null) {
        return;
    }
    const playerId = String(info.object_num);
    const name = info.name;
    const normalizedName = typeof name === "string" && name ? toTitleCase(name) : undefined;

    updateObjectsState((prev) => {
        const existing = prev.data[playerId];
        const playerChanged = prev.playerId !== playerId;
        const nameChanged = normalizedName ? existing?.desc !== normalizedName : false;
        if (!playerChanged && !nameChanged) {
            return prev;
        }
        const nextData: Record<string, RuntimeObjectData> = { ...prev.data };
        if (existing) {
            nextData[playerId] = nameChanged ? { ...existing, desc: normalizedName } : existing;
        } else if (normalizedName) {
            nextData[playerId] = { desc: normalizedName };
        } else {
            nextData[playerId] = {};
        }
        return {
            data: nextData,
            nums: prev.nums,
            playerId,
        };
    });
}

function updatePlayerStateFromCharState(detail: unknown): void {
    if (!detail || typeof detail !== "object") {
        return;
    }
    const data = detail as { hp?: unknown };
    if (typeof data.hp !== "number") {
        return;
    }
    const hp = data.hp;
    updateObjectsState((prev) => {
        const playerId = prev.playerId;
        if (!playerId) {
            return prev;
        }
        const existing = prev.data[playerId];
        const currentHp = typeof existing?.hp === "number" ? existing.hp : undefined;
        const currentState = typeof existing?.state === "number" ? existing.state : undefined;
        if (currentHp === hp && currentState === hp) {
            return prev;
        }
        const merged: RuntimeObjectData = existing
            ? { ...existing, hp, state: hp }
            : { hp, state: hp };
        const nextData: Record<string, RuntimeObjectData> = {
            ...prev.data,
            [playerId]: merged,
        };
        return {
            data: nextData,
            nums: prev.nums,
            playerId,
        };
    });
}

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
                    updatePlayerStateFromCharState(value);
                }
                break;
            case "char.options":
                if (value && typeof value === "object") {
                    store.setState((current) => ({
                        charOptions: { ...current.charOptions, ...(value as CharOptionsState) },
                    }));
                }
                break;
            case "char.info":
                updatePlayerInfoFromGmcp(value);
                break;
            case "objects.data":
                updateObjectsFromData(value);
                break;
            case "objects.nums":
                updateObjectNumsFromDetail(value);
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
let clientEventCleanups: ListenerCleanup[] = [];

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

    clientEventCleanups.forEach((cleanup) => cleanup());
    clientEventCleanups = [];

    const cleanups: ListenerCleanup[] = [];

    const handleUiSettings: EventListener = (event: Event) => {
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

    client.addEventListener("uiSettings", handleUiSettings);
    cleanups.push(() => {
        if (typeof client.removeEventListener === "function") {
            client.removeEventListener("uiSettings", handleUiSettings);
        }
    });

    const handleAttackQueueChange: EventListener = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        if (Array.isArray(detail)) {
            const normalized = detail.map((entry) => String(entry));
            store.setState({ attackQueue: normalized });
        }
    };

    client.addEventListener("attackQueueChange", handleAttackQueueChange);
    cleanups.push(() => {
        if (typeof client.removeEventListener === "function") {
            client.removeEventListener("attackQueueChange", handleAttackQueueChange);
        }
    });

    clientEventCleanups = cleanups;
}

export const uiStore = storeWithSelector;

export function resetUiStoreForTesting() {
    clientEventCleanups.forEach((cleanup) => cleanup());
    clientEventCleanups = [];
    runtimeCleanup?.();
    runtimeCleanup = null;
    catalogSubscription?.unsubscribe();
    catalogSubscription = null;
    pendingCatalogLoads.clear();
    store.setState({
        ...baseState,
        objectData: {},
        objectNums: [],
        playerObjectId: undefined,
        nearbyObjects: [],
        teamStatus: { ...emptyTeamStatus },
        attackQueue: [],
        commandDispatcher: null,
    });
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

export const selectNearbyObjects = (state: UiStoreState) => state.nearbyObjects;

export const selectTeamStatus = (state: UiStoreState) => state.teamStatus;

export const selectAttackQueue = (state: UiStoreState) => state.attackQueue;

export function useNearbyObjects(): readonly NearbyObject[] {
    return useUiStore((state) => state.nearbyObjects);
}

export function useTeamStatus(): TeamStatus {
    return useUiStore((state) => state.teamStatus);
}

export function useNpcDataset(): CatalogDatasetSlice<readonly NpcDefinition[]> | undefined {
    return useCatalogDataset<readonly NpcDefinition[]>(NPC_DATASET_KEY);
}

export function useLoadNpcDataset(): (options?: CatalogLoadOptions) => Promise<void> {
    const loadDataset = useUiStore((state) => state.loadDataset);
    return useCallback((options?: CatalogLoadOptions) => loadDataset(NPC_DATASET_KEY, options), [loadDataset]);
}

export function useEnsureNpcDataset(): (options?: CatalogLoadOptions) => Promise<readonly NpcDefinition[]> {
    const ensureDataset = useUiStore((state) => state.ensureDataset);
    return useCallback(
        (options?: CatalogLoadOptions) => ensureDataset<readonly NpcDefinition[]>(NPC_DATASET_KEY, options),
        [ensureDataset],
    );
}

export function useSyncNpcDataset(): () => void {
    const syncDataset = useUiStore((state) => state.syncDataset);
    return useCallback(() => syncDataset(NPC_DATASET_KEY), [syncDataset]);
}

export function ensureMapDataset(options?: CatalogLoadOptions): Promise<MapData.Map> {
    return uiStore.getState().ensureDataset<MapData.Map>(MAP_DATASET_KEY, options);
}

export function ensureColorDataset(options?: CatalogLoadOptions): Promise<MapData.Env[]> {
    return uiStore.getState().ensureDataset<MapData.Env[]>(COLORS_DATASET_KEY, options);
}

export function ensureNpcDataset(options?: CatalogLoadOptions): Promise<readonly NpcDefinition[]> {
    return uiStore.getState().ensureDataset<readonly NpcDefinition[]>(NPC_DATASET_KEY, options);
}

export function useUiDispatch() {
    return useStore(storeWithSelector, (state) => state.dispatch);
}

