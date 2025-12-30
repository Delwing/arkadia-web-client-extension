import { useState } from "react";
import { Modal, Button, Alert, Spinner } from "react-bootstrap";
import type { SyncConflict } from "@modules/device";
import { resolveSyncConflict, getRemoteDeviceName } from "@modules/firebase";

interface SyncConflictModalProps {
    conflict: SyncConflict;
    onResolved: () => void;
    onCancel: () => void;
}

function SyncConflictModal({ conflict, onResolved, onCancel }: SyncConflictModalProps) {
    const [isResolving, setIsResolving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [remoteDeviceName, setRemoteDeviceName] = useState<string>(conflict.remoteUpdatedBy);

    // Resolve device name on mount
    useState(() => {
        getRemoteDeviceName(conflict.remoteUpdatedBy).then(setRemoteDeviceName);
    });

    const formatDate = (isoString: string) => {
        try {
            return new Date(isoString).toLocaleString("pl-PL");
        } catch {
            return isoString;
        }
    };

    const handleResolve = async (choice: "local" | "remote") => {
        setIsResolving(true);
        setError(null);

        try {
            const resolveChoice = choice === "local" ? "keep-local" : "use-remote";
            const result = await resolveSyncConflict(resolveChoice, conflict);
            if (result.success) {
                onResolved();
            } else {
                setError(result.error || "Nie udalo sie rozwiazac konfliktu.");
            }
        } catch (err) {
            console.error("Failed to resolve sync conflict", err);
            setError("Wystapil blad podczas rozwiazywania konfliktu.");
        } finally {
            setIsResolving(false);
        }
    };

    return (
        <Modal show onHide={onCancel} centered backdrop="static">
            <Modal.Header closeButton>
                <Modal.Title>Konflikt synchronizacji</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Alert variant="warning" className="mb-3">
                    Ustawienia na tym urzadzeniu roznia sie od ustawien w chmurze.
                    Wybierz, ktore ustawienia chcesz zachowac.
                </Alert>

                <div className="mb-3">
                    <strong>Ustawienia zdalne:</strong>
                    <div className="text-muted small">
                        <div>Zmienione przez: {remoteDeviceName}</div>
                        <div>Data: {formatDate(conflict.remoteUpdatedAt)}</div>
                        <div>Wersja: {conflict.remoteVersion}</div>
                    </div>
                </div>

                <div className="mb-3">
                    <strong>Ustawienia lokalne:</strong>
                    <div className="text-muted small">
                        <div>Wersja: {conflict.localVersion}</div>
                    </div>
                </div>

                {error && (
                    <Alert variant="danger" className="mb-0">
                        {error}
                    </Alert>
                )}
            </Modal.Body>
            <Modal.Footer>
                <Button
                    variant="secondary"
                    onClick={onCancel}
                    disabled={isResolving}
                >
                    Anuluj
                </Button>
                <Button
                    variant="outline-primary"
                    onClick={() => handleResolve("local")}
                    disabled={isResolving}
                >
                    {isResolving ? (
                        <Spinner size="sm" />
                    ) : (
                        "Zachowaj lokalne"
                    )}
                </Button>
                <Button
                    variant="primary"
                    onClick={() => handleResolve("remote")}
                    disabled={isResolving}
                >
                    {isResolving ? (
                        <Spinner size="sm" />
                    ) : (
                        "Uzyj zdalnych"
                    )}
                </Button>
            </Modal.Footer>
        </Modal>
    );
}

export default SyncConflictModal;
