import '../style.css'
import {ChangeEvent, useEffect, useState} from "react";
import {Button, Form, Table} from 'react-bootstrap';
import {TiDelete} from "react-icons/ti";
import {dataCatalog} from "@client/src/dataCatalog/catalogInstance.ts";

interface NpcProps {
    name: string;
    loc: number
}

function Npc() {

    const [npcs, setNpcs] = useState<NpcProps[]>([])
    const [filter, setFilter] = useState<string>('')

    useEffect(() => {
        dataCatalog.getNpcStore().getData().then(
            (data: NpcProps[]) => {
                setNpcs(data)
            },
            (e) => {
                console.error('Failed to load NPC data:', e)
            }
        )
    }, []);

    useEffect(() => {
        //TODO download on demand only
        dataCatalog.getNpcStore().getData().then(npc => setNpcs(npc))
    }, [])

    function downloadNpcs() {
        dataCatalog.getNpcStore().getData({forceReload: true})
            .then(npc => {
                setNpcs(npc)
            })
            .catch(e => console.error('Failed to update NPC data:', e));
    }

    function clearNpcs() {
        dataCatalog.getNpcStore().invalidate().then(() => {
            setNpcs([])
        })
    }

    function exportNpcs() {
        const json = JSON.stringify(npcs, null, 2)
        const blob = new Blob([json], {type: 'application/json'})
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
        //TODO persist deletion
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
