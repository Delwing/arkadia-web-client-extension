import { useEffect, useState, ChangeEvent } from "react";
import { Button, Form, Modal } from "react-bootstrap";
import { TiDelete, TiEdit } from "react-icons/ti";
import storage from "./storage";

interface Alias {
    pattern: string;
    command: string;
}

function Aliases() {
    const [aliases, setAliases] = useState<Alias[]>([]);
    const [pattern, setPattern] = useState("");
    const [command, setCommand] = useState("");
    const [editIndex, setEditIndex] = useState<number | null>(null);
    const [showModal, setShowModal] = useState(false);
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
        setShowModal(true);
    }

    function openEdit(idx: number) {
        const a = aliases[idx];
        setPattern(a.pattern);
        setCommand(a.command);
        setEditIndex(idx);
        setShowModal(true);
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

            <Modal show={showModal} onHide={() => setShowModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>{editIndex === null ? 'Dodaj alias' : 'Edytuj alias'}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
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
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button size="sm" variant="secondary" onClick={() => setShowModal(false)}>Anuluj</Button>
                    <Button size="sm" onClick={() => { save(); setShowModal(false); }}>{editIndex === null ? 'Dodaj' : 'Zapisz'}</Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
}

export default Aliases;
