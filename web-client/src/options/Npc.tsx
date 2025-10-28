import '../style.css'
import {ChangeEvent, useEffect, useState} from "react";
import {Button, Form, Table} from 'react-bootstrap';
import {TiDelete} from "@react-icons/all-files/ti/TiDelete";
import {
    NpcListEntry,
    clearLocal,
    clearRemote,
    refresh as refreshNpc,
    removeLocalNpc,
    subscribe,
} from "../dataStores/npcStore";

function Npc() {

    const [npcs, setNpcs] = useState<NpcListEntry[]>([])
    const [filter, setFilter] = useState<string>('')

    useEffect(() => {
        const unsubscribe = subscribe(snapshot => {
            setNpcs(snapshot?.all.data ?? [])
        })
        void refreshNpc()
        return unsubscribe
    }, [])

    async function downloadNpcs() {
        try {
            await refreshNpc({force: true})
        } catch (e) {
            console.error('Failed to update NPC data:', e)
        }
    }

    async function clearNpcs() {
        try {
            await clearRemote()
            await clearLocal()
        } catch (e) {
            console.error('Failed to clear NPC data:', e)
        }
    }

    function exportNpcs() {
        const exportable = npcs.map(({name, loc}) => ({name, loc}))
        const json = JSON.stringify(exportable, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'arkadia-npcs.json'
        a.click()
        URL.revokeObjectURL(url)
    }

    function deleteNpc(npc: NpcListEntry) {
        if (npc.source !== 'local') {
            return
        }
        removeLocalNpc({name: npc.name, loc: npc.loc}).catch(e => console.error('Failed to remove NPC:', e))
    }

    return (
        <div className="m-2">
            <div className="mb-2 d-flex align-items-center gap-2">
                <Button variant="primary" size="sm" onClick={downloadNpcs}>Aktualizuj</Button>
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
            <Table bordered size="sm" hover className="table-modern table-zebra npc-table">
                <colgroup>
                    <col />
                    <col className="npc-table__location-col" />
                    <col className="npc-table__actions-col" />
                </colgroup>
                <tbody className="align-middle">
                {npcs
                    .filter(item => item.name.toLowerCase().includes(filter.toLowerCase()))
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((item) => (
                        <tr key={item.name + '-' + item.loc}>
                            <td className="npc-name">{item.name}</td>
                            <td className="npc-location">
                                <span className="npc-location__value">{item.loc}</span>
                            </td>
                            <td className="npc-actions text-end">
                                <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => deleteNpc(item)}
                                    disabled={item.source !== 'local'}
                                    className="npc-delete-button"
                                >
                                    <TiDelete/>
                                </Button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </Table>
        </div>
    )
}

export default Npc
