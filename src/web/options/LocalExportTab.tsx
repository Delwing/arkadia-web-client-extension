import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Form, Spinner } from "react-bootstrap";
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
        return () => {
            window.removeEventListener("show-export-import", handleShow);
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
        <div className="d-flex flex-column gap-3">
            <p className="mb-0">
                Wybierz postacie, ktore chcesz uwzglednic w eksporcie. Dane pobierane z internetu (mapy, ziola, magiki
                itp.) nie sa dolaczane.
            </p>
            <section className="character-settings-section">
                <div className="d-flex justify-content-between align-items-center">
                    <h5 className="character-settings-section-title">Postacie</h5>
                    {characters.length > 0 && (
                        <div className="d-flex gap-2">
                            <Button
                                size="sm"
                                variant="outline-secondary"
                                className="py-0 px-2"
                                style={{ fontSize: "0.75rem" }}
                                onClick={() => handleToggleAll(true)}
                            >
                                Wszystkie
                            </Button>
                            <Button
                                size="sm"
                                variant="outline-secondary"
                                className="py-0 px-2"
                                style={{ fontSize: "0.75rem" }}
                                onClick={() => handleToggleAll(false)}
                            >
                                Żadna
                            </Button>
                        </div>
                    )}
                </div>
                {characters.length > 0 ? (
                    <div className="d-flex flex-wrap gap-3">
                        {characters.map(name => (
                            <Form.Check
                                key={name}
                                type="checkbox"
                                id={`export-character-${name}`}
                                label={name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()}
                                checked={!!selection[name]}
                                onChange={e => setSelection(prev => ({ ...prev, [name]: e.target.checked }))}
                            />
                        ))}
                    </div>
                ) : (
                    <p className="text-muted mb-0">Brak zapisanych postaci.</p>
                )}
            </section>
            <section className="character-settings-section">
                <div className="d-flex justify-content-between align-items-center">
                    <h5 className="character-settings-section-title">Dane do eksportu</h5>
                    <div className="d-flex gap-2">
                        <Button
                            size="sm"
                            variant="outline-secondary"
                            className="py-0 px-2"
                            style={{ fontSize: "0.75rem" }}
                            onClick={() => setExportOptions({ ...DEFAULT_EXPORT_OPTIONS })}
                        >
                            Wszystko
                        </Button>
                        <Button
                            size="sm"
                            variant="outline-secondary"
                            className="py-0 px-2"
                            style={{ fontSize: "0.75rem" }}
                            onClick={() => setExportOptions({
                                uiSettings: false,
                                binds: false,
                                shortcuts: false,
                                characterSettings: false,
                                triggers: false,
                                aliases: false,
                                buttons: false,
                                radial: false,
                                scripts: false,
                                multibinds: false,
                                recordings: false,
                                visitedRooms: false,
                                locationNotes: false,
                                peopleEdits: false,
                                knowledge: false,
                            })}
                        >
                            Nic
                        </Button>
                    </div>
                </div>
                <div className="row g-3">
                    <div className="col-6 col-md-4">
                        <div className="text-muted small mb-1">Ustawienia</div>
                        <Form.Check
                            type="checkbox"
                            id="export-option-uiSettings"
                            label="Interfejsu"
                            checked={exportOptions.uiSettings}
                            onChange={e => setExportOptions(prev => ({ ...prev, uiSettings: e.target.checked }))}
                        />
                        <Form.Check
                            type="checkbox"
                            id="export-option-characterSettings"
                            label="Postaci"
                            checked={exportOptions.characterSettings}
                            onChange={e => setExportOptions(prev => ({ ...prev, characterSettings: e.target.checked }))}
                        />
                    </div>
                    <div className="col-6 col-md-4">
                        <div className="text-muted small mb-1">Sterowanie</div>
                        <Form.Check
                            type="checkbox"
                            id="export-option-binds"
                            label="Bindy klawiszy"
                            checked={exportOptions.binds}
                            onChange={e => setExportOptions(prev => ({ ...prev, binds: e.target.checked }))}
                        />
                        <Form.Check
                            type="checkbox"
                            id="export-option-shortcuts"
                            label="Skroty"
                            checked={exportOptions.shortcuts}
                            onChange={e => setExportOptions(prev => ({ ...prev, shortcuts: e.target.checked }))}
                        />
                        <Form.Check
                            type="checkbox"
                            id="export-option-buttons"
                            label="Przyciski"
                            checked={exportOptions.buttons}
                            onChange={e => setExportOptions(prev => ({ ...prev, buttons: e.target.checked }))}
                        />
                        <Form.Check
                            type="checkbox"
                            id="export-option-radial"
                            label="Menu radialne"
                            checked={exportOptions.radial}
                            onChange={e => setExportOptions(prev => ({ ...prev, radial: e.target.checked }))}
                        />
                    </div>
                    <div className="col-6 col-md-4">
                        <div className="text-muted small mb-1">Automatyzacja</div>
                        <Form.Check
                            type="checkbox"
                            id="export-option-triggers"
                            label="Triggery"
                            checked={exportOptions.triggers}
                            onChange={e => setExportOptions(prev => ({ ...prev, triggers: e.target.checked }))}
                        />
                        <Form.Check
                            type="checkbox"
                            id="export-option-aliases"
                            label="Aliasy"
                            checked={exportOptions.aliases}
                            onChange={e => setExportOptions(prev => ({ ...prev, aliases: e.target.checked }))}
                        />
                        <Form.Check
                            type="checkbox"
                            id="export-option-multibinds"
                            label="Multibindy"
                            checked={exportOptions.multibinds}
                            onChange={e => setExportOptions(prev => ({ ...prev, multibinds: e.target.checked }))}
                        />
                        <Form.Check
                            type="checkbox"
                            id="export-option-scripts"
                            label="Skrypty"
                            checked={exportOptions.scripts}
                            onChange={e => setExportOptions(prev => ({ ...prev, scripts: e.target.checked }))}
                        />
                    </div>
                    <div className="col-6 col-md-4">
                        <div className="text-muted small mb-1">Dane</div>
                        <Form.Check
                            type="checkbox"
                            id="export-option-recordings"
                            label="Nagrania"
                            checked={exportOptions.recordings}
                            onChange={e => setExportOptions(prev => ({ ...prev, recordings: e.target.checked }))}
                        />
                        <Form.Check
                            type="checkbox"
                            id="export-option-visitedRooms"
                            label="Odwiedzone lokacje"
                            checked={exportOptions.visitedRooms}
                            onChange={e => setExportOptions(prev => ({ ...prev, visitedRooms: e.target.checked }))}
                        />
                        <Form.Check
                            type="checkbox"
                            id="export-option-locationNotes"
                            label="Notatki lokacji"
                            checked={exportOptions.locationNotes}
                            onChange={e => setExportOptions(prev => ({ ...prev, locationNotes: e.target.checked }))}
                        />
                        <Form.Check
                            type="checkbox"
                            id="export-option-peopleEdits"
                            label="Edycje bazy postaci"
                            checked={exportOptions.peopleEdits}
                            onChange={e => setExportOptions(prev => ({ ...prev, peopleEdits: e.target.checked }))}
                        />
                        <Form.Check
                            type="checkbox"
                            id="export-option-knowledge"
                            label="Wiedza"
                            checked={exportOptions.knowledge}
                            onChange={e => setExportOptions(prev => ({ ...prev, knowledge: e.target.checked }))}
                        />
                    </div>
                </div>
            </section>
            <div className="d-flex flex-wrap gap-2 align-items-center">
                <Button onClick={handleExport} disabled={isProcessing}>
                    {isProcessing ? (
                        <span className="d-inline-flex align-items-center gap-2">
                            <Spinner animation="border" size="sm" role="status" />
                            <span>Przetwarzanie...</span>
                        </span>
                    ) : (
                        "Eksportuj dane"
                    )}
                </Button>
                <Button variant="secondary" onClick={handleImport} disabled={isProcessing}>
                    Importuj dane...
                </Button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json"
                    style={{ display: "none" }}
                    onChange={onFileChange}
                />
            </div>
            {status && (
                <Alert variant="success" className="mb-0">
                    {status}
                </Alert>
            )}
            {error && (
                <Alert variant="danger" className="mb-0">
                    {error}
                </Alert>
            )}
        </div>
    );
}

export default LocalExportTab;
