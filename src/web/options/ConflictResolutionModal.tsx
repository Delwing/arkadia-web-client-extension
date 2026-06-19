import { Modal, Button, Alert } from "react-bootstrap";
import type { CategoryConflictInfo, ConflictResolution, SyncCategory } from "@modules/firebase";
import { SYNC_CATEGORY_NAMES } from "@modules/firebase";
import ConflictDiffView from "./ConflictDiffView";

interface ConflictResolutionModalProps {
    show: boolean;
    conflicts: CategoryConflictInfo[];
    onResolve: (resolution: ConflictResolution, categories: SyncCategory[]) => void;
}

function formatDate(timestamp: number | string): string {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'Nieznana data';
    return date.toLocaleString();
}

function ConflictResolutionModal({ show, conflicts, onResolve }: ConflictResolutionModalProps) {
    if (!conflicts || conflicts.length === 0) return null;

    const categories = conflicts.map(c => c.category);

    return (
        <Modal show={show} onHide={() => onResolve('cancel', categories)} centered size="lg">
            <Modal.Header closeButton>
                <Modal.Title>Konflikt synchronizacji</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Alert variant="warning" className="mb-3">
                    {conflicts.length === 1
                        ? 'Dane lokalne roznia sie od danych zapisanych w chmurze dla nastepujacej kategorii.'
                        : `Dane lokalne roznia sie od danych zapisanych w chmurze dla ${conflicts.length} kategorii.`
                    }
                    {' '}Wybierz, ktora wersje chcesz zachowac.
                </Alert>

                <div className="mb-3" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                    {conflicts.map((conflict) => (
                        <div key={conflict.category} className="mb-2 p-2 border rounded">
                            <div className="fw-semibold mb-1">
                                {SYNC_CATEGORY_NAMES[conflict.category]}
                            </div>
                            <div className="d-flex gap-3 small">
                                <div>
                                    <span className="text-muted">Lokalna: </span>
                                    {formatDate(conflict.localTimestamp) || 'Brak'}
                                </div>
                                <div>
                                    <span className="text-muted">Chmura: </span>
                                    {formatDate(conflict.cloudTimestamp)}
                                </div>
                            </div>
                            <ConflictDiffView conflict={conflict} />
                        </div>
                    ))}
                </div>

                <p className="text-muted small mb-0">
                    Uwaga: Wybrana wersja nadpisze druga dla wszystkich wymienionych kategorii. Ta operacja jest nieodwracalna.
                </p>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={() => onResolve('cancel', categories)}>
                    Anuluj
                </Button>
                <Button variant="outline-primary" onClick={() => onResolve('keep-local', categories)}>
                    Zachowaj lokalne
                </Button>
                <Button variant="primary" onClick={() => onResolve('use-cloud', categories)}>
                    Uzyj z chmury
                </Button>
            </Modal.Footer>
        </Modal>
    );
}

export default ConflictResolutionModal;
