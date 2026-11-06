import { useCallback, useState } from "react";
import { syncEngine } from "@modules/firebase";
import { isSyncV2Enabled, startSyncV2 } from "@web/userData/syncV2";
import AccountBar from "./AccountBar";
import AuthForm from "./AuthForm";
import AutoSyncSection from "./AutoSyncSection";
import CloudDeleteSection from "./CloudDeleteSection";
import EncryptionSection from "./EncryptionSection";
import { FirebaseInitError, FirebaseInitializing } from "./FirebaseInitStatus";
import LocationHandoffSection from "./LocationHandoffSection";
import { SyncActivityLog } from "./SyncActivity";
import SyncButtons from "./SyncButtons";
import SyncToasts from "./SyncToasts";
import { useFirebaseAuth } from "./useFirebaseAuth";
import { useFirebaseInit } from "./useFirebaseInit";
import { useFirebaseSync } from "./useFirebaseSync";
import ConflictResolutionModal from "./v1/ConflictResolutionModal";

interface FirebaseTabProps {
    onImportComplete?: () => void;
    isVisible?: boolean;  // Whether the tab is currently visible (for lazy loading)
}

/** The cloud sync settings page: Firebase start-up, the account and sync. */
function FirebaseTab({ onImportComplete }: FirebaseTabProps) {
    const [syncV2] = useState(isSyncV2Enabled);
    const init = useFirebaseInit();

    // Ensure sync runs even when the startup wiring in clientBootstrap
    // did not (e.g. first session before a config was saved). Both
    // starts are idempotent; stopping is handled there on sign-out.
    const startSync = useCallback((userId: string) => {
        if (syncV2) startSyncV2(userId, () => syncEngine.getPassphrase());
        else syncEngine.start();
    }, [syncV2]);

    const auth = useFirebaseAuth(init.isConfigured, startSync);
    const { authState } = auth;
    const sync = useFirebaseSync({ isAuthenticated: authState.isAuthenticated, syncV2, onImportComplete });
    const { isSyncing, encryptionEnabled, passphrase } = sync;

    if (init.isInitializing) {
        return <FirebaseInitializing />;
    }

    if (!init.isConfigured || init.initError) {
        return <FirebaseInitError error={init.initError} isInitializing={init.isInitializing} onRetry={init.retry} />;
    }

    if (!authState.isAuthenticated) {
        return <AuthForm auth={auth} />;
    }

    return (
        <div className="firebase-sync">
            <SyncToasts
                status={sync.syncStatus}
                error={sync.syncError}
                onCloseStatus={() => sync.setSyncStatus(null)}
                onCloseError={() => sync.setSyncError(null)}
            />

            {/* Scrollable content container */}
            <div className="firebase-sync__scroll">
                <div>
                    <div className="popup-stack firebase-sync__content">
                        <AccountBar
                            authState={authState}
                            onSignOut={() => auth.handleSignOut(sync.resetAfterSignOut)}
                            disabled={auth.isAuthBusy || isSyncing}
                        />

                        <p className="popup-field__hint">
                            Synchronizowane są wszystkie Twoje dane: ustawienia, sterowanie, aliasy, triggery i skrypty,
                            dane postaci i mapy. Ustawienia interfejsu i przycisków są zapisywane osobno dla każdego urządzenia.
                        </p>

                        <EncryptionSection sync={sync} />
                        <AutoSyncSection sync={sync} syncV2={syncV2} />
                        <LocationHandoffSection />

                        {(syncV2 || Object.values(sync.cloudMetadata).some(m => m?.exists)) && (
                            <CloudDeleteSection onDelete={sync.deleteCloudData} isSyncing={isSyncing} />
                        )}
                    </div>
                </div>
            </div>

            <SyncButtons
                onSend={() => sync.sendToCloud()}
                onDownload={() => sync.downloadFromCloud()}
                isSyncing={isSyncing}
                disabled={isSyncing || (encryptionEnabled && !passphrase)}
            />

            <SyncActivityLog />

            <ConflictResolutionModal
                show={sync.showConflictModal}
                conflicts={sync.conflicts}
                onResolve={sync.resolveConflicts}
            />
        </div>
    );
}

export default FirebaseTab;
