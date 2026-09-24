import { ChangeEvent, useRef, useState } from "react";
import { Button } from "@web-ui/primitives/index.ts";
import { buildBackup, isRestorableBackup, restoreBackup } from "./exportUtils";

function LocalExportTab() {
    const [status, setStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleExport = async () => {
        setError(null);
        setStatus(null);
        setIsProcessing(true);
        try {
            const payload = await buildBackup();
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
            if (!isRestorableBackup(parsed)) {
                throw new Error("invalid");
            }
            const result = await restoreBackup(parsed);
            let msg = "Import zakończony sukcesem. Niektóre ustawienia mogą wymagać odświeżenia strony.";
            if (result.deviceSettingsSavedToImportedList) {
                msg += " Ustawienia interfejsu z innego urzadzenia zostaly zapisane - mozesz je zastosowac w zakladce Urzadzenia.";
            }
            setStatus(msg);
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
                Kopia zawiera wszystkie Twoje dane i ustawienia wszystkich postaci. Dane pobierane z internetu (mapy,
                ziola, magiki itp.) nie sa dolaczane.
            </p>
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
