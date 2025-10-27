import { useEffect, useState, ChangeEvent } from "react";
import { Button, Form } from "react-bootstrap";
import { TiDelete, TiEdit } from "react-icons/ti";
import storage from "@client/src/storage";

export interface UserMacro {
    type: 'uppercase' | 'color' | 'replace' | 'beep' | 'command';
    color?: string;
    to?: string;
    command?: string;
}

export interface UserTrigger {
    pattern: string;
    macros: UserMacro[];
}

function MacroEditor({ macro, onChange, onRemove }: { macro: UserMacro; onChange: (m: UserMacro) => void; onRemove: () => void }) {
    return (
        <div className="d-flex align-items-start gap-2 mb-1">
            <div className="flex-grow-1">
                <Form.Select
                    size="sm"
                    value={macro.type}
                    onChange={e => onChange({ ...macro, type: e.target.value as any })}
                >
                    <option value="uppercase">Wielkie litery</option>
                    <option value="color">Koloruj</option>
                    <option value="replace">Zamień</option>
                    <option value="beep">Dźwięk</option>
                    <option value="command">Komenda</option>
                </Form.Select>
                {macro.type === 'command' && (
                    <Form.Control
                        className="mt-1 font-monospace"
                        type="text"
                        size="sm"
                        placeholder="Command"
                        value={macro.command || ''}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ ...macro, command: e.target.value })}
                    />
                )}
            </div>
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
        setShowCreateForm(false);
    }

    function remove(idx: number) {
        if (!confirm('Delete trigger?')) return;
        const updated = triggers.filter((_, i) => i !== idx);
        saveList(updated);
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

    function macrosToText(list: UserMacro[]): string {
        return list
            .map(m => {
                switch (m.type) {
                    case 'uppercase':
                        return 'uppercase';
                    case 'color':
                        return m.color ? `color ${m.color}` : 'color';
                    case 'replace':
                        return m.to ? `replace ${m.to}` : 'replace';
                    case 'beep':
                        return 'beep';
                    case 'command':
                        return m.command ? `command ${m.command}` : 'command';
                    default:
                        return m.type;
                }
            })
            .join(', ');
    }

    const filteredTriggers = triggers
        .map((t, idx) => ({ ...t, idx }))
        .filter(t => t.pattern.toLowerCase().includes(filter.toLowerCase()));

    return (
        <div className="m-2 d-flex flex-column gap-2">
            <div className="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 w-100">
                <Form.Control
                    type="text"
                    size="sm"
                    placeholder="Filter"
                    value={filter}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setFilter(e.target.value)}
                    className="flex-grow-1"
                    style={{ minWidth: 0 }}
                />
                <Button size="sm" className="w-100 w-md-auto text-nowrap" onClick={openNew}>Dodaj trigger</Button>
            </div>
            
            {showCreateForm && (
                <div className="border rounded p-3 mb-3">
                    <h6 className="mb-3">{editIndex === null ? 'Dodaj trigger' : 'Edytuj trigger'}</h6>
                    <Form.Group className="d-flex flex-column gap-2">
                        <Form.Control
                            type="text"
                            size="sm"
                            placeholder="Pattern"
                            value={pattern}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setPattern(e.target.value)}
                            style={{ width: '100%' }}
                            className="font-monospace"
                        />
                        {macros.map((m, i) => (
                            <MacroEditor
                                key={i}
                                macro={m}
                                onChange={macro => updateMacro(i, macro)}
                                onRemove={() => removeMacro(i)}
                            />
                        ))}
                        <Button size="sm" onClick={addMacro}>Dodaj akcję</Button>
                        <div className="d-flex gap-2 mt-2">
                            <Button size="sm" variant="secondary" onClick={() => { resetForm(); setShowCreateForm(false); }}>Anuluj</Button>
                            <Button size="sm" onClick={save}>{editIndex === null ? 'Dodaj' : 'Zapisz'}</Button>
                        </div>
                    </Form.Group>
                </div>
            )}

            <ul className="list-unstyled ms-3">
                {filteredTriggers.map(t => (
                    editIndex === t.idx ? (
                        <li key={t.idx} className="alias-list-item">
                            <div className="border rounded p-3 mb-3">
                                <h6 className="mb-3">Edytuj trigger</h6>
                                <Form.Group className="d-flex flex-column gap-2">
                                    <Form.Control
                                        type="text"
                                        size="sm"
                                        placeholder="Pattern"
                                        value={pattern}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setPattern(e.target.value)}
                                        style={{ width: '100%' }}
                                        className="font-monospace"
                                    />
                                    {macros.map((m, i) => (
                                        <MacroEditor
                                            key={i}
                                            macro={m}
                                            onChange={macro => updateMacro(i, macro)}
                                            onRemove={() => removeMacro(i)}
                                        />
                                    ))}
                                    <Button size="sm" onClick={addMacro}>Dodaj akcję</Button>
                                    <div className="d-flex gap-2 mt-2">
                                        <Button size="sm" variant="secondary" onClick={resetForm}>Anuluj</Button>
                                        <Button size="sm" onClick={save}>Zapisz</Button>
                                    </div>
                                </Form.Group>
                            </div>
                        </li>
                    ) : (
                        <li key={t.idx} className="alias-list-item d-flex flex-column flex-md-row gap-2 align-items-stretch align-items-md-center">
                            <div className="alias-entry flex-grow-1">
                                <code className="alias-pattern">{t.pattern}</code>
                                {t.macros?.length ? (
                                    <>
                                        <span className="alias-divider">→</span>
                                        <code className="alias-command">{macrosToText(t.macros)}</code>
                                    </>
                                ) : null}
                            </div>
                            <div className="alias-list-item-actions">
                                <Button size="sm" variant="secondary" onClick={() => edit(t.idx)}><TiEdit /></Button>
                                <Button size="sm" variant="danger" onClick={() => remove(t.idx)}><TiDelete /></Button>
                            </div>
                        </li>
                    )
                ))}
            </ul>
        </div>
    );
}

export default UserTriggers;
