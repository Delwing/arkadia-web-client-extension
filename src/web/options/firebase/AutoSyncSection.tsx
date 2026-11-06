import { Check } from "@web-ui/primitives/index.ts";
import { SyncTimers } from "./SyncActivity";
import type { FirebaseSync } from "./useFirebaseSync";

/** The auto-sync switch, its state and its timers. */
function AutoSyncSection({ sync, syncV2 }: { sync: FirebaseSync; syncV2: boolean }) {
    const { autoSyncEnabled, setAutoSyncEnabled, pendingAutoSync, encryptionEnabled, passphrase } = sync;
    return (
        <section className="character-settings-section">
            <div className="firebase-sync__bar">
                <Check
                    id="auto-sync-toggle"
                    label="Automatyczna synchronizacja"
                    checked={autoSyncEnabled}
                    onChange={e => setAutoSyncEnabled(e.target.checked)}
                />
                {autoSyncEnabled && (
                    <span className={`popup-chip ${pendingAutoSync ? 'popup-chip--warning' : 'popup-chip--success'}`}>
                        {pendingAutoSync ? 'Oczekiwanie...' : 'Aktywna'}
                    </span>
                )}
            </div>
            <div className="popup-muted popup-small">
                {syncV2 ? (
                    <>
                        Wysyła zmiany do chmury co 5 minut (co 15 sekund, gdy inne Twoje urządzenie
                        jest aktywne) oraz od razu po ukryciu lub zamknięciu karty.
                    </>
                ) : (
                    <>
                        Automatycznie wysyła zmiany do chmury po 30 sekundach od ostatniej zmiany
                        (rzadziej dla danych zmieniających się często, np. licznika zabitych).
                    </>
                )}
                {' '}Działa w tle także po zamknięciu tego okna.
                {encryptionEnabled && !passphrase && autoSyncEnabled && (
                    <div className="popup-text-warning">
                        Podaj hasło szyfrowania aby włączyć auto-sync.
                    </div>
                )}
            </div>
            {autoSyncEnabled && <SyncTimers syncV2={syncV2} />}
        </section>
    );
}

export default AutoSyncSection;
