import '../style.css'
import {ChangeEvent, useEffect, useState} from "react";
import {Button, Form, Table} from 'react-bootstrap';
import {TiDelete} from "react-icons/ti";
import {loadNpcData} from "../npcDataLoader.ts";
import services from "@client/src/runtime/service-registry";
import { NPC_DATASET_KEY } from "@client/src/runtime/data";

interface NpcProps {
    name: string;
    loc: number
}

function Npc() {

    const [npcs, setNpcs] = useState<NpcProps[]>([])
    const [filter, setFilter] = useState<string>('')

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                const data = await loadNpcData<NpcProps[]>();
                if (!cancelled) {
                    setNpcs(data);
                }
            } catch (error) {
                console.error('Failed to load NPC data:', error);
            }
        };

        void load();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const handler = (ev: Event) => {
            const detail = (ev as CustomEvent).detail
            if (Array.isArray(detail)) {
                setNpcs(detail)
            }
        }
        window.addEventListener('npc', handler as EventListener)
        return () => {
            window.removeEventListener('npc', handler as EventListener)
        }
    }, [])

    async function downloadNpcs() {
        try {
            await services.dataCatalog.load(NPC_DATASET_KEY);
            const data = await loadNpcData<NpcProps[]>();
            setNpcs(data);
            ;(window as any).clientExtension?.sendEvent('npc', data);
        } catch (e) {
            console.error('Failed to update NPC data:', e);
        }
    }

    function clearNpcs() {
        services.dataCatalog.clear(NPC_DATASET_KEY)
            .then(() => {
                setNpcs([])
                ;(window as any).clientExtension?.sendEvent('npc', [])
            })
            .catch(e => console.error('Failed to clear NPC data:', e));
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

    function deleteNpc(npc: NpcProps) {
        const updated = npcs.filter(n => !(n.name === npc.name && n.loc === npc.loc))
        setNpcs(updated)
        void saveNpcs(updated)
        ;(window as any).clientExtension?.sendEvent('npc', updated)
    }

    async function saveNpcs(list: NpcProps[]) {
        try {
            await services.dataCatalog.set(NPC_DATASET_KEY, list, 'cache')
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
