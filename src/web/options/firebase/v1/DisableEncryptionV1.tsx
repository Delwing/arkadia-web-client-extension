import { Button, Input } from "@web-ui/primitives/index.ts";

interface DisableEncryptionV1Props {
    passphrase: string;
    onPassphraseChange: (passphrase: string) => void;
    isSyncing: boolean;
    onDisable: () => void;
}

/**
 * Encryption switched off while the v1 cloud document still holds encrypted
 * categories: decrypt them with the passphrase and store them unencrypted.
 * Goes with the rest of `firebase/v1/` when v1 is removed.
 */
function DisableEncryptionV1({ passphrase, onPassphraseChange, isSyncing, onDisable }: DisableEncryptionV1Props) {
    return (
        <div className="popup-stack">
            <div className="popup-notice popup-notice--warning">
                <small>
                    Niektóre dane w chmurze są zaszyfrowane. Podaj hasło aby pobrać i zapisać bez szyfrowania.
                </small>
            </div>
            <div className="popup-field">
                <label className="popup-field__label">Aktualne hasło szyfrowania</label>
                <Input
                    type="password"
                    value={passphrase}
                    onChange={e => onPassphraseChange(e.target.value)}
                    placeholder="Wprowadź hasło do odszyfrowania..."
                />
            </div>
            <Button variant="solid"
                size="sm"
                disabled={!passphrase || isSyncing}
                onClick={onDisable}
            >
                {isSyncing ? (
                    <span className="popup-inline">
                        <span className="popup-spinner" />
                        <span>Odszyfrowanie...</span>
                    </span>
                ) : (
                    'Wyłącz szyfrowanie i zapisz'
                )}
            </Button>
        </div>
    );
}

export default DisableEncryptionV1;
