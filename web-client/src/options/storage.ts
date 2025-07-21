interface Storage {
    getItem(key: string): Promise<any>;

    setItem(key: string, value: any): Promise<any>;

    downloadItem(url: string, ttl: number): Promise<{value: any, cacheTime: number, ttl: number }>;

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


class LocalStorage implements Storage {
    private listeners: Array<(changes: { [key: string]: { oldValue: any, newValue: any } }) => void> = [];

    constructor() {
        window.addEventListener('storage', (ev: StorageEvent) => {
            if (!ev.key) return;
            const changes: { [key: string]: { oldValue: any, newValue: any } } = {};
            let oldValue: any = undefined;
            if (ev.oldValue !== null) {
                try { oldValue = JSON.parse(ev.oldValue); } catch { oldValue = ev.oldValue; }
            }
            let newValue: any = undefined;
            if (ev.newValue !== null) {
                try { newValue = JSON.parse(ev.newValue); } catch { newValue = ev.newValue; }
            }
            changes[ev.key] = { oldValue, newValue };
            this.listeners.forEach(l => l(changes));
        });
    }

    getItem(key: string): Promise<any> {
        const value = localStorage.getItem(key);
        if (value) {
            try {
                const parsed = JSON.parse(value)
                return Promise.resolve({[key]: parsed})
            } catch (e) {
                return Promise.resolve({[key]: value})
            }
        }
        return Promise.resolve();
    }

    setItem(key: string, value: any): Promise<void> {
        const oldRaw = localStorage.getItem(key);
        let oldValue: any = undefined;
        if (oldRaw !== null) {
            try { oldValue = JSON.parse(oldRaw); } catch { oldValue = oldRaw; }
        }
        localStorage.setItem(key, JSON.stringify(value));
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

class ChromeLocalStorage implements Storage {
    getItem(key: string): Promise<any> {
        return chrome.storage.local.get(key)
    }

    setItem(key: string, value: any): Promise<void> {
        return chrome.storage.local.set({[key]: value})
    }

    downloadItem(url: string, ttl: number): Promise<any> {
        return download(this, url, ttl)
    }

}

const storage: Storage = typeof chrome !== "undefined" && chrome.storage ? new ChromeLocalStorage() : new LocalStorage();
export default storage;
