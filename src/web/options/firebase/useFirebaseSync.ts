import { useCallback, useEffect, useRef, useState } from "react";
import {
    type SyncCategory,
    FIREBASE_ERRORS,
    loadFirebaseSettings,
    saveFirebaseSettings,
    syncEngine,
} from "@modules/firebase";
import { nudgeSyncV2 } from "@web/userData/syncV2";
import type { SyncOutcome } from "./syncOutcome";
import { redownloadV2, resetCloudV2, sendChangesV2 } from "./syncV2Actions";
import {
    deleteCloudDataV1,
    disableEncryptionV1,
    downloadV1,
    readCloudMetadataV1,
    sendChangesV1,
} from "./v1/syncV1Actions";
import { useSyncV1 } from "./v1/useSyncV1";

interface UseFirebaseSyncOptions {
    isAuthenticated: boolean;
    /** Sync v2 is on for this device; otherwise the v1 engine syncs. */
    syncV2: boolean;
    onImportComplete?: () => void;
}

/**
 * The signed-in part of the sync tab: sync settings, the encryption
 * passphrase, the status / error toasts and the manual actions. The actions
 * go to sync v2 or to the v1 engine (`./v1`) depending on `syncV2`.
 */
export function useFirebaseSync({ isAuthenticated, syncV2, onImportComplete }: UseFirebaseSyncOptions) {
    const [encryptionEnabled, setEncryptionEnabled] = useState(() => loadFirebaseSettings().encryptionEnabled);
    const [autoSyncEnabled, setAutoSyncEnabled] = useState(() => loadFirebaseSettings().autoSyncEnabled);
    const [passphrase, setPassphrase] = useState(() => syncEngine.getPassphrase() ?? '');
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState<string | null>(null);
    const [syncError, setSyncError] = useState<string | null>(null);

    // Auto-sync
    const isSyncingRef = useRef(false);

    // Auto-dismiss status/error messages
    useEffect(() => {
        if (syncStatus) {
            const timer = setTimeout(() => setSyncStatus(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [syncStatus]);

    useEffect(() => {
        if (syncError) {
            const timer = setTimeout(() => setSyncError(null), 8000);
            return () => clearTimeout(timer);
        }
    }, [syncError]);

    const v1 = useSyncV1({ isAuthenticated, onImportComplete, isSyncingRef, setIsSyncing, setSyncStatus, setSyncError });
    const { cloudMetadata, setCloudMetadata } = v1;

    // Forward the passphrase to the sync engine (which feeds the realtime listener)
    useEffect(() => {
        syncEngine.setPassphrase(passphrase || null);
        // A passphrase entered may be what sync v2 was waiting for.
        if (syncV2 && passphrase) nudgeSyncV2();
    }, [passphrase, syncV2]);

    // Save sync settings when they change and let the engine re-evaluate them.
    // The engine itself watches storage and uploads — see @modules/firebase/syncEngine.
    useEffect(() => {
        saveFirebaseSettings({ encryptionEnabled, autoSyncEnabled });
        syncEngine.settingsChanged();
        // Auto-sync switched on (start v2 now) or off (stop it), or encryption changed.
        if (syncV2) nudgeSyncV2();
    }, [encryptionEnabled, autoSyncEnabled, syncV2]);

    const report = useCallback((outcome: SyncOutcome) => {
        if (outcome.error) setSyncError(outcome.error);
        else if (outcome.status) setSyncStatus(outcome.status);
    }, []);

    // Manual "send to cloud". Success, conflicts and errors of the v1 engine
    // come back through its eventBus notifications (`useSyncV1`).
    const sendToCloud = useCallback(async () => {
        if (isSyncingRef.current) return;
        if (!isAuthenticated) return;

        isSyncingRef.current = true;
        setIsSyncing(true);
        setSyncError(null);
        setSyncStatus(null);

        try {
            report(syncV2 ? await sendChangesV2() : await sendChangesV1());
        } finally {
            isSyncingRef.current = false;
            setIsSyncing(false);
        }
    }, [isAuthenticated, syncV2, report]);

    const downloadFromCloud = useCallback(async (specificCategories?: SyncCategory[]) => {
        if (!isAuthenticated) return;
        if (encryptionEnabled && !passphrase) {
            setSyncError('Podaj hasło szyfrowania.');
            return;
        }

        setIsSyncing(true);
        setSyncError(null);
        setSyncStatus(null);

        try {
            if (syncV2) {
                report(await redownloadV2());
                return;
            }
            const outcome = await downloadV1(specificCategories, encryptionEnabled ? passphrase : undefined);
            if (outcome.imported) onImportComplete?.();
            report(outcome);
        } catch (err) {
            console.error('Download failed', err);
            setSyncError(FIREBASE_ERRORS.SYNC_FAILED);
        } finally {
            setIsSyncing(false);
        }
    }, [isAuthenticated, encryptionEnabled, passphrase, onImportComplete, syncV2, report]);

    /** Deletes all the account's data from the cloud; the caller shows its own busy state. */
    const deleteCloudData = useCallback(async () => {
        if (!isAuthenticated) return;

        setSyncError(null);
        setSyncStatus(null);

        try {
            if (syncV2) {
                report(await resetCloudV2());
                return;
            }
            const outcome = await deleteCloudDataV1();
            report(outcome);
            if (outcome.cleared) setCloudMetadata({});
        } catch (err) {
            console.error('Delete failed', err);
            setSyncError(FIREBASE_ERRORS.SYNC_FAILED);
        }
    }, [isAuthenticated, syncV2, report, setCloudMetadata]);

    // v1 only: rewrites the cloud's encrypted categories unencrypted.
    const disableEncryption = useCallback(async () => {
        setIsSyncing(true);
        setSyncError(null);
        setSyncStatus(null);
        try {
            const outcome = await disableEncryptionV1(cloudMetadata, passphrase);
            if (outcome.error) {
                setSyncError(outcome.error);
                return;
            }
            setPassphrase('');
            setSyncStatus(outcome.status ?? null);
            // Refresh metadata
            const metadata = await readCloudMetadataV1();
            if (metadata) {
                setCloudMetadata(metadata);
            }
        } catch (err) {
            console.error('Failed to disable encryption', err);
            setSyncError(FIREBASE_ERRORS.SYNC_FAILED);
        } finally {
            setIsSyncing(false);
        }
    }, [cloudMetadata, passphrase, setCloudMetadata]);

    /** Clears what belonged to the signed-out account. */
    const resetAfterSignOut = useCallback(() => {
        // Stop the engine here too — covers setups where the startup wiring
        // in web/main.ts did not run (e.g. first session, localhost).
        syncEngine.stop();
        setPassphrase('');
        setSyncStatus(null);
        setSyncError(null);
        setCloudMetadata({});
    }, [setCloudMetadata]);

    return {
        encryptionEnabled,
        setEncryptionEnabled,
        autoSyncEnabled,
        setAutoSyncEnabled,
        passphrase,
        setPassphrase,
        isSyncing,
        syncStatus,
        setSyncStatus,
        syncError,
        setSyncError,
        cloudMetadata,
        pendingAutoSync: v1.pendingAutoSync,
        conflicts: v1.conflicts,
        showConflictModal: v1.showConflictModal,
        resolveConflicts: v1.resolveConflicts,
        sendToCloud,
        downloadFromCloud,
        deleteCloudData,
        disableEncryption,
        resetAfterSignOut,
    };
}

export type FirebaseSync = ReturnType<typeof useFirebaseSync>;
