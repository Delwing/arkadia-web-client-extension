import {
    type CharacterStorageSchema,
    type GlobalStorageSchema,
    CHARACTER_KEY_OPTIONS,
    characterStorageKeys,
} from './storageSchema';

let currentCharacter: string | null = localStorage.getItem('currentCharacter');

/**
 * Keys that were newly made character-scoped in the storage redesign.
 * These need a one-time migration for users who already had currentCharacter set.
 */
const NEWLY_SCOPED_KEYS = [
    'kill_counter_session',
    'kill_counter_team',
    'improve_counter',
    'attack_mode',
    'chat_history',
] as const;

const SCOPED_MIGRATION_FLAG = 'characterScopeMigrationV1';

/**
 * Migrate newly character-scoped keys for existing profiles.
 * The first-character migration in setCharacter only runs when no character was ever set.
 * This handles users who already had currentCharacter — their unscoped data for the
 * newly scoped keys would otherwise become unreachable.
 */
export function migrateNewlyCharacterScopedKeys(): void {
    if (localStorage.getItem(SCOPED_MIGRATION_FLAG)) return;

    const character = localStorage.getItem('currentCharacter');
    if (character) {
        for (const key of NEWLY_SCOPED_KEYS) {
            const raw = localStorage.getItem(key);
            if (raw !== null && localStorage.getItem(`${character}:${key}`) === null) {
                localStorage.setItem(`${character}:${key}`, raw);
                localStorage.removeItem(key);
            }
        }
    }

    localStorage.setItem(SCOPED_MIGRATION_FLAG, '1');
}

const characterKeySet = new Set<string>(characterStorageKeys);

// ---------------------------------------------------------------------------
// TypedStorage classes
// ---------------------------------------------------------------------------

type ChangeListener<T> = (newValue: T | undefined, oldValue: T | undefined) => void;
type AnyChangeListener = (key: string, newValue: any, oldValue: any) => void;

/**
 * Generic typed storage wrapper over localStorage.
 * Provides synchronous get/set with JSON serialization and per-key onChange listeners.
 */
export class TypedStorage<TSchema extends Record<string, any>> {
    private listeners = new Map<string, Set<ChangeListener<any>>>();
    private anyChangeListeners?: Set<AnyChangeListener>;
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

    /** Register a listener that fires on ANY key change in this storage namespace. */
    onAnyChange(listener: AnyChangeListener): () => void {
        if (!this.anyChangeListeners) this.anyChangeListeners = new Set();
        this.anyChangeListeners.add(listener);
        return () => { this.anyChangeListeners!.delete(listener); };
    }

    /** Fire typed per-key listeners and any-change listeners. */
    fireListeners<K extends keyof TSchema & string>(key: K, newValue: TSchema[K] | undefined, oldValue: TSchema[K] | undefined): void {
        const set = this.listeners.get(key);
        if (set) {
            set.forEach(l => l(newValue, oldValue));
        }
        this.anyChangeListeners?.forEach(l => l(key, newValue, oldValue));
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
    private characterChangeListeners = new Set<(char: string | null) => void>();

    constructor() {
        super((key) => currentCharacter ? `${currentCharacter}:${key}` : key);
    }

    getCharacter(): string | null {
        return currentCharacter;
    }

    /** Register a listener that fires whenever the active character changes. */
    onCharacterChange(listener: (char: string | null) => void): () => void {
        this.characterChangeListeners.add(listener);
        return () => { this.characterChangeListeners.delete(listener); };
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

        // The name is re-announced through the session, and re-announcing it changes nothing about
        // what this storage points at. Listeners hear about a switch only when it is one, so none
        // of them has to tell a switch from a repeat for itself.
        if (prev === currentCharacter) return;

        // Fire change events for all character-scoped keys
        this.notifyCharacterChange(prev);

        // Fire character change listeners
        this.characterChangeListeners.forEach(l => l(currentCharacter));
    }

    /** Handle cross-tab character change from another tab. */
    handleCrossTabCharacterChange(newCharacterValue: string | null): void {
        const prev = currentCharacter;
        currentCharacter = newCharacterValue;
        if (prev === currentCharacter) return;
        this.notifyCharacterChange(prev);
        this.characterChangeListeners.forEach(l => l(currentCharacter));
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

            this.fireListeners(key, newValue, oldValue);
        });
    }

    override handleStorageEvent(storageKey: string, oldRaw: string | null, newRaw: string | null): boolean {
        const idx = storageKey.indexOf(':');
        if (idx > 0) {
            const base = storageKey.substring(idx + 1);
            if (characterKeySet.has(base)) {
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
        // Only handle keys that are NOT character-scoped (no colon prefix)
        if (characterKeySet.has(storageKey) || storageKey.indexOf(':') > 0) {
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
// Cross-tab storage sync
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined') {
    window.addEventListener('storage', (ev: StorageEvent) => {
        if (!ev.key) return;
        if (ev.key === 'currentCharacter') {
            characterStorage.handleCrossTabCharacterChange(ev.newValue);
            return;
        }
        characterStorage.handleStorageEvent(ev.key, ev.oldValue, ev.newValue);
        globalStorage.handleStorageEvent(ev.key, ev.oldValue, ev.newValue);
    });
}
