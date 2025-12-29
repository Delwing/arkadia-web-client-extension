import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Form, Card, Badge, ListGroup, Spinner, InputGroup } from "react-bootstrap";
import {
    getDeviceInfo,
    setDeviceCustomName,
    getImportedDevices,
    deleteImportedDevice,
    applyImportedDeviceSettings,
    getDeviceDisplayName,
    getSyncGroup,
    setSyncGroup,
    createLocalSyncGroup,
    leaveSyncGroup,
    type DeviceInfo,
    type ImportedDeviceEntry,
    type SyncGroup,
    type SyncConflict,
} from "@modules/device";
import {
    createSyncGroup,
    joinSyncGroup,
    leaveSyncGroupCloud,
    syncNow,
    checkForSyncUpdates,
    getRemoteDeviceName,
    getFirebaseAuth,
} from "@modules/firebase";
import SyncConflictModal from "./SyncConflictModal";

function DeviceManagementTab() {
    const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
    const [customName, setCustomName] = useState("");
    const [isEditing, setIsEditing] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [importedDevices, setImportedDevices] = useState<ImportedDeviceEntry[]>([]);

    // Sync group state
    const [syncGroup, setSyncGroupState] = useState<SyncGroup | null>(null);
    const [syncGroupName, setSyncGroupName] = useState("");
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isLeavingGroup, setIsLeavingGroup] = useState(false);
    const [syncConflict, setSyncConflict] = useState<SyncConflict | null>(null);
    const [showConflictModal, setShowConflictModal] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null);
    const [conflictDeviceName, setConflictDeviceName] = useState<string>("");

    // Load device info and imported devices
    const refreshData = useCallback(() => {
        const info = getDeviceInfo();
        setDeviceInfo(info);
        setCustomName(info.customName || "");
        setImportedDevices(getImportedDevices());
        setSyncGroupState(getSyncGroup());

        // Check login status
        const auth = getFirebaseAuth();
        setIsLoggedIn(!!auth?.currentUser);
    }, []);

    useEffect(() => {
        refreshData();
    }, [refreshData]);

    // Handle custom name save
    const handleSaveName = () => {
        const trimmed = customName.trim();
        setDeviceCustomName(trimmed || undefined);
        refreshData();
        setIsEditing(false);
        setStatus("Nazwa urzadzenia zostala zapisana.");
    };

    // Handle copy settings from imported device
    const handleCopyFromDevice = (entry: ImportedDeviceEntry) => {
        const deviceName = getDeviceDisplayName(entry.deviceInfo);
        const confirmMessage = `Czy na pewno chcesz skopiowac ustawienia z urzadzenia "${deviceName}"? Aktualne ustawienia tego urzadzenia zostana nadpisane.`;
        if (!window.confirm(confirmMessage)) return;

        setError(null);
        setStatus(null);

        const success = applyImportedDeviceSettings(entry.deviceInfo.id);
        if (success) {
            setStatus(`Ustawienia zostaly skopiowane z urzadzenia "${deviceName}".`);
        } else {
            setError("Nie udalo sie skopiowac ustawien.");
        }
    };

    // Handle delete imported device
    const handleDeleteImported = (entry: ImportedDeviceEntry) => {
        const deviceName = getDeviceDisplayName(entry.deviceInfo);
        if (!window.confirm(`Czy na pewno chcesz usunac zaimportowane urzadzenie "${deviceName}"?`)) return;

        deleteImportedDevice(entry.deviceInfo.id);
        refreshData();
        setStatus(`Urzadzenie "${deviceName}" zostalo usuniete.`);
    };

    // Handle create sync group
    const handleCreateSyncGroup = async () => {
        setIsCreatingGroup(true);
        setError(null);
        setStatus(null);

        try {
            const name = syncGroupName || "Moje urzadzenia";

            if (isLoggedIn) {
                // Use Firebase when logged in
                const result = await createSyncGroup(name);
                if (result.success && result.group) {
                    setSyncGroupState(result.group);
                    setSyncGroupName("");
                    setStatus(`Grupa synchronizacji "${result.group.name}" zostala utworzona.`);
                } else {
                    setError(result.error || "Nie udalo sie utworzyc grupy synchronizacji.");
                }
            } else {
                // Create local sync group when not logged in
                const group = createLocalSyncGroup(name);
                setSyncGroupState(group);
                setSyncGroupName("");
                setStatus(`Grupa synchronizacji "${group.name}" zostala utworzona. Zaloguj sie, aby synchronizowac automatycznie.`);
            }
        } catch (err) {
            console.error("Failed to create sync group", err);
            setError("Wystapil blad podczas tworzenia grupy synchronizacji.");
        } finally {
            setIsCreatingGroup(false);
        }
    };

    // Handle leave sync group
    const handleLeaveSyncGroup = async () => {
        if (!syncGroup) return;
        if (!window.confirm(`Czy na pewno chcesz opuscic grupe synchronizacji "${syncGroup.name}"?`)) return;

        setIsLeavingGroup(true);
        setError(null);
        setStatus(null);

        try {
            if (isLoggedIn) {
                // Use Firebase when logged in
                const result = await leaveSyncGroupCloud();
                if (result.success) {
                    setSyncGroupState(null);
                    setSyncConflict(null);
                    setStatus("Opuscono grupe synchronizacji.");
                } else {
                    setError(result.error || "Nie udalo sie opuscic grupy synchronizacji.");
                }
            } else {
                // Leave locally when not logged in
                leaveSyncGroup();
                setSyncGroupState(null);
                setSyncConflict(null);
                setStatus("Opuscono grupe synchronizacji.");
            }
        } catch (err) {
            console.error("Failed to leave sync group", err);
            setError("Wystapil blad podczas opuszczania grupy synchronizacji.");
        } finally {
            setIsLeavingGroup(false);
        }
    };

    // Handle sync now
    const handleSyncNow = async () => {
        if (!syncGroup) return;

        setIsSyncing(true);
        setError(null);
        setStatus(null);

        try {
            const result = await syncNow();
            if (result.success) {
                if (result.action === "conflict" && result.conflict) {
                    setSyncConflict(result.conflict);
                    // Get device name for display
                    const name = await getRemoteDeviceName(result.conflict.remoteUpdatedBy);
                    setConflictDeviceName(name);
                    setShowConflictModal(true);
                } else if (result.action === "uploaded") {
                    setStatus("Ustawienia zostaly zsynchronizowane.");
                } else if (result.action === "downloaded") {
                    setStatus("Pobrano nowe ustawienia z chmury.");
                } else {
                    setStatus("Ustawienia sa aktualne.");
                }
            } else {
                setError(result.error || "Nie udalo sie zsynchronizowac ustawien.");
            }
        } catch (err) {
            console.error("Failed to sync", err);
            setError("Wystapil blad podczas synchronizacji.");
        } finally {
            setIsSyncing(false);
        }
    };

    // Handle conflict resolved
    const handleConflictResolved = () => {
        setSyncConflict(null);
        setShowConflictModal(false);
        setStatus("Konflikt zostal rozwiazany.");
        refreshData();
    };

    // Handle conflict modal cancel
    const handleConflictCancel = () => {
        setShowConflictModal(false);
    };

    // Handle join sync group from imported device
    const handleJoinSyncGroup = async (entry: ImportedDeviceEntry) => {
        if (!entry.syncGroup) return;
        if (syncGroup) {
            setError("Juz nalezysz do grupy synchronizacji. Opusc ja najpierw, aby dolaczyc do innej.");
            return;
        }

        const groupName = entry.syncGroup.name;
        const deviceName = getDeviceDisplayName(entry.deviceInfo);
        if (!window.confirm(`Czy na pewno chcesz dolaczyc do grupy synchronizacji "${groupName}" z urzadzenia "${deviceName}"? Ustawienia z tego urzadzenia zostana skopiowane.`)) {
            return;
        }

        setJoiningGroupId(entry.syncGroup.id);
        setError(null);
        setStatus(null);

        try {
            // First, apply settings from the imported device
            const success = applyImportedDeviceSettings(entry.deviceInfo.id);
            if (!success) {
                setError("Nie udalo sie skopiowac ustawien z urzadzenia.");
                setJoiningGroupId(null);
                return;
            }

            if (isLoggedIn) {
                // Join via Firebase when logged in
                const result = await joinSyncGroup(entry.syncGroup.id);
                if (result.success && result.group) {
                    setSyncGroupState(result.group);
                    setStatus(`Dolaczono do grupy synchronizacji "${result.group.name}" i skopiowano ustawienia.`);
                } else {
                    // If Firebase join fails (group doesn't exist in cloud), join locally
                    setSyncGroup(entry.syncGroup);
                    setSyncGroupState(entry.syncGroup);
                    setStatus(`Dolaczono do grupy synchronizacji "${groupName}" (lokalnie) i skopiowano ustawienia.`);
                }
            } else {
                // Join locally when not logged in
                setSyncGroup(entry.syncGroup);
                setSyncGroupState(entry.syncGroup);
                setStatus(`Dolaczono do grupy synchronizacji "${groupName}" i skopiowano ustawienia. Zaloguj sie, aby synchronizowac automatycznie.`);
            }
        } catch (err) {
            console.error("Failed to join sync group", err);
            setError("Wystapil blad podczas dolaczania do grupy synchronizacji.");
        } finally {
            setJoiningGroupId(null);
        }
    };

    // Check for sync updates on mount
    useEffect(() => {
        const checkUpdates = async () => {
            if (!syncGroup || !isLoggedIn) return;

            try {
                const result = await checkForSyncUpdates();
                if (result.error) {
                    setError(result.error);
                } else if (result.hasUpdate && result.conflict) {
                    setSyncConflict(result.conflict);
                    // Get device name for display
                    const name = await getRemoteDeviceName(result.conflict.remoteUpdatedBy);
                    setConflictDeviceName(name);
                }
            } catch (err) {
                console.error("Failed to check for sync updates", err);
                setError("Nie udalo sie sprawdzic aktualizacji synchronizacji.");
            }
        };

        checkUpdates();
    }, [syncGroup, isLoggedIn]);

    const formatDate = (isoString?: string) => {
        if (!isoString) return "Brak danych";
        try {
            return new Date(isoString).toLocaleString("pl-PL");
        } catch {
            return isoString;
        }
    };

    return (
        <div className="d-flex flex-column gap-3">
            <p className="mb-0">
                Informacje o tym urzadzeniu. Ustawienia urzadzenia (pozycje okien, konfiguracja przyciskow)
                sa automatycznie synchronizowane razem z ustawieniami interfejsu.
            </p>

            {/* Current Device Info */}
            <section className="character-settings-section">
                <h5 className="character-settings-section-title">To urzadzenie</h5>
                {deviceInfo && (
                    <Card className="bg-dark">
                        <Card.Body>
                            <div className="d-flex flex-column gap-2">
                                <div className="d-flex justify-content-between align-items-start">
                                    <div>
                                        {isEditing ? (
                                            <div className="d-flex gap-2 align-items-center">
                                                <Form.Control
                                                    type="text"
                                                    size="sm"
                                                    value={customName}
                                                    onChange={e => setCustomName(e.target.value)}
                                                    placeholder={deviceInfo.name}
                                                    style={{ maxWidth: "200px" }}
                                                />
                                                <Button size="sm" variant="primary" onClick={handleSaveName}>
                                                    Zapisz
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline-secondary"
                                                    onClick={() => {
                                                        setCustomName(deviceInfo.customName || "");
                                                        setIsEditing(false);
                                                    }}
                                                >
                                                    Anuluj
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="d-flex gap-2 align-items-center">
                                                <strong>{deviceInfo.customName || deviceInfo.name}</strong>
                                                <Button
                                                    size="sm"
                                                    variant="link"
                                                    className="p-0 text-muted"
                                                    onClick={() => setIsEditing(true)}
                                                >
                                                    Zmien
                                                </Button>
                                            </div>
                                        )}
                                        {deviceInfo.customName && (
                                            <div className="text-muted small">{deviceInfo.name}</div>
                                        )}
                                    </div>
                                    <Badge bg="primary">Aktywne</Badge>
                                </div>
                                <div className="text-muted small">
                                    <div>ID: {deviceInfo.id.substring(0, 16)}...</div>
                                    <div>Utworzono: {formatDate(deviceInfo.createdAt)}</div>
                                    {deviceInfo.lastSyncedAt && (
                                        <div>Ostatnia synchronizacja: {formatDate(deviceInfo.lastSyncedAt)}</div>
                                    )}
                                </div>
                            </div>
                        </Card.Body>
                    </Card>
                )}
            </section>

            {/* Sync Group Section */}
            <section className="character-settings-section">
                <h5 className="character-settings-section-title">Synchronizacja urzadzen</h5>
                {!syncGroup ? (
                    <Card className="bg-dark">
                        <Card.Body>
                            <p className="text-muted small mb-3">
                                Utworz grupe synchronizacji, aby synchronizowac
                                ustawienia urzadzenia (pozycje okien, przyciski) miedzy wieloma urzadzeniami.
                                {!isLoggedIn && " Zaloguj sie, aby synchronizowac automatycznie, lub eksportuj/importuj reczne."}
                            </p>
                            <Form onSubmit={e => { e.preventDefault(); handleCreateSyncGroup(); }}>
                                <InputGroup className="mb-0">
                                    <Form.Control
                                        type="text"
                                        placeholder="Nazwa grupy (np. Moje urzadzenia)"
                                        value={syncGroupName}
                                        onChange={e => setSyncGroupName(e.target.value)}
                                        disabled={isCreatingGroup}
                                    />
                                    <Button
                                        variant="primary"
                                        onClick={handleCreateSyncGroup}
                                        disabled={isCreatingGroup}
                                    >
                                        {isCreatingGroup ? (
                                            <>
                                                <Spinner size="sm" className="me-2" />
                                                Tworzenie...
                                            </>
                                        ) : (
                                            "Utworz grupe"
                                        )}
                                    </Button>
                                </InputGroup>
                            </Form>
                        </Card.Body>
                    </Card>
                ) : (
                    <Card className="bg-dark">
                        <Card.Body>
                            <div className="d-flex flex-column gap-3">
                                <div className="d-flex justify-content-between align-items-start">
                                    <div>
                                        <strong>{syncGroup.name}</strong>
                                        <div className="text-muted small">
                                            {syncGroup.devices.length} {syncGroup.devices.length === 1 ? "urzadzenie" : "urzadzen"}
                                        </div>
                                    </div>
                                    <Badge bg={isLoggedIn ? "success" : "secondary"}>
                                        {isLoggedIn ? "Polaczone" : "Lokalna"}
                                    </Badge>
                                </div>

                                {!isLoggedIn && (
                                    <Alert variant="info" className="mb-0 small">
                                        Zaloguj sie, aby automatycznie synchronizowac ustawienia.
                                        Mozesz tez uzywac eksportu/importu recznego.
                                    </Alert>
                                )}

                                {syncConflict && isLoggedIn && (
                                    <Alert variant="warning" className="mb-0">
                                        <div className="d-flex justify-content-between align-items-center">
                                            <div>
                                                <strong>Wykryto konflikt ustawien</strong>
                                                <div className="small">
                                                    Urzadzenie "{conflictDeviceName}" zmienilo ustawienia {formatDate(syncConflict.remoteUpdatedAt)}.
                                                </div>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="warning"
                                                onClick={() => setShowConflictModal(true)}
                                            >
                                                Rozwiaz
                                            </Button>
                                        </div>
                                    </Alert>
                                )}

                                <div className="text-muted small">
                                    <div>ID grupy: {syncGroup.id.substring(0, 16)}...</div>
                                    <div>Utworzono: {formatDate(syncGroup.createdAt)}</div>
                                    <div>Ostatnia zmiana: {formatDate(syncGroup.updatedAt)}</div>
                                </div>

                                <div className="d-flex gap-2">
                                    {isLoggedIn && (
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            onClick={handleSyncNow}
                                            disabled={isSyncing}
                                        >
                                            {isSyncing ? (
                                                <>
                                                    <Spinner size="sm" className="me-2" />
                                                    Synchronizowanie...
                                                </>
                                            ) : (
                                                "Synchronizuj teraz"
                                            )}
                                        </Button>
                                    )}
                                    <Button
                                        variant="danger"
                                        size="sm"
                                        onClick={handleLeaveSyncGroup}
                                        disabled={isLeavingGroup}
                                    >
                                        {isLeavingGroup ? (
                                            <>
                                                <Spinner size="sm" className="me-2" />
                                                Opuszczanie...
                                            </>
                                        ) : (
                                            "Opusc grupe"
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </Card.Body>
                    </Card>
                )}
            </section>

            {/* Imported Devices Section */}
            {importedDevices.length > 0 && (
                <section className="character-settings-section">
                    <h5 className="character-settings-section-title">Zaimportowane urzadzenia</h5>
                    <p className="text-muted small mb-2">
                        Urzadzenia z zaimportowanych plikow. Mozesz skopiowac ich ustawienia na to urzadzenie.
                    </p>
                    <ListGroup variant="flush" className="bg-dark">
                        {importedDevices.map(entry => (
                            <ListGroup.Item
                                key={entry.deviceInfo.id}
                                className="bg-dark border-secondary py-3"
                            >
                                <div className="d-flex flex-column gap-2">
                                    <div className="d-flex align-items-center gap-2 flex-wrap">
                                        <strong>
                                            {entry.deviceInfo.customName || entry.deviceInfo.name}
                                        </strong>
                                        <Badge bg="secondary">
                                            Zaimportowane
                                        </Badge>
                                        {entry.syncGroup && (
                                            <Badge bg="info">
                                                Grupa: {entry.syncGroup.name}
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="text-muted small">
                                        <div>ID: {entry.deviceInfo.id.substring(0, 16)}...</div>
                                        <div>Zaimportowano: {formatDate(entry.importedAt)}</div>
                                    </div>
                                    <div className="d-flex gap-2 flex-wrap">
                                        {entry.syncGroup && !syncGroup && (
                                            <Button
                                                size="sm"
                                                variant="success"
                                                onClick={() => handleJoinSyncGroup(entry)}
                                                disabled={joiningGroupId === entry.syncGroup?.id}
                                            >
                                                {joiningGroupId === entry.syncGroup?.id ? (
                                                    <>
                                                        <Spinner size="sm" className="me-1" />
                                                        Dolaczanie...
                                                    </>
                                                ) : (
                                                    "Dolacz do grupy"
                                                )}
                                            </Button>
                                        )}
                                        <Button
                                            size="sm"
                                            variant="primary"
                                            onClick={() => handleCopyFromDevice(entry)}
                                        >
                                            Kopiuj ustawienia
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="danger"
                                            onClick={() => handleDeleteImported(entry)}
                                        >
                                            Usun
                                        </Button>
                                    </div>
                                </div>
                            </ListGroup.Item>
                        ))}
                    </ListGroup>
                </section>
            )}

            {/* Status/Error Messages */}
            {status && (
                <Alert variant="success" className="mb-0" dismissible onClose={() => setStatus(null)}>
                    {status}
                </Alert>
            )}
            {error && (
                <Alert variant="danger" className="mb-0" dismissible onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            {/* Sync Conflict Modal */}
            {showConflictModal && syncConflict && (
                <SyncConflictModal
                    conflict={syncConflict}
                    onResolved={handleConflictResolved}
                    onCancel={handleConflictCancel}
                />
            )}
        </div>
    );
}

export default DeviceManagementTab;
