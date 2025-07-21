import storage from "../web-client/src/options/storage.ts";

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
                if (key === 'settings' || key === 'npc') {
                    this.dispatch({[key]: newValue});
                }
            });
        });
    }

    private dispatch(message: any) {
        this.listeners.forEach(l => l(message));
    }

    postMessage(message: any) {
        if (message.type === 'NEW_NPC') {
            const raw = localStorage.getItem('npc');
            const npc = raw ? JSON.parse(raw) : [];
            npc.push({name: message.name, loc: message.loc});
            localStorage.setItem('npc', JSON.stringify(npc));
            this.dispatch({npc});
            this.dispatch({storage: {key: 'npc', value: npc}});
            return;
        }
        if (message.type === 'SET_STORAGE') {
            localStorage.setItem(message.key, JSON.stringify(message.value));
            this.dispatch({storage: {key: message.key, value: message.value}});
            if (message.key === 'settings' || message.key === 'npc') {
                this.dispatch({[message.key]: message.value});
            }
        }
        if (message.type === 'GET_STORAGE') {
            this.sendStorage(message.key);
        }
    }

    private sendStorage(key: string) {
        const raw = localStorage.getItem(key);
        if (raw !== null) {
            try {
                const value = JSON.parse(raw);
                this.dispatch({storage: {key, value}});
                if (key === 'settings' || key === 'npc') {
                    this.dispatch({[key]: value});
                }
            } catch {
                // ignore malformed json
            }
        }
    };
}
