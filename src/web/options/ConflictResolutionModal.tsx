import { Button, Alert } from "react-bootstrap";
import type { CategoryConflictInfo, ConflictResolution, SyncCategory } from "@modules/firebase";
import { SYNC_CATEGORY_NAMES } from "@modules/firebase";
import SubDialog from "../SubDialog";
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

/**
 * Shown from the sync tab of `#export-import-modal`, so it uses the shared
 * inline `SubDialog` rather than a portaled react-bootstrap `<Modal>` — see
 * `@web/SubDialog` for why.
 */
function ConflictResolutionModal({ show, conflicts, onResolve }: ConflictResolutionModalProps) {
    if (!show || !conflicts || conflicts.length === 0) return null;

    const categories = conflicts.map(c => c.category);

    return (
        <SubDialog
            size="lg"
            title="Konflikt synchronizacji"
            onClose={() => onResolve('cancel', categories)}
            footer={(
                <>
                    <Button variant="secondary" onClick={() => onResolve('cancel', categories)}>
                        Anuluj
                    </Button>
                    <Button variant="outline-primary" onClick={() => onResolve('keep-local', categories)}>
                        Zachowaj lokalne
                    </Button>
                    <Button variant="primary" onClick={() => onResolve('use-cloud', categories)}>
                        Uzyj z chmury
                    </Button>
                </>
            )}
        >
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
        </SubDialog>
    );
}

export default ConflictResolutionModal;
