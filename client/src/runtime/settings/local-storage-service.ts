import storage, { getItemSync } from '../../storage';
import { defaultSettings } from '../../defaultSettings';
import type { Observable, SettingsService, SettingsSnapshot } from './settings-service';
import { settingsEventHub } from './settings-service';

type StorageModule = typeof storage;

type StorageChange = {
    [key: string]: { oldValue: unknown; newValue: unknown };
};

class BehaviorSubject<T> implements Observable<T> {
    private value: T;
    private readonly listeners = new Set<(value: T) => void>();

    constructor(initial: T) {
        this.value = initial;
    }

    getValue(): T {
        return this.value;
    }

    next(value: T) {
        this.value = value;
        this.listeners.forEach(listener => listener(value));
    }

    subscribe(listener: (value: T) => void) {
        this.listeners.add(listener);
        listener(this.value);
        return {
            unsubscribe: () => {
                this.listeners.delete(listener);
            },
        };
    }
}

function asError(error: unknown): Error {
    if (error instanceof Error) {
        return error;
    }
    return new Error(typeof error === 'string' ? error : 'Unknown error');
}

function normalizeSnapshot(snapshot: unknown): SettingsSnapshot {
    const overrides = snapshot && typeof snapshot === 'object' ? snapshot as Record<string, unknown> : {};
    return {
        ...defaultSettings,
        ...overrides,
    } as SettingsSnapshot;
}

export class LocalStorageSettingsService implements SettingsService {
    private readonly subject: BehaviorSubject<SettingsSnapshot>;
    private readonly storage: StorageModule;
    private readonly listener: ((changes: StorageChange) => void) | null;
    private suppressNextChange = false;

    readonly settings$: Observable<SettingsSnapshot>;

    constructor(store: StorageModule = storage) {
        this.storage = store;
        const initial = normalizeSnapshot(getItemSync('settings')?.settings);
        this.subject = new BehaviorSubject(initial);
        this.settings$ = this.subject;
        settingsEventHub.emit('settings.updated', initial);

        const listener = (changes: StorageChange) => {
            const change = changes['settings'];
            if (!change) {
                return;
            }
            if (this.suppressNextChange) {
                this.suppressNextChange = false;
                return;
            }
            const next = normalizeSnapshot(change.newValue);
            this.applySnapshot(next);
        };

        if (this.storage.onChanged?.addListener) {
            this.listener = listener;
            this.storage.onChanged.addListener(listener);
        } else {
            this.listener = null;
        }
    }

    async update(patch: Partial<SettingsSnapshot>): Promise<void> {
        const current = this.subject.getValue();
        const next = normalizeSnapshot({ ...current, ...patch });
        try {
            this.suppressNextChange = !!this.listener;
            await this.storage.setItem('settings', next);
            this.applySnapshot(next);
        } catch (error) {
            this.suppressNextChange = false;
            const err = asError(error);
            settingsEventHub.emit('settings.error', err);
            throw err;
        }
    }

    destroy() {
        if (this.listener && this.storage.onChanged?.removeListener) {
            this.storage.onChanged.removeListener(this.listener);
        }
    }

    private applySnapshot(snapshot: SettingsSnapshot) {
        this.subject.next(snapshot);
        settingsEventHub.emit('settings.updated', snapshot);
    }
}

