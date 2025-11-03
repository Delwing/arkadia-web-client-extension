import { useEffect, useState } from "react";
import { Button, Form, Table } from 'react-bootstrap';
import { TiDelete } from 'react-icons/ti';
import storage from "@client/src/storage";
import eventBus from "@client/src/eventBus.ts";
import { getClientInstance } from "@shared/runtime";

interface ShortcutEntry {
    key: string;
    id: number;
    label: string;
}

function Shortcuts() {
    const [list, setList] = useState<ShortcutEntry[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [key, setKey] = useState('');
    const [loc, setLoc] = useState('');
    const [label, setLabel] = useState('');

    useEffect(() => {
        storage.getItem('shortcuts').then(res => {
            const arr = Array.isArray(res?.shortcuts) ? res.shortcuts : [];
            setList(arr);
        });
    }, []);

    function saveList(newList: ShortcutEntry[]) {
        setList(newList);
        storage.setItem('shortcuts', newList);
    }

    function add() {
        const id = parseInt(loc);
        const k = key.trim();
        const l = label.trim();
        if (!k || isNaN(id)) return;
        if (!/^[a-zA-Z_0-9]+$/.test(k)) return;
        if (!list.find(s => s.key === k)) {
            const updated = [...list, { key: k, id, label: l }];
            saveList(updated);
        }
        setShowForm(false);
        setKey('');
        setLoc('');
        setLabel('');
        window.dispatchEvent(new Event('close-options'));
    }

    function remove(k: string) {
        const updated = list.filter(s => s.key !== k);
        saveList(updated);
    }

    function useCurrent() {
        const id = getClientInstance()?.Map?.currentRoom?.id;
        if (id) {
            setLoc(String(id));
        }
    }

    return (
        <div className="m-2 d-flex flex-column gap-2">
            <Button size="sm" onClick={() => setShowForm(true)}>Dodaj</Button>
            {showForm && (
                <div className="border rounded p-3">
                    <Form.Group className="d-flex align-items-center gap-2 mb-2">
                        <Form.Label className="w-32 mb-0">Nazwa</Form.Label>
                        <Form.Control type="text" size="sm" value={key} onChange={e => setKey(e.target.value)} />
                    </Form.Group>
                    <Form.Group className="d-flex align-items-center gap-2 mb-2">
                        <Form.Label className="w-32 mb-0">Lokalizacja</Form.Label>
                        <Form.Control type="number" size="sm" value={loc} onChange={e => setLoc(e.target.value)} />
                        <Button size="sm" variant="secondary" onClick={useCurrent}>Aktualna</Button>
                    </Form.Group>
                    <Form.Group className="d-flex align-items-center gap-2 mb-2">
                        <Form.Label className="w-32 mb-0">Opis</Form.Label>
                        <Form.Control type="text" size="sm" value={label} onChange={e => setLabel(e.target.value)} />
                    </Form.Group>
                    <div className="d-flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => { setShowForm(false); setKey(''); setLoc(''); setLabel(''); }}>Anuluj</Button>
                        <Button size="sm" onClick={add}>Zapisz</Button>
                    </div>
                </div>
            )}
            <Table bordered size="sm" hover className="table-modern table-zebra">
                <tbody className="align-middle">
                {list.map(item => (
                    <tr key={item.key}>
                        <td>{item.key}</td>
                        <td>{item.id}</td>
                        <td>{item.label}</td>
                        <td className="d-flex gap-2">
                            <Button size="sm" onClick={() => eventBus.emit('leadTo', item.id)}>Prowadź</Button>
                            <Button size="sm" variant="danger" onClick={() => remove(item.key)}><TiDelete /></Button>
                        </td>
                    </tr>
                ))}
                </tbody>
            </Table>
        </div>
    );
}

export default Shortcuts;
