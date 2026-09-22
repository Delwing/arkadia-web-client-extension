import { useEffect, useState } from "react";
import { Button, DeleteButton, Field, Input } from "@web-ui/primitives/index.ts";
import { globalStorage } from "@modules/core/storage";
import eventBus from "@modules/core/eventBus";
import { getCurrentRoomId } from "@modules/core/currentRoomProvider";
import type { ClientEvents } from "@modules/core/eventBus";

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
        const saved = globalStorage.get('shortcuts') as any;
        const arr = Array.isArray(saved) ? saved : [];
        setList(arr);
    }, []);

    useEffect(() => {
        const handleAddWithRoom = ({ roomId }: ClientEvents['shortcuts.addWithRoom']) => {
            setLoc(String(roomId));
            setShowForm(true);
        };
        return eventBus.on('shortcuts.addWithRoom', handleAddWithRoom);
    }, []);

    function saveList(newList: ShortcutEntry[]) {
        setList(newList);
        globalStorage.set('shortcuts', newList as any);
    }

    function add() {
        const id = parseInt(loc);
        const k = key.trim();
        const l = label.trim();
        if (!k || isNaN(id)) return;
        if (!/^[a-zA-Z_0-9 ]+$/.test(k)) return;
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
        const id = getCurrentRoomId();
        if (id) {
            setLoc(String(id));
        }
    }

    function cancel() {
        setShowForm(false);
        setKey('');
        setLoc('');
        setLabel('');
    }

    return (
        <div className="popup-stack shortcuts-panel">
            <div className="popup-row">
                <Button size="sm" onClick={() => setShowForm(true)}>Dodaj</Button>
            </div>
            {showForm && (
                <div className="popup-stack shortcuts-panel__form">
                    <Field label="Nazwa">
                        <Input mono value={key} onChange={e => setKey(e.target.value)} />
                    </Field>
                    <Field label="Lokalizacja">
                        <div className="popup-inline">
                            <Input type="number" value={loc} onChange={e => setLoc(e.target.value)} />
                            <Button size="sm" onClick={useCurrent}>Aktualna</Button>
                        </div>
                    </Field>
                    <Field label="Opis">
                        <Input mono value={label} onChange={e => setLabel(e.target.value)} />
                    </Field>
                    <div className="popup-row">
                        <Button size="sm" onClick={cancel}>Anuluj</Button>
                        <Button size="sm" variant="solid" onClick={add}>Zapisz</Button>
                    </div>
                </div>
            )}
            <table className="popup-table">
                <tbody>
                {list.map(item => (
                    <tr key={item.key}>
                        <td>{item.key}</td>
                        <td>{item.id}</td>
                        <td>{item.label}</td>
                        <td>
                            <div className="popup-inline">
                                <Button size="sm" onClick={() => eventBus.emit('leadTo', item.id)}>Prowadź</Button>
                                <DeleteButton onClick={() => remove(item.key)} />
                            </div>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}

export default Shortcuts;
