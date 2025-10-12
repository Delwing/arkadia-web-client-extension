import storage, { setItemSync, getItemSync } from "@client/src/storage";
import services from "@client/src/runtime/service-registry";
import type { NpcDefinition } from "@client/src/runtime/data";
import { readMultibinds, replaceMultibinds } from "./multibindStorage";

const NPC_STORAGE_KEY = 'npc' as const;

function normalizeNpcList(value: unknown): NpcDefinition[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((entry): entry is NpcDefinition => Boolean(entry && typeof entry === 'object'))
        .map((entry) => ({
            name: String((entry as NpcDefinition).name ?? ''),
            loc: Number((entry as NpcDefinition).loc ?? (entry as any).loc),
        }))
        .filter((entry) => entry.name.length > 0 && Number.isFinite(entry.loc));
}

function areNpcEntriesEqual(a: NpcDefinition, b: NpcDefinition): boolean {
    return a.name === b.name && a.loc === b.loc;
}

function npcListsEqual(a: readonly NpcDefinition[], b: readonly NpcDefinition[]): boolean {
    if (a.length !== b.length) {
        return false;
    }

    for (let i = 0; i < a.length; i += 1) {
        if (!areNpcEntriesEqual(a[i], b[i])) {
            return false;
        }
    }

    return true;
}

function getNpcCatalogData(): NpcDefinition[] {
    const current = services.dataCatalog.getNpcData();
    return Array.isArray(current) ? [...current] : [];
}

async function persistNpcCatalogData(list: readonly NpcDefinition[]): Promise<void> {
    await services.dataCatalog.setNpcData(list, 'cache');
}

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
                if (key === 'settings' || key === 'npc' || key === 'uiSettings' || key === 'binds') {
                    this.dispatch({[key]: newValue});
                }
                if (key === NPC_STORAGE_KEY) {
                    const normalized = normalizeNpcList(newValue);
                    const current = getNpcCatalogData();
                    if (normalized.length === 0 && current.length === 0) {
                        return;
                    }
                    if (!npcListsEqual(normalized, current)) {
                        void persistNpcCatalogData(normalized).catch((error) => {
                            console.error('Failed to sync NPC storage to catalog:', error);
                        });
                    }
                }
            });
        });

        const initialNpc = getNpcCatalogData();
        if (initialNpc.length > 0) {
            this.broadcastNpc(initialNpc);
        }

        services.dataCatalog.readyForNpc$().subscribe(({ data }) => {
            this.broadcastNpc(normalizeNpcList(data));
        });
    }

    private dispatch(message: any) {
        this.listeners.forEach(l => l(message));
    }

    private broadcastNpc(list: readonly NpcDefinition[]): void {
        const normalized = normalizeNpcList(list);
        this.dispatch({ npc: normalized });
        this.dispatch({ storage: { key: NPC_STORAGE_KEY, value: normalized } });
    }

    postMessage(message: any) {
        if (message.type === 'NEW_NPC') {
            const existing = getNpcCatalogData();
            const trimmedName = String(message.name ?? '').trim();
            const numericLoc = Number(message.loc);
            if (!trimmedName || !Number.isFinite(numericLoc)) {
                return;
            }
            const nextEntry: NpcDefinition = { name: trimmedName, loc: numericLoc };
            if (!existing.some((npc) => areNpcEntriesEqual(npc, nextEntry))) {
                existing.push(nextEntry);
                void persistNpcCatalogData(existing).catch((error) => {
                    console.error('Failed to add NPC:', error);
                });
            } else {
                this.broadcastNpc(existing);
            }
            return;
        }
        if (message.type === 'MULTIBINDS_LOAD') {
            readMultibinds()
                .then(list => {
                    this.dispatch({ multibindsStorage: list });
                })
                .catch(e => console.error('Failed to load multibinds:', e));
            return;
        }
        if (message.type === 'MULTIBINDS_SAVE') {
            const list = Array.isArray(message.value) ? message.value : [];
            replaceMultibinds(list)
                .then((normalized) => {
                    this.dispatch({ multibindsStorage: normalized });
                })
                .catch(e => console.error('Failed to save multibinds:', e));
            return;
        }
        if (message.type === 'SET_STORAGE') {
            setItemSync(message.key, message.value);
            this.dispatch({storage: {key: message.key, value: message.value}});
            if (message.key === 'settings' || message.key === 'npc' || message.key === 'uiSettings' || message.key === 'binds') {
                this.dispatch({[message.key]: message.value});
            }
        }
        if (message.type === 'GET_STORAGE') {
            this.sendStorage(message.key);
        }
    }

    private sendStorage(key: string) {
        if (key === NPC_STORAGE_KEY) {
            this.broadcastNpc(getNpcCatalogData());
            return;
        }
        const data = getItemSync(key);
        const value = data ? data[key] : {};
        this.dispatch({ storage: { key, value } });
        if (key === 'settings' || key === 'npc' || key === 'uiSettings' || key === 'binds') {
            this.dispatch({ [key]: value });
        }
    };
}
