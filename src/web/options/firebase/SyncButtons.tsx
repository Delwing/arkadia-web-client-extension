import { Button } from "@web-ui/primitives/index.ts";

interface SyncButtonsProps {
    onSend: () => void;
    onDownload: () => void;
    isSyncing: boolean;
    disabled: boolean;
}

/** "Send to cloud" and "download from cloud". */
function SyncButtons({ onSend, onDownload, isSyncing, disabled }: SyncButtonsProps) {
    return (
        <div className="popup-row firebase-sync__actions">
            <Button variant="solid"
                onClick={onSend}
                disabled={disabled}
            >
                {isSyncing ? (
                    <span className="popup-inline">
                        <span className="popup-spinner" />
                        <span>Synchronizacja...</span>
                    </span>
                ) : (
                    'Wyślij do chmury'
                )}
            </Button>
            <Button
                onClick={onDownload}
                disabled={disabled}
            >
                {isSyncing ? (
                    <span className="popup-inline">
                        <span className="popup-spinner" />
                        <span>Pobieranie...</span>
                    </span>
                ) : (
                    'Pobierz z chmury'
                )}
            </Button>
        </div>
    );
}

export default SyncButtons;
