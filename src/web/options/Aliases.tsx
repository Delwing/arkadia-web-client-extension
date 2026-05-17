import { useEffect, useState, ChangeEvent, useRef } from "react";
import { Button, Form } from "react-bootstrap";
import { Trash2, Pencil } from "lucide-react";
import { globalStorage } from "@modules/core/storage";
import { parseBlowtorch, Alias } from "./importBlowtorch";
import { parseArkadia } from "./importArkadia";
import AliasEditModal from "./AliasEditModal";

function Aliases() {
    const [aliases, setAliases] = useState<Alias[]>([]);
    const [filter, setFilter] = useState("");
    const [showModal, setShowModal] = useState(false);
    const [modalAlias, setModalAlias] = useState<{ alias: Alias; index: number } | undefined>(undefined);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const arkadiaInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const saved = globalStorage.get("aliases");
        if (Array.isArray(saved)) {
            setAliases(saved);
        }
    }, []);

    function saveList(list: Alias[]) {
        setAliases(list);
        globalStorage.set("aliases", list);
    }

    function openNew() {
        setModalAlias(undefined);
        setShowModal(true);
    }

    function openEdit(idx: number) {
        setModalAlias({ alias: aliases[idx], index: idx });
        setShowModal(true);
    }

    function closeModal() {
        setShowModal(false);
        setModalAlias(undefined);
    }

    function handleSave(alias: Alias) {
        const updated = [...aliases];
        if (modalAlias !== undefined) {
            updated[modalAlias.index] = alias;
        } else {
            updated.push(alias);
        }
        saveList(updated);
        closeModal();
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

    function remove(idx: number) {
        if (!confirm("Czy na pewno chcesz usunąć ten alias?")) return;
        const updated = aliases.filter((_, i) => i !== idx);
        saveList(updated);
    }

    const lowerFilter = filter.toLowerCase();
    const filteredAliases = aliases
        .map((a, idx) => ({ ...a, idx }))
        .filter(a => {
            if (!lowerFilter) return true;
            if (a.pattern.toLowerCase().includes(lowerFilter)) return true;
            if (a.command.toLowerCase().includes(lowerFilter)) return true;
            if (a.overrides) {
                for (const [char, cmd] of Object.entries(a.overrides)) {
                    if (char.toLowerCase().includes(lowerFilter)) return true;
                    if (cmd.toLowerCase().includes(lowerFilter)) return true;
                }
            }
            return false;
        });

    const existingPatterns = aliases.map(a => a.pattern);

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

            <div className="d-flex flex-column gap-2">
                {filteredAliases.map(a => (
                    <div key={a.idx} className="alias-card">
                        <div className="alias-card-body">
                            <div className="alias-entry">
                                <code className="alias-pattern">{a.pattern}</code>
                                <span className="alias-entry-command">
                                    <code className="alias-command">{a.command}</code>
                                </span>
                            </div>
                            {a.overrides && Object.keys(a.overrides).length > 0 && (
                                <div className="alias-overrides">
                                    {Object.entries(a.overrides).map(([char, cmd]) => (
                                        <div key={char} className="alias-override-entry">
                                            <span className="alias-override-char">{char}</span>
                                            <span className="alias-entry-command">
                                                <code className="alias-command">{cmd}</code>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="alias-card-actions">
                            <Button size="sm" variant="secondary" onClick={() => openEdit(a.idx)}><Pencil size={16} /></Button>
                            <Button size="sm" variant="danger" onClick={() => remove(a.idx)}><Trash2 size={16} /></Button>
                        </div>
                    </div>
                ))}
            </div>

            <AliasEditModal
                show={showModal}
                onClose={closeModal}
                onSave={handleSave}
                alias={modalAlias?.alias}
                existingPatterns={existingPatterns}
            />
        </div>
    );
}

export default Aliases;
