import { useEffect, useState, ChangeEvent } from "react";
import { Button, Form, Modal } from "react-bootstrap";
import { TiDelete, TiEdit } from "react-icons/ti";
import storage from "./storage";

export interface UserMacro {
    type: 'uppercase' | 'color' | 'replace';
    color?: string;
    from?: string;
    to?: string;
}

export interface UserTrigger {
    pattern: string;
    macros: UserMacro[];
}

function MacroEditor({ macro, onChange, onRemove }: { macro: UserMacro; onChange: (m: UserMacro) => void; onRemove: () => void }) {
    return (
        <div className="d-flex align-items-center gap-2 mb-1">
            <Form.Select
                size="sm"
                className="w-auto"
                value={macro.type}
                onChange={e => onChange({ ...macro, type: e.target.value as any })}
            >
                <option value="uppercase">Uppercase</option>
                <option value="color">Color</option>
                <option value="replace">Replace</option>
            </Form.Select>
            {macro.type === 'color' && (
            <Form.Control
                type="color"
                    size="sm"
                    className="w-auto"
                    style={{ width: '2.2rem' }}
                    value={macro.color || '#ffffff'}
                    onChange={e => onChange({ ...macro, color: e.target.value })}
                />
            )}
            {macro.type === 'replace' && (
                <>
                    <Form.Control
                        type="text"
                        size="sm"
                        placeholder="From"
                        value={macro.from || ''}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ ...macro, from: e.target.value })}
                        style={{ width: '100%', maxWidth: '6rem' }}
                    />
                    <Form.Control
                        type="text"
                        size="sm"
                        placeholder="To"
                        value={macro.to || ''}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ ...macro, to: e.target.value })}
                        style={{ width: '100%', maxWidth: '6rem' }}
                    />
                </>
            )}
            <Button size="sm" variant="secondary" onClick={onRemove}><TiDelete /></Button>
        </div>
    );
}

function TriggerPopup({ show, onClose, onSave, initial }: { show: boolean; onClose: () => void; onSave: (t: UserTrigger) => void; initial?: UserTrigger }) {
    const [pattern, setPattern] = useState('');
    const [macros, setMacros] = useState<UserMacro[]>([]);

    useEffect(() => {
        if (initial) {
            setPattern(initial.pattern);
            setMacros(initial.macros ? [...initial.macros] : []);
        } else {
            setPattern('');
            setMacros([]);
        }
    }, [initial]);

    function addMacro() {
        setMacros(prev => [...prev, { type: 'uppercase' }]);
    }

    function updateMacro(idx: number, macro: UserMacro) {
        setMacros(prev => prev.map((m, i) => i === idx ? macro : m));
    }

    function removeMacro(idx: number) {
        setMacros(prev => prev.filter((_, i) => i !== idx));
    }

    function save() {
        if (!pattern.trim()) return;
        onSave({ pattern: pattern.trim(), macros });
    }

    return (
        <Modal show={show} onHide={onClose} centered>
            <Modal.Header closeButton>
                <Modal.Title>Trigger</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form.Group className="mb-2">
                    <Form.Label>Pattern</Form.Label>
                    <Form.Control
                        type="text"
                        size="sm"
                        autoFocus
                        value={pattern}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setPattern(e.target.value)}
                    />
                </Form.Group>
                {macros.map((m, i) => (
                    <MacroEditor
                        key={i}
                        macro={m}
                        onChange={macro => updateMacro(i, macro)}
                        onRemove={() => removeMacro(i)}
                    />
                ))}
                <Button size="sm" onClick={addMacro}>Add macro</Button>
            </Modal.Body>
            <Modal.Footer>
                <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
                <Button size="sm" onClick={save}>Save</Button>
            </Modal.Footer>
        </Modal>
    );
}

function UserTriggers() {
    const [triggers, setTriggers] = useState<UserTrigger[]>([]);
    const [showPopup, setShowPopup] = useState(false);
    const [editIndex, setEditIndex] = useState<number | null>(null);

    useEffect(() => {
        storage.getItem('triggers').then(res => {
            if (res && Array.isArray(res.triggers)) {
                setTriggers(res.triggers);
            }
        });
    }, []);

    function saveList(list: UserTrigger[]) {
        setTriggers(list);
        storage.setItem('triggers', list);
    }

    function openNew() {
        setEditIndex(null);
        setShowPopup(true);
    }

    function edit(idx: number) {
        setEditIndex(idx);
        setShowPopup(true);
    }

    function remove(idx: number) {
        if (!confirm('Delete trigger?')) return;
        const updated = triggers.filter((_, i) => i !== idx);
        saveList(updated);
    }

    function saveTrigger(t: UserTrigger) {
        const list = [...triggers];
        if (editIndex === null) {
            list.push(t);
        } else {
            list[editIndex] = t;
        }
        saveList(list);
        setShowPopup(false);
    }

    const current = editIndex !== null ? triggers[editIndex] : undefined;

    return (
        <div className="m-2 d-flex flex-column gap-2">
            <Button size="sm" onClick={openNew}>Add trigger</Button>
            <ul className="list-unstyled ms-3">
                {triggers.map((t, i) => (
                    <li key={i} className="d-flex align-items-center gap-2">
                        <span>{t.pattern}</span>
                        <Button size="sm" variant="secondary" onClick={() => edit(i)}><TiEdit /></Button>
                        <Button size="sm" variant="danger" onClick={() => remove(i)}><TiDelete /></Button>
                    </li>
                ))}
            </ul>
            <TriggerPopup
                show={showPopup}
                onClose={() => setShowPopup(false)}
                onSave={saveTrigger}
                initial={current}
            />
        </div>
    );
}

export default UserTriggers;
