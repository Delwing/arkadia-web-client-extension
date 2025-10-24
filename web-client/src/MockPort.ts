import storage, { setItemSync, getItemSync } from "@client/src/storage";
import {
    getSnapshot as getMultibindsSnapshot,
    replaceAll as replaceMultibinds,
    subscribe as subscribeMultibinds,
} from "./dataStores/multibindStore";
import {
    addLocalNpc,
    setLocalNpcs,
    subscribe as subscribeNpcStore,
} from "./dataStores/npcStore";

export default class MockPort {
    listeners: Array<(msg: any) => void> = [];
    private currentNpc: { name: string; loc: number }[] = [];

    onMessage = {
        addListener: (cb: (msg: any) => void) => {
            this.listeners.push(cb);
        }
    };

    private unsubscribeMultibinds: (() => void) | null = null;

    constructor() {
        storage.onChanged?.addListener(changes => {
            Object.entries(changes).forEach(([key, {newValue}]) => {
                this.dispatch({storage: {key, value: newValue}});
                if (key === 'settings' || key === 'npc' || key === 'uiSettings' || key === 'binds') {
                    this.dispatch({[key]: newValue});
                }
            });
        });

        subscribeNpcStore(snapshot => {
            this.currentNpc = snapshot?.all.data.map(({name, loc}) => ({name, loc})) ?? [];
            this.dispatch({ npc: this.currentNpc });
            this.dispatch({ storage: { key: 'npc', value: this.currentNpc } });
        });

        this.unsubscribeMultibinds = subscribeMultibinds(list => {
            this.dispatch({ multibindsStorage: list });
        });
    }

    private dispatch(message: any) {
        this.listeners.forEach(l => l(message));
    }

    postMessage(message: any) {
        if (message.type === 'NEW_NPC') {
            addLocalNpc({ name: message.name, loc: message.loc }).catch(e => console.error('Failed to add NPC:', e));
            return;
        }
        if (message.type === 'MULTIBINDS_LOAD') {
            getMultibindsSnapshot()
                .then(list => {
                    this.dispatch({ multibindsStorage: list });
                })
                .catch(e => console.error('Failed to load multibinds:', e));
            return;
        }
        if (message.type === 'MULTIBINDS_SAVE') {
            const list = Array.isArray(message.value) ? message.value : [];
            replaceMultibinds(list).catch(e => console.error('Failed to save multibinds:', e));
            return;
        }
        if (message.type === 'SET_STORAGE') {
            if (message.key === 'npc') {
                const list = Array.isArray(message.value) ? message.value : [];
                setLocalNpcs(list).catch(e => console.error('Failed to replace NPC list:', e));
                return;
            }
            setItemSync(message.key, message.value);
            this.dispatch({storage: {key: message.key, value: message.value}});
            if (message.key === 'settings' || message.key === 'uiSettings' || message.key === 'binds') {
                this.dispatch({[message.key]: message.value});
            }
            if (message.key === 'settings' || message.key === 'npc' || message.key === 'uiSettings' || message.key === 'binds') {
                this.dispatch({[message.key]: message.value});
            }
            return;
        }
        if (message.type === 'GET_STORAGE') {
            this.sendStorage(message.key);
        }
    }

    private sendStorage(key: string) {
        const data = getItemSync(key);
        let value = data ? data[key] : {};
        if (key === 'npc') {
            value = this.currentNpc;
        }
        this.dispatch({ storage: { key, value } });
        if (key === 'settings' || key === 'npc' || key === 'uiSettings' || key === 'binds') {
            this.dispatch({ [key]: value });
        }
    };
}
