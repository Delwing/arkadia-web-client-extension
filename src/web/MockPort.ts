import { characterStorage, globalStorage } from "@modules/core/storage";
import { characterStorageKeys } from "@modules/core/storageSchema";

const characterKeySet = new Set<string>(characterStorageKeys);

function getStorage(key: string): { get(k: any): any; set(k: any, v: any): void } {
    return characterKeySet.has(key) ? characterStorage : globalStorage;
}

export default class MockPort {
    listeners: Array<(msg: any) => void> = [];

    onMessage = {
        addListener: (cb: (msg: any) => void) => {
            this.listeners.push(cb);
        }
    };

    constructor() {
        characterStorage.onAnyChange((key, newValue) => {
            this.dispatch({storage: {key, value: newValue}});
            if (key === 'settings') {
                this.dispatch({settings: newValue});
            }
        });
        globalStorage.onAnyChange((key, newValue) => {
            this.dispatch({storage: {key, value: newValue}});
            if (key === 'uiSettings' || key === 'binds') {
                this.dispatch({[key]: newValue});
            }
        });
    }

    private dispatch(message: any) {
        this.listeners.forEach(l => l(message));
    }

    postMessage(message: any) {
        if (message.type === 'SET_STORAGE') {
            getStorage(message.key).set(message.key as any, message.value);
            this.dispatch({storage: {key: message.key, value: message.value}});
            if (message.key === 'settings' || message.key === 'uiSettings' || message.key === 'binds') {
                this.dispatch({[message.key]: message.value});
            }
            return;
        }
        if (message.type === 'GET_STORAGE') {
            this.sendStorage(message.key);
        }
    }

    private sendStorage(key: string) {
        const value = getStorage(key).get(key as any) ?? {};
        this.dispatch({ storage: { key, value } });
        if (key === 'settings' || key === 'uiSettings' || key === 'binds') {
            this.dispatch({ [key]: value });
        }
    };
}
