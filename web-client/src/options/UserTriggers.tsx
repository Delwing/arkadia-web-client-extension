import { useEffect, useState, ChangeEvent, useRef } from "react";
import { Button, Form } from "react-bootstrap";
import { TiDelete, TiEdit } from "react-icons/ti";
import storage from "@client/src/storage";

export interface UserMacro {
    type: 'uppercase' | 'color' | 'replace' | 'beep';
    color?: string;
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
                value={macro.type}
                onChange={e => onChange({ ...macro, type: e.target.value as any })}
            >
                <option value="uppercase">Wielkie litery</option>
                <option value="color">Koloruj</option>
                <option value="replace">Zamień</option>
                <option value="beep">Dźwięk</option>
            </Form.Select>
            {macro.type === 'color' && (
            <Form.Control
                type="color"
                    size="sm"
                    style={{ width: '2.2rem' }}
                    value={macro.color || '#ffffff'}
                    onChange={e => onChange({ ...macro, color: e.target.value })}
                />
            )}
            {macro.type === 'replace' && (
                <Form.Control
                    type="text"
                    size="sm"
                    placeholder="Replacement"
                    value={macro.to || ''}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ ...macro, to: e.target.value })}
                    style={{ width: '100%', maxWidth: '8rem' }}
                />
            )}
            <Button size="sm" variant="secondary" onClick={onRemove}><TiDelete /></Button>
        </div>
    );
}

function UserTriggers() {
    const [triggers, setTriggers] = useState<UserTrigger[]>([]);
    const [pattern, setPattern] = useState('');
    const [macros, setMacros] = useState<UserMacro[]>([]);
    const [editIndex, setEditIndex] = useState<number | null>(null);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [filter, setFilter] = useState('');
    const fileInput = useRef<HTMLInputElement>(null);

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

    function resetForm() {
        setPattern('');
        setMacros([]);
        setEditIndex(null);
    }

    function openNew() {
        resetForm();
        setShowCreateForm(true);
    }

    function edit(idx: number) {
        const t = triggers[idx];
        setPattern(t.pattern);
        setMacros(t.macros ? [...t.macros] : []);
        setEditIndex(idx);
        setShowCreateForm(true);
    }

    function remove(idx: number) {
        if (!confirm('Delete trigger?')) return;
        const updated = triggers.filter((_, i) => i !== idx);
       saveList(updated);
    }

    function exportTriggers() {
        const json = JSON.stringify(triggers, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'arkadia-triggers.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    function importTriggers(ev: ChangeEvent<HTMLInputElement>) {
        const file = ev.target.files?.[0];
        if (!file) return;
        file.text().then(text => {
            try {
                const data = JSON.parse(text);
                if (Array.isArray(data) && data.every(d => typeof d.pattern === 'string' && Array.isArray(d.macros))) {
                    saveList(data);
                } else {
                    alert('Błędny plik');
                }
            } catch {
                alert('Błędny plik');
            } finally {
                if (fileInput.current) fileInput.current.value = '';
            }
        });
    }

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
        const p = pattern.trim();
        if (!p) return;
        const list = [...triggers];
        const entry = { pattern: p, macros };
        if (editIndex === null) {
            list.push(entry);
        } else {
            list[editIndex] = entry;
        }
        saveList(list);
        resetForm();
        setShowCreateForm(false);
    }

    const filteredTriggers = triggers.filter(t =>
        t.pattern.toLowerCase().includes(filter.toLowerCase())
    );

    return (
        <div className="m-2 d-flex flex-column gap-2">
            <div className="d-flex gap-2 align-items-center flex-wrap">
                <Form.Control
                    type="text"
                    size="sm"
                    placeholder="Filter"
                    value={filter}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setFilter(e.target.value)}
                    style={{ width: '100%', maxWidth: '12rem' }}
                />
                <Button size="sm" onClick={openNew}>Add trigger</Button>
                <Button size="sm" variant="secondary" onClick={exportTriggers}>Export</Button>
                <Button size="sm" variant="secondary" onClick={() => fileInput.current?.click()}>Import</Button>
                <input
                    ref={fileInput}
                    type="file"
                    accept="application/json"
                    style={{ display: 'none' }}
                    onChange={importTriggers}
                />
            </div>
            
            {showCreateForm && (
                <div className="border rounded p-3 mb-3">
                    <h6 className="mb-3">{editIndex === null ? 'Add trigger' : 'Edit trigger'}</h6>
                    <Form.Group className="d-flex flex-column gap-2">
                        <Form.Control
                            type="text"
                            size="sm"
                            placeholder="Pattern"
                            value={pattern}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setPattern(e.target.value)}
                            style={{ maxWidth: '10rem' }}
                        />
                        {macros.map((m, i) => (
                            <MacroEditor
                                key={i}
                                macro={m}
                                onChange={macro => updateMacro(i, macro)}
                                onRemove={() => removeMacro(i)}
                            />
                        ))}
                        <Button size="sm" onClick={addMacro}>Add action</Button>
                        <div className="d-flex gap-2 mt-2">
                            <Button size="sm" variant="secondary" onClick={() => { resetForm(); setShowCreateForm(false); }}>Cancel</Button>
                            <Button size="sm" onClick={save}>{editIndex === null ? 'Add' : 'Save'}</Button>
                        </div>
                    </Form.Group>
                </div>
            )}
            
            <ul className="list-unstyled ms-3">
                {filteredTriggers.map((t, i) => (
                    <li key={i} className="d-flex align-items-center gap-2">
                        <span>{t.pattern}</span>
                        <Button size="sm" variant="secondary" onClick={() => edit(i)}><TiEdit /></Button>
                        <Button size="sm" variant="danger" onClick={() => remove(i)}><TiDelete /></Button>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default UserTriggers;
