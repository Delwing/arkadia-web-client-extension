import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SHOW_SETTINGS_EVENT } from "@web/settings/categories.ts";
import { Button, Check } from "@web-ui/primitives/index.ts";
import { characterStorage, globalStorage } from "@modules/core/storage";
import {
    collectCharacters,
    buildExport,
    validatePayload,
    applyImportedData,
    DEFAULT_EXPORT_OPTIONS,
    type ExportOptions,
    type ExportPayload,
} from "./exportUtils";

/** The export checklist, grouped as it is shown. */
const EXPORT_OPTION_GROUPS: { title: string; options: { key: keyof ExportOptions; label: string }[] }[] = [
    { title: "Ustawienia", options: [
        { key: "uiSettings", label: "Interfejsu" },
        { key: "characterSettings", label: "Postaci" },
    ] },
    { title: "Sterowanie", options: [
        { key: "binds", label: "Bindy klawiszy" },
        { key: "shortcuts", label: "Skroty" },
        { key: "buttons", label: "Przyciski" },
        { key: "radial", label: "Menu radialne" },
    ] },
    { title: "Automatyzacja", options: [
        { key: "triggers", label: "Triggery" },
        { key: "aliases", label: "Aliasy" },
        { key: "automationGroups", label: "Grupy automatyzacji" },
        { key: "automationScripts", label: "Skrypty automatyzacji" },
        { key: "multibinds", label: "Multibindy" },
        { key: "scripts", label: "Skrypty" },
    ] },
    { title: "Dane", options: [
        { key: "recordings", label: "Nagrania" },
        { key: "visitedRooms", label: "Odwiedzone lokacje" },
        { key: "locationNotes", label: "Notatki lokacji" },
        { key: "peopleEdits", label: "Edycje bazy postaci" },
        { key: "knowledge", label: "Wiedza" },
    ] },
];

interface LocalExportTabProps {
    // Expose selected characters and options to parent for other tabs
    onSelectionChange?: (characters: string[], options: ExportOptions) => void;
}

function LocalExportTab({ onSelectionChange }: LocalExportTabProps) {
    const [characters, setCharacters] = useState<string[]>([]);
    const [selection, setSelection] = useState<Record<string, boolean>>({});
    const [exportOptions, setExportOptions] = useState<ExportOptions>({ ...DEFAULT_EXPORT_OPTIONS });
    const [status, setStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const selectedCharacters = useMemo(
        () => characters.filter(name => selection[name]),
        [characters, selection]
    );

    // Notify parent of selection changes
    useEffect(() => {
        onSelectionChange?.(selectedCharacters, exportOptions);
    }, [selectedCharacters, exportOptions, onSelectionChange]);

    const refreshCharacters = useCallback(() => {
        const list = collectCharacters();
        setCharacters(list);
        setSelection(prev => {
            const next: Record<string, boolean> = {};
            if (list.length === 0) {
                return next;
            }
            list.forEach(name => {
                next[name] = prev[name] ?? true;
            });
            return next;
        });
    }, []);

    useEffect(() => {
        refreshCharacters();
        const handleChange = () => refreshCharacters();
        const unsub1 = characterStorage.onAnyChange(handleChange);
        const unsub2 = globalStorage.onAnyChange(handleChange);
        window.addEventListener("storage", handleChange);
        return () => {
            unsub1();
            unsub2();
            window.removeEventListener("storage", handleChange);
        };
    }, [refreshCharacters]);

    useEffect(() => {
        const handleShow = () => {
            refreshCharacters();
        };
        window.addEventListener("show-export-import", handleShow);
        window.addEventListener(SHOW_SETTINGS_EVENT, handleShow);
        return () => {
            window.removeEventListener("show-export-import", handleShow);
            window.removeEventListener(SHOW_SETTINGS_EVENT, handleShow);
        };
    }, [refreshCharacters]);

    const handleToggleAll = (checked: boolean) => {
        setSelection(() => {
            const next: Record<string, boolean> = {};
            characters.forEach(name => {
                next[name] = checked;
            });
            return next;
        });
    };

    const handleExport = async () => {
        setError(null);
        setStatus(null);
        setIsProcessing(true);
        try {
            const payload = await buildExport(selectedCharacters, exportOptions);
            const json = JSON.stringify(payload, null, 2);
            const blob = new Blob([json], { type: "application/json" });
            const timestamp = new Date().toISOString().replace(/[:T]/g, "-").split(".")[0];
            const filename = `arkadia-backup-${timestamp}.json`;
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = filename;
            anchor.click();
            URL.revokeObjectURL(url);
            setStatus("Eksport zakończony sukcesem.");
        } catch (err) {
            console.error("Failed to export settings", err);
            setError("Nie udało się wyeksportować danych.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleImport = () => {
        setError(null);
        setStatus(null);
        fileInputRef.current?.click();
    };

    const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setIsProcessing(true);
        setError(null);
        setStatus(null);
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            if (!validatePayload(parsed)) {
                throw new Error("invalid");
            }
            const result = await applyImportedData(parsed as ExportPayload);
            let msg = "Import zakończony sukcesem. Niektóre ustawienia mogą wymagać odświeżenia strony.";
            if (result.deviceSettingsSavedToImportedList) {
                msg += " Ustawienia interfejsu z innego urzadzenia zostaly zapisane - mozesz je zastosowac w zakladce Urzadzenia.";
            }
            setStatus(msg);
            refreshCharacters();
        } catch (err) {
            console.error("Failed to import settings", err);
            setError("Nie udało się zaimportować danych.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="ui-settings-stack">
            <p className="popup-field__hint">
                Wybierz postacie, ktore chcesz uwzglednic w eksporcie. Dane pobierane z internetu (mapy, ziola, magiki
                itp.) nie sa dolaczane.
            </p>
            <section className="character-settings-section">
                <div className="export-section__header">
                    <h5 className="character-settings-section-title">Postacie</h5>
                    {characters.length > 0 && (
                        <div className="popup-inline">
                            <Button size="sm" variant="ghost" onClick={() => handleToggleAll(true)}>Wszystkie</Button>
                            <Button size="sm" variant="ghost" onClick={() => handleToggleAll(false)}>Żadna</Button>
                        </div>
                    )}
                </div>
                {characters.length > 0 ? (
                    <div className="settings-check-grid">
                        {characters.map(name => (
                            <Check
                                key={name}
                                id={`export-character-${name}`}
                                label={name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()}
                                checked={!!selection[name]}
                                onChange={e => setSelection(prev => ({ ...prev, [name]: e.target.checked }))}
                            />
                        ))}
                    </div>
                ) : (
                    <p className="popup-field__hint">Brak zapisanych postaci.</p>
                )}
            </section>
            <section className="character-settings-section">
                <div className="export-section__header">
                    <h5 className="character-settings-section-title">Dane do eksportu</h5>
                    <div className="popup-inline">
                        <Button size="sm" variant="ghost" onClick={() => setExportOptions({ ...DEFAULT_EXPORT_OPTIONS })}>
                            Wszystko
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setExportOptions(Object.fromEntries(
                                Object.keys(DEFAULT_EXPORT_OPTIONS).map(key => [key, false]),
                            ) as unknown as ExportOptions)}
                        >
                            Nic
                        </Button>
                    </div>
                </div>
                <div className="export-option-groups">
                    {EXPORT_OPTION_GROUPS.map(group => (
                        <div key={group.title} className="export-option-group">
                            <span className="popup-field__label">{group.title}</span>
                            {group.options.map(option => (
                                <Check
                                    key={option.key}
                                    id={`export-option-${option.key}`}
                                    label={option.label}
                                    checked={exportOptions[option.key]}
                                    onChange={e => setExportOptions(prev => ({ ...prev, [option.key]: e.target.checked }))}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </section>
            <div className="popup-inline settings-wrap">
                <Button variant="solid" onClick={handleExport} disabled={isProcessing}>
                    {isProcessing ? (
                        <>
                            <span className="popup-spinner" />
                            <span>Przetwarzanie...</span>
                        </>
                    ) : (
                        "Eksportuj dane"
                    )}
                </Button>
                <Button onClick={handleImport} disabled={isProcessing}>
                    Importuj dane...
                </Button>
                <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={onFileChange} />
            </div>
            {status && <div className="popup-notice popup-notice--success">{status}</div>}
            {error && <div className="popup-notice popup-notice--danger">{error}</div>}
        </div>
    );
}

export default LocalExportTab;
