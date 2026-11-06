/**
 * The sync tab's view of the v1 sync engine: its eventBus notifications, the
 * cloud document's metadata and the conflict dialog. Goes with the rest of
 * `firebase/v1/` when v1 is removed (`docs/dev/SYNC_V2_PLAN.md`, stage 5b).
 */
import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback, useEffect, useState } from "react";
import {
    type CategoryConflictInfo,
    type SyncCategory,
    FIREBASE_ERRORS,
    getAllCategoriesMetadata,
    syncEngine,
} from "@modules/firebase";
import eventBus from "@modules/core/eventBus";
import { type CloudMetadata, readCloudMetadataV1 } from "./syncV1Actions";

interface UseSyncV1Options {
    isAuthenticated: boolean;
    onImportComplete?: () => void;
    /** The tab's busy flag, shared with the manual send. */
    isSyncingRef: MutableRefObject<boolean>;
    setIsSyncing: Dispatch<SetStateAction<boolean>>;
    setSyncStatus: Dispatch<SetStateAction<string | null>>;
    setSyncError: Dispatch<SetStateAction<string | null>>;
}

export function useSyncV1({
    isAuthenticated,
    onImportComplete,
    isSyncingRef,
    setIsSyncing,
    setSyncStatus,
    setSyncError,
}: UseSyncV1Options) {
    const [cloudMetadata, setCloudMetadata] = useState<CloudMetadata>({});
    const [pendingAutoSync, setPendingAutoSync] = useState(() => syncEngine.hasPendingAutoSync());

    // Conflict state
    const [conflicts, setConflicts] = useState<CategoryConflictInfo[]>([]);
    const [showConflictModal, setShowConflictModal] = useState(false);

    // Subscribe to real-time sync listener events
    useEffect(() => {
        if (!isAuthenticated) return;

        // Conflicts detected while this tab was closed are held by the engine —
        // show them now. Registering also suppresses the global conflict toast
        // while the modal can be displayed here.
        syncEngine.setConflictUiActive(true);
        const pending = syncEngine.getPendingConflicts();
        if (pending.length > 0) {
            setConflicts(pending);
            setShowConflictModal(true);
        }

        // Seed from the listener's last snapshot: `firebase.sync.metadata` is
        // emitted only when a snapshot arrives, and the first one lands when
        // the listener starts — long before this tab is usually mounted.
        // Without this, the cloud markers and the "delete cloud data" section
        // stay hidden until the next sync, and vanish again on every remount
        // (tab switch, reopening the dialog).
        let cancelled = false;
        const cached = syncEngine.getLastMetadata();
        if (cached) {
            setCloudMetadata(cached);
        } else {
            // Listener has not produced a snapshot yet (or is not running) —
            // read the metadata once directly.
            getAllCategoriesMetadata()
                .then(result => {
                    if (cancelled || result.error) return;
                    setCloudMetadata(prev => (Object.keys(prev).length > 0 ? prev : result.categories));
                })
                .catch(err => console.error('Failed to read cloud metadata', err));
        }

        const unsubMeta = eventBus.on('firebase.sync.metadata', (metadata) => {
            setCloudMetadata(metadata);
        });

        const unsubApplied = eventBus.on('firebase.sync.applied', ({ categories }) => {
            onImportComplete?.();
            setSyncStatus(`Automatycznie zsynchronizowano: ${categories.length} kat.`);
        });

        const unsubUploaded = eventBus.on('firebase.sync.uploaded', ({ categories, encrypted, auto }) => {
            // Update metadata locally based on what was uploaded (avoids extra read)
            setCloudMetadata(prev => {
                const updated = { ...prev };
                categories.forEach(cat => {
                    updated[cat] = { exists: true, encrypted };
                });
                return updated;
            });
            if (!auto) {
                setSyncStatus('Synchronizacja zakończona sukcesem.');
            }
        });

        const unsubAutoPending = eventBus.on('firebase.autosync.pending', ({ pending }) => {
            setPendingAutoSync(pending);
        });

        const unsubConflict = eventBus.on('firebase.sync.conflict', ({ conflicts: newConflicts }) => {
            setConflicts(newConflicts);
            setShowConflictModal(true);
        });

        const unsubPending = eventBus.on('firebase.sync.pendingPassphrase', ({ categories }) => {
            if (categories.length > 0) {
                setSyncError('Dane w chmurze są zaszyfrowane. Podaj hasło szyfrowania, aby je zastosować.');
            }
        });

        const unsubError = eventBus.on('firebase.sync.error', ({ message }) => {
            setSyncError(message);
        });

        return () => {
            cancelled = true;
            syncEngine.setConflictUiActive(false);
            unsubMeta();
            unsubApplied();
            unsubUploaded();
            unsubAutoPending();
            unsubConflict();
            unsubPending();
            unsubError();
        };
    }, [isAuthenticated, onImportComplete, setSyncStatus, setSyncError]);

    const resolveConflicts = useCallback(async (resolution: 'keep-local' | 'use-cloud' | 'cancel', categories: SyncCategory[]) => {
        setShowConflictModal(false);

        if (resolution === 'cancel') {
            syncEngine.clearPendingConflicts(categories);
            setConflicts([]);
            return;
        }

        // The engine performs the resolution: merge-capable categories
        // (per-character maps, append-only data) are combined so neither
        // side's exclusive data is discarded; the rest is overwritten by the
        // chosen side. Import notifications come back via eventBus.
        isSyncingRef.current = true;
        setIsSyncing(true);
        try {
            const result = await syncEngine.resolveConflicts(resolution, categories);
            if (!result.success) {
                setSyncError(result.error ?? FIREBASE_ERRORS.SYNC_FAILED);
            } else {
                setSyncStatus(resolution === 'keep-local'
                    ? 'Dane lokalne zostały wysłane do chmury.'
                    : 'Dane zostały pobrane z chmury. Niektóre ustawienia mogą wymagać odświeżenia strony.');
                onImportComplete?.();

                // Refresh metadata
                const metadata = await readCloudMetadataV1();
                if (metadata) {
                    setCloudMetadata(metadata);
                }
            }
        } catch {
            setSyncError(FIREBASE_ERRORS.SYNC_FAILED);
        } finally {
            isSyncingRef.current = false;
            setIsSyncing(false);
        }

        setConflicts([]);
    }, [onImportComplete, isSyncingRef, setIsSyncing, setSyncStatus, setSyncError]);

    return {
        cloudMetadata,
        setCloudMetadata,
        pendingAutoSync,
        conflicts,
        showConflictModal,
        resolveConflicts,
    };
}
