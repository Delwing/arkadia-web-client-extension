export interface Bind {
    key: string;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
}

export interface CustomBind extends Bind {
    command: string;
}

export interface DirectionBinds {
    n: Bind;
    s: Bind;
    w: Bind;
    e: Bind;
    nw: Bind;
    ne: Bind;
    sw: Bind;
    se: Bind;
    u: Bind;
    d: Bind;
    special: Bind;
}

export interface BindSettings {
    main: Bind;
    lamp: Bind;
    attack: Bind;
    support: Bind;
    moveMode: Bind;
    roomBind: Bind;
    drinkable: Bind;
    directions: DirectionBinds;
    custom: CustomBind[];
    temp: Bind[];
    enemy: Bind[];
    enemyBlock: Bind[];
}

export interface KeymapEntry {
    id: string;
    name: string;
    binds: BindSettings;
}

export interface BindsStore {
    version: 2;
    keymaps: KeymapEntry[];
}

export const BINDS_STORAGE_VERSION = 2 as const;
export const BINDS_KEYMAP_ID_STORAGE_KEY = 'bindsKeymapId';
export const DEFAULT_KEYMAP_NAME = 'Domyslna';

export const defaultBinds: BindSettings = {
    main: { key: 'BracketRight' },
    lamp: { key: 'Digit4', ctrl: true },
    attack: { key: 'Digit1', ctrl: true },
    support: { key: 'KeyQ', ctrl: true },
    moveMode: { key: 'Backquote' },
    roomBind: { key: 'KeyP', alt: true },
    drinkable: { key: 'KeyN', alt: true },
    temp: [
        { key: 'F4' },
        { key: 'F5' },
    ],
    enemy: [
        { key: 'F1' },
        { key: 'F2' },
        { key: 'F3' },
    ],
    enemyBlock: [
        { key: 'F1', ctrl: true },
        { key: 'F2', ctrl: true },
        { key: 'F3', ctrl: true },
    ],
    directions: {
        n: { key: 'Numpad8' },
        s: { key: 'Numpad2' },
        w: { key: 'Numpad4' },
        e: { key: 'Numpad6' },
        nw: { key: 'Numpad7' },
        ne: { key: 'Numpad9' },
        sw: { key: 'Numpad1' },
        se: { key: 'Numpad3' },
        u: { key: 'NumpadMultiply' },
        d: { key: 'NumpadSubtract' },
        special: { key: 'Numpad0' },
    },
    custom: [],
};

const directionKeys: Array<keyof DirectionBinds> = [
    'n',
    's',
    'w',
    'e',
    'nw',
    'ne',
    'sw',
    'se',
    'u',
    'd',
    'special',
];

export function mergeBindSettings(
    base: BindSettings,
    overrides?: Partial<BindSettings>
): BindSettings {
    const temp = overrides?.temp ?? [];
    const enemy = overrides?.enemy ?? [];
    const enemyBlock = overrides?.enemyBlock ?? [];
    const directionsOverrides = overrides?.directions ?? {};

    return {
        ...base,
        main: { ...base.main, ...(overrides?.main ?? {}) },
        lamp: { ...base.lamp, ...(overrides?.lamp ?? {}) },
        attack: { ...base.attack, ...(overrides?.attack ?? {}) },
        support: { ...base.support, ...(overrides?.support ?? {}) },
        moveMode: { ...base.moveMode, ...(overrides?.moveMode ?? {}) },
        roomBind: { ...base.roomBind, ...(overrides?.roomBind ?? {}) },
        drinkable: { ...base.drinkable, ...(overrides?.drinkable ?? {}) },
        temp: base.temp.map((item, index) => ({ ...item, ...(temp[index] ?? {}) })),
        enemy: base.enemy.map((item, index) => ({ ...item, ...(enemy[index] ?? {}) })),
        enemyBlock: base.enemyBlock.map((item, index) => ({ ...item, ...(enemyBlock[index] ?? {}) })),
        directions: directionKeys.reduce<DirectionBinds>((acc, key) => {
            acc[key] = { ...base.directions[key], ...(directionsOverrides[key] ?? {}) };
            return acc;
        }, {} as DirectionBinds),
        custom: Array.isArray(overrides?.custom) ? overrides?.custom ?? [] : base.custom,
    };
}

export function cloneBindSettings(binds: BindSettings): BindSettings {
    if (typeof structuredClone === 'function') {
        return structuredClone(binds);
    }
    return JSON.parse(JSON.stringify(binds)) as BindSettings;
}

const bindSettingsKeys: Array<keyof BindSettings> = [
    'main',
    'lamp',
    'attack',
    'support',
    'moveMode',
    'roomBind',
    'drinkable',
    'directions',
    'custom',
    'temp',
    'enemy',
    'enemyBlock',
];

function isBindSettingsCandidate(value: unknown): value is Partial<BindSettings> {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    return bindSettingsKeys.some(key => key in candidate);
}

function buildKeymapName(index: number): string {
    if (index === 0) return DEFAULT_KEYMAP_NAME;
    return `Mapa ${index + 1}`;
}

function ensureKeymapId(entry: Partial<KeymapEntry> | null | undefined, index: number): string {
    if (entry?.id && typeof entry.id === 'string') return entry.id;
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `keymap-${Date.now()}-${index}`;
}

export function normalizeBindsStore(raw: unknown, fallback: BindSettings = defaultBinds): BindsStore {
    if (raw && typeof raw === 'object' && 'version' in raw && (raw as BindsStore).version === 2) {
        const entries = Array.isArray((raw as BindsStore).keymaps) ? (raw as BindsStore).keymaps : [];
        const normalized = entries
            .map((entry, index) => {
                if (!entry || typeof entry !== 'object') return null;
                const candidate = entry as Partial<KeymapEntry>;
                const binds = mergeBindSettings(fallback, candidate.binds as Partial<BindSettings> | undefined);
                return {
                    id: ensureKeymapId(candidate, index),
                    name: typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name : buildKeymapName(index),
                    binds,
                } as KeymapEntry;
            })
            .filter((entry): entry is KeymapEntry => entry !== null);
        if (normalized.length > 0) {
            return { version: BINDS_STORAGE_VERSION, keymaps: normalized };
        }
    }

    if (isBindSettingsCandidate(raw)) {
        return {
            version: BINDS_STORAGE_VERSION,
            keymaps: [{
                id: 'default',
                name: DEFAULT_KEYMAP_NAME,
                binds: mergeBindSettings(fallback, raw),
            }],
        };
    }

    return {
        version: BINDS_STORAGE_VERSION,
        keymaps: [{
            id: 'default',
            name: DEFAULT_KEYMAP_NAME,
            binds: cloneBindSettings(fallback),
        }],
    };
}

export function resolveActiveKeymapId(store: BindsStore, preferredId?: string | null): string {
    if (preferredId && store.keymaps.some(entry => entry.id === preferredId)) {
        return preferredId;
    }
    return store.keymaps[0]?.id ?? 'default';
}

export function resolveActiveBinds(
    raw: unknown,
    preferredId?: string | null,
    fallback: BindSettings = defaultBinds
): BindSettings {
    const store = normalizeBindsStore(raw, fallback);
    const activeId = resolveActiveKeymapId(store, preferredId);
    const entry = store.keymaps.find(item => item.id === activeId) ?? store.keymaps[0];
    return entry?.binds ?? cloneBindSettings(fallback);
}
