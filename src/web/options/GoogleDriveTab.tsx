import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Spinner } from "react-bootstrap";
import {
    buildExport,
    validatePayload,
    applyImportedData,
    type ExportOptions,
    type ExportPayload,
} from "./exportUtils";

const GOOGLE_CLIENT_ID = "717498712073-50tjdorsa6vk4mq0fj774u0rhqr5jkd4.apps.googleusercontent.com";
const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.appdata"];
const DRIVE_TOKEN_STORAGE_KEY = "arkadia.driveToken";

interface StoredDriveToken {
    token: string;
    expiresAt: number;
}

function loadStoredDriveToken(): StoredDriveToken | null {
    if (typeof localStorage === "undefined") {
        return null;
    }
    try {
        const raw = localStorage.getItem(DRIVE_TOKEN_STORAGE_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw) as Partial<StoredDriveToken> | null;
        if (!parsed || typeof parsed.token !== "string" || typeof parsed.expiresAt !== "number") {
            return null;
        }
        return parsed as StoredDriveToken;
    } catch (err) {
        console.error("Failed to load stored Google Drive token", err);
        return null;
    }
}

function saveStoredDriveToken(token: string, expiresAt: number) {
    if (typeof localStorage === "undefined") {
        return;
    }
    try {
        const value: StoredDriveToken = { token, expiresAt };
        localStorage.setItem(DRIVE_TOKEN_STORAGE_KEY, JSON.stringify(value));
    } catch (err) {
        console.error("Failed to persist Google Drive token", err);
    }
}

function clearStoredDriveToken() {
    if (typeof localStorage === "undefined") {
        return;
    }
    try {
        localStorage.removeItem(DRIVE_TOKEN_STORAGE_KEY);
    } catch (err) {
        console.error("Failed to clear stored Google Drive token", err);
    }
}

interface GoogleTokenResponse {
    access_token?: string;
    expires_in?: number | string;
    error?: string;
}

interface GoogleTokenClient {
    callback: (response: GoogleTokenResponse) => void;
    requestAccessToken: (options?: { prompt?: "" | "consent" }) => void;
}

interface GoogleTokenClientConfig {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    use_fedcm_for_prompt?: boolean;
}

interface DriveFileSummary {
    id: string;
    name: string;
    modifiedTime?: string;
    size?: string;
}

declare global {
    interface Window {
        google?: {
            accounts?: {
                oauth2?: {
                    initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient;
                    revoke?: (token: string, done?: () => void) => void;
                };
            };
        };
    }
}

function formatDriveDate(iso?: string) {
    if (!iso) return "Nieznana data";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString();
}

function formatDriveSize(size?: string) {
    if (!size) return null;
    const value = Number(size);
    if (!Number.isFinite(value)) return null;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

interface GoogleDriveTabProps {
    selectedCharacters: string[];
    exportOptions: ExportOptions;
    onImportComplete?: () => void;
}

function GoogleDriveTab({ selectedCharacters, exportOptions, onImportComplete }: GoogleDriveTabProps) {
    const [isDriveScriptReady, setIsDriveScriptReady] = useState(false);
    const [isDriveBusy, setIsDriveBusy] = useState(false);
    const [isDriveLoading, setIsDriveLoading] = useState(false);
    const [driveFiles, setDriveFiles] = useState<DriveFileSummary[]>([]);
    const [driveStatus, setDriveStatus] = useState<string | null>(null);
    const [driveError, setDriveError] = useState<string | null>(null);
    const [driveToken, setDriveToken] = useState<string | null>(null);
    const [driveAction, setDriveAction] = useState<string | null>(null);
    const tokenClientRef = useRef<GoogleTokenClient | null>(null);
    const driveTokenRef = useRef<string | null>(null);
    const driveTokenExpiryRef = useRef(0);

    useEffect(() => {
        const stored = loadStoredDriveToken();
        if (!stored) {
            return;
        }
        if (Date.now() < stored.expiresAt) {
            driveTokenRef.current = stored.token;
            driveTokenExpiryRef.current = stored.expiresAt;
            setDriveToken(stored.token);
        } else {
            clearStoredDriveToken();
        }
    }, []);

    useEffect(() => {
        if (window.google?.accounts?.oauth2) {
            setIsDriveScriptReady(true);
            return;
        }
        let isMounted = true;
        const existing = document.querySelector<HTMLScriptElement>('script[data-google-gis="true"]');
        const target = existing ?? document.createElement("script");

        const handleLoad = () => {
            target.dataset.googleGisLoaded = "true";
            if (!isMounted) return;
            setDriveError(null);
            setIsDriveScriptReady(true);
        };

        const handleError = () => {
            if (!isMounted) return;
            setDriveError("Nie udalo sie zaladowac integracji z Google Drive.");
        };

        target.addEventListener("load", handleLoad);
        target.addEventListener("error", handleError);

        if (!existing) {
            target.src = "https://accounts.google.com/gsi/client";
            target.async = true;
            target.defer = true;
            target.dataset.googleGis = "true";
            document.head.appendChild(target);
        } else if (existing.dataset.googleGisLoaded === "true" || window.google?.accounts?.oauth2) {
            handleLoad();
        }

        return () => {
            isMounted = false;
            target.removeEventListener("load", handleLoad);
            target.removeEventListener("error", handleError);
        };
    }, []);

    useEffect(() => {
        if (!isDriveScriptReady) return;
        const oauth2 = window.google?.accounts?.oauth2;
        if (!oauth2) {
            setDriveError("Nie udalo sie zainicjalizowac integracji z Google Drive.");
            return;
        }
        tokenClientRef.current = oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: DRIVE_SCOPES.join(" "),
            callback: () => {},
            use_fedcm_for_prompt: true,
        });
    }, [isDriveScriptReady]);

    const requestNewToken = useCallback(
        (client: GoogleTokenClient, promptType: "" | "none" | "consent"): Promise<string> => {
            return new Promise<string>((resolve, reject) => {
                client.callback = (response: GoogleTokenResponse) => {
                    if (response?.error) {
                        reject(new Error(response.error === "access_denied"
                            ? "Dostep do Google Drive zostal odrzucony."
                            : response.error));
                        return;
                    }
                    const token = response?.access_token;
                    if (!token) {
                        reject(new Error("Nie udalo sie uzyskac tokenu Google Drive."));
                        return;
                    }
                    const expiresRaw = response.expires_in;
                    const expiresIn =
                        typeof expiresRaw === "string" ? Number.parseInt(expiresRaw, 10) : Number(expiresRaw ?? 0);
                    const issuedAt = Date.now();
                    const buffer = Number.isFinite(expiresIn) ? Math.max(0, (expiresIn - 60) * 1000) : 0;
                    const expiresAt = buffer ? issuedAt + buffer : issuedAt + 5 * 60 * 1000;
                    driveTokenRef.current = token;
                    driveTokenExpiryRef.current = expiresAt;
                    setDriveToken(token);
                    saveStoredDriveToken(token, expiresAt);
                    resolve(token);
                };
                try {
                    client.requestAccessToken({ prompt: promptType as "" | "consent" });
                } catch (err) {
                    reject(err instanceof Error ? err : new Error("Nie udalo sie uzyskac tokenu Google Drive."));
                }
            });
        },
        []
    );

    const ensureDriveToken = useCallback(
        async (forcePrompt = false): Promise<string> => {
            const client = tokenClientRef.current;
            if (!client) {
                throw new Error("Integracja z Google Drive nie jest dostepna.");
            }
            if (!forcePrompt) {
                const existingToken = driveTokenRef.current;
                const expiry = driveTokenExpiryRef.current;
                if (existingToken && expiry && Date.now() < expiry) {
                    return existingToken;
                }
            }

            const hadPreviousToken = driveTokenRef.current !== null || loadStoredDriveToken() !== null;

            if (!forcePrompt && hadPreviousToken) {
                try {
                    return await requestNewToken(client, "none");
                } catch {
                    // Silent refresh failed, fall through to consent prompt
                }
            }

            return requestNewToken(client, forcePrompt ? "consent" : (hadPreviousToken ? "" : "consent"));
        },
        [requestNewToken]
    );

    const driveFetch = useCallback(
        async (url: string, init?: RequestInit, retry = true): Promise<Response> => {
            const token = await ensureDriveToken();
            const headers = new Headers(init?.headers as HeadersInit | undefined);
            headers.set("Authorization", `Bearer ${token}`);
            const requestInit: RequestInit = { ...init, headers };
            const response = await fetch(url, requestInit);
            if (response.status === 401 && retry) {
                driveTokenRef.current = null;
                driveTokenExpiryRef.current = 0;
                setDriveToken(null);
                clearStoredDriveToken();
                return driveFetch(url, init, false);
            }
            return response;
        },
        [ensureDriveToken]
    );

    // Proactive token refresh
    useEffect(() => {
        if (!driveToken || !tokenClientRef.current) {
            return;
        }

        const expiry = driveTokenExpiryRef.current;
        if (!expiry) {
            return;
        }

        const now = Date.now();
        const timeUntilExpiry = expiry - now;
        const refreshAt = Math.max(timeUntilExpiry / 2, Math.min(timeUntilExpiry - 5 * 60 * 1000, timeUntilExpiry * 0.8));

        if (refreshAt <= 0) {
            requestNewToken(tokenClientRef.current, "none").catch(() => {});
            return;
        }

        const timerId = setTimeout(() => {
            const client = tokenClientRef.current;
            if (!client) return;
            requestNewToken(client, "none").catch(() => {});
        }, refreshAt);

        return () => clearTimeout(timerId);
    }, [driveToken, requestNewToken]);

    const refreshDriveFiles = useCallback(
        async (options?: { action?: "list" }) => {
            if (!tokenClientRef.current) {
                return;
            }
            if (options?.action === "list") {
                setDriveAction("list");
            }
            setDriveError(null);
            setIsDriveLoading(true);
            try {
                const params = new URLSearchParams({
                    spaces: "appDataFolder",
                    fields: "files(id,name,modifiedTime,size)",
                    orderBy: "modifiedTime desc",
                    pageSize: "20",
                });
                const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);
                if (!response.ok) {
                    throw new Error(`Failed to list files: ${response.status}`);
                }
                const data = await response.json();
                const list: DriveFileSummary[] = Array.isArray(data?.files)
                    ? data.files
                        .filter((file: any) => typeof file?.id === "string" && typeof file?.name === "string")
                        .map((file: any) => ({
                            id: file.id as string,
                            name: file.name as string,
                            modifiedTime: typeof file.modifiedTime === "string" ? file.modifiedTime : undefined,
                            size: typeof file.size === "string" ? file.size : undefined,
                        }))
                    : [];
                setDriveFiles(list);
            } catch (err) {
                console.error("Failed to list Google Drive files", err);
                setDriveError("Nie udalo sie pobrac listy plikow z Google Drive.");
            } finally {
                setIsDriveLoading(false);
                if (options?.action === "list") {
                    setDriveAction(null);
                }
            }
        },
        [driveFetch]
    );

    useEffect(() => {
        const handleShow = () => {
            if (driveTokenRef.current && driveTokenExpiryRef.current && Date.now() < driveTokenExpiryRef.current) {
                void refreshDriveFiles();
            }
        };
        window.addEventListener("show-export-import", handleShow);
        return () => {
            window.removeEventListener("show-export-import", handleShow);
        };
    }, [refreshDriveFiles]);

    const handleDriveConnect = async () => {
        if (!tokenClientRef.current) return;
        setDriveStatus(null);
        setDriveError(null);
        setDriveAction("connect");
        setIsDriveBusy(true);
        try {
            await ensureDriveToken(true);
            setDriveStatus("Polaczono z Google Drive.");
            await refreshDriveFiles();
        } catch (err) {
            console.error("Failed to connect to Google Drive", err);
            setDriveError("Nie udalo sie polaczyc z Google Drive.");
        } finally {
            setIsDriveBusy(false);
            setDriveAction(null);
        }
    };

    const handleDriveUpload = async () => {
        if (!tokenClientRef.current) return;
        setDriveError(null);
        setDriveStatus(null);
        setDriveAction("upload");
        setIsDriveBusy(true);
        try {
            const payload = await buildExport(selectedCharacters, exportOptions);
            const json = JSON.stringify(payload, null, 2);
            const timestamp = new Date().toISOString().replace(/[:T]/g, "-").split(".")[0];
            const metadata = {
                name: `arkadia-backup-${timestamp}.json`,
                parents: ["appDataFolder"],
            };
            const boundary = `-------arkadia-${Date.now().toString(16)}`;
            const body = [
                `--${boundary}`,
                "Content-Type: application/json; charset=UTF-8",
                "",
                JSON.stringify(metadata),
                `--${boundary}`,
                "Content-Type: application/json",
                "",
                json,
                `--${boundary}--`,
                "",
            ].join("\r\n");
            const response = await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
                method: "POST",
                headers: {
                    "Content-Type": `multipart/related; boundary=${boundary}`,
                },
                body,
            });
            if (!response.ok) {
                throw new Error(`Upload failed with status ${response.status}`);
            }
            setDriveStatus("Kopia zostala zapisana na Google Drive.");
            await refreshDriveFiles();
        } catch (err) {
            console.error("Failed to upload backup to Google Drive", err);
            setDriveError("Nie udalo sie wyslac kopii na Google Drive.");
        } finally {
            setIsDriveBusy(false);
            setDriveAction(null);
        }
    };

    const handleDriveImport = async (fileSummary: DriveFileSummary) => {
        if (!tokenClientRef.current) return;
        setDriveError(null);
        setDriveStatus(null);
        setDriveAction(`import:${fileSummary.id}`);
        setIsDriveBusy(true);
        try {
            const response = await driveFetch(
                `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileSummary.id)}?alt=media`
            );
            if (!response.ok) {
                throw new Error(`Download failed with status ${response.status}`);
            }
            const text = await response.text();
            const parsed = JSON.parse(text);
            if (!validatePayload(parsed)) {
                throw new Error("invalid");
            }
            const result = await applyImportedData(parsed as ExportPayload);
            onImportComplete?.();
            let msg = `Zaimportowano plik "${fileSummary.name}" z Google Drive. Niektore ustawienia moga wymagac odswiezenia strony.`;
            if (result.deviceSettingsSavedToImportedList) {
                msg += " Ustawienia interfejsu z innego urzadzenia zostaly zapisane - mozesz je zastosowac w zakladce Urzadzenia.";
            }
            setDriveStatus(msg);
        } catch (err) {
            console.error("Failed to import backup from Google Drive", err);
            setDriveError("Nie udalo sie pobrac danych z Google Drive.");
        } finally {
            setIsDriveBusy(false);
            setDriveAction(null);
        }
    };

    const handleDriveDelete = async (fileSummary: DriveFileSummary) => {
        if (!tokenClientRef.current) return;
        const confirmed = window.confirm(`Czy na pewno chcesz usunac kopie "${fileSummary.name}" z Google Drive?`);
        if (!confirmed) {
            return;
        }
        setDriveError(null);
        setDriveStatus(null);
        setDriveAction(`delete:${fileSummary.id}`);
        setIsDriveBusy(true);
        try {
            const response = await driveFetch(
                `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileSummary.id)}`,
                {
                    method: "DELETE",
                }
            );
            if (!response.ok) {
                throw new Error(`Delete failed with status ${response.status}`);
            }
            setDriveStatus(`Usunieto kopie "${fileSummary.name}" z Google Drive.`);
            await refreshDriveFiles();
        } catch (err) {
            console.error("Failed to delete backup from Google Drive", err);
            setDriveError("Nie udalo sie usunac kopii z Google Drive.");
        } finally {
            setIsDriveBusy(false);
            setDriveAction(null);
        }
    };

    const handleDriveDisconnect = async () => {
        setDriveError(null);
        setDriveStatus(null);
        setDriveAction("disconnect");
        setIsDriveBusy(true);
        try {
            const token = driveTokenRef.current;
            if (token && window.google?.accounts?.oauth2?.revoke) {
                await new Promise<void>(resolve => {
                    window.google?.accounts?.oauth2?.revoke?.(token, () => resolve());
                });
            }
        } catch (err) {
            console.error("Failed to revoke Google Drive token", err);
        } finally {
            driveTokenRef.current = null;
            driveTokenExpiryRef.current = 0;
            setDriveToken(null);
            clearStoredDriveToken();
            setDriveFiles([]);
            setDriveStatus("Polaczenie z Google Drive zostalo zakonczenie.");
            setIsDriveBusy(false);
            setDriveAction(null);
        }
    };

    return (
        <div className="d-flex flex-column gap-3">
            <div>
                <p className="mb-0 text-muted">Polacz konto Google, aby zapisywac kopie zapasowe w chmurze.</p>
            </div>
            <div className="d-flex flex-wrap gap-2 align-items-center">
                {!isDriveScriptReady ? (
                    <div className="d-inline-flex align-items-center gap-2 text-muted">
                        <Spinner animation="border" size="sm" role="status" />
                        <span>Ladowanie integracji z Google...</span>
                    </div>
                ) : !driveToken ? (
                    <Button onClick={handleDriveConnect} disabled={isDriveBusy}>
                        {driveAction === "connect" ? (
                            <span className="d-inline-flex align-items-center gap-2">
                                <Spinner animation="border" size="sm" role="status" />
                                <span>Laczenie...</span>
                            </span>
                        ) : (
                            "Polacz z Google Drive"
                        )}
                    </Button>
                ) : (
                    <>
                        <Button
                            onClick={handleDriveUpload}
                            disabled={isDriveBusy || isDriveLoading}
                        >
                            {driveAction === "upload" ? (
                                <span className="d-inline-flex align-items-center gap-2">
                                    <Spinner animation="border" size="sm" role="status" />
                                    <span>Wysylanie...</span>
                                </span>
                            ) : (
                                "Wyslij kopie na Google Drive"
                            )}
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => refreshDriveFiles({ action: "list" })}
                            disabled={isDriveLoading || isDriveBusy}
                        >
                            {driveAction === "list" ? (
                                <span className="d-inline-flex align-items-center gap-2">
                                    <Spinner animation="border" size="sm" role="status" />
                                    <span>Odswiezanie...</span>
                                </span>
                            ) : (
                                "Odswiez liste"
                            )}
                        </Button>
                        <Button
                            variant="outline-secondary"
                            onClick={handleDriveDisconnect}
                            disabled={isDriveBusy || isDriveLoading}
                        >
                            {driveAction === "disconnect" ? (
                                <span className="d-inline-flex align-items-center gap-2">
                                    <Spinner animation="border" size="sm" role="status" />
                                    <span>Odlaczanie...</span>
                                </span>
                            ) : (
                                "Odlacz"
                            )}
                        </Button>
                    </>
                )}
            </div>
            {driveToken && (
                <section className="character-settings-section">
                    <h5 className="character-settings-section-title">Kopie zapasowe</h5>
                    {isDriveLoading ? (
                        <div className="d-inline-flex align-items-center gap-2 text-muted">
                            <Spinner animation="border" size="sm" role="status" />
                            <span>Ladowanie listy plikow...</span>
                        </div>
                    ) : driveFiles.length > 0 ? (
                        <div className="d-flex flex-column gap-2">
                        {driveFiles.map(file => {
                            const sizeText = formatDriveSize(file.size);
                            const displayName = file.name.replace("arkadia-backup-", "").replace(".json", "");
                            return (
                                <div
                                    key={file.id}
                                    className="d-flex flex-wrap align-items-center justify-content-between gap-2 border rounded px-2 py-2"
                                >
                                    <div className="me-auto">
                                        <div className="d-flex align-items-center gap-2">
                                            <span className="fw-semibold">{displayName}</span>
                                        </div>
                                        <div className="text-muted small">
                                            {formatDriveDate(file.modifiedTime)}
                                            {sizeText ? ` - ${sizeText}` : ""}
                                        </div>
                                    </div>
                                    <div className="d-flex flex-wrap align-items-center gap-2">
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => handleDriveImport(file)}
                                            disabled={isDriveBusy || isDriveLoading}
                                        >
                                            {driveAction === `import:${file.id}` ? (
                                                <span className="d-inline-flex align-items-center gap-2">
                                                    <Spinner animation="border" size="sm" role="status" />
                                                    <span>Importowanie...</span>
                                                </span>
                                            ) : (
                                                "Importuj"
                                            )}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline-danger"
                                            onClick={() => handleDriveDelete(file)}
                                            disabled={isDriveBusy || isDriveLoading}
                                        >
                                            {driveAction === `delete:${file.id}` ? (
                                                <span className="d-inline-flex align-items-center gap-2">
                                                    <Spinner animation="border" size="sm" role="status" />
                                                    <span>Usuwanie...</span>
                                                </span>
                                            ) : (
                                                "Usun"
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                        </div>
                    ) : (
                        <p className="text-muted mb-0">Brak kopii zapisanych przez Arkadie na Google Drive.</p>
                    )}
                </section>
            )}
            {driveStatus && (
                <Alert variant="success" className="mb-0">
                    {driveStatus}
                </Alert>
            )}
            {driveError && (
                <Alert variant="danger" className="mb-0">
                    {driveError}
                </Alert>
            )}
        </div>
    );
}

export default GoogleDriveTab;
