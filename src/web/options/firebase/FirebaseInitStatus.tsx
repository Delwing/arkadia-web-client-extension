import { Button } from "@web-ui/primitives/index.ts";

/** Shown while Firebase initializes. */
export function FirebaseInitializing() {
    return (
        <div className="popup-inline popup-muted">
            <span className="popup-spinner" />
            <span>Inicjalizacja Firebase...</span>
        </div>
    );
}

interface FirebaseInitErrorProps {
    error: string | null;
    isInitializing: boolean;
    onRetry: () => void;
}

/** Shown when Firebase could not be initialized. */
export function FirebaseInitError({ error, isInitializing, onRetry }: FirebaseInitErrorProps) {
    return (
        <div className="popup-stack">
            <div className="popup-notice popup-notice--danger">
                <div className="popup-strong">Nie udało się zainicjalizować Firebase</div>
                {error && <div className="popup-small">{error}</div>}
            </div>
            <Button variant="solid" className="ui-settings-self-start" onClick={onRetry} disabled={isInitializing}>
                {isInitializing ? (
                    <span className="popup-inline">
                        <span className="popup-spinner" />
                        <span>Ponawiam...</span>
                    </span>
                ) : (
                    'Spróbuj ponownie'
                )}
            </Button>
        </div>
    );
}
