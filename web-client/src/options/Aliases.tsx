import { useEffect, useState, ChangeEvent } from "react";
import { Button, Form } from "react-bootstrap";
import { TiDelete, TiEdit } from "react-icons/ti";
import storage from "@client/src/storage";

interface Alias {
    pattern: string;
    command: string;
}

function Aliases() {
    const [aliases, setAliases] = useState<Alias[]>([]);
    const [pattern, setPattern] = useState("");
    const [command, setCommand] = useState("");
    const [editIndex, setEditIndex] = useState<number | null>(null);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [filter, setFilter] = useState("");

    useEffect(() => {
        storage.getItem("aliases").then(res => {
            if (res && Array.isArray(res.aliases)) {
                setAliases(res.aliases);
            }
        });
    }, []);

    function saveList(list: Alias[]) {
        setAliases(list);
        storage.setItem("aliases", list);
    }

    function resetForm() {
        setPattern("");
        setCommand("");
        setEditIndex(null);
    }

    function openNew() {
        resetForm();
        setShowCreateForm(true);
    }

    function openEdit(idx: number) {
        const a = aliases[idx];
        setPattern(a.pattern);
        setCommand(a.command);
        setEditIndex(idx);
        setShowCreateForm(true);
    }

    function save() {
        const p = pattern.trim();
        const c = command.trim();
        if (!p || !c) return;
        if (aliases.some((a, i) => i !== editIndex && a.pattern === p)) {
            alert("Alias już istnieje");
            return;
        }
        const updated = [...aliases];
        const entry = { pattern: p, command: c };
        if (editIndex === null) {
            updated.push(entry);
        } else {
            updated[editIndex] = entry;
        }
        saveList(updated);
        resetForm();
        setShowCreateForm(false);
    }


    function remove(idx: number) {
        if (!confirm("Czy na pewno chcesz usunąć ten alias?")) return;
        const updated = aliases.filter((_, i) => i !== idx);
        saveList(updated);
    }

    const filteredAliases = aliases.filter(a =>
        a.pattern.toLowerCase().includes(filter.toLowerCase()) ||
        a.command.toLowerCase().includes(filter.toLowerCase())
    );

    return (
        <div className="m-2 d-flex flex-column gap-2">
            <div className="d-flex gap-2 align-items-center">
                <Form.Control
                    type="text"
                    size="sm"
                    placeholder="Filtruj"
                    value={filter}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setFilter(e.target.value)}
                    style={{width: '100%', maxWidth: '12rem'}}
                />
                <Button size="sm" onClick={openNew}>Dodaj alias</Button>
            </div>
            
            {showCreateForm && (
                <div className="border rounded p-3 mb-3">
                    <h6 className="mb-3">{editIndex === null ? 'Dodaj alias' : 'Edytuj alias'}</h6>
                    <Form.Group className="d-flex flex-column gap-2">
                        <Form.Control
                            type="text"
                            size="sm"
                            placeholder="Pattern"
                            value={pattern}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setPattern(e.target.value)}
                        />
                        <Form.Control
                            type="text"
                            size="sm"
                            placeholder="Komenda"
                            value={command}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setCommand(e.target.value)}
                        />
                        <small className="text-secondary">
                            Pattern jest wyrażeniem regularnym. Użyj <code>$1</code>, <code>$2</code> itd. w komendzie, aby wstawić odpowiednie grupy.
                        </small>
                        <div className="d-flex gap-2">
                            <Button size="sm" variant="secondary" onClick={() => { resetForm(); setShowCreateForm(false); }}>Anuluj</Button>
                            <Button size="sm" onClick={save}>{editIndex === null ? 'Dodaj' : 'Zapisz'}</Button>
                        </div>
                    </Form.Group>
                </div>
            )}
            
            <ul className="list-unstyled ms-3">
                {filteredAliases.map((a, i) => (
                    <li key={i} className="d-flex align-items-center justify-content-between gap-2 alias-list-item">
                        <span>
                            <span>{a.pattern}</span>
                            <span className="text-secondary mx-1">→</span>
                            <span>{a.command}</span>
                        </span>
                        <span className="d-flex gap-2">
                            <Button size="sm" variant="secondary" onClick={() => openEdit(i)}><TiEdit /></Button>
                            <Button size="sm" variant="danger" onClick={() => remove(i)}><TiDelete /></Button>
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default Aliases;
