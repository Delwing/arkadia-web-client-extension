import { applyDeviceSettingsFrom, flushSyncV2, isSyncV2Enabled } from "@web/userData/syncV2";
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
    updateLocalSyncGroup,
    registerDevice,
    copySettingsFromCloudDevice,
    deleteEmptySyncGroup,
    onAuthStateChanged,
    syncEngine,
} from "@modules/firebase";
import { SHOW_SETTINGS_EVENT } from "@web/settings/categories.ts";

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
    // Bumped when the settings dialog is shown: it stays mounted, so the cloud
    // lists would otherwise only load once.
    const [reloadToken, setReloadToken] = useState(0);

    // The dialog can mount before sign-in: follow the auth state, not just its value at mount.
    useEffect(() => onAuthStateChanged(state => setIsLoggedIn(state.isAuthenticated)), []);

    useEffect(() => {
        const reload = () => setReloadToken(token => token + 1);
        window.addEventListener(SHOW_SETTINGS_EVENT, reload);
        return () => window.removeEventListener(SHOW_SETTINGS_EVENT, reload);
    }, []);

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
                // The group may have gained devices since this device last looked
                const updated = updateLocalSyncGroup(result.groups);
                if (updated) {
                    setSyncGroupState(updated);
                    if (isSyncV2Enabled()) void applyDeviceSettingsFrom(updated.devices);
                }
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
    }, [isLoggedIn, syncGroup, deviceInfo?.id, reloadToken]);

    // Handle custom name save
    const handleSaveName = () => {
        const trimmed = customName.trim();
        setDeviceCustomName(trimmed || undefined);
        refreshData();
        // Other devices list this device under its new name
        if (isLoggedIn) void registerDevice({ force: true });
        setIsEditing(false);
        setStatus("Nazwa urządzenia została zapisana.");
    };

    // Handle copy settings from imported device
    const handleCopyFromDevice = (entry: ImportedDeviceEntry) => {
        const deviceName = getDeviceDisplayName(entry.deviceInfo);
        const confirmMessage = `Czy na pewno chcesz skopiować ustawienia z urządzenia "${deviceName}"? Aktualne ustawienia tego urządzenia zostaną nadpisane.`;
        if (!window.confirm(confirmMessage)) return;

        setError(null);
        setStatus(null);

        const success = applyImportedDeviceSettings(entry.deviceInfo.id);
        if (success) {
            setStatus(`Ustawienia zostały skopiowane z urządzenia "${deviceName}".`);
        } else {
            setError("Nie udało się skopiować ustawień.");
        }
    };

    // Handle delete imported device
    const handleDeleteImported = (entry: ImportedDeviceEntry) => {
        const deviceName = getDeviceDisplayName(entry.deviceInfo);
        if (!window.confirm(`Czy na pewno chcesz usunąć zaimportowane urządzenie "${deviceName}"?`)) return;

        deleteImportedDevice(entry.deviceInfo.id);
        refreshData();
        setStatus(`Urządzenie "${deviceName}" zostało usunięte.`);
    };

    // Handle create sync group
    const handleCreateSyncGroup = async () => {
        setIsCreatingGroup(true);
        setError(null);
        setStatus(null);

        try {
            const name = syncGroupName || "Moje urządzenia";

            if (isLoggedIn) {
                // Use Firebase when logged in
                const result = await createSyncGroup(name);
                if (result.success && result.group) {
                    setSyncGroupState(result.group);
                    setSyncGroupName("");
                    // Push this device's interface/button settings so devices that
                    // join the group have something to apply (the group doc only
                    // holds membership; settings travel as device-scoped categories).
                    if (isSyncV2Enabled()) void flushSyncV2();
                    else void syncEngine.syncNow();
                    setStatus(`Grupa synchronizacji "${result.group.name}" została utworzona.`);
                } else {
                    setError(result.error || "Nie udało się utworzyć grupy synchronizacji.");
                }
            } else {
                // Create local sync group when not logged in
                const group = createLocalSyncGroup(name);
                setSyncGroupState(group);
                setSyncGroupName("");
                setStatus(`Grupa synchronizacji "${group.name}" została utworzona. Zaloguj się, aby synchronizować automatycznie.`);
            }
        } catch (err) {
            console.error("Failed to create sync group", err);
            setError("Wystąpił błąd podczas tworzenia grupy synchronizacji.");
        } finally {
            setIsCreatingGroup(false);
        }
    };

    // Handle leave sync group
    const handleLeaveSyncGroup = async () => {
        if (!syncGroup) return;
        if (!window.confirm(`Czy na pewno chcesz opuścić grupę synchronizacji "${syncGroup.name}"?`)) return;

        setIsLeavingGroup(true);
        setError(null);
        setStatus(null);

        try {
            if (isLoggedIn) {
                // Use Firebase when logged in
                const result = await leaveSyncGroupCloud();
                if (result.success) {
                    setSyncGroupState(null);
                    setStatus("Opuszczono grupę synchronizacji.");
                } else {
                    setError(result.error || "Nie udało się opuścić grupy synchronizacji.");
                }
            } else {
                // Leave locally when not logged in
                leaveSyncGroup();
                setSyncGroupState(null);
                setStatus("Opuszczono grupę synchronizacji.");
            }
        } catch (err) {
            console.error("Failed to leave sync group", err);
            setError("Wystąpił błąd podczas opuszczania grupy synchronizacji.");
        } finally {
            setIsLeavingGroup(false);
        }
    };

    // Sync v2: take the interface and button settings of the group's other devices
    const applyGroupSettings = async (group: SyncGroup) => {
        if (!isSyncV2Enabled()) return;
        const others = group.devices.filter(id => id !== deviceInfo?.id);
        if (others.length > 0) await applyDeviceSettingsFrom(others);
    };

    // Handle join sync group from imported device
    const handleJoinSyncGroup = async (entry: ImportedDeviceEntry) => {
        if (!entry.syncGroup) return;
        if (syncGroup) {
            setError("Już należysz do grupy synchronizacji. Opuść ją najpierw, aby dołączyć do innej.");
            return;
        }

        const groupName = entry.syncGroup.name;
        const deviceName = getDeviceDisplayName(entry.deviceInfo);
        if (!window.confirm(`Czy na pewno chcesz dołączyć do grupy synchronizacji "${groupName}" z urządzenia "${deviceName}"? Ustawienia z tego urządzenia zostaną skopiowane.`)) {
            return;
        }

        setJoiningGroupId(entry.syncGroup.id);
        setError(null);
        setStatus(null);

        try {
            // First, apply settings from the imported device
            const success = applyImportedDeviceSettings(entry.deviceInfo.id);
            if (!success) {
                setError("Nie udało się skopiować ustawień z urządzenia.");
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
                    await applyGroupSettings(result.group);
                    setStatus(`Dołączono do grupy synchronizacji "${result.group.name}" i skopiowano ustawienia.`);
                } else {
                    // If Firebase join fails (group doesn't exist in cloud), join locally
                    setSyncGroup(entry.syncGroup);
                    setSyncGroupState(entry.syncGroup);
                    setStatus(`Dołączono do grupy synchronizacji "${groupName}" (lokalnie) i skopiowano ustawienia.`);
                }
            } else {
                // Join locally when not logged in
                setSyncGroup(entry.syncGroup);
                setSyncGroupState(entry.syncGroup);
                setStatus(`Dołączono do grupy synchronizacji "${groupName}" i skopiowano ustawienia. Zaloguj się, aby synchronizować automatycznie.`);
            }
        } catch (err) {
            console.error("Failed to join sync group", err);
            setError("Wystąpił błąd podczas dołączania do grupy synchronizacji.");
        } finally {
            setJoiningGroupId(null);
        }
    };

    // Handle join cloud sync group (when group exists in cloud but not locally)
    const handleJoinCloudSyncGroup = async (groupToJoin: SyncGroup) => {
        const groupName = groupToJoin.name;
        if (!window.confirm(`Czy na pewno chcesz dołączyć do grupy synchronizacji "${groupName}"? Ustawienia z chmury zostaną pobrane.`)) {
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
                await applyGroupSettings(result.group);
                // Remove joined group from cloud groups list
                setCloudSyncGroups(prev => prev.filter(g => g.id !== result.group!.id));
                setStatus(`Dołączono do grupy synchronizacji "${result.group.name}".`);
            } else {
                setError(result.error || "Nie udało się dołączyć do grupy synchronizacji.");
            }
        } catch (err) {
            console.error("Failed to join cloud sync group", err);
            setError("Wystąpił błąd podczas dołączania do grupy synchronizacji.");
        } finally {
            setJoiningGroupId(null);
        }
    };

    // Handle copy settings from cloud device
    const handleCopyFromCloudDevice = async (deviceId: string, deviceName: string) => {
        const confirmMessage = syncGroup
            ? `Czy na pewno chcesz skopiować ustawienia z urządzenia "${deviceName}"? Ustawienia zostaną zastosowane na tym urządzeniu i zsynchronizowane z Twoją grupą.`
            : `Czy na pewno chcesz skopiować ustawienia z urządzenia "${deviceName}"? Aktualne ustawienia tego urządzenia zostaną nadpisane.`;
        if (!window.confirm(confirmMessage)) return;

        setCopyingFromDeviceId(deviceId);
        setError(null);
        setStatus(null);

        try {
            // Sync v2 keeps other devices' settings in its own data, not in the v1 document.
            const result = isSyncV2Enabled()
                ? await applyDeviceSettingsFrom([deviceId]).then(found => found
                    ? { success: true }
                    : { success: false, error: "Brak ustawień tego urządzenia w chmurze - otwórz na nim klienta, aby je wysłał." })
                : await copySettingsFromCloudDevice(deviceId, syncEngine.getPassphrase() ?? undefined);
            if (result.success) {
                setStatus(`Ustawienia zostały skopiowane z urządzenia "${deviceName}".`);
            } else {
                setError(result.error || "Nie udało się skopiować ustawień.");
            }
        } catch (err) {
            console.error("Failed to copy settings from cloud device", err);
            setError("Wystąpił błąd podczas kopiowania ustawień.");
        } finally {
            setCopyingFromDeviceId(null);
        }
    };

    // Handle delete empty sync group
    const handleDeleteEmptyGroup = async (group: SyncGroup) => {
        if (!window.confirm(`Czy na pewno chcesz usunąć pustą grupę "${group.name}"?`)) return;

        setDeletingGroupId(group.id);
        setError(null);
        setStatus(null);

        try {
            const result = await deleteEmptySyncGroup(group.id);
            if (result.success) {
                setCloudSyncGroups(prev => prev.filter(g => g.id !== group.id));
                setStatus(`Grupa "${group.name}" została usunięta.`);
            } else {
                setError(result.error || "Nie udało się usunąć grupy.");
            }
        } catch (err) {
            console.error("Failed to delete empty sync group", err);
            setError("Wystąpił błąd podczas usuwania grupy.");
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
        <div className="popup-stack">
            <p className="popup-field__hint">
                Informacje o tym urządzeniu. Ustawienia urządzenia (pozycje okien, konfiguracja przycisków)
                są automatycznie synchronizowane razem z ustawieniami interfejsu.
            </p>

            {/* Current Device Info */}
            <section className="character-settings-section">
                <h5 className="character-settings-section-title">To urządzenie</h5>
                {deviceInfo && (
                    <div className="device-card">
                            <div className="popup-stack popup-stack--sm">
                                <div className="popup-spread popup-spread--top">
                                    <div>
                                        {isEditing ? (
                                            <div className="popup-inline">
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
                                            <div className="popup-inline">
                                                <strong>{deviceInfo.customName || deviceInfo.name}</strong>
                                                <Button variant="ghost"
                                                    size="sm"
                                                    className="popup-muted"
                                                    onClick={() => setIsEditing(true)}
                                                >
                                                    Zmień
                                                </Button>
                                            </div>
                                        )}
                                        {deviceInfo.customName && (
                                            <div className="popup-muted popup-small">{deviceInfo.name}</div>
                                        )}
                                    </div>
                                    <span className="popup-chip popup-chip--accent">Aktywne</span>
                                </div>
                                <div className="popup-muted popup-small">
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
                <h5 className="character-settings-section-title">Synchronizacja urządzeń</h5>
                {!syncGroup ? (
                    <div className="popup-stack">
                        {/* Cloud sync groups available to join */}
                        {isLoggedIn && cloudSyncGroups.length > 0 && cloudSyncGroups.map(group => (
                            <div key={group.id} className="device-card device-card--active">
                                    <div className="popup-stack popup-stack--sm">
                                        <div className="popup-spread popup-spread--top">
                                            <div>
                                                <strong>{group.name}</strong>
                                                <div className="popup-muted popup-small">
                                                    Grupa z chmury ({group.devices.length} {group.devices.length === 1 ? "urządzenie" : "urządzeń"})
                                                </div>
                                            </div>
                                            <span className="popup-chip popup-chip--success">W chmurze</span>
                                        </div>
                                        <div className="popup-muted popup-small">
                                            Dołącz do tej grupy, aby zsynchronizować ustawienia urządzenia z innymi urządzeniami.
                                        </div>
                                        <div className="popup-inline">
                                            <Button variant="solid"
                                                size="sm"
                                                onClick={() => handleJoinCloudSyncGroup(group)}
                                                disabled={joiningGroupId === group.id}
                                            >
                                                {joiningGroupId === group.id ? (
                                                    <>
                                                        <span className="popup-spinner" />
                                                        Dołączanie...
                                                    </>
                                                ) : (
                                                    "Dołącz do grupy"
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
                                                        "Usuń grupę"
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
                                <p className="popup-muted popup-small device-card__lead">
                                    {cloudSyncGroups.length > 0
                                        ? "Możesz też utworzyć nową grupę synchronizacji:"
                                        : "Utwórz grupę synchronizacji, aby synchronizować ustawienia urządzenia (pozycje okien, przyciski) między wieloma urządzeniami."
                                    }
                                    {!isLoggedIn && " Zaloguj się, aby synchronizować automatycznie, lub eksportuj/importuj ręcznie."}
                                </p>
                                <form onSubmit={e => { e.preventDefault(); handleCreateSyncGroup(); }}>
                                    <div className="popup-inline device-card__form">
                                        <Input
                                            placeholder="Nazwa grupy (np. Moje urządzenia)"
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
                                                "Utwórz grupę"
                                            )}
                                        </Button>
                                    </div>
                                </form>
                            </div>
                    </div>
                ) : (
                    <div className="device-card">
                            <div className="popup-stack">
                                <div className="popup-spread popup-spread--top">
                                    <div>
                                        <strong>{syncGroup.name}</strong>
                                        <div className="popup-muted popup-small">
                                            {syncGroup.devices.length} {syncGroup.devices.length === 1 ? "urządzenie" : "urządzeń"}
                                        </div>
                                    </div>
                                    <span className={`popup-chip${isLoggedIn ? " popup-chip--success" : ""}`}>
                                        {isLoggedIn ? "Połączone" : "Lokalna"}
                                    </span>
                                </div>

                                {!isLoggedIn && (
                                    <div className="popup-notice">
                                        Zaloguj się, aby automatycznie synchronizować ustawienia.
                                        Możesz też używać eksportu/importu ręcznego.
                                    </div>
                                )}

                                {isLoggedIn && (
                                    <div className="popup-muted popup-small">
                                        Ustawienia interfejsu synchronizują się automatycznie z urządzeniami w tej grupie
                                        (razem z pozostałymi kategoriami w zakładce Synchronizacja).
                                    </div>
                                )}

                                <div className="popup-muted popup-small">
                                    <div>ID grupy: {syncGroup.id.substring(0, 16)}...</div>
                                    <div>Utworzono: {formatDate(syncGroup.createdAt)}</div>
                                    <div>Ostatnia zmiana: {formatDate(syncGroup.updatedAt)}</div>
                                </div>

                                <div className="popup-inline">
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
                                            "Opuść grupę"
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
                    <h5 className="character-settings-section-title">Urządzenia w chmurze</h5>
                    <div className="popup-muted popup-small">
                        Inne urządzenia zarejestrowane na tym koncie. Możesz dołączyć do ich grupy synchronizacji.
                    </div>
                    {isLoadingCloudDevices ? (
                        <div className="device-card device-card--muted">
                                <span className="popup-spinner" />
                                <span>Ładowanie urządzeń z chmury...</span>
                            </div>
                    ) : (
                        <div className="dialog-list">
                            {cloudDevices.map(device => {
                                // Find all groups this device is in
                                const deviceGroups = cloudSyncGroups.filter(g => g.devices.includes(device.id));
                                const isInCurrentGroup = syncGroup?.devices.includes(device.id);
                                return (
                                    <div key={device.id} className="dialog-list__row dialog-list__row--block">
                                        <div className="popup-stack popup-stack--sm">
                                            <div className="popup-row">
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
                                            <div className="popup-muted popup-small">
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
                                                    <div className="popup-row">
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
                                                                        Dołączanie...
                                                                    </>
                                                                ) : (
                                                                    `Dołącz do "${group.name}"`
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
                    <h5 className="character-settings-section-title">Zaimportowane urządzenia</h5>
                    <div className="popup-muted popup-small">
                        Urządzenia z zaimportowanych plików. Możesz skopiować ich ustawienia na to urządzenie.
                    </div>
                    <div className="dialog-list">
                        {importedDevices.map(entry => (
                            <div key={entry.deviceInfo.id} className="dialog-list__row dialog-list__row--block">
                                <div className="popup-stack popup-stack--sm">
                                    <div className="popup-row">
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
                                    <div className="popup-muted popup-small">
                                        <div>ID: {entry.deviceInfo.id.substring(0, 16)}...</div>
                                        <div>Zaimportowano: {formatDate(entry.importedAt)}</div>
                                    </div>
                                    <div className="popup-row">
                                        {entry.syncGroup && !syncGroup && (
                                            <Button variant="solid"
                                                size="sm"
                                                onClick={() => handleJoinSyncGroup(entry)}
                                                disabled={joiningGroupId === entry.syncGroup?.id}
                                            >
                                                {joiningGroupId === entry.syncGroup?.id ? (
                                                    <>
                                                        <span className="popup-spinner" />
                                                        Dołączanie...
                                                    </>
                                                ) : (
                                                    "Dołącz do grupy"
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
