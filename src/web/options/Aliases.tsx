import { useEffect, useState, ChangeEvent } from "react";
import { Pencil } from "lucide-react";
import { Button, DeleteButton, Input, MenuButton } from "@web-ui/primitives/index.ts";
import { globalStorage } from "@modules/core/storage";
import type { Alias } from "./importBlowtorch";
import { openSettingsPage } from "@web/settings/categories.ts";
import AliasEditModal from "./AliasEditModal";

function Aliases() {
    const [aliases, setAliases] = useState<Alias[]>([]);
    const [filter, setFilter] = useState("");
    const [showModal, setShowModal] = useState(false);
    const [modalAlias, setModalAlias] = useState<{ alias: Alias; index: number } | undefined>(undefined);
    // Follows storage, so aliases imported in Ustawienia show up here too.
    useEffect(() => {
        const saved = globalStorage.get("aliases");
        if (Array.isArray(saved)) {
            setAliases(saved);
        }
        return globalStorage.onChange("aliases", (value) => {
            setAliases(Array.isArray(value) ? value : []);
        });
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
        <div className="alias-manager">
            <div className="alias-manager__toolbar">
                <Input
                    type="search"
                    placeholder="Filtruj"
                    value={filter}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setFilter(e.target.value)}
                />
                <Button size="sm" variant="solid" onClick={openNew}>Dodaj alias</Button>
                <MenuButton
                    label="Importuj"
                    items={[
                        { label: "Z klienta Arkadii (.json)", onSelect: () => openSettingsPage("data-import", "import-aliases-arkadia") },
                        { label: "Z Blowtorch (.xml)", onSelect: () => openSettingsPage("data-import", "import-aliases-blowtorch") },
                    ]}
                />
            </div>

            {aliases.length === 0 ? (
                <p className="popup-field__hint alias-manager__empty">
                    Brak aliasów. Alias zamienia wpisaną komendę na inną, np. <code>zab (.+)</code> → <code>zabij $1</code>.
                </p>
            ) : filteredAliases.length === 0 ? (
                <p className="popup-field__hint alias-manager__empty">Brak aliasów pasujących do filtra.</p>
            ) : (
                <div className="alias-list">
                    {filteredAliases.map(a => (
                        <div key={a.idx} className="alias-card">
                            <div className="alias-card-body">
                                <div className="alias-entry">
                                    <code className="alias-pattern">{a.pattern}</code>
                                    <span className="alias-arrow">→</span>
                                    <code className="alias-command">{a.command}</code>
                                </div>
                                {a.overrides && Object.keys(a.overrides).length > 0 && (
                                    <div className="alias-overrides">
                                        {Object.entries(a.overrides).map(([char, cmd]) => (
                                            <div key={char} className="alias-override-entry">
                                                <span className="alias-override-char">{char}</span>
                                                <code className="alias-command">{cmd}</code>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="alias-card-actions">
                                <Button size="sm" variant="ghost" className="popup-btn--icon" title="Edytuj" onClick={() => openEdit(a.idx)}>
                                    <Pencil size={15} strokeWidth={1.75} />
                                </Button>
                                <DeleteButton onClick={() => remove(a.idx)} />
                            </div>
                        </div>
                    ))}
                </div>
            )}

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
