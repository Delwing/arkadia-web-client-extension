import '../style.css'
import {ChangeEvent, useEffect, useState} from "react";
import {Button, Form, Table} from 'react-bootstrap';
import {clearIndexedDB, updateIndexedDB} from "@client/src/utils/dataCache.ts";
import {TiDelete} from "react-icons/ti";
import {loadNpcData} from "../npcDataLoader.ts";
import eventBus from "@client/src/eventBus.ts";

const DB_CONFIG = { dbName: 'ArkadiaNpcDB', storeName: 'npcData', key: 'npc' } as const;
const NPC_URL = 'https://delwing.github.io/arkadia-mapa/data/npc.json';

interface NpcProps {
    name: string;
    loc: number
}

function Npc() {

    const [npcs, setNpcs] = useState<NpcProps[]>([])
    const [filter, setFilter] = useState<string>('')

    useEffect(() => {
        loadNpcData().then((data: NpcProps[]) => {
            setNpcs(data)
        })
    }, []);

    useEffect(() => {
        const handler = (ev: Event) => {
            const detail = (ev as CustomEvent).detail
            if (Array.isArray(detail)) {
                setNpcs(detail)
            }
        }

        const removeClientListener = (window as any).clientExtension?.addEventListener?.('npc', handler as (event: CustomEvent) => void)

        if (!removeClientListener) {
            eventBus.addEventListener('npc', handler as EventListener)
        }

        return () => {
            if (typeof removeClientListener === 'function') {
                removeClientListener()
            } else {
                eventBus.removeEventListener('npc', handler as EventListener)
            }
        }
    }, [])

    function downloadNpcs() {
        updateIndexedDB<NpcProps[]>(DB_CONFIG, NPC_URL)
            .then(data => {
                setNpcs(data)
                ;(window as any).clientExtension?.sendEvent('npc', data)
            })
            .catch(e => console.error('Failed to update NPC data:', e));
    }

    function clearNpcs() {
        clearIndexedDB(DB_CONFIG)
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
        saveNpcs(updated)
        ;(window as any).clientExtension?.sendEvent('npc', updated)
    }

    async function saveNpcs(list: NpcProps[]) {
        try {
            const db = await openDb()
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction([DB_CONFIG.storeName], 'readwrite')
                const store = tx.objectStore(DB_CONFIG.storeName)
                const req = store.put({ id: DB_CONFIG.key, data: list, timestamp: Date.now() })
                req.onsuccess = () => resolve()
                req.onerror = () => reject(new Error('Failed to store data'))
            })
        } catch (e) {
            console.error('Failed to save NPC list:', e)
        }
    }

    function openDb(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_CONFIG.dbName, 1)
            request.onupgradeneeded = () => {
                const db = request.result
                if (!db.objectStoreNames.contains(DB_CONFIG.storeName)) {
                    db.createObjectStore(DB_CONFIG.storeName, { keyPath: 'id' })
                }
            }
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(new Error('Failed to open IndexedDB'))
        })
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
