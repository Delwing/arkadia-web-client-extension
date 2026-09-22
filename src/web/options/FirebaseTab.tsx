import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Check, Input, Notice } from "@web-ui/primitives/index.ts";
import {
    type FirebaseAuthState,
    type SyncOptions,
    type SyncCategory,
    type CategoryConflictInfo,
    INITIAL_AUTH_STATE,
    SYNC_CATEGORIES,
    SYNC_CATEGORY_NAMES,
    CATEGORY_GROUPS,
    getCategoriesByGroup,
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
    getAllCategoriesMetadata,
    recordCategorySyncState,
    deleteAllCategories,
    syncEngine,
} from "@modules/firebase";
import eventBus from "@modules/core/eventBus";
import { importCategories } from "./exportUtils";
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
    const [passphrase, setPassphrase] = useState(() => syncEngine.getPassphrase() ?? '');
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState<string | null>(null);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [cloudMetadata, setCloudMetadata] = useState<Partial<Record<SyncCategory, {
        exists: boolean;
        syncedAt?: string;
        deviceId?: string;
        encrypted?: boolean;
    }>>>({});
    const [pendingAutoSync, setPendingAutoSync] = useState(() => syncEngine.hasPendingAutoSync());

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
            // Ensure the headless engine runs even when the startup wiring in
            // web/main.ts did not (e.g. first session before a config was saved).
            // start() is idempotent; stopping is handled by main.ts / sign-out.
            if (state.isAuthenticated) {
                syncEngine.start();
            }
        });

        return () => unsubscribe();
    }, [isConfigured]);

    // Subscribe to real-time sync listener events
    useEffect(() => {
        if (!authState.isAuthenticated) return;

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
                setSyncStatus('Synchronizacja zakonczona sukcesem.');
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
                setSyncError('Dane w chmurze sa zaszyfrowane. Podaj haslo szyfrowania, aby je zastosowac.');
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
    }, [authState.isAuthenticated, onImportComplete]);

    // Forward the passphrase to the sync engine (which feeds the realtime listener)
    useEffect(() => {
        syncEngine.setPassphrase(passphrase || null);
    }, [passphrase]);

    // Save sync options when they change and let the engine re-evaluate them.
    // The engine itself watches storage and uploads — see @modules/firebase/syncEngine.
    useEffect(() => {
        saveFirebaseSettings({ syncOptions, encryptionEnabled, autoSyncEnabled });
        syncEngine.settingsChanged();
    }, [syncOptions, encryptionEnabled, autoSyncEnabled]);

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
            // Stop the engine here too — covers setups where the startup wiring
            // in web/main.ts did not run (e.g. first session, localhost).
            syncEngine.stop();
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

    // Manual "send to cloud". The engine performs the actual work; success,
    // conflicts and errors come back through eventBus subscriptions above.
    const performSync = useCallback(async () => {
        if (isSyncingRef.current) return;
        if (!authState.isAuthenticated) return;

        isSyncingRef.current = true;
        setIsSyncing(true);
        setSyncError(null);
        setSyncStatus(null);

        try {
            const result = await syncEngine.syncNow(false);
            if (result.status === 'skipped') {
                if (result.reason === 'needs-passphrase') {
                    setSyncError('Podaj haslo szyfrowania.');
                } else if (result.reason === 'no-categories') {
                    setSyncError('Nie wybrano zadnych kategorii do synchronizacji.');
                } else if (result.reason === 'no-data') {
                    setSyncStatus('Brak danych do wyslania.');
                }
            } else if (result.status === 'in-sync') {
                setSyncStatus('Wszystkie dane sa aktualne.');
            }
        } finally {
            isSyncingRef.current = false;
            setIsSyncing(false);
        }
    }, [authState.isAuthenticated]);

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

            // The downloaded cloud state is the new sync base for these categories
            const baseChecksums: Partial<Record<SyncCategory, string>> = {};
            Object.keys(result.data).forEach(cat => {
                const payload = result.payloads[cat as SyncCategory];
                if (payload) baseChecksums[cat as SyncCategory] = payload.checksum;
            });
            recordCategorySyncState(baseChecksums);

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
                    ? 'Dane lokalne zostaly wyslane do chmury.'
                    : 'Dane zostaly pobrane z chmury. Niektore ustawienia moga wymagac odswiezenia strony.');
                onImportComplete?.();

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

        setConflicts([]);
    }, [onImportComplete]);

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
            <div className="popup-inline popup-muted">
                <span className="popup-spinner" />
                <span>Inicjalizacja Firebase...</span>
            </div>
        );
    }

    // Render error state
    if (!isConfigured || initError) {
        return (
            <div className="popup-stack">
                <div className="popup-notice popup-notice--danger">
                    <div className="popup-strong">Nie udalo sie zainicjalizowac Firebase</div>
                    {initError && <div className="popup-small">{initError}</div>}
                </div>
                <Button variant="solid" className="ui-settings-self-start" onClick={initFirebase} disabled={isInitializing}>
                    {isInitializing ? (
                        <span className="popup-inline">
                            <span className="popup-spinner" />
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
            <div className="popup-stack">
                <p className="popup-muted firebase-sync__lead">
                    Zaloguj sie, aby synchronizowac ustawienia miedzy urzadzeniami.
                </p>

                {authState.loading ? (
                    <div className="popup-inline popup-muted">
                        <span className="popup-spinner" />
                        <span>Sprawdzanie sesji...</span>
                    </div>
                ) : (
                    <>
                        <div className="dialog-tabs">
                            <button
                                type="button"
                                className={`dialog-tab${authMode === 'login' ? ' is-active' : ''}`}
                                onClick={() => { setAuthMode('login'); setAuthError(null); setResetSuccess(null); }}
                            >
                                Logowanie
                            </button>
                            <button
                                type="button"
                                className={`dialog-tab${authMode === 'register' ? ' is-active' : ''}`}
                                onClick={() => { setAuthMode('register'); setAuthError(null); setResetSuccess(null); }}
                            >
                                Rejestracja
                            </button>
                        </div>

                        {authMode === 'reset' ? (
                            <form className="popup-stack firebase-auth-form" onSubmit={handlePasswordReset}>
                                <div className="popup-field">
                                    <label className="popup-field__label">Email</label>
                                    <Input
                                        type="email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        disabled={isAuthBusy}
                                        required
                                        autoComplete="username"
                                    />
                                    <span className="popup-field__hint">
                                        Podaj adres email powiazany z kontem.
                                    </span>
                                </div>
                                <div className="popup-row">
                                    <Button variant="solid" type="submit" disabled={isAuthBusy}>
                                        {isAuthBusy ? (
                                            <span className="popup-inline">
                                                <span className="popup-spinner" />
                                                <span>Wysylanie...</span>
                                            </span>
                                        ) : (
                                            'Wyslij link resetujacy'
                                        )}
                                    </Button>
                                    <Button variant="ghost"
                                        size="sm"
                                        onClick={() => { setAuthMode('login'); setAuthError(null); setResetSuccess(null); }}
                                    >
                                        Powrot do logowania
                                    </Button>
                                </div>
                            </form>
                        ) : (
                            <form className="popup-stack firebase-auth-form" onSubmit={handleEmailAuth}>
                                <div className="popup-field">
                                    <label className="popup-field__label">Email</label>
                                    <Input
                                        type="email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        disabled={isAuthBusy}
                                        required
                                        autoComplete="username"
                                    />
                                </div>
                                <div className="popup-field">
                                    <label className="popup-field__label">Haslo</label>
                                    <Input
                                        type="password"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        disabled={isAuthBusy}
                                        required
                                        minLength={6}
                                        autoComplete="current-password"
                                    />
                                </div>
                                {authMode === 'login' && (
                                    <button type="button" className="popup-link ui-settings-self-start" onClick={() => { setAuthMode('reset'); setAuthError(null); }}>
                                        Nie pamietam hasla
                                    </button>
                                )}
                                <div className="popup-row">
                                    <Button variant="solid" type="submit" disabled={isAuthBusy}>
                                        {isAuthBusy ? (
                                            <span className="popup-inline">
                                                <span className="popup-spinner" />
                                                <span>{authMode === 'login' ? 'Logowanie...' : 'Rejestracja...'}</span>
                                            </span>
                                        ) : (
                                            authMode === 'login' ? 'Zaloguj sie' : 'Zarejestruj sie'
                                        )}
                                    </Button>
                                    <Button onClick={handleGoogleSignIn} disabled={isAuthBusy}>
                                        {isAuthBusy ? (
                                            <span className="popup-spinner" />
                                        ) : (
                                            <>
                                                <GoogleLogo size={16} />
                                                <span>Zaloguj przez Google</span>
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </form>
                        )}
                    </>
                )}

                {resetSuccess && (
                    <div className="popup-notice popup-notice--success">
                        {resetSuccess}
                    </div>
                )}

                {authError && (
                    <div className="popup-notice popup-notice--danger">
                        {authError}
                    </div>
                )}
            </div>
        );
    }

    // Render main sync UI when authenticated
    return (
        <div className="firebase-sync">
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
                        <Notice variant="success" onClose={() => setSyncStatus(null)}>
                            {syncStatus}
                        </Notice>
                    )}
                    {syncError && (
                        <Notice variant="danger" onClose={() => setSyncError(null)}>
                            {syncError}
                        </Notice>
                    )}
                </div>
            )}

            {/* Scrollable content container */}
            <div className="firebase-sync__scroll">
                <div>
                    <div className="popup-stack firebase-sync__content">
                    {/* User info */}
                    <div className="firebase-sync__bar">
                        <div>
                            <span className="popup-muted popup-small">Zalogowany jako: </span>
                            <span className="popup-strong">{authState.email ?? authState.displayName ?? 'Nieznany'}</span>
                        </div>
                        <Button
                            size="sm"
                            onClick={handleSignOut}
                            disabled={isAuthBusy || isSyncing}
                        >
                            Wyloguj
                        </Button>
                    </div>

                    {/* Sync options, grouped by category group (registry-driven) */}
                    <section className="character-settings-section">
                        <div className="firebase-sync__bar">
                            <h5 className="character-settings-section-title">Dane do synchronizacji</h5>
                            <div className="popup-inline">
                                <Button variant="ghost"
                                    size="sm"
                                    className="popup-muted"
                                    onClick={() => setSyncOptions(Object.fromEntries(SYNC_CATEGORIES.map(c => [c, true])) as SyncOptions)}
                                >
                                    Zaznacz wszystko
                                </Button>
                                <span className="popup-muted">·</span>
                                <Button variant="ghost"
                                    size="sm"
                                    className="popup-muted"
                                    onClick={() => setSyncOptions(Object.fromEntries(SYNC_CATEGORIES.map(c => [c, false])) as SyncOptions)}
                                >
                                    Odznacz wszystko
                                </Button>
                            </div>
                        </div>
                        <div className="firebase-sync__groups">
                            {CATEGORY_GROUPS.map(group => (
                                <div key={group.id}>
                                    <div className="popup-muted popup-small popup-strong firebase-sync__group-name">{group.name}</div>
                                    {getCategoriesByGroup(group.id).map(cat => (
                                        <div key={cat} className="firebase-sync__category">
                                            <Check
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
                            ))}
                        </div>
                    </section>

                    {/* Encryption */}
                    <section className="character-settings-section">
                        <Check
                            id="encryption-toggle"
                            label="Szyfruj dane w chmurze"
                            checked={encryptionEnabled}
                            onChange={e => setEncryptionEnabled(e.target.checked)}
                        />
                        {/* Show warning when cloud has encrypted data but user wants to disable */}
                        {!encryptionEnabled && Object.values(cloudMetadata).some(m => m?.encrypted) && (
                            <div className="popup-stack">
                                <div className="popup-notice popup-notice--warning">
                                    <small>
                                        Niektore dane w chmurze sa zaszyfrowane. Podaj haslo aby pobrac i zapisac bez szyfrowania.
                                    </small>
                                </div>
                                <div className="popup-field">
                                    <label className="popup-field__label">Aktualne haslo szyfrowania</label>
                                    <Input
                                        type="password"
                                        value={passphrase}
                                        onChange={e => setPassphrase(e.target.value)}
                                        placeholder="Wprowadz haslo do odszyfrowania..."
                                    />
                                </div>
                                <Button variant="solid"
                                    size="sm"
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
                                            // Re-upload without encryption. Force: this rewrites the
                                            // cloud's own data deliberately, the conflict check must
                                            // not block it.
                                            const uploadResult = await uploadCategories(result.data, {
                                                encrypted: false,
                                                force: true,
                                            });
                                            if (!uploadResult.success) {
                                                const firstError = Object.values(uploadResult.errors)[0];
                                                setSyncError(firstError ?? FIREBASE_ERRORS.SYNC_FAILED);
                                                return;
                                            }
                                            setPassphrase('');
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
                                        <span className="popup-inline">
                                            <span className="popup-spinner" />
                                            <span>Odszyfrowanie...</span>
                                        </span>
                                    ) : (
                                        'Wylacz szyfrowanie i zapisz'
                                    )}
                                </Button>
                            </div>
                        )}
                        {encryptionEnabled && (
                            <div className="popup-stack">
                                <div className="popup-field">
                                    <label className="popup-field__label">Haslo szyfrowania</label>
                                    <Input
                                        type="password"
                                        value={passphrase}
                                        onChange={e => setPassphrase(e.target.value)}
                                        placeholder="Wprowadz haslo..."
                                    />
                                </div>
                                <div className="popup-muted popup-small">
                                    Haslo jest pamietane tylko do zamkniecia karty przegladarki i nigdy nie trafia
                                    na serwer. Jesli je zapomnisz, dane w chmurze beda niedostepne.
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Auto-sync */}
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
                            Automatycznie wysyla zmiany do chmury po 30 sekundach od ostatniej zmiany
                            (rzadziej dla danych zmieniajacych sie czesto, np. licznika zabitych).
                            Dziala w tle takze po zamknieciu tego okna.
                            {encryptionEnabled && !passphrase && autoSyncEnabled && (
                                <div className="popup-text-warning">
                                    Podaj haslo szyfrowania aby wlaczyc auto-sync.
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Delete cloud data */}
                    {Object.values(cloudMetadata).some(m => m?.exists) && (
                        <section className="character-settings-section cloud-delete">
                            <div className="cloud-delete__row">
                                <div className="cloud-delete__text">
                                    <h5 className="character-settings-section-title">Usuwanie danych z chmury</h5>
                                    <div className="popup-muted popup-small">
                                        Usuwa wszystkie zsynchronizowane dane z chmury (niezaleznie od szyfrowania).
                                        Dane lokalne pozostana nienaruszone.
                                    </div>
                                </div>
                                {!showDeleteConfirm && (
                                    <Button
                                        size="sm"
                                        className="popup-btn--danger cloud-delete__action"
                                        onClick={() => setShowDeleteConfirm(true)}
                                        disabled={isSyncing || isDeleting}
                                    >
                                        Usun dane z chmury
                                    </Button>
                                )}
                            </div>
                            {showDeleteConfirm && (
                                <div className="cloud-delete__confirm">
                                    <span className="popup-small">
                                        Na pewno usunac wszystkie dane z chmury? Tej operacji nie mozna cofnac.
                                    </span>
                                    <div className="popup-inline">
                                        <Button
                                            size="sm"
                                            onClick={() => setShowDeleteConfirm(false)}
                                            disabled={isDeleting}
                                        >
                                            Anuluj
                                        </Button>
                                        <Button
                                            size="sm"
                                            className="cloud-delete__confirm-button"
                                            onClick={handleDeleteCloudData}
                                            disabled={isDeleting}
                                        >
                                            {isDeleting ? (
                                                <span className="popup-inline">
                                                    <span className="popup-spinner" />
                                                    <span>Usuwanie...</span>
                                                </span>
                                            ) : (
                                                'Tak, usun'
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </section>
                    )}
                    </div>
                </div>
            </div>

            {/* Bottom action buttons */}
            <div className="popup-row firebase-sync__actions">
                <Button variant="solid"
                    onClick={() => performSync()}
                    disabled={isSyncing || (encryptionEnabled && !passphrase)}
                >
                    {isSyncing ? (
                        <span className="popup-inline">
                            <span className="popup-spinner" />
                            <span>Synchronizacja...</span>
                        </span>
                    ) : (
                        'Wyslij do chmury'
                    )}
                </Button>
                <Button
                    onClick={() => handleDownload()}
                    disabled={isSyncing || (encryptionEnabled && !passphrase)}
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
