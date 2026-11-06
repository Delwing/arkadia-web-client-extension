import { Check, Input } from "@web-ui/primitives/index.ts";
import DisableEncryptionV1 from "./v1/DisableEncryptionV1";
import type { FirebaseSync } from "./useFirebaseSync";

/** The encryption switch and the passphrase. */
function EncryptionSection({ sync }: { sync: FirebaseSync }) {
    const { encryptionEnabled, setEncryptionEnabled, passphrase, setPassphrase, cloudMetadata } = sync;
    return (
        <section className="character-settings-section">
            <Check
                id="encryption-toggle"
                label="Szyfruj dane w chmurze"
                checked={encryptionEnabled}
                onChange={e => setEncryptionEnabled(e.target.checked)}
            />
            {/* Show warning when cloud has encrypted data but user wants to disable */}
            {!encryptionEnabled && Object.values(cloudMetadata).some(m => m?.encrypted) && (
                <DisableEncryptionV1
                    passphrase={passphrase}
                    onPassphraseChange={setPassphrase}
                    isSyncing={sync.isSyncing}
                    onDisable={sync.disableEncryption}
                />
            )}
            {encryptionEnabled && (
                <div className="popup-stack">
                    <div className="popup-field">
                        <label className="popup-field__label">Hasło szyfrowania</label>
                        <Input
                            type="password"
                            value={passphrase}
                            onChange={e => setPassphrase(e.target.value)}
                            placeholder="Wprowadź hasło..."
                        />
                    </div>
                    <div className="popup-muted popup-small">
                        Hasło jest pamiętane tylko do zamknięcia karty przeglądarki i nigdy nie trafia
                        na serwer. Jeśli je zapomnisz, dane w chmurze będą niedostępne.
                    </div>
                </div>
            )}
        </section>
    );
}

export default EncryptionSection;
