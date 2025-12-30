import storage, { setItemSync, getItemSync } from "@modules/core/storage";

export default class MockPort {
    listeners: Array<(msg: any) => void> = [];

    onMessage = {
        addListener: (cb: (msg: any) => void) => {
            this.listeners.push(cb);
        }
    };

    constructor() {
        storage.onChanged?.addListener(changes => {
            Object.entries(changes).forEach(([key, {newValue}]) => {
                this.dispatch({storage: {key, value: newValue}});
                if (key === 'settings' || key === 'uiSettings') {
                    this.dispatch({[key]: newValue});
                }
                if (key === 'binds') {
                    this.dispatch({binds: newValue});
                }
                if (key === 'bindsKeymapId') {
                    const binds = getItemSync('binds')?.binds;
                    if (binds) {
                        this.dispatch({binds});
                    }
                }
            });
        });
    }

    private dispatch(message: any) {
        this.listeners.forEach(l => l(message));
    }

    postMessage(message: any) {
        if (message.type === 'SET_STORAGE') {
            setItemSync(message.key, message.value);
            this.dispatch({storage: {key: message.key, value: message.value}});
            if (message.key === 'settings' || message.key === 'uiSettings') {
                this.dispatch({[message.key]: message.value});
            }
            if (message.key === 'binds') {
                this.dispatch({binds: message.value});
            }
            if (message.key === 'bindsKeymapId') {
                const binds = getItemSync('binds')?.binds;
                if (binds) {
                    this.dispatch({binds});
                }
            }
            return;
        }
        if (message.type === 'GET_STORAGE') {
            this.sendStorage(message.key);
        }
    }

    private sendStorage(key: string) {
        const data = getItemSync(key);
        const value = data ? data[key] : {};
        this.dispatch({ storage: { key, value } });
        if (key === 'settings' || key === 'uiSettings') {
            this.dispatch({ [key]: value });
        }
        if (key === 'binds') {
            this.dispatch({ binds: value });
        }
    };
}
