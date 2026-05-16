import { globalStorage } from './storage';
import type { BindSettings, Keymap, KeymapStore } from './keymapTypes';
import {
    ACTIVE_KEYMAP_STORAGE_KEY,
    DEFAULT_KEYMAP_ID,
    DEFAULT_KEYMAP_NAME,
} from './keymapTypes';

// Default binds (duplicated from Binds.tsx so the module is self-contained)
const defaultBinds: BindSettings = {
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
        zerknij: { key: 'Numpad5' },
        special: { key: 'Numpad0' },
    },
    custom: [],
};

// ============================================================================
// Reading
// ============================================================================

/**
 * Load the full keymap store from localStorage.
 * Performs migration from the legacy flat-binds format if necessary.
 */
export function getKeymapStore(): KeymapStore {
    const stored = globalStorage.get('keymaps');
    if (stored) {
        if (stored.version === 1 && stored.keymaps && typeof stored.keymaps === 'object') {
            return stored;
        }
    }

    // No valid keymaps store – migrate from legacy binds
    return migrateLegacyBinds();
}

/**
 * Get the active keymap ID for this device.
 * Falls back to the legacy `arkadia.activeKeymap` key, then to the default keymap.
 */
export function getActiveKeymapId(): string {
    const stored = globalStorage.get('active_keymap_id');
    if (stored) return stored;

    // Migrate legacy key if present
    const legacy = localStorage.getItem(ACTIVE_KEYMAP_STORAGE_KEY);
    if (legacy) {
        const id = legacy.replace(/^"|"$/g, '');
        globalStorage.set('active_keymap_id', id);
        localStorage.removeItem(ACTIVE_KEYMAP_STORAGE_KEY);
        return id;
    }

    return DEFAULT_KEYMAP_ID;
}

/**
 * Get the active Keymap object (resolved from store + active ID).
 * Always returns a valid keymap; falls back to the first available or a
 * freshly-created default.
 */
export function getActiveKeymap(): Keymap {
    const store = getKeymapStore();
    const activeId = getActiveKeymapId();

    if (store.keymaps[activeId]) {
        return store.keymaps[activeId];
    }

    // Active keymap ID points to a keymap that no longer exists – pick first
    const ids = Object.keys(store.keymaps);
    if (ids.length > 0) {
        const fallback = store.keymaps[ids[0]];
        setActiveKeymapId(fallback.id);
        return fallback;
    }

    // Store is completely empty – should not happen, but create default
    const fallback = createDefaultKeymap(defaultBinds);
    store.keymaps[fallback.id] = fallback;
    saveKeymapStore(store);
    setActiveKeymapId(fallback.id);
    return fallback;
}

/**
 * Get the active keymap's flat BindSettings.
 */
export function getActiveBindSettings(): BindSettings {
    return getActiveKeymap().binds;
}

/**
 * Get a sorted list of all keymaps (for UI display).
 */
export function getKeymapList(): Keymap[] {
    const store = getKeymapStore();
    return Object.values(store.keymaps).sort((a, b) => {
        // Default keymap always first
        if (a.id === DEFAULT_KEYMAP_ID) return -1;
        if (b.id === DEFAULT_KEYMAP_ID) return 1;
        return a.createdAt.localeCompare(b.createdAt);
    });
}

// ============================================================================
// Writing
// ============================================================================

/**
 * Persist the full keymap store to localStorage.
 */
export function saveKeymapStore(store: KeymapStore): void {
    globalStorage.set('keymaps', store);
}

/**
 * Set the active keymap ID for this device.
 */
export function setActiveKeymapId(id: string): void {
    globalStorage.set('active_keymap_id', id);
}

/**
 * Switch to a different keymap.
 * Updates the active keymap ID and writes the keymap's binds to the `binds`
 * storage key so all runtime consumers pick up the change.
 */
export function switchKeymap(keymapId: string): void {
    const store = getKeymapStore();
    const keymap = store.keymaps[keymapId];
    if (!keymap) {
        console.warn(`[Keymap] Cannot switch to unknown keymap: ${keymapId}`);
        return;
    }
    setActiveKeymapId(keymapId);
    // Write flat binds to the `binds` key – this triggers storage.onChanged
    // which propagates to Client.ts and all other runtime consumers.
    globalStorage.set('binds', keymap.binds);
}

/**
 * Save the binds for a specific keymap.  If it is the active keymap, also
 * update the flat `binds` storage key so runtime consumers see the change.
 */
export function saveKeymapBinds(keymapId: string, binds: BindSettings): void {
    const store = getKeymapStore();
    const keymap = store.keymaps[keymapId];
    if (!keymap) {
        console.warn(`[Keymap] Cannot save binds for unknown keymap: ${keymapId}`);
        return;
    }
    keymap.binds = binds;
    saveKeymapStore(store);

    if (keymapId === getActiveKeymapId()) {
        globalStorage.set('binds', binds);
    }
}

/**
 * Create a new keymap by cloning the given binds.
 * Returns the newly created keymap.
 */
export function createKeymap(name: string, binds: BindSettings): Keymap {
    const store = getKeymapStore();
    const id = crypto.randomUUID();
    const keymap: Keymap = {
        id,
        name: name.trim() || 'Nowa mapa klawiszy',
        binds: structuredClone(binds),
        createdAt: new Date().toISOString(),
    };
    store.keymaps[id] = keymap;
    saveKeymapStore(store);
    return keymap;
}

/**
 * Rename an existing keymap.
 */
export function renameKeymap(keymapId: string, newName: string): void {
    const store = getKeymapStore();
    const keymap = store.keymaps[keymapId];
    if (!keymap) return;
    keymap.name = newName.trim() || keymap.name;
    saveKeymapStore(store);
}

/**
 * Delete a keymap.  Cannot delete the last remaining keymap.
 * If the deleted keymap was active, switches to the first available.
 */
export function deleteKeymap(keymapId: string): boolean {
    const store = getKeymapStore();
    const ids = Object.keys(store.keymaps);
    if (ids.length <= 1) {
        return false; // Cannot delete the last keymap
    }
    if (!store.keymaps[keymapId]) {
        return false;
    }

    delete store.keymaps[keymapId];
    saveKeymapStore(store);

    // If deleted the active keymap, switch to first remaining
    if (getActiveKeymapId() === keymapId) {
        const remaining = Object.keys(store.keymaps);
        switchKeymap(remaining[0]);
    }

    return true;
}

// ============================================================================
// Migration
// ============================================================================

/**
 * Migrate from the legacy flat-binds format (where `localStorage['binds']`
 * contained a bare BindSettings object) to the new keymaps store.
 *
 * Called automatically on first load when no `keymaps` key is present.
 */
function migrateLegacyBinds(): KeymapStore {
    let existingBinds: BindSettings = defaultBinds;

    const raw = localStorage.getItem('binds');
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !parsed.version) {
                existingBinds = mergeBindSettings(parsed);
            }
        } catch {
            // Use defaults
        }
    }

    const keymap = createDefaultKeymap(existingBinds);
    const store: KeymapStore = {
        version: 1,
        keymaps: { [keymap.id]: keymap },
    };

    saveKeymapStore(store);

    // Ensure active keymap is set
    if (!globalStorage.get('active_keymap_id')) {
        setActiveKeymapId(keymap.id);
    }

    console.log('[Keymap] Migrated legacy binds to keymap store');
    return store;
}

function createDefaultKeymap(binds: BindSettings): Keymap {
    return {
        id: DEFAULT_KEYMAP_ID,
        name: DEFAULT_KEYMAP_NAME,
        binds: structuredClone(binds),
        createdAt: new Date().toISOString(),
    };
}

/**
 * Merge a partial / legacy binds object with defaults to ensure
 * all required fields are present.
 */
function mergeBindSettings(raw: any): BindSettings {
    return {
        ...defaultBinds,
        main: raw.main || defaultBinds.main,
        mainGates: raw.mainGates && typeof raw.mainGates === 'object' ? raw.mainGates : undefined,
        mainTransport: raw.mainTransport && typeof raw.mainTransport === 'object' ? raw.mainTransport : undefined,
        mainLoot: raw.mainLoot && typeof raw.mainLoot === 'object' ? raw.mainLoot : undefined,
        lamp: raw.lamp || defaultBinds.lamp,
        attack: raw.attack || defaultBinds.attack,
        support: raw.support || defaultBinds.support,
        moveMode: raw.moveMode || defaultBinds.moveMode,
        roomBind: raw.roomBind || defaultBinds.roomBind,
        drinkable: raw.drinkable || defaultBinds.drinkable,
        temp: Array.isArray(raw.temp) && raw.temp.length >= 2
            ? [
                { ...defaultBinds.temp[0], ...(raw.temp[0] || {}) },
                { ...defaultBinds.temp[1], ...(raw.temp[1] || {}) },
            ]
            : [...defaultBinds.temp],
        enemy: Array.isArray(raw.enemy) && raw.enemy.length >= 3
            ? [
                { ...defaultBinds.enemy[0], ...(raw.enemy[0] || {}) },
                { ...defaultBinds.enemy[1], ...(raw.enemy[1] || {}) },
                { ...defaultBinds.enemy[2], ...(raw.enemy[2] || {}) },
            ]
            : [...defaultBinds.enemy],
        enemyBlock: Array.isArray(raw.enemyBlock) && raw.enemyBlock.length >= 3
            ? [
                { ...defaultBinds.enemyBlock[0], ...(raw.enemyBlock[0] || {}) },
                { ...defaultBinds.enemyBlock[1], ...(raw.enemyBlock[1] || {}) },
                { ...defaultBinds.enemyBlock[2], ...(raw.enemyBlock[2] || {}) },
            ]
            : [...defaultBinds.enemyBlock],
        directions: {
            ...defaultBinds.directions,
            ...(raw.directions || {}),
        },
        custom: Array.isArray(raw.custom) ? raw.custom : [],
    };
}

// Also export mergeBindSettings for use in Binds.tsx
export { mergeBindSettings, defaultBinds };
