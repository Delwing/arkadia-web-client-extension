import '../style.css'
import {ChangeEvent, useEffect, useState} from "react";
import {Button, Form, Table} from 'react-bootstrap';
import {TiDelete} from "react-icons/ti";
import services from "@client/src/runtime/service-registry";
import type { NpcDefinition } from "@client/src/runtime/data";
import { normalizeNpcList, npcListsEqual } from "../npcData";
import {
    useEnsureNpcDataset,
    useLoadNpcDataset,
    useNpcDataset,
    useSyncNpcDataset,
    useUiDispatch,
} from "../ui/store";

function Npc() {
    const dataset = useNpcDataset();
    const loadDataset = useLoadNpcDataset();
    const ensureDataset = useEnsureNpcDataset();
    const syncDataset = useSyncNpcDataset();
    const [filter, setFilter] = useState<string>('');
    const dispatch = useUiDispatch();

    const npcs = Array.isArray(dataset?.data) ? dataset.data : [];

    useEffect(() => {
        if (dataset?.metadata.status === "ready" || dataset?.metadata.status === "loading") {
            return;
        }

        let cancelled = false;

        void ensureDataset().catch((error) => {
            if (!cancelled) {
                console.error('Failed to load NPC data:', error);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [dataset?.metadata.status, ensureDataset]);

    useEffect(() => {
        const handler = (ev: Event) => {
            const detail = (ev as CustomEvent).detail;
            const normalized = normalizeNpcList(detail);
            const current = services.dataCatalog.getNpcData();
            const currentList = Array.isArray(current) ? current : [];

            if (npcListsEqual(currentList, normalized)) {
                return;
            }

            void services.dataCatalog
                .setNpcData(normalized, 'cache')
                .catch((error) => console.error('Failed to persist NPC event data:', error));
        };

        window.addEventListener('npc', handler as EventListener);
        return () => {
            window.removeEventListener('npc', handler as EventListener);
        };
    }, []);

    async function downloadNpcs() {
        try {
            await loadDataset({ force: true });
            const data = services.dataCatalog.getNpcData() ?? [];
            void dispatch({ type: 'event/send', event: 'npc', payload: data });
        } catch (e) {
            console.error('Failed to update NPC data:', e);
        }
    }

    async function clearNpcs() {
        try {
            await services.dataCatalog.clearNpcData();
            syncDataset();
            void dispatch({ type: 'event/send', event: 'npc', payload: [] });
        } catch (e) {
            console.error('Failed to clear NPC data:', e);
        }
    }

    function exportNpcs() {
        const json = JSON.stringify(npcs, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'arkadia-npcs.json'
        a.click()
        URL.revokeObjectURL(url)
    }

    function deleteNpc(npc: NpcDefinition) {
        const updated = npcs.filter(n => !(n.name === npc.name && n.loc === npc.loc))
        void saveNpcs(updated)
        void dispatch({ type: 'event/send', event: 'npc', payload: updated });
    }

    async function saveNpcs(list: readonly NpcDefinition[]) {
        try {
            await services.dataCatalog.setNpcData(list, 'cache')
            syncDataset();
        } catch (e) {
            console.error('Failed to save NPC list:', e)
        }
    }

    return (
        <div className="m-2">
            <div className="mb-2 d-flex align-items-center gap-2">
                <Button variant="primary" size="sm" onClick={downloadNpcs}>Pobierz</Button>
                <Button variant="secondary" size="sm" onClick={exportNpcs}>Eksport</Button>
                <Button variant="danger" size="sm" onClick={clearNpcs}>Wyczyść</Button>
                <Form.Control
                    type="text"
                    placeholder="Filtruj"
                    size="sm"
                    value={filter}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setFilter(e.target.value)}
                    style={{width: '100%', maxWidth: '160px'}}
                />
            </div>
            <Table bordered size="sm" className="table-zebra">
                <tbody className="align-middle">
                {npcs
                    .filter(item => item.name.toLowerCase().includes(filter.toLowerCase()))
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((item) => (
                        <tr key={item.name + '-' + item.loc}>
                            <td>{item.name}</td>
                            <td>{item.loc}</td>
                            <td>
                                <Button variant="danger" size="sm" onClick={() => deleteNpc(item)}><TiDelete/></Button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </Table>
        </div>
    )
}

export default Npc
