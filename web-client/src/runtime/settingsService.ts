import { defaultSettings, type Settings } from '@client/src/defaultSettings';
import storage, { getItemSync, setItemSync } from '@client/src/storage';

type SettingsListener = (settings: Settings) => void;

function normalizeSettings(raw: unknown): Settings {
    if (!raw || typeof raw !== 'object') {
        return { ...defaultSettings };
    }
    return { ...defaultSettings, ...(raw as Partial<Settings>) };
}

class SettingsService {
    private current: Settings;
    private readonly target = new EventTarget();
    private readonly storageListener = (changes: { [key: string]: { oldValue: any; newValue: any } }) => {
        const change = changes.settings;
        if (!change) {
            return;
        }
        this.current = normalizeSettings(change.newValue);
        this.emit();
    };

    constructor(initial: Settings) {
        this.current = { ...initial };
        storage.onChanged?.addListener(this.storageListener);
    }

    get snapshot(): Settings {
        return { ...this.current };
    }

    update(patch: Partial<Settings>) {
        this.current = { ...this.current, ...patch };
        setItemSync('settings', this.current);
        this.emit();
    }

    onChange(listener: SettingsListener): () => void {
        const handler = (ev: Event) => {
            listener((ev as CustomEvent<Settings>).detail);
        };
        this.target.addEventListener('change', handler);
        return () => this.target.removeEventListener('change', handler);
    }

    dispose() {
        storage.onChanged?.removeListener?.(this.storageListener);
    }

    private emit() {
        this.target.dispatchEvent(new CustomEvent<Settings>('change', { detail: this.snapshot }));
    }
}

let settingsServiceInstance: SettingsService | null = null;

export function createSettingsService(): SettingsService {
    if (settingsServiceInstance) {
        return settingsServiceInstance;
    }
    const stored = getItemSync('settings');
    const initial = normalizeSettings(stored?.settings);
    settingsServiceInstance = new SettingsService(initial);
    return settingsServiceInstance;
}

export function setSettingsService(service: SettingsService) {
    settingsServiceInstance = service;
}

export function getSettingsService(): SettingsService {
    if (!settingsServiceInstance) {
        throw new Error('Settings service has not been initialised.');
    }
    return settingsServiceInstance;
}

export function clearSettingsService() {
    settingsServiceInstance?.dispose();
    settingsServiceInstance = null;
}

export { SettingsService };
