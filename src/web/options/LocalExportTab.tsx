import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Button } from "@web-ui/primitives/index.ts";
import { SHOW_SETTINGS_EVENT } from "@web/settings/categories.ts";
import { loadPreSyncBackup, PRE_SYNC_BACKUP_SAVED_EVENT } from "@web/userData/preSyncBackup.ts";
import { buildBackup, isRestorableBackup, restoreBackup, type BackupPayload } from "./exportUtils";
import { confirmRestore, publishRestore } from "./restoreFlow";

function downloadBackup(payload: BackupPayload, name: string): void {
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
}

function LocalExportTab() {
    const [status, setStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    // Taken automatically right before this device moved to the new sync
    const [preSyncBackup, setPreSyncBackup] = useState<BackupPayload | null>(null);

    // The settings dialog stays mounted, and the backup is taken when sync is
    // first switched on: look again when it is saved and when settings open.
    useEffect(() => {
        const load = () => {
            loadPreSyncBackup()
                .then(setPreSyncBackup)
                .catch(err => console.warn("Failed to read the backup from before the sync update", err));
        };
        load();
        window.addEventListener(PRE_SYNC_BACKUP_SAVED_EVENT, load);
        window.addEventListener(SHOW_SETTINGS_EVENT, load);
        return () => {
            window.removeEventListener(PRE_SYNC_BACKUP_SAVED_EVENT, load);
            window.removeEventListener(SHOW_SETTINGS_EVENT, load);
        };
    }, []);

    const handleExport = async () => {
        setError(null);
        setStatus(null);
        setIsProcessing(true);
        try {
            const payload = await buildBackup();
            const timestamp = new Date().toISOString().replace(/[:T]/g, "-").split(".")[0];
            downloadBackup(payload, `arkadia-backup-${timestamp}.json`);
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

    const restore = async (payload: Parameters<typeof restoreBackup>[0]) => {
        if (!confirmRestore()) return;
        const result = await restoreBackup(payload);
        await publishRestore();
        let msg = "Import zakończony sukcesem. Niektóre ustawienia mogą wymagać odświeżenia strony.";
        if (result.deviceSettingsSavedToImportedList) {
            msg += " Ustawienia interfejsu z innego urzadzenia zostaly zapisane - mozesz je zastosowac w zakladce Urzadzenia.";
        }
        setStatus(msg);
    };

    const handleRestorePreSync = async () => {
        if (!preSyncBackup) return;
        setIsProcessing(true);
        setError(null);
        setStatus(null);
        try {
            await restore(preSyncBackup);
        } catch (err) {
            console.error("Failed to restore the backup from before the sync update", err);
            setError("Nie udało się przywrócić kopii.");
        } finally {
            setIsProcessing(false);
        }
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
            await restore(parsed);
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
            {preSyncBackup && (
                <>
                    <p className="popup-field__hint">
                        Kopia sprzed aktualizacji synchronizacji
                        ({new Date(preSyncBackup.createdAt).toLocaleString()}) - zapisana automatycznie na tym
                        urzadzeniu, zanim nowa synchronizacja zmienila jakiekolwiek dane.
                    </p>
                    <div className="popup-inline settings-wrap">
                        <Button onClick={handleRestorePreSync} disabled={isProcessing}>
                            Przywroc stan sprzed aktualizacji
                        </Button>
                        <Button
                            onClick={() => downloadBackup(preSyncBackup, "arkadia-backup-przed-aktualizacja-synchronizacji.json")}
                            disabled={isProcessing}
                        >
                            Pobierz te kopie
                        </Button>
                    </div>
                </>
            )}
            {status && <div className="popup-notice popup-notice--success">{status}</div>}
            {error && <div className="popup-notice popup-notice--danger">{error}</div>}
        </div>
    );
}

export default LocalExportTab;
