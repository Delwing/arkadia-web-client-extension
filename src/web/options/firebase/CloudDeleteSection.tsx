import { useState } from "react";
import { Button } from "@web-ui/primitives/index.ts";

interface CloudDeleteSectionProps {
    onDelete: () => Promise<void>;
    isSyncing: boolean;
}

/** Deleting all the account's data from the cloud, behind a confirmation. */
function CloudDeleteSection({ onDelete, isSyncing }: CloudDeleteSectionProps) {
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await onDelete();
        } finally {
            setIsDeleting(false);
            setShowDeleteConfirm(false);
        }
    };

    return (
        <section className="character-settings-section cloud-delete">
            <div className="cloud-delete__row">
                <div className="cloud-delete__text">
                    <h5 className="character-settings-section-title">Usuwanie danych z chmury</h5>
                    <div className="popup-muted popup-small">
                        Usuwa wszystkie zsynchronizowane dane z chmury (niezależnie od szyfrowania).
                        Dane lokalne pozostaną nienaruszone.
                    </div>
                </div>
                {!showDeleteConfirm && (
                    <Button
                        size="sm"
                        className="popup-btn--danger cloud-delete__action"
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={isSyncing || isDeleting}
                    >
                        Usuń dane z chmury
                    </Button>
                )}
            </div>
            {showDeleteConfirm && (
                <div className="cloud-delete__confirm">
                    <span className="popup-small">
                        Na pewno usunąć wszystkie dane z chmury? Tej operacji nie można cofnąć.
                    </span>
                    <div className="popup-inline">
                        <Button
                            size="sm"
                            onClick={() => setShowDeleteConfirm(false)}
                            disabled={isDeleting}
                        >
                            Anuluj
                        </Button>
                        <Button
                            size="sm"
                            className="cloud-delete__confirm-button"
                            onClick={handleDelete}
                            disabled={isDeleting}
                        >
                            {isDeleting ? (
                                <span className="popup-inline">
                                    <span className="popup-spinner" />
                                    <span>Usuwanie...</span>
                                </span>
                            ) : (
                                'Tak, usuń'
                            )}
                        </Button>
                    </div>
                </div>
            )}
        </section>
    );
}

export default CloudDeleteSection;
