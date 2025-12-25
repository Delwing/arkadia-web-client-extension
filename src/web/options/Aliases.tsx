import { useEffect, useState, ChangeEvent, useRef } from "react";
import { Button, Form } from "react-bootstrap";
import { TiDelete, TiEdit } from "react-icons/ti";
import storage from "@modules/core/storage";
import { parseBlowtorch, Alias } from "./importBlowtorch";
import { parseArkadia } from "./importArkadia";

function Aliases() {
    const [aliases, setAliases] = useState<Alias[]>([]);
    const [pattern, setPattern] = useState("");
    const [command, setCommand] = useState("");
    const [editIndex, setEditIndex] = useState<number | null>(null);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [filter, setFilter] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const arkadiaInputRef = useRef<HTMLInputElement>(null);

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

    function openArkadiaImport() {
        arkadiaInputRef.current?.click();
    }

    function openImport() {
        fileInputRef.current?.click();
    }

    async function handleArkadiaImport(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const { imported, skipped } = parseArkadia(text);
            const filtered = imported.filter(a => !aliases.some(b => b.pattern === a.pattern));
            if (filtered.length) {
                saveList([...aliases, ...filtered]);
            }
            let message = `Zaimportowano ${filtered.length} aliasów`;
            if (skipped.length) {
                message += `\nPominięto: ${skipped.join(", ")}`;
            } else if (!filtered.length) {
                message = "Brak nowych aliasów";
            }
            alert(message);
        } catch {
            alert("Nie udało się zaimportować pliku");
        } finally {
            e.target.value = "";
        }
    }

    async function handleImport(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const imported = parseBlowtorch(text);
            const filtered = imported.filter(a => !aliases.some(b => b.pattern === a.pattern));
            if (filtered.length) {
                saveList([...aliases, ...filtered]);
                alert(`Zaimportowano ${filtered.length} aliasów`);
            } else {
                alert("Brak nowych aliasów");
            }
        } catch {
            alert("Nie udało się zaimportować pliku");
        } finally {
            e.target.value = "";
        }
    }

    function openEdit(idx: number) {
        const a = aliases[idx];
        setPattern(a.pattern);
        setCommand(a.command);
        setEditIndex(idx);
        setShowCreateForm(false);
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

    const filteredAliases = aliases
        .map((a, idx) => ({ ...a, idx }))
        .filter(a =>
            a.pattern.toLowerCase().includes(filter.toLowerCase()) ||
            a.command.toLowerCase().includes(filter.toLowerCase())
        );

    return (
        <div className="m-2 d-flex flex-column gap-2">
            <div className="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 w-100">
                <Form.Control
                    type="text"
                    size="sm"
                    placeholder="Filtruj"
                    value={filter}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setFilter(e.target.value)}
                    className="flex-grow-1"
                    style={{ minWidth: 0 }}
                />
                <Button size="sm" className="w-100 w-md-auto text-nowrap" onClick={openNew}>Dodaj alias</Button>
                <Button size="sm" className="w-100 w-md-auto text-nowrap" onClick={openArkadiaImport}>Importuj z klienta Arkadii</Button>
                <Button size="sm" className="w-100 w-md-auto text-nowrap" onClick={openImport}>Importuj z Blowtorch</Button>
                <input
                    ref={arkadiaInputRef}
                    type="file"
                    accept=".json"
                    style={{ display: 'none' }}
                    onChange={handleArkadiaImport}
                />
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xml"
                    style={{ display: 'none' }}
                    onChange={handleImport}
                />
            </div>
            
            {showCreateForm && (
                <div className="border rounded p-3 mb-3">
                    <h6 className="mb-3">{editIndex === null ? 'Dodaj alias' : 'Edytuj alias'}</h6>
                    <Form.Group className="d-flex flex-column gap-2">
                        <div>
                            <Form.Label className="mb-1 small">Wzorzec (pattern)</Form.Label>
                            <Form.Control
                                type="text"
                                size="sm"
                                placeholder="np. ^zab (.+)$"
                                value={pattern}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setPattern(e.target.value)}
                                className="font-monospace"
                            />
                        </div>
                        <div>
                            <Form.Label className="mb-1 small">Komenda do wykonania</Form.Label>
                            <Form.Control
                                type="text"
                                size="sm"
                                placeholder="np. zabij $1"
                                value={command}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setCommand(e.target.value)}
                                className="font-monospace"
                            />
                        </div>
                        <small className="text-secondary">
                            Pattern jest wyrażeniem regularnym. Użyj <code>$1</code>, <code>$2</code> itd. w komendzie, aby wstawić odpowiednie grupy.<br/>
                            Możesz także korzystać ze skrótów obiektów (<code>@1</code>, <code>@A</code>, <code>@@</code>), które zostaną rozwinięte do identyfikatorów obiektów.
                        </small>
                        <div className="d-flex gap-2">
                            <Button size="sm" variant="secondary" onClick={() => { resetForm(); setShowCreateForm(false); }}>Anuluj</Button>
                            <Button size="sm" onClick={save}>{editIndex === null ? 'Dodaj' : 'Zapisz'}</Button>
                        </div>
                    </Form.Group>
                </div>
            )}
            
            <ul className="list-unstyled">
                {filteredAliases.map(a => (
                    editIndex === a.idx ? (
                        <li key={a.idx} className="alias-list-item d-flex flex-column gap-2">
                            <Form.Group className="d-flex flex-column gap-2">
                                <div>
                                    <Form.Label className="mb-1 small">Wzorzec (pattern)</Form.Label>
                                    <Form.Control
                                        type="text"
                                        size="sm"
                                        placeholder="np. ^zab (.+)$"
                                        value={pattern}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setPattern(e.target.value)}
                                        className="font-monospace"
                                    />
                                </div>
                                <div>
                                    <Form.Label className="mb-1 small">Komenda do wykonania</Form.Label>
                                    <Form.Control
                                        type="text"
                                        size="sm"
                                        placeholder="np. zabij $1"
                                        value={command}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setCommand(e.target.value)}
                                        className="font-monospace"
                                    />
                                </div>
                                <div className="d-flex gap-2">
                                    <Button size="sm" variant="secondary" onClick={resetForm}>Anuluj</Button>
                                    <Button size="sm" onClick={save}>Zapisz</Button>
                                </div>
                            </Form.Group>
                        </li>
                    ) : (
                        <li key={a.idx} className="alias-list-item d-flex flex-column flex-md-row gap-2 align-items-stretch align-items-md-center">
                            <div className="alias-entry flex-grow-1">
                                <code className="alias-pattern">{a.pattern}</code>
                                <span className="alias-divider">→</span>
                                <code className="alias-command">{a.command}</code>
                            </div>
                            <div className="alias-list-item-actions">
                                <Button size="sm" variant="secondary" onClick={() => openEdit(a.idx)}><TiEdit /></Button>
                                <Button size="sm" variant="danger" onClick={() => remove(a.idx)}><TiDelete /></Button>
                            </div>
                        </li>
                    )
                ))}
            </ul>
        </div>
    );
}

export default Aliases;
