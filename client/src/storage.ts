import {defaultSettings} from './defaultSettings';
import appEventBus from "./events/app-event-bus";

interface Storage {
    getItem(key: string): Promise<any>;

    setItem(key: string, value: any): Promise<any>;

    downloadItem(url: string, ttl: number): Promise<{ value: any, cacheTime: number, ttl: number }>;

    onChanged?: {
        addListener: (listener: (changes: { [key: string]: { oldValue: any, newValue: any } }) => void) => void;
        removeListener?: (listener: (changes: { [key: string]: { oldValue: any, newValue: any } }) => void) => void;
    };
}

const download = async (storage: Storage, url: string, ttl: number) => {
    return storage.getItem(url).then(cacheContent => {
        if (cacheContent && cacheContent.value && cacheContent.cacheTime && cacheContent.cacheTime + cacheContent.ttl > Date.now()) {
            return cacheContent.value;
        } else {
            return fetch(url).then(data => data.json()).then(data => {
                storage.setItem(url, {value: data, cacheTime: Date.now(), ttl: ttl});
                return {value: data, cacheTime: Date.now(), ttl: ttl}
            })
        }
    })
}


const characterScopedKeys = new Set([
    'settings',
    'kill_counter',
    'improve_counter',
    'improve_counter_lifetime',
    'deposits',
    'containers',
    'herb_counts',
    'herbs_data',
    'mapperRoomId',
    'lastLang',
    'object_num',
]);

let currentCharacter: string | null = localStorage.getItem('currentCharacter');

function notifyCharacterChange(prev: string | null) {
    characterScopedKeys.forEach(key => {
        const prevKey = prev ? `${prev}:${key}` : key;
        const newKey = currentCharacter ? `${currentCharacter}:${key}` : key;
        const oldRaw = localStorage.getItem(prevKey);
        const newRaw = localStorage.getItem(newKey);
        if (oldRaw === newRaw || newRaw === null) {
            return;
        }
        let oldValue: any = undefined;
        let newValue: any;
        if (oldRaw !== null) {
            try {
                oldValue = JSON.parse(oldRaw);
            } catch {
                oldValue = oldRaw;
            }
        }
        {
            try {
                newValue = JSON.parse(newRaw);
            } catch {
                newValue = newRaw;
            }
        }
        const changes: { [key: string]: { oldValue: any, newValue: any } } = {
            [key]: {oldValue, newValue}
        };
        (storage as any).listeners?.forEach?.((l: any) => l(changes));
    });
}

export function setCurrentCharacter(name: string) {
    const prev = currentCharacter;
    const firstCharacter = !currentCharacter && !localStorage.getItem('currentCharacter');
    currentCharacter = name ? String(name) : null;
    if (firstCharacter && currentCharacter) {
        characterScopedKeys.forEach(key => {
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
    notifyCharacterChange(prev);
    appEventBus.emit("currentCharacter", currentCharacter);
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
                try {
                    oldValue = JSON.parse(ev.oldValue);
                } catch {
                    oldValue = ev.oldValue;
                }
            }
            let newValue: any = undefined;
            if (ev.newValue !== null) {
                try {
                    newValue = JSON.parse(ev.newValue);
                } catch {
                    newValue = ev.newValue;
                }
            }
            changes[baseKey] = {oldValue, newValue};
            this.listeners.forEach(l => l(changes));
        });
    }

    getItem(key: string): Promise<any> {
        const realKey = applyCharacterScope(key);
        const value = localStorage.getItem(realKey);
        if (value) {
            try {
                const parsed = JSON.parse(value)
                return Promise.resolve({[key]: parsed})
            } catch (e) {
                return Promise.resolve({[key]: value})
            }
        }
        if (key === 'settings') {
            return Promise.resolve({...defaultSettings});
        }
        return Promise.resolve();
    }

    setItem(key: string, value: any): Promise<void> {
        const realKey = applyCharacterScope(key);
        const oldRaw = localStorage.getItem(realKey);
        let oldValue: any = undefined;
        if (oldRaw !== null) {
            try {
                oldValue = JSON.parse(oldRaw);
            } catch {
                oldValue = oldRaw;
            }
        }
        localStorage.setItem(realKey, JSON.stringify(value));
        const changes: { [key: string]: { oldValue: any, newValue: any } } = {
            [key]: {oldValue, newValue: value}
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
        try {
            return JSON.parse(value);
        } catch {
            return value
        }
    }
    if (key === 'settings') {
        return {...defaultSettings};
    }
    return undefined;
}

export function setItemSync(key: string, value: any) {
    const realKey = applyCharacterScope(key);
    const oldRaw = localStorage.getItem(realKey);
    let oldValue: any = undefined;
    if (oldRaw !== null) {
        try {
            oldValue = JSON.parse(oldRaw);
        } catch {
            oldValue = oldRaw;
        }
    }
    localStorage.setItem(realKey, JSON.stringify(value));
    const changes: { [key: string]: { oldValue: any, newValue: any } } = {
        [key]: {oldValue, newValue: value}
    };
    (storage as any).listeners?.forEach?.((l: any) => l(changes));
}
