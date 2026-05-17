import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Form, Spinner } from "react-bootstrap";
import { characterStorage, globalStorage } from "@modules/core/storage";
import {
    type FirebaseAuthState,
    type SyncOptions,
    type SyncCategory,
    type CategoryConflictInfo,
    type CategorySyncTimes,
    INITIAL_AUTH_STATE,
    SYNC_CATEGORIES,
    SYNC_CATEGORY_NAMES,
    FIREBASE_ERRORS,
    loadFirebaseConfig,
    saveFirebaseConfig,
    loadFirebaseSettings,
    saveFirebaseSettings,
} from "@modules/firebase";
import {
    initializeFirebase,
} from "@modules/firebase";
import {
    onAuthStateChanged,
    getCurrentAuthState,
    signInWithEmail,
    signInWithGoogle,
    registerWithEmail,
    signOut,
    sendPasswordReset,
} from "@modules/firebase";
import {
    uploadCategories,
    downloadCategories,
    checkCategoriesConflicts,
    getAllCategoriesMetadata,
    updateCategorySyncTime,
    deleteAllCategories,
    syncDebounceManager,
    syncListener,
} from "@modules/firebase";
import eventBus from "@modules/core/eventBus";
import {
    collectCharacters,
    exportCategories,
    importCategories,
    mergeCloudProfessionData,
} from "./exportUtils";
import ConflictResolutionModal from "./ConflictResolutionModal";

const GoogleLogo = ({ size = 18 }: { size?: number }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 48 48">
        <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
        <path fill="#FF3D00" d="m6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z" />
        <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
        <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
);

// Default Firebase config - will be used if not overridden
const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyCLzwBiOJQQ8KoKEeVn6XUksa1pvqtrQsw",
    authDomain: "dargoth-client.firebaseapp.com",
    projectId: "dargoth-client",
    storageBucket: "dargoth-client.firebasestorage.app",
    messagingSenderId: "297724157458",
    appId: "1:297724157458:web:02a8c5258caedbad4642cb",
    measurementId: "G-0WGG26XZB2"
};

interface FirebaseTabProps {
    onImportComplete?: () => void;
    isVisible?: boolean;  // Whether the tab is currently visible (for lazy loading)
}

function FirebaseTab({ onImportComplete }: FirebaseTabProps) {
    // Config state
    const [isConfigured, setIsConfigured] = useState(false);
    const [isInitializing, setIsInitializing] = useState(true);
    const [initError, setInitError] = useState<string | null>(null);

    // Auth state
    const [authState, setAuthState] = useState<FirebaseAuthState>(INITIAL_AUTH_STATE);
    const [authMode, setAuthMode] = useState<'login' | 'register' | 'reset'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isAuthBusy, setIsAuthBusy] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);
    const [resetSuccess, setResetSuccess] = useState<string | null>(null);

    // Sync state
    const [syncOptions, setSyncOptions] = useState<SyncOptions>(() => loadFirebaseSettings().syncOptions);
    const [encryptionEnabled, setEncryptionEnabled] = useState(() => loadFirebaseSettings().encryptionEnabled);
    const [autoSyncEnabled, setAutoSyncEnabled] = useState(() => loadFirebaseSettings().autoSyncEnabled);
    const [passphrase, setPassphrase] = useState('');
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState<string | null>(null);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [, setCategorySyncTimes] = useState<CategorySyncTimes>(() => loadFirebaseSettings().categorySyncTimes);
    const [cloudMetadata, setCloudMetadata] = useState<Partial<Record<SyncCategory, {
        exists: boolean;
        syncedAt?: string;
        deviceId?: string;
        encrypted?: boolean;
    }>>>({});
    const [pendingAutoSync, setPendingAutoSync] = useState(false);

    // Conflict state
    const [conflicts, setConflicts] = useState<CategoryConflictInfo[]>([]);
    const [showConflictModal, setShowConflictModal] = useState(false);

    // Delete state
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

    // Initialize Firebase on mount
    const initFirebase = useCallback(async () => {
        // Skip Firebase initialization in test environment
        if ((window as { __DISABLE_FIREBASE__?: boolean }).__DISABLE_FIREBASE__) {
            setIsInitializing(false);
            setInitError('Firebase disabled in test environment');
            return;
        }

        setIsInitializing(true);
        setInitError(null);
        try {
            // Try to load existing config or use default
            let config = loadFirebaseConfig();
            if (!config) {
                // Use default config
                config = DEFAULT_FIREBASE_CONFIG;
                saveFirebaseConfig(config);
            }

            await initializeFirebase(config);
            setIsConfigured(true);
        } catch (err) {
            console.error('Failed to initialize Firebase', err);
            setIsConfigured(false);
            setInitError(err instanceof Error ? err.message : 'Nieznany blad');
        } finally {
            setIsInitializing(false);
        }
    }, []);

    useEffect(() => {
        initFirebase();
    }, [initFirebase]);

    // Subscribe to auth state changes
    useEffect(() => {
        if (!isConfigured) return;

        // Get current auth state immediately
        getCurrentAuthState().then(state => {
            setAuthState(state);
        });

        // Subscribe to future changes
        const unsubscribe = onAuthStateChanged((state) => {
            setAuthState(state);
        });

        return () => unsubscribe();
    }, [isConfigured]);

    // Subscribe to real-time sync listener events
    useEffect(() => {
        if (!authState.isAuthenticated) return;

        const unsubMeta = eventBus.on('firebase.sync.metadata', (metadata) => {
            setCloudMetadata(metadata);
        });

        const unsubApplied = eventBus.on('firebase.sync.applied', ({ categories }) => {
            const now = Date.now();
            categories.forEach(cat => updateCategorySyncTime(cat, now));
            setCategorySyncTimes(prev => {
                const updated = { ...prev };
                categories.forEach(cat => { updated[cat] = now; });
                return updated;
            });
            onImportComplete?.();
            setSyncStatus(`Automatycznie zsynchronizowano: ${categories.length} kat.`);
        });

        const unsubConflict = eventBus.on('firebase.sync.conflict', ({ conflicts: newConflicts }) => {
            setConflicts(newConflicts);
            setShowConflictModal(true);
        });

        const unsubPending = eventBus.on('firebase.sync.pendingPassphrase', ({ categories }) => {
            if (categories.length > 0) {
                setSyncError('Dane w chmurze sa zaszyfrowane. Podaj haslo szyfrowania, aby je zastosowac.');
            }
        });

        const unsubError = eventBus.on('firebase.sync.error', ({ message }) => {
            setSyncError(message);
        });

        return () => {
            unsubMeta();
            unsubApplied();
            unsubConflict();
            unsubPending();
            unsubError();
        };
    }, [authState.isAuthenticated, onImportComplete]);

    // Sync passphrase to the listener service
    useEffect(() => {
        syncListener.setPassphrase(encryptionEnabled ? passphrase || null : null);
    }, [encryptionEnabled, passphrase]);

    // Save sync options when they change
    useEffect(() => {
        saveFirebaseSettings({ syncOptions, encryptionEnabled, autoSyncEnabled });
    }, [syncOptions, encryptionEnabled, autoSyncEnabled]);

    // Auto-sync on storage changes using SyncDebounceManager
    useEffect(() => {
        // Disable auto-sync on localhost to prevent excessive writes during testing
        const isLocalhost = typeof window !== 'undefined' &&
            (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

        if (!authState.isAuthenticated || !autoSyncEnabled || isLocalhost) {
            setPendingAutoSync(false);
            syncDebounceManager.cancelAll();
            return;
        }

        // Check if we can auto-sync (encryption needs passphrase)
        const canSync = !encryptionEnabled || (encryptionEnabled && passphrase);
        if (!canSync) {
            syncDebounceManager.cancelAll();
            return;
        }

        // Keys that should NOT trigger auto-sync (internal sync metadata)
        // This prevents sync loops when multiple windows are open
        const IGNORED_STORAGE_KEYS = ['arkadia.firebaseSettings', 'arkadia.firebaseConfig'];

        // Initialize debounce manager with sync callback
        syncDebounceManager.initialize({
            onSyncNeeded: () => {
                setPendingAutoSync(false);
                if (!isSyncingRef.current) {
                    performSync(true);
                }
            }
        });

        // Handler for local storage changes
        // Filter out firebase internal keys to prevent sync loops between tabs
        const handleStorageChange = (key: string) => {
            if (IGNORED_STORAGE_KEYS.includes(key)) {
                return;
            }
            const result = syncDebounceManager.handleStorageChange([key]);
            if (result.shouldSync) {
                setPendingAutoSync(true);
            }
        };

        const unsub1 = characterStorage.onAnyChange((key) => handleStorageChange(key));
        const unsub2 = globalStorage.onAnyChange((key) => handleStorageChange(key));

        return () => {
            unsub1();
            unsub2();
            syncDebounceManager.destroy();
            setPendingAutoSync(false);
        };
    }, [authState.isAuthenticated, autoSyncEnabled, encryptionEnabled, passphrase]);

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError(null);
        setIsAuthBusy(true);

        try {
            let result: FirebaseAuthState;
            if (authMode === 'register') {
                result = await registerWithEmail(email, password);
            } else {
                result = await signInWithEmail(email, password);
            }

            if (result.error) {
                setAuthError(result.error);
            } else {
                setEmail('');
                setPassword('');
            }
        } catch {
            setAuthError(FIREBASE_ERRORS.AUTH_FAILED);
        } finally {
            setIsAuthBusy(false);
        }
    };

    const handlePasswordReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError(null);
        setResetSuccess(null);
        setIsAuthBusy(true);

        try {
            const result = await sendPasswordReset(email);
            if (result.success) {
                setResetSuccess('Link do resetowania hasla zostal wyslany na podany adres email.');
                setEmail('');
            } else {
                setAuthError(result.error ?? FIREBASE_ERRORS.AUTH_FAILED);
            }
        } catch {
            setAuthError(FIREBASE_ERRORS.AUTH_FAILED);
        } finally {
            setIsAuthBusy(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setAuthError(null);
        setIsAuthBusy(true);

        try {
            const result = await signInWithGoogle();
            if (result.error) {
                setAuthError(result.error);
            }
        } catch {
            setAuthError(FIREBASE_ERRORS.AUTH_FAILED);
        } finally {
            setIsAuthBusy(false);
        }
    };

    const handleSignOut = async () => {
        setAuthError(null);
        setIsAuthBusy(true);

        try {
            await signOut();
            setPassphrase('');
            setSyncStatus(null);
            setSyncError(null);
            setCloudMetadata({});
        } catch (err) {
            console.error('Sign out failed', err);
        } finally {
            setIsAuthBusy(false);
        }
    };

    const performSync = useCallback(async (isAutoSync = false) => {
        if (isSyncingRef.current) return;
        if (!authState.isAuthenticated) return;
        if (encryptionEnabled && !passphrase) {
            if (!isAutoSync) {
                setSyncError('Podaj haslo szyfrowania.');
            }
            return;
        }

        isSyncingRef.current = true;
        setIsSyncing(true);
        setSyncError(null);
        if (!isAutoSync) {
            setSyncStatus(null);
        }

        try {
            // Get enabled categories
            const enabledCategories = SYNC_CATEGORIES.filter(cat => syncOptions[cat]);
            if (enabledCategories.length === 0) {
                setSyncError('Nie wybrano zadnych kategorii do synchronizacji.');
                return;
            }

            // Pre-merge CRDT data (profession) from cloud before exporting
            // This prevents overwriting cloud +staz events that were added on another device
            if (enabledCategories.includes('characterSettings')) {
                try {
                    const cloudResult = await downloadCategories(
                        ['characterSettings'],
                        encryptionEnabled ? passphrase : undefined
                    );
                    if (cloudResult.success && cloudResult.data.characterSettings) {
                        mergeCloudProfessionData(cloudResult.data.characterSettings);
                    }
                } catch {
                    // Non-critical: proceed with upload even if pre-merge fails
                }
            }

            // Export data for enabled categories
            const allCharacters = collectCharacters();
            const categoryData = await exportCategories(enabledCategories, allCharacters);

            // Check for conflicts
            const conflictResult = await checkCategoriesConflicts(
                categoryData
            );

            if (Object.keys(conflictResult.errors).length > 0) {
                const firstError = Object.values(conflictResult.errors)[0];
                setSyncError(firstError ?? FIREBASE_ERRORS.SYNC_FAILED);
                return;
            }

            if (conflictResult.conflicts.length > 0) {
                setConflicts(conflictResult.conflicts);
                setShowConflictModal(true);
                return;
            }

            // Upload categories to Firestore
            const uploadResult = await uploadCategories(categoryData, {
                encrypted: encryptionEnabled,
                passphrase: encryptionEnabled ? passphrase : undefined,
            });

            if (!uploadResult.success) {
                const firstError = Object.values(uploadResult.errors)[0];
                setSyncError(firstError ?? FIREBASE_ERRORS.SYNC_FAILED);
                return;
            }

            setCategorySyncTimes(prev => ({ ...prev, ...uploadResult.timestamps }));
            syncListener.notifyLocalUpload(uploadResult.checksums);
            if (!isAutoSync) {
                setSyncStatus('Synchronizacja zakonczona sukcesem.');
            }

            // Update metadata locally based on what we uploaded (avoids extra read)
            setCloudMetadata(prev => {
                const updated = { ...prev };
                enabledCategories.forEach(cat => {
                    updated[cat] = { exists: true, encrypted: encryptionEnabled };
                });
                return updated;
            });
        } catch (err) {
            console.error('Sync failed', err);
            setSyncError(FIREBASE_ERRORS.SYNC_FAILED);
        } finally {
            isSyncingRef.current = false;
            setIsSyncing(false);
        }
    }, [authState.isAuthenticated, encryptionEnabled, passphrase, syncOptions]);

    const handleDownload = useCallback(async (specificCategories?: SyncCategory[]) => {
        if (!authState.isAuthenticated) return;
        if (encryptionEnabled && !passphrase) {
            setSyncError('Podaj haslo szyfrowania.');
            return;
        }

        setIsSyncing(true);
        setSyncError(null);
        setSyncStatus(null);

        try {
            // Get categories to download
            const categoriesToDownload = specificCategories ?? SYNC_CATEGORIES.filter(cat => syncOptions[cat]);
            if (categoriesToDownload.length === 0) {
                setSyncError('Nie wybrano zadnych kategorii do pobrania.');
                return;
            }

            const result = await downloadCategories(
                categoriesToDownload,
                encryptionEnabled ? passphrase : undefined
            );

            if (!result.success) {
                const firstError = Object.values(result.errors)[0];
                setSyncError(firstError ?? FIREBASE_ERRORS.SYNC_FAILED);
                return;
            }

            if (Object.keys(result.data).length === 0) {
                setSyncStatus('Brak danych w chmurze dla wybranych kategorii.');
                return;
            }

            // Import downloaded categories
            // (downloadCategories already returns per-device data for device-scoped categories)
            const importResult = await importCategories(result.data);
            if (!importResult.success) {
                const firstError = Object.values(importResult.errors)[0];
                setSyncError(firstError ?? 'Import nie powiodl sie.');
                return;
            }

            // Update local sync times
            const now = Date.now();
            const newTimes: CategorySyncTimes = {};
            Object.keys(result.data).forEach(cat => {
                newTimes[cat as SyncCategory] = now;
                updateCategorySyncTime(cat as SyncCategory, now);
            });
            setCategorySyncTimes(prev => ({ ...prev, ...newTimes }));

            onImportComplete?.();
            setSyncStatus('Dane zostaly pobrane z chmury. Niektore ustawienia moga wymagac odswiezenia strony.');
        } catch (err) {
            console.error('Download failed', err);
            setSyncError(FIREBASE_ERRORS.SYNC_FAILED);
        } finally {
            setIsSyncing(false);
        }
    }, [authState.isAuthenticated, encryptionEnabled, passphrase, syncOptions, onImportComplete]);

    const handleConflictResolution = useCallback(async (resolution: 'keep-local' | 'use-cloud' | 'cancel', categories: SyncCategory[]) => {
        setShowConflictModal(false);

        if (resolution === 'cancel') {
            setConflicts([]);
            return;
        }

        if (resolution === 'use-cloud') {
            // Download the conflicted categories from cloud
            await handleDownload(categories);
        } else if (resolution === 'keep-local') {
            // Force upload local data for conflicted categories
            isSyncingRef.current = true;
            setIsSyncing(true);

            try {
                // Pre-merge CRDT data (profession) from cloud before overwriting
                if (categories.includes('characterSettings')) {
                    try {
                        const cloudResult = await downloadCategories(
                            ['characterSettings'],
                            encryptionEnabled ? passphrase : undefined
                        );
                        if (cloudResult.success && cloudResult.data.characterSettings) {
                            mergeCloudProfessionData(cloudResult.data.characterSettings);
                        }
                    } catch {
                        // Non-critical: proceed with upload even if pre-merge fails
                    }
                }

                const allCharacters = collectCharacters();
                const categoryData = await exportCategories(categories, allCharacters);

                const uploadResult = await uploadCategories(categoryData, {
                    encrypted: encryptionEnabled,
                    passphrase: encryptionEnabled ? passphrase : undefined,
                });

                if (!uploadResult.success) {
                    const firstError = Object.values(uploadResult.errors)[0];
                    setSyncError(firstError ?? FIREBASE_ERRORS.SYNC_FAILED);
                } else {
                    setCategorySyncTimes(prev => ({ ...prev, ...uploadResult.timestamps }));
                    setSyncStatus('Dane lokalne zostaly wyslane do chmury.');

                    // Refresh metadata
                    const metadata = await getAllCategoriesMetadata();
                    if (!metadata.error) {
                        setCloudMetadata(metadata.categories);
                    }
                }
            } catch {
                setSyncError(FIREBASE_ERRORS.SYNC_FAILED);
            } finally {
                isSyncingRef.current = false;
                setIsSyncing(false);
            }
        }

        setConflicts([]);
    }, [handleDownload, encryptionEnabled, passphrase]);

    const handleDeleteCloudData = useCallback(async () => {
        if (!authState.isAuthenticated) return;

        setIsDeleting(true);
        setSyncError(null);
        setSyncStatus(null);

        try {
            const result = await deleteAllCategories();

            if (!result.success) {
                const firstError = Object.values(result.errors)[0];
                setSyncError(firstError ?? FIREBASE_ERRORS.SYNC_FAILED);
                return;
            }

            setSyncStatus('Dane zostaly usuniete z chmury.');
            setCloudMetadata({});
        } catch (err) {
            console.error('Delete failed', err);
            setSyncError(FIREBASE_ERRORS.SYNC_FAILED);
        } finally {
            setIsDeleting(false);
            setShowDeleteConfirm(false);
        }
    }, [authState.isAuthenticated]);

    // Render loading state
    if (isInitializing) {
        return (
            <div className="d-flex align-items-center gap-2 text-muted">
                <Spinner animation="border" size="sm" />
                <span>Inicjalizacja Firebase...</span>
            </div>
        );
    }

    // Render error state
    if (!isConfigured || initError) {
        return (
            <div className="d-flex flex-column gap-3">
                <Alert variant="danger" className="mb-0">
                    <div className="fw-semibold">Nie udalo sie zainicjalizowac Firebase</div>
                    {initError && <div className="small mt-1">{initError}</div>}
                </Alert>
                <Button onClick={initFirebase} disabled={isInitializing}>
                    {isInitializing ? (
                        <span className="d-inline-flex align-items-center gap-2">
                            <Spinner animation="border" size="sm" />
                            <span>Ponawiam...</span>
                        </span>
                    ) : (
                        'Sprobuj ponownie'
                    )}
                </Button>
            </div>
        );
    }

    // Render auth section when not authenticated
    if (!authState.isAuthenticated) {
        return (
            <div className="d-flex flex-column gap-3">
                <p className="mb-0 text-muted">
                    Zaloguj sie, aby synchronizowac ustawienia miedzy urzadzeniami.
                </p>

                {authState.loading ? (
                    <div className="d-flex align-items-center gap-2 text-muted">
                        <Spinner animation="border" size="sm" />
                        <span>Sprawdzanie sesji...</span>
                    </div>
                ) : (
                    <>
                        <div className="d-flex gap-2 mb-2">
                            <Button
                                variant={authMode === 'login' ? 'primary' : 'outline-primary'}
                                size="sm"
                                onClick={() => { setAuthMode('login'); setAuthError(null); setResetSuccess(null); }}
                            >
                                Logowanie
                            </Button>
                            <Button
                                variant={authMode === 'register' ? 'primary' : 'outline-primary'}
                                size="sm"
                                onClick={() => { setAuthMode('register'); setAuthError(null); setResetSuccess(null); }}
                            >
                                Rejestracja
                            </Button>
                        </div>

                        {authMode === 'reset' ? (
                            <Form onSubmit={handlePasswordReset}>
                                <Form.Group className="mb-3">
                                    <Form.Label className="small">Email</Form.Label>
                                    <Form.Control
                                        type="email"
                                        size="sm"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        disabled={isAuthBusy}
                                        required
                                        autoComplete="username"
                                    />
                                    <Form.Text className="text-muted">
                                        Podaj adres email powiazany z kontem.
                                    </Form.Text>
                                </Form.Group>
                                <div className="d-flex flex-wrap gap-2 align-items-center">
                                    <Button type="submit" disabled={isAuthBusy}>
                                        {isAuthBusy ? (
                                            <span className="d-inline-flex align-items-center gap-2">
                                                <Spinner animation="border" size="sm" />
                                                <span>Wysylanie...</span>
                                            </span>
                                        ) : (
                                            'Wyslij link resetujacy'
                                        )}
                                    </Button>
                                    <Button
                                        variant="link"
                                        size="sm"
                                        onClick={() => { setAuthMode('login'); setAuthError(null); setResetSuccess(null); }}
                                    >
                                        Powrot do logowania
                                    </Button>
                                </div>
                            </Form>
                        ) : (
                            <Form onSubmit={handleEmailAuth}>
                                <Form.Group className="mb-2">
                                    <Form.Label className="small">Email</Form.Label>
                                    <Form.Control
                                        type="email"
                                        size="sm"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        disabled={isAuthBusy}
                                        required
                                        autoComplete="username"
                                    />
                                </Form.Group>
                                <Form.Group className="mb-2">
                                    <Form.Label className="small">Haslo</Form.Label>
                                    <Form.Control
                                        type="password"
                                        size="sm"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        disabled={isAuthBusy}
                                        required
                                        minLength={6}
                                        autoComplete="current-password"
                                    />
                                </Form.Group>
                                {authMode === 'login' && (
                                    <div className="mb-3">
                                        <Button
                                            variant="link"
                                            size="sm"
                                            className="p-0"
                                            onClick={() => { setAuthMode('reset'); setAuthError(null); }}
                                        >
                                            Nie pamietam hasla
                                        </Button>
                                    </div>
                                )}
                                <div className="d-flex flex-wrap gap-2">
                                    <Button type="submit" disabled={isAuthBusy}>
                                        {isAuthBusy ? (
                                            <span className="d-inline-flex align-items-center gap-2">
                                                <Spinner animation="border" size="sm" />
                                                <span>{authMode === 'login' ? 'Logowanie...' : 'Rejestracja...'}</span>
                                            </span>
                                        ) : (
                                            authMode === 'login' ? 'Zaloguj sie' : 'Zarejestruj sie'
                                        )}
                                    </Button>
                                    <button
                                        type="button"
                                        onClick={handleGoogleSignIn}
                                        disabled={isAuthBusy}
                                        className="d-inline-flex align-items-center gap-2"
                                        style={{
                                            backgroundColor: '#fff',
                                            color: '#3c4043',
                                            border: '1px solid #dadce0',
                                            borderRadius: '4px',
                                            padding: '8px 16px',
                                            fontSize: '14px',
                                            fontWeight: 500,
                                            cursor: isAuthBusy ? 'not-allowed' : 'pointer',
                                            opacity: isAuthBusy ? 0.7 : 1,
                                        }}
                                    >
                                        {isAuthBusy ? (
                                            <Spinner animation="border" size="sm" />
                                        ) : (
                                            <>
                                                <GoogleLogo size={18} />
                                                <span>Zaloguj przez Google</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </Form>
                        )}
                    </>
                )}

                {resetSuccess && (
                    <Alert variant="success" className="mb-0">
                        {resetSuccess}
                    </Alert>
                )}

                {authError && (
                    <Alert variant="danger" className="mb-0">
                        {authError}
                    </Alert>
                )}
            </div>
        );
    }

    // Render main sync UI when authenticated
    return (
        <div className="d-flex flex-column h-100" style={{ minHeight: 0 }}>
            {/* Toast messages */}
            {(syncStatus || syncError) && (
                <div style={{
                    position: 'fixed',
                    top: '1rem',
                    right: '1rem',
                    zIndex: 1050,
                    maxWidth: '400px',
                }}>
                    {syncStatus && (
                        <Alert
                            variant="success"
                            dismissible
                            onClose={() => setSyncStatus(null)}
                            className="mb-2 shadow-sm"
                        >
                            {syncStatus}
                        </Alert>
                    )}
                    {syncError && (
                        <Alert
                            variant="danger"
                            dismissible
                            onClose={() => setSyncError(null)}
                            className="mb-2 shadow-sm"
                        >
                            {syncError}
                        </Alert>
                    )}
                </div>
            )}

            {/* Scrollable content container */}
            <div className="flex-grow-1 overflow-hidden" style={{ minHeight: 0 }}>
                <div className="h-100 overflow-auto pe-1" style={{ minHeight: 0 }}>
                    <div className="d-flex flex-column gap-3 pb-2">
                    {/* User info */}
                    <div className="d-flex justify-content-between align-items-center">
                        <div>
                            <span className="text-muted small">Zalogowany jako: </span>
                            <span className="fw-semibold">{authState.email ?? authState.displayName ?? 'Nieznany'}</span>
                        </div>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleSignOut}
                            disabled={isAuthBusy || isSyncing}
                        >
                            Wyloguj
                        </Button>
                    </div>

                    {/* Sync options */}
                    <section className="character-settings-section">
                        <h5 className="character-settings-section-title">Dane do synchronizacji</h5>
                        <div className="row g-2">
                            <div className="col-6">
                                {(['uiSettings', 'binds', 'shortcuts', 'characterSettings', 'triggers', 'aliases', 'killCounts', 'improveCounts'] as SyncCategory[]).map(cat => (
                                    <div key={cat} className="d-flex align-items-center gap-1">
                                        <Form.Check
                                            type="checkbox"
                                            id={`sync-${cat}`}
                                            label={SYNC_CATEGORY_NAMES[cat]}
                                            checked={syncOptions[cat]}
                                            onChange={e => setSyncOptions(prev => ({ ...prev, [cat]: e.target.checked }))}
                                        />
                                        {cloudMetadata[cat]?.exists && (
                                            <span
                                                title={`W chmurze${cloudMetadata[cat]?.encrypted ? ' (zaszyfrowane)' : ''}${cloudMetadata[cat]?.syncedAt ? ` - ${new Date(cloudMetadata[cat]!.syncedAt!).toLocaleString()}` : ''}`}
                                                style={{ fontSize: '0.75rem', cursor: 'help' }}
                                            >
                                                {cloudMetadata[cat]?.encrypted ? '🔒' : '☁️'}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="col-6">
                                {(['multibinds', 'buttons', 'radial', 'visitedRooms', 'locationNotes', 'deposits', 'containers'] as SyncCategory[]).map(cat => (
                                    <div key={cat} className="d-flex align-items-center gap-1">
                                        <Form.Check
                                            type="checkbox"
                                            id={`sync-${cat}`}
                                            label={SYNC_CATEGORY_NAMES[cat]}
                                            checked={syncOptions[cat]}
                                            onChange={e => setSyncOptions(prev => ({ ...prev, [cat]: e.target.checked }))}
                                        />
                                        {cloudMetadata[cat]?.exists && (
                                            <span
                                                title={`W chmurze${cloudMetadata[cat]?.encrypted ? ' (zaszyfrowane)' : ''}${cloudMetadata[cat]?.syncedAt ? ` - ${new Date(cloudMetadata[cat]!.syncedAt!).toLocaleString()}` : ''}`}
                                                style={{ fontSize: '0.75rem', cursor: 'help' }}
                                            >
                                                {cloudMetadata[cat]?.encrypted ? '🔒' : '☁️'}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* Encryption */}
                    <section className="character-settings-section">
                        <Form.Check
                            type="switch"
                            id="encryption-toggle"
                            label="Szyfruj dane w chmurze"
                            checked={encryptionEnabled}
                            onChange={e => setEncryptionEnabled(e.target.checked)}
                        />
                        {/* Show warning when cloud has encrypted data but user wants to disable */}
                        {!encryptionEnabled && Object.values(cloudMetadata).some(m => m?.encrypted) && (
                            <div className="mt-2">
                                <Alert variant="warning" className="mb-2 py-2">
                                    <small>
                                        Niektore dane w chmurze sa zaszyfrowane. Podaj haslo aby pobrac i zapisac bez szyfrowania.
                                    </small>
                                </Alert>
                                <Form.Group className="mb-2">
                                    <Form.Label className="small">Aktualne haslo szyfrowania</Form.Label>
                                    <Form.Control
                                        type="password"
                                        size="sm"
                                        value={passphrase}
                                        onChange={e => setPassphrase(e.target.value)}
                                        placeholder="Wprowadz haslo do odszyfrowania..."
                                    />
                                </Form.Group>
                                <Button
                                    size="sm"
                                    variant="warning"
                                    disabled={!passphrase || isSyncing}
                                    onClick={async () => {
                                        setIsSyncing(true);
                                        setSyncError(null);
                                        setSyncStatus(null);
                                        try {
                                            // Get encrypted categories
                                            const encryptedCategories = SYNC_CATEGORIES.filter(cat => cloudMetadata[cat]?.encrypted);

                                            // Download and decrypt with current passphrase
                                            const result = await downloadCategories(encryptedCategories, passphrase);
                                            if (!result.success) {
                                                const firstError = Object.values(result.errors)[0];
                                                setSyncError(firstError ?? FIREBASE_ERRORS.DECRYPTION_FAILED);
                                                return;
                                            }
                                            if (Object.keys(result.data).length === 0) {
                                                setSyncError('Brak danych w chmurze.');
                                                return;
                                            }
                                            // Re-upload without encryption
                                            const uploadResult = await uploadCategories(result.data, {
                                                encrypted: false,
                                            });
                                            if (!uploadResult.success) {
                                                const firstError = Object.values(uploadResult.errors)[0];
                                                setSyncError(firstError ?? FIREBASE_ERRORS.SYNC_FAILED);
                                                return;
                                            }
                                            setPassphrase('');
                                            setCategorySyncTimes(prev => ({ ...prev, ...uploadResult.timestamps }));
                                            setSyncStatus('Szyfrowanie zostalo wylaczone. Dane zapisane bez szyfrowania.');
                                            // Refresh metadata
                                            const metadata = await getAllCategoriesMetadata();
                                            if (!metadata.error) {
                                                setCloudMetadata(metadata.categories);
                                            }
                                        } catch (err) {
                                            console.error('Failed to disable encryption', err);
                                            setSyncError(FIREBASE_ERRORS.SYNC_FAILED);
                                        } finally {
                                            setIsSyncing(false);
                                        }
                                    }}
                                >
                                    {isSyncing ? (
                                        <span className="d-inline-flex align-items-center gap-2">
                                            <Spinner animation="border" size="sm" />
                                            <span>Odszyfrowanie...</span>
                                        </span>
                                    ) : (
                                        'Wylacz szyfrowanie i zapisz'
                                    )}
                                </Button>
                            </div>
                        )}
                        {encryptionEnabled && (
                            <div className="mt-2">
                                <Form.Group className="mb-2">
                                    <Form.Label className="small">Haslo szyfrowania</Form.Label>
                                    <Form.Control
                                        type="password"
                                        size="sm"
                                        value={passphrase}
                                        onChange={e => setPassphrase(e.target.value)}
                                        placeholder="Wprowadz haslo..."
                                    />
                                </Form.Group>
                                <p className="text-muted small mb-0">
                                    Haslo nie jest zapisywane. Jesli je zapomnisz, dane w chmurze beda niedostepne.
                                </p>
                            </div>
                        )}
                    </section>

                    {/* Auto-sync */}
                    <section className="character-settings-section">
                        <div className="d-flex justify-content-between align-items-center">
                            <Form.Check
                                type="switch"
                                id="auto-sync-toggle"
                                label="Automatyczna synchronizacja"
                                checked={autoSyncEnabled}
                                onChange={e => setAutoSyncEnabled(e.target.checked)}
                            />
                            {autoSyncEnabled && (
                                <span className={`badge ${pendingAutoSync ? 'bg-warning' : 'bg-success'}`} style={{ fontSize: '0.7rem' }}>
                                    {pendingAutoSync ? 'Oczekiwanie...' : 'Aktywna'}
                                </span>
                            )}
                        </div>
                        <p className="text-muted small mb-0 mt-1">
                            Automatycznie wysyla zmiany do chmury po 5 sekundach od ostatniej zmiany.
                            {encryptionEnabled && !passphrase && autoSyncEnabled && (
                                <span className="text-warning d-block mt-1">
                                    Podaj haslo szyfrowania aby wlaczyc auto-sync.
                                </span>
                            )}
                        </p>
                    </section>

                    {/* Delete cloud data */}
                    {Object.values(cloudMetadata).some(m => m?.exists) && (
                        <section className="character-settings-section">
                            <h5 className="character-settings-section-title text-danger">Usuwanie danych z chmury</h5>
                            {!showDeleteConfirm ? (
                                <Button
                                    variant="outline-danger"
                                    size="sm"
                                    onClick={() => setShowDeleteConfirm(true)}
                                    disabled={isSyncing || isDeleting}
                                >
                                    Usun wszystkie dane z chmury
                                </Button>
                            ) : (
                                <div>
                                    <p className="text-danger small mb-2">
                                        Czy na pewno chcesz usunac wszystkie dane z chmury? Tej operacji nie mozna cofnac.
                                    </p>
                                    <div className="d-flex gap-2">
                                        <Button
                                            variant="danger"
                                            size="sm"
                                            onClick={handleDeleteCloudData}
                                            disabled={isDeleting}
                                        >
                                            {isDeleting ? (
                                                <span className="d-inline-flex align-items-center gap-2">
                                                    <Spinner animation="border" size="sm" />
                                                    <span>Usuwanie...</span>
                                                </span>
                                            ) : (
                                                'Tak, usun'
                                            )}
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => setShowDeleteConfirm(false)}
                                            disabled={isDeleting}
                                        >
                                            Anuluj
                                        </Button>
                                    </div>
                                </div>
                            )}
                            <p className="text-muted small mb-0 mt-2">
                                Usuwa wszystkie zsynchronizowane dane z chmury (niezaleznie od szyfrowania). Dane lokalne pozostana nienaruszone.
                            </p>
                        </section>
                    )}
                    </div>
                </div>
            </div>

            {/* Bottom action buttons */}
            <div className="d-flex flex-wrap gap-2 pt-2 border-top flex-shrink-0">
                <Button
                    onClick={() => performSync(false)}
                    disabled={isSyncing || (encryptionEnabled && !passphrase)}
                >
                    {isSyncing ? (
                        <span className="d-inline-flex align-items-center gap-2">
                            <Spinner animation="border" size="sm" />
                            <span>Synchronizacja...</span>
                        </span>
                    ) : (
                        'Wyslij do chmury'
                    )}
                </Button>
                <Button
                    variant="secondary"
                    onClick={() => handleDownload()}
                    disabled={isSyncing || (encryptionEnabled && !passphrase)}
                >
                    {isSyncing ? (
                        <span className="d-inline-flex align-items-center gap-2">
                            <Spinner animation="border" size="sm" />
                            <span>Pobieranie...</span>
                        </span>
                    ) : (
                        'Pobierz z chmury'
                    )}
                </Button>
            </div>

            {/* Conflict resolution modal */}
            <ConflictResolutionModal
                show={showConflictModal}
                conflicts={conflicts}
                onResolve={handleConflictResolution}
            />
        </div>
    );
}

export default FirebaseTab;
