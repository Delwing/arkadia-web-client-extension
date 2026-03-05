import { defaultSettings } from './defaultSettings';
import { LUA_GAGS_STORAGE_KEY, LUA_GAGS_COLORS_STORAGE_KEY, LUA_GAGS_WALKA_CONFIG_STORAGE_KEY } from "@client/luaGagsSettings";
import {
    type CharacterStorageSchema,
    type GlobalStorageSchema,
    CHARACTER_KEY_OPTIONS,
    characterStorageKeys,
} from './storageSchema';
import { fetchWithCache } from './httpCache';

// ---------------------------------------------------------------------------
// Legacy Storage interface & download (kept for backward compat)
// ---------------------------------------------------------------------------

interface Storage {
    getItem(key: string): Promise<any>;

    setItem(key: string, value: any): Promise<any>;

    downloadItem(url: string, ttl: number): Promise<{value: any, cacheTime: number, ttl: number }>;

    onChanged?: {
        addListener: (listener: (changes: { [key: string]: { oldValue: any, newValue: any } }) => void) => void;
        removeListener?: (listener: (changes: { [key: string]: { oldValue: any, newValue: any } }) => void) => void;
    };
}

/** @deprecated Use fetchWithCache from httpCache.ts directly */
const download = async (_storage: Storage, url: string, ttl: number) => {
    return fetchWithCache(url, ttl);
}

// ---------------------------------------------------------------------------
// Legacy character-scoped key set (used by old code paths)
// ---------------------------------------------------------------------------

const characterScopedKeys = new Set([
    'settings',
    'kill_counter',
    'improve_counter_lifetime',
    'deposits',
    'containers',
    'herb_counts',
    'herbs_data',
    'mapperRoomId',
    'lastLang',
    'object_num',
    'clock_active_domain',
    'language_max_levels',
    'profession',
    'introduced_remembered',
    'introduced_presented',
    'peopleLocalEvents',
    LUA_GAGS_STORAGE_KEY,
    LUA_GAGS_COLORS_STORAGE_KEY,
    LUA_GAGS_WALKA_CONFIG_STORAGE_KEY,
]);

let currentCharacter: string | null = localStorage.getItem('currentCharacter');

// ---------------------------------------------------------------------------
// New TypedStorage classes
// ---------------------------------------------------------------------------

type ChangeListener<T> = (newValue: T | undefined, oldValue: T | undefined) => void;

/**
 * Generic typed storage wrapper over localStorage.
 * Provides synchronous get/set with JSON serialization and per-key onChange listeners.
 */
export class TypedStorage<TSchema extends Record<string, any>> {
    private listeners = new Map<string, Set<ChangeListener<any>>>();
    private resolveKeyFn: ((key: string) => string) | undefined;

    constructor(resolveKey?: (key: string) => string) {
        this.resolveKeyFn = resolveKey;
    }

    private resolveKey(key: string): string {
        return this.resolveKeyFn ? this.resolveKeyFn(key) : key;
    }

    get<K extends keyof TSchema & string>(key: K): TSchema[K] | undefined {
        const realKey = this.resolveKey(key);
        const raw = localStorage.getItem(realKey);
        if (raw !== null) {
            try { return JSON.parse(raw) as TSchema[K]; } catch { return raw as any; }
        }
        return undefined;
    }

    set<K extends keyof TSchema & string>(key: K, value: TSchema[K]): void {
        const realKey = this.resolveKey(key);
        const oldRaw = localStorage.getItem(realKey);
        let oldValue: TSchema[K] | undefined;
        if (oldRaw !== null) {
            try { oldValue = JSON.parse(oldRaw); } catch { oldValue = oldRaw as any; }
        }
        localStorage.setItem(realKey, JSON.stringify(value));
        this.fireListeners(key, value, oldValue);
        // Also notify legacy listeners
        const changes: { [k: string]: { oldValue: any, newValue: any } } = {
            [key]: { oldValue, newValue: value }
        };
        (storage as any).listeners?.forEach?.((l: any) => l(changes));
    }

    remove<K extends keyof TSchema & string>(key: K): void {
        const realKey = this.resolveKey(key);
        const oldRaw = localStorage.getItem(realKey);
        let oldValue: TSchema[K] | undefined;
        if (oldRaw !== null) {
            try { oldValue = JSON.parse(oldRaw); } catch { oldValue = oldRaw as any; }
        }
        localStorage.removeItem(realKey);
        this.fireListeners(key, undefined, oldValue);
    }

    onChange<K extends keyof TSchema & string>(
        key: K,
        listener: ChangeListener<TSchema[K]>,
    ): () => void {
        let set = this.listeners.get(key);
        if (!set) {
            set = new Set();
            this.listeners.set(key, set);
        }
        set.add(listener);
        return () => { set!.delete(listener); };
    }

    /** Fire typed per-key listeners. */
    fireListeners<K extends keyof TSchema & string>(key: K, newValue: TSchema[K] | undefined, oldValue: TSchema[K] | undefined): void {
        const set = this.listeners.get(key);
        if (set) {
            set.forEach(l => l(newValue, oldValue));
        }
    }

    /** Handle cross-tab StorageEvent for a resolved key. Returns true if handled. */
    handleStorageEvent(_storageKey: string, _oldRaw: string | null, _newRaw: string | null): boolean {
        // Subclasses override to map storageKey back to schema key
        return false;
    }
}

/**
 * Character-scoped typed storage. Keys are prefixed with `<character>:` in localStorage.
 */
export class CharacterTypedStorage extends TypedStorage<CharacterStorageSchema> {
    constructor() {
        super((key) => currentCharacter ? `${currentCharacter}:${key}` : key);
    }

    getCharacter(): string | null {
        return currentCharacter;
    }

    setCharacter(name: string): void {
        const prev = currentCharacter;
        const firstCharacter = !currentCharacter && !localStorage.getItem('currentCharacter');
        currentCharacter = name ? String(name) : null;

        // First-character migration: move unscoped keys to character-prefixed
        if (firstCharacter && currentCharacter) {
            characterStorageKeys.forEach(key => {
                const raw = localStorage.getItem(key);
                if (raw !== null) {
                    localStorage.setItem(`${currentCharacter}:${key}`, raw);
                    localStorage.removeItem(key);
                }
            });
        }

        if (currentCharacter) {
            localStorage.setItem('currentCharacter', currentCharacter);
        } else {
            localStorage.removeItem('currentCharacter');
        }

        // Fire change events for all character-scoped keys
        this.notifyCharacterChange(prev);
    }

    private notifyCharacterChange(prev: string | null): void {
        characterStorageKeys.forEach(key => {
            const prevKey = prev ? `${prev}:${key}` : key;
            const newKey = currentCharacter ? `${currentCharacter}:${key}` : key;
            const oldRaw = localStorage.getItem(prevKey);
            const newRaw = localStorage.getItem(newKey);
            if (oldRaw === newRaw) {
                return;
            }
            const opts = CHARACTER_KEY_OPTIONS[key];
            if (newRaw === null && !opts?.notifyOnNull) {
                return;
            }
            let oldValue: any;
            let newValue: any;
            if (oldRaw !== null) { try { oldValue = JSON.parse(oldRaw); } catch { oldValue = oldRaw; } }
            if (newRaw !== null) { try { newValue = JSON.parse(newRaw); } catch { newValue = newRaw; } }

            // Fire typed per-key listeners
            this.fireListeners(key, newValue, oldValue);

            // Also fire legacy listeners
            const changes: { [k: string]: { oldValue: any, newValue: any } } = {
                [key]: { oldValue, newValue }
            };
            (storage as any).listeners?.forEach?.((l: any) => l(changes));
        });
    }

    override handleStorageEvent(storageKey: string, oldRaw: string | null, newRaw: string | null): boolean {
        const idx = storageKey.indexOf(':');
        if (idx > 0) {
            const base = storageKey.substring(idx + 1);
            if (characterScopedKeys.has(base)) {
                let oldValue: any;
                let newValue: any;
                if (oldRaw !== null) { try { oldValue = JSON.parse(oldRaw); } catch { oldValue = oldRaw; } }
                if (newRaw !== null) { try { newValue = JSON.parse(newRaw); } catch { newValue = newRaw; } }
                this.fireListeners(base as keyof CharacterStorageSchema & string, newValue, oldValue);
                return true;
            }
        }
        return false;
    }
}

/**
 * Global (non-character-scoped) typed storage.
 */
export class GlobalTypedStorage extends TypedStorage<GlobalStorageSchema> {
    constructor() {
        super();
    }

    override handleStorageEvent(storageKey: string, oldRaw: string | null, newRaw: string | null): boolean {
        // Only handle keys that are NOT character-scoped
        if (characterScopedKeys.has(storageKey) || storageKey.indexOf(':') > 0) {
            return false;
        }
        let oldValue: any;
        let newValue: any;
        if (oldRaw !== null) { try { oldValue = JSON.parse(oldRaw); } catch { oldValue = oldRaw; } }
        if (newRaw !== null) { try { newValue = JSON.parse(newRaw); } catch { newValue = newRaw; } }
        this.fireListeners(storageKey as keyof GlobalStorageSchema & string, newValue, oldValue);
        return true;
    }
}

/** Character-scoped typed storage singleton. */
export const characterStorage = new CharacterTypedStorage();

/** Global typed storage singleton. */
export const globalStorage = new GlobalTypedStorage();

// ---------------------------------------------------------------------------
// Legacy code (backward compat)
// ---------------------------------------------------------------------------

function notifyCharacterChange(prev: string | null) {
    characterScopedKeys.forEach(key => {
        const prevKey = prev ? `${prev}:${key}` : key;
        const newKey = currentCharacter ? `${currentCharacter}:${key}` : key;
        const oldRaw = localStorage.getItem(prevKey);
        const newRaw = localStorage.getItem(newKey);
        if (oldRaw === newRaw) {
            return;
        }
        if (newRaw === null && key !== 'settings' && key !== 'peopleLocalEvents') {
            return;
        }
        let oldValue: any = undefined;
        let newValue: any;
        if (oldRaw !== null) { try { oldValue = JSON.parse(oldRaw); } catch { oldValue = oldRaw; } }
        if (newRaw !== null) { try { newValue = JSON.parse(newRaw); } catch { newValue = newRaw; } }
        const changes: { [key: string]: { oldValue: any, newValue: any } } = {
            [key]: { oldValue, newValue }
        };
        (storage as any).listeners?.forEach?.((l: any) => l(changes));
    });
}

export function setCurrentCharacter(name: string) {
    characterStorage.setCharacter(name);
}

export function getCurrentCharacter() {
    return currentCharacter;
}

function applyCharacterScope(key: string): string {
    if (currentCharacter && characterScopedKeys.has(key)) {
        return `${currentCharacter}:${key}`;
    }
    return key;
}

function stripCharacterScope(key: string): string {
    const idx = key.indexOf(':');
    if (idx > 0) {
        const base = key.substring(idx + 1);
        if (characterScopedKeys.has(base)) {
            return base;
        }
    }
    return key;
}

class LocalStorage implements Storage {
    private listeners: Array<(changes: { [key: string]: { oldValue: any, newValue: any } }) => void> = [];

    constructor() {
        const saved = localStorage.getItem('currentCharacter');
        if (saved) {
            currentCharacter = saved;
        }

        window.addEventListener('storage', (ev: StorageEvent) => {
            if (!ev.key) return;
            if (ev.key === 'currentCharacter') {
                const prev = currentCharacter;
                currentCharacter = ev.newValue;
                notifyCharacterChange(prev);
                return;
            }
            const baseKey = stripCharacterScope(ev.key);
            const changes: { [key: string]: { oldValue: any, newValue: any } } = {};
            let oldValue: any = undefined;
            if (ev.oldValue !== null) {
                try { oldValue = JSON.parse(ev.oldValue); } catch { oldValue = ev.oldValue; }
            }
            let newValue: any = undefined;
            if (ev.newValue !== null) {
                try { newValue = JSON.parse(ev.newValue); } catch { newValue = ev.newValue; }
            }
            changes[baseKey] = { oldValue, newValue };
            this.listeners.forEach(l => l(changes));

            // Also fire typed storage listeners for cross-tab sync
            characterStorage.handleStorageEvent(ev.key, ev.oldValue, ev.newValue);
            globalStorage.handleStorageEvent(ev.key, ev.oldValue, ev.newValue);
        });
    }

    getItem(key: string): Promise<any> {
        const realKey = applyCharacterScope(key);
        const value = localStorage.getItem(realKey);
        if (value) {
            try {
                const parsed = JSON.parse(value)
                return Promise.resolve({[key]: parsed})
            } catch (_e) {
                return Promise.resolve({[key]: value})
            }
        }
        if (key === 'settings') {
            return Promise.resolve({ [key]: { ...defaultSettings } });
        }
        return Promise.resolve();
    }

    setItem(key: string, value: any): Promise<void> {
        const realKey = applyCharacterScope(key);
        const oldRaw = localStorage.getItem(realKey);
        let oldValue: any = undefined;
        if (oldRaw !== null) {
            try { oldValue = JSON.parse(oldRaw); } catch { oldValue = oldRaw; }
        }
        localStorage.setItem(realKey, JSON.stringify(value));
        const changes: { [key: string]: { oldValue: any, newValue: any } } = {
            [key]: { oldValue, newValue: value }
        };
        this.listeners.forEach(l => l(changes));
        return Promise.resolve();
    }

    downloadItem(url: string, ttl: number): Promise<any> {
        return download(this, url, ttl)
    }

    onChanged = {
        addListener: (listener: (changes: { [key: string]: { oldValue: any, newValue: any } }) => void) => {
            this.listeners.push(listener);
        },
        removeListener: (listener: (changes: { [key: string]: { oldValue: any, newValue: any } }) => void) => {
            this.listeners = this.listeners.filter(l => l !== listener);
        }
    }
}

const storage: Storage = new LocalStorage();
export default storage;

export function getItemSync(key: string): any {
    const realKey = applyCharacterScope(key);
    const value = localStorage.getItem(realKey);
    if (value !== null) {
        try { return { [key]: JSON.parse(value) }; } catch { return { [key]: value }; }
    }
    if (key === 'settings') {
        return { [key]: { ...defaultSettings } };
    }
    return undefined;
}

export function setItemSync(key: string, value: any) {
    const realKey = applyCharacterScope(key);
    const oldRaw = localStorage.getItem(realKey);
    let oldValue: any = undefined;
    if (oldRaw !== null) {
        try { oldValue = JSON.parse(oldRaw); } catch { oldValue = oldRaw; }
    }
    localStorage.setItem(realKey, JSON.stringify(value));
    const changes: { [key: string]: { oldValue: any, newValue: any } } = {
        [key]: { oldValue, newValue: value }
    };
    (storage as any).listeners?.forEach?.((l: any) => l(changes));
}
