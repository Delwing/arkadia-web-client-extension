import { useCallback, useEffect, useState } from "react";
import { Button, DeleteButton, Input, Notice } from "@web-ui/primitives/index.ts";
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
} from "@modules/device";
import {
    createSyncGroup,
    joinSyncGroup,
    leaveSyncGroupCloud,
    getFirebaseAuth,
    getCloudSyncGroups,
    getRegisteredDevices,
    registerDevice,
    copySettingsFromCloudDevice,
    deleteEmptySyncGroup,
    syncEngine,
} from "@modules/firebase";

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
    const [isLeavingGroup, setIsLeavingGroup] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null);
    const [cloudSyncGroups, setCloudSyncGroups] = useState<SyncGroup[]>([]);
    const [isLoadingCloudGroups, setIsLoadingCloudGroups] = useState(false);
    const [cloudDevices, setCloudDevices] = useState<DeviceInfo[]>([]);
    const [isLoadingCloudDevices, setIsLoadingCloudDevices] = useState(false);
    const [copyingFromDeviceId, setCopyingFromDeviceId] = useState<string | null>(null);
    const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

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

    // Load cloud sync group and devices when logged in
    useEffect(() => {
        const loadCloudData = async () => {
            if (!isLoggedIn) {
                setCloudSyncGroups([]);
                setCloudDevices([]);
                return;
            }

            // Register current device to cloud (so other devices can see it)
            try {
                await registerDevice();
            } catch (err) {
                console.error("Failed to register device", err);
            }

            // Load cloud sync groups (filter out current group if we're in one)
            setIsLoadingCloudGroups(true);
            try {
                const result = await getCloudSyncGroups();
                // Filter out the group we're already in
                const otherGroups = syncGroup
                    ? result.groups.filter(g => g.id !== syncGroup.id)
                    : result.groups;
                setCloudSyncGroups(otherGroups);
            } catch (err) {
                console.error("Failed to load cloud sync groups", err);
                setCloudSyncGroups([]);
            } finally {
                setIsLoadingCloudGroups(false);
            }

            // Load cloud devices
            setIsLoadingCloudDevices(true);
            try {
                const result = await getRegisteredDevices();
                // Filter out current device
                const otherDevices = result.devices.filter(d => d.id !== deviceInfo?.id);
                setCloudDevices(otherDevices);
            } catch (err) {
                console.error("Failed to load cloud devices", err);
                setCloudDevices([]);
            } finally {
                setIsLoadingCloudDevices(false);
            }
        };
        loadCloudData();
    }, [isLoggedIn, syncGroup, deviceInfo?.id]);

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
                    // Push this device's interface/button settings so devices that
                    // join the group have something to apply (the group doc only
                    // holds membership; settings travel as device-scoped categories).
                    void syncEngine.syncNow();
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
                    setStatus("Opuscono grupe synchronizacji.");
                } else {
                    setError(result.error || "Nie udalo sie opuscic grupy synchronizacji.");
                }
            } else {
                // Leave locally when not logged in
                leaveSyncGroup();
                setSyncGroupState(null);
                setStatus("Opuscono grupe synchronizacji.");
            }
        } catch (err) {
            console.error("Failed to leave sync group", err);
            setError("Wystapil blad podczas opuszczania grupy synchronizacji.");
        } finally {
            setIsLeavingGroup(false);
        }
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
                const result = await joinSyncGroup(entry.syncGroup.id, {
                    passphrase: syncEngine.getPassphrase() ?? undefined,
                });
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

    // Handle join cloud sync group (when group exists in cloud but not locally)
    const handleJoinCloudSyncGroup = async (groupToJoin: SyncGroup) => {
        const groupName = groupToJoin.name;
        if (!window.confirm(`Czy na pewno chcesz dolaczyc do grupy synchronizacji "${groupName}"? Ustawienia z chmury zostana pobrane.`)) {
            return;
        }

        setJoiningGroupId(groupToJoin.id);
        setError(null);
        setStatus(null);

        try {
            const result = await joinSyncGroup(groupToJoin.id, {
                passphrase: syncEngine.getPassphrase() ?? undefined,
            });
            if (result.success && result.group) {
                setSyncGroupState(result.group);
                // Remove joined group from cloud groups list
                setCloudSyncGroups(prev => prev.filter(g => g.id !== result.group!.id));
                setStatus(`Dolaczono do grupy synchronizacji "${result.group.name}".`);
            } else {
                setError(result.error || "Nie udalo sie dolaczyc do grupy synchronizacji.");
            }
        } catch (err) {
            console.error("Failed to join cloud sync group", err);
            setError("Wystapil blad podczas dolaczania do grupy synchronizacji.");
        } finally {
            setJoiningGroupId(null);
        }
    };

    // Handle copy settings from cloud device
    const handleCopyFromCloudDevice = async (deviceId: string, deviceName: string) => {
        const confirmMessage = syncGroup
            ? `Czy na pewno chcesz skopiowac ustawienia z urzadzenia "${deviceName}"? Ustawienia zostana zastosowane na tym urzadzeniu i zsynchronizowane z Twoja grupa.`
            : `Czy na pewno chcesz skopiowac ustawienia z urzadzenia "${deviceName}"? Aktualne ustawienia tego urzadzenia zostana nadpisane.`;
        if (!window.confirm(confirmMessage)) return;

        setCopyingFromDeviceId(deviceId);
        setError(null);
        setStatus(null);

        try {
            const result = await copySettingsFromCloudDevice(deviceId, syncEngine.getPassphrase() ?? undefined);
            if (result.success) {
                setStatus(`Ustawienia zostaly skopiowane z urzadzenia "${deviceName}".`);
            } else {
                setError(result.error || "Nie udalo sie skopiowac ustawien.");
            }
        } catch (err) {
            console.error("Failed to copy settings from cloud device", err);
            setError("Wystapil blad podczas kopiowania ustawien.");
        } finally {
            setCopyingFromDeviceId(null);
        }
    };

    // Handle delete empty sync group
    const handleDeleteEmptyGroup = async (group: SyncGroup) => {
        if (!window.confirm(`Czy na pewno chcesz usunac pusta grupe "${group.name}"?`)) return;

        setDeletingGroupId(group.id);
        setError(null);
        setStatus(null);

        try {
            const result = await deleteEmptySyncGroup(group.id);
            if (result.success) {
                setCloudSyncGroups(prev => prev.filter(g => g.id !== group.id));
                setStatus(`Grupa "${group.name}" zostala usunieta.`);
            } else {
                setError(result.error || "Nie udalo sie usunac grupy.");
            }
        } catch (err) {
            console.error("Failed to delete empty sync group", err);
            setError("Wystapil blad podczas usuwania grupy.");
        } finally {
            setDeletingGroupId(null);
        }
    };

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
            <p className="popup-field__hint">
                Informacje o tym urzadzeniu. Ustawienia urzadzenia (pozycje okien, konfiguracja przyciskow)
                sa automatycznie synchronizowane razem z ustawieniami interfejsu.
            </p>

            {/* Current Device Info */}
            <section className="character-settings-section">
                <h5 className="character-settings-section-title">To urzadzenie</h5>
                {deviceInfo && (
                    <div className="device-card">
                            <div className="d-flex flex-column gap-2">
                                <div className="d-flex justify-content-between align-items-start">
                                    <div>
                                        {isEditing ? (
                                            <div className="d-flex gap-2 align-items-center">
                                                <Input
                                                    value={customName}
                                                    onChange={e => setCustomName(e.target.value)}
                                                    placeholder={deviceInfo.name}
                                                    style={{ maxWidth: "200px" }}
                                                />
                                                <Button variant="solid" size="sm" onClick={handleSaveName}>
                                                    Zapisz
                                                </Button>
                                                <Button
                                                    size="sm"
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
                                                <Button variant="ghost"
                                                    size="sm"
                                                    className="text-muted"
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
                                    <span className="popup-chip popup-chip--accent">Aktywne</span>
                                </div>
                                <div className="text-muted small">
                                    <div>ID: {deviceInfo.id.substring(0, 16)}...</div>
                                    <div>Utworzono: {formatDate(deviceInfo.createdAt)}</div>
                                    {deviceInfo.lastSyncedAt && (
                                        <div>Ostatnia synchronizacja: {formatDate(deviceInfo.lastSyncedAt)}</div>
                                    )}
                                </div>
                            </div>
                        </div>
                )}
            </section>

            {/* Sync Group Section */}
            <section className="character-settings-section">
                <h5 className="character-settings-section-title">Synchronizacja urzadzen</h5>
                {!syncGroup ? (
                    <div className="d-flex flex-column gap-3">
                        {/* Cloud sync groups available to join */}
                        {isLoggedIn && cloudSyncGroups.length > 0 && cloudSyncGroups.map(group => (
                            <div key={group.id} className="device-card device-card--active">
                                    <div className="d-flex flex-column gap-2">
                                        <div className="d-flex justify-content-between align-items-start">
                                            <div>
                                                <strong>{group.name}</strong>
                                                <div className="text-muted small">
                                                    Grupa z chmury ({group.devices.length} {group.devices.length === 1 ? "urzadzenie" : "urzadzen"})
                                                </div>
                                            </div>
                                            <span className="popup-chip popup-chip--success">W chmurze</span>
                                        </div>
                                        <p className="text-muted small mb-2">
                                            Dolacz do tej grupy, aby zsynchronizowac ustawienia urzadzenia z innymi urzadzeniami.
                                        </p>
                                        <div className="d-flex gap-2">
                                            <Button variant="solid"
                                                size="sm"
                                                onClick={() => handleJoinCloudSyncGroup(group)}
                                                disabled={joiningGroupId === group.id}
                                            >
                                                {joiningGroupId === group.id ? (
                                                    <>
                                                        <span className="popup-spinner" />
                                                        Dolaczanie...
                                                    </>
                                                ) : (
                                                    "Dolacz do grupy"
                                                )}
                                            </Button>
                                            {group.devices.length === 0 && (
                                                <Button variant="danger"
                                                    size="sm"
                                                    onClick={() => handleDeleteEmptyGroup(group)}
                                                    disabled={deletingGroupId === group.id}
                                                >
                                                    {deletingGroupId === group.id ? (
                                                        <>
                                                            <span className="popup-spinner" />
                                                            Usuwanie...
                                                        </>
                                                    ) : (
                                                        "Usun grupe"
                                                    )}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                        ))}

                        {/* Loading cloud sync groups */}
                        {isLoggedIn && isLoadingCloudGroups && cloudSyncGroups.length === 0 && (
                            <div className="device-card device-card--muted">
                                    <span className="popup-spinner" />
                                    <span>Sprawdzanie grup w chmurze...</span>
                                </div>
                        )}

                        {/* Create new sync group */}
                        <div className="device-card">
                                <p className="text-muted small mb-3">
                                    {cloudSyncGroups.length > 0
                                        ? "Mozesz tez utworzyc nowa grupe synchronizacji:"
                                        : "Utworz grupe synchronizacji, aby synchronizowac ustawienia urzadzenia (pozycje okien, przyciski) miedzy wieloma urzadzeniami."
                                    }
                                    {!isLoggedIn && " Zaloguj sie, aby synchronizowac automatycznie, lub eksportuj/importuj reczne."}
                                </p>
                                <form onSubmit={e => { e.preventDefault(); handleCreateSyncGroup(); }}>
                                    <div className="popup-inline device-card__form">
                                        <Input
                                            placeholder="Nazwa grupy (np. Moje urzadzenia)"
                                            value={syncGroupName}
                                            onChange={e => setSyncGroupName(e.target.value)}
                                            disabled={isCreatingGroup}
                                        />
                                        <Button variant="solid"
                                            onClick={handleCreateSyncGroup}
                                            disabled={isCreatingGroup}
                                        >
                                            {isCreatingGroup ? (
                                                <>
                                                    <span className="popup-spinner" />
                                                    Tworzenie...
                                                </>
                                            ) : (
                                                "Utworz grupe"
                                            )}
                                        </Button>
                                    </div>
                                </form>
                            </div>
                    </div>
                ) : (
                    <div className="device-card">
                            <div className="d-flex flex-column gap-3">
                                <div className="d-flex justify-content-between align-items-start">
                                    <div>
                                        <strong>{syncGroup.name}</strong>
                                        <div className="text-muted small">
                                            {syncGroup.devices.length} {syncGroup.devices.length === 1 ? "urzadzenie" : "urzadzen"}
                                        </div>
                                    </div>
                                    <span className={`popup-chip${isLoggedIn ? " popup-chip--success" : ""}`}>
                                        {isLoggedIn ? "Polaczone" : "Lokalna"}
                                    </span>
                                </div>

                                {!isLoggedIn && (
                                    <div className="popup-notice">
                                        Zaloguj sie, aby automatycznie synchronizowac ustawienia.
                                        Mozesz tez uzywac eksportu/importu recznego.
                                    </div>
                                )}

                                {isLoggedIn && (
                                    <p className="text-muted small mb-0">
                                        Ustawienia interfejsu synchronizuja sie automatycznie z urzadzeniami w tej grupie
                                        (razem z pozostalymi kategoriami w zakladce Synchronizacja).
                                    </p>
                                )}

                                <div className="text-muted small">
                                    <div>ID grupy: {syncGroup.id.substring(0, 16)}...</div>
                                    <div>Utworzono: {formatDate(syncGroup.createdAt)}</div>
                                    <div>Ostatnia zmiana: {formatDate(syncGroup.updatedAt)}</div>
                                </div>

                                <div className="d-flex gap-2">
                                    <Button variant="danger"
                                        size="sm"
                                        onClick={handleLeaveSyncGroup}
                                        disabled={isLeavingGroup}
                                    >
                                        {isLeavingGroup ? (
                                            <>
                                                <span className="popup-spinner" />
                                                Opuszczanie...
                                            </>
                                        ) : (
                                            "Opusc grupe"
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </div>
                )}
            </section>

            {/* Cloud Devices Section */}
            {isLoggedIn && (cloudDevices.length > 0 || isLoadingCloudDevices) && (
                <section className="character-settings-section">
                    <h5 className="character-settings-section-title">Urzadzenia w chmurze</h5>
                    <p className="text-muted small mb-2">
                        Inne urzadzenia zarejestrowane na tym koncie. Mozesz dolaczyc do ich grupy synchronizacji.
                    </p>
                    {isLoadingCloudDevices ? (
                        <div className="device-card device-card--muted">
                                <span className="popup-spinner" />
                                <span>Ladowanie urzadzen z chmury...</span>
                            </div>
                    ) : (
                        <div className="dialog-list">
                            {cloudDevices.map(device => {
                                // Find all groups this device is in
                                const deviceGroups = cloudSyncGroups.filter(g => g.devices.includes(device.id));
                                const isInCurrentGroup = syncGroup?.devices.includes(device.id);
                                return (
                                    <div key={device.id} className="dialog-list__row dialog-list__row--block">
                                        <div className="d-flex flex-column gap-2">
                                            <div className="d-flex align-items-center gap-2 flex-wrap">
                                                <strong>
                                                    {device.customName || device.name}
                                                </strong>
                                                <span className="popup-chip popup-chip--accent">Chmura</span>
                                                {isInCurrentGroup && (
                                                    <span className="popup-chip popup-chip--success">W Twojej grupie</span>
                                                )}
                                                {deviceGroups.map(group => (
                                                    <span key={group.id} className="popup-chip popup-chip--warning">
                                                        Grupa: {group.name}
                                                    </span>
                                                ))}
                                            </div>
                                            <div className="text-muted small">
                                                <div>ID: {device.id.substring(0, 16)}...</div>
                                                {device.browserInfo && (
                                                    <div>{device.browserInfo.browser} na {device.browserInfo.os}</div>
                                                )}
                                                <div>Utworzono: {formatDate(device.createdAt)}</div>
                                            </div>
                                            {/* Show action buttons - join group or copy settings */}
                                            {(() => {
                                                const deviceDisplayName = device.customName || device.name;
                                                const isCurrentDevice = device.id === deviceInfo?.id;
                                                return (
                                                    <div className="d-flex gap-2 flex-wrap">
                                                        {/* Join buttons - only show if not in any group */}
                                                        {!syncGroup && deviceGroups.map(group => (
                                                            <Button variant="solid"
                                                                key={group.id}
                                                                size="sm"
                                                                onClick={() => handleJoinCloudSyncGroup(group)}
                                                                disabled={joiningGroupId === group.id}
                                                            >
                                                                {joiningGroupId === group.id ? (
                                                                    <>
                                                                        <span className="popup-spinner" />
                                                                        Dolaczanie...
                                                                    </>
                                                                ) : (
                                                                    `Dolacz do "${group.name}"`
                                                                )}
                                                            </Button>
                                                        ))}
                                                        {/* Copy settings button - show for all devices except current */}
                                                        {!isCurrentDevice && (
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleCopyFromCloudDevice(device.id, deviceDisplayName)}
                                                                disabled={copyingFromDeviceId === device.id}
                                                            >
                                                                {copyingFromDeviceId === device.id ? (
                                                                    <>
                                                                        <span className="popup-spinner" />
                                                                        Kopiowanie...
                                                                    </>
                                                                ) : (
                                                                    "Kopiuj ustawienia"
                                                                )}
                                                            </Button>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}

            {/* Imported Devices Section */}
            {importedDevices.length > 0 && (
                <section className="character-settings-section">
                    <h5 className="character-settings-section-title">Zaimportowane urzadzenia</h5>
                    <p className="text-muted small mb-2">
                        Urzadzenia z zaimportowanych plikow. Mozesz skopiowac ich ustawienia na to urzadzenie.
                    </p>
                    <div className="dialog-list">
                        {importedDevices.map(entry => (
                            <div key={entry.deviceInfo.id} className="dialog-list__row dialog-list__row--block">
                                <div className="d-flex flex-column gap-2">
                                    <div className="d-flex align-items-center gap-2 flex-wrap">
                                        <strong>
                                            {entry.deviceInfo.customName || entry.deviceInfo.name}
                                        </strong>
                                        <span className="popup-chip">
                                            Zaimportowane
                                        </span>
                                        {entry.syncGroup && (
                                            <span className="popup-chip popup-chip--accent">
                                                Grupa: {entry.syncGroup.name}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-muted small">
                                        <div>ID: {entry.deviceInfo.id.substring(0, 16)}...</div>
                                        <div>Zaimportowano: {formatDate(entry.importedAt)}</div>
                                    </div>
                                    <div className="d-flex gap-2 flex-wrap">
                                        {entry.syncGroup && !syncGroup && (
                                            <Button variant="solid"
                                                size="sm"
                                                onClick={() => handleJoinSyncGroup(entry)}
                                                disabled={joiningGroupId === entry.syncGroup?.id}
                                            >
                                                {joiningGroupId === entry.syncGroup?.id ? (
                                                    <>
                                                        <span className="popup-spinner" />
                                                        Dolaczanie...
                                                    </>
                                                ) : (
                                                    "Dolacz do grupy"
                                                )}
                                            </Button>
                                        )}
                                        <Button
                                            size="sm"
                                            onClick={() => handleCopyFromDevice(entry)}
                                        >
                                            Kopiuj ustawienia
                                        </Button>
                                        <DeleteButton title="Usuń urządzenie" onClick={() => handleDeleteImported(entry)} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Status/Error Messages */}
            {status && (
                <Notice variant="success" onClose={() => setStatus(null)}>
                    {status}
                </Notice>
            )}
            {error && (
                <Notice variant="danger" onClose={() => setError(null)}>
                    {error}
                </Notice>
            )}
        </div>
    );
}

export default DeviceManagementTab;
