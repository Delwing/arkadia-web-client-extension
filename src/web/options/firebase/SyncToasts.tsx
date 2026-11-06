import { Notice } from "@web-ui/primitives/index.ts";

interface SyncToastsProps {
    status: string | null;
    error: string | null;
    onCloseStatus: () => void;
    onCloseError: () => void;
}

/** The sync tab's status and error messages, pinned to the top right. */
function SyncToasts({ status, error, onCloseStatus, onCloseError }: SyncToastsProps) {
    if (!status && !error) return null;
    return (
        <div style={{
            position: 'fixed',
            top: '1rem',
            right: '1rem',
            zIndex: 1050,
            maxWidth: '400px',
        }}>
            {status && (
                <Notice variant="success" onClose={onCloseStatus}>
                    {status}
                </Notice>
            )}
            {error && (
                <Notice variant="danger" onClose={onCloseError}>
                    {error}
                </Notice>
            )}
        </div>
    );
}

export default SyncToasts;
