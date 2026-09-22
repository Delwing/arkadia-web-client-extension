import type { CategoryConflictInfo, ConflictResolution, SyncCategory } from "@modules/firebase";
import { Button } from "@web-ui/primitives/index.ts";
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
                    <Button onClick={() => onResolve('cancel', categories)}>
                        Anuluj
                    </Button>
                    <Button onClick={() => onResolve('keep-local', categories)}>
                        Zachowaj lokalne
                    </Button>
                    <Button variant="solid" onClick={() => onResolve('use-cloud', categories)}>
                        Uzyj z chmury
                    </Button>
                </>
            )}
        >
            <div className="popup-stack">
                <div className="popup-notice popup-notice--warning">
                    {conflicts.length === 1
                        ? 'Dane lokalne roznia sie od danych zapisanych w chmurze dla nastepujacej kategorii.'
                        : `Dane lokalne roznia sie od danych zapisanych w chmurze dla ${conflicts.length} kategorii.`
                    }
                    {' '}Wybierz, ktora wersje chcesz zachowac.
                </div>

                <div className="popup-stack popup-stack--sm conflict-list">
                    {conflicts.map((conflict) => (
                        <div key={conflict.category} className="conflict-list__item">
                            <div className="popup-strong">
                                {SYNC_CATEGORY_NAMES[conflict.category]}
                            </div>
                            <div className="popup-small conflict-list__times">
                                <div>
                                    <span className="popup-muted">Lokalna: </span>
                                    {formatDate(conflict.localTimestamp) || 'Brak'}
                                </div>
                                <div>
                                    <span className="popup-muted">Chmura: </span>
                                    {formatDate(conflict.cloudTimestamp)}
                                </div>
                            </div>
                            <ConflictDiffView conflict={conflict} />
                        </div>
                    ))}
                </div>

                <div className="popup-muted popup-small">
                    Uwaga: Wybrana wersja nadpisze druga dla wszystkich wymienionych kategorii. Ta operacja jest nieodwracalna.
                </div>
            </div>
        </SubDialog>
    );
}

export default ConflictResolutionModal;
