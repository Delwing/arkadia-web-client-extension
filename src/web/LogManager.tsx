/**
 * Session management for the in-client log browser.
 *
 * Everything here is about the *store*, not about reading a log: archiving
 * sessions to disk, importing them back, and deleting the ones that are no
 * longer wanted. The standalone page deliberately has none of it — it reads
 * logs and never writes to the database — so this is the one place in the
 * client where a log can be removed or restored.
 *
 * The session list comes in already loaded (`LogSession[]`), so line counts
 * and time spans are read from memory rather than re-counted through a second
 * pass over IndexedDB.
 *
 * Bootstrap here, unlike in the viewer itself: this screen only ever runs in
 * the client, where Bootstrap is loaded anyway. It uses `SubDialog` rather than
 * a react-bootstrap `<Modal>` for the reason that module documents at length —
 * a portaled modal inside stock's Bootstrap-driven window pits two focus
 * managers against each other and pegs the CPU.
 */
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { formatClock, type LogSession } from "@ui/logViewer";
import SubDialog from "./SubDialog";
import type { LogExportData, LogsExportWorkerResponse } from "./logsExport.shared";
import LogsExportWorker from "./logsExport.worker?worker";
import { collectLogStyles, getRawSessionData } from "./logBrowserUtils";
import { getSavedToDiskSessions } from "./logFileSaver";
import { LogsDatabase } from "./logsDatabase";

// --- Downloaded status, in a database of its own -------------------------
//
// Deliberately not in `ArkadiaMessagesDB`: a "has been archived" flag must not
// make the log database go through a version upgrade, which every tab has to
// stand aside for.

function openMetaDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("ArkadiaLogsMetaDB", 3);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains("downloaded")) db.createObjectStore("downloaded");
            if (!db.objectStoreNames.contains("fileSaveDir")) db.createObjectStore("fileSaveDir");
            if (!db.objectStoreNames.contains("savedToDisk")) db.createObjectStore("savedToDisk");
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getDownloadedSessions(): Promise<Set<string>> {
    const db = await openMetaDb();
    return new Promise((resolve) => {
        const tx = db.transaction("downloaded", "readonly");
        const request = tx.objectStore("downloaded").getAllKeys();
        request.onsuccess = () => resolve(new Set(request.result as string[]));
        request.onerror = () => resolve(new Set());
        tx.oncomplete = () => db.close();
    });
}

async function markSessionsDownloaded(names: string[]): Promise<void> {
    if (names.length === 0) return;
    const db = await openMetaDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("downloaded", "readwrite");
        const store = tx.objectStore("downloaded");
        const now = Date.now();
        for (const name of names) store.put({ downloadedAt: now }, name);
        tx.oncomplete = () => {
            db.close();
            resolve();
        };
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    });
}

// --- helpers --------------------------------------------------------------

function download(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
}

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

function sessionYear(session: LogSession): number {
    return new Date(session.startedAt).getFullYear();
}

/** "14.09 20:31 - 22:04", collapsing the date when it does not change. */
function spanLabel(session: LogSession): string {
    const from = new Date(session.startedAt);
    const to = new Date(session.endedAt);
    const day = (date: Date) =>
        `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
    const sameDay =
        from.getFullYear() === to.getFullYear() &&
        from.getMonth() === to.getMonth() &&
        from.getDate() === to.getDate();
    const start = `${day(from)} ${formatClock(session.startedAt, true)}`;
    return sameDay
        ? `${start} – ${formatClock(session.endedAt, true)}`
        : `${start} – ${day(to)} ${formatClock(session.endedAt, true)}`;
}

export interface LogManagerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Opens the file picker as soon as the window appears. */
    startImport?: boolean;
    sessions: LogSession[];
    /** Deleting or importing changes the store; the host reloads from it. */
    onSessionsChanged: () => void;
}

export function LogManager({
    open,
    onOpenChange,
    startImport,
    sessions,
    onSessionsChanged,
}: LogManagerProps) {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [downloaded, setDownloaded] = useState<Set<string>>(new Set());
    const [savedToDisk, setSavedToDisk] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState<"" | "zip" | "json" | "import" | "delete">("");
    const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
    const [status, setStatus] = useState<{ tone: "neutral" | "danger"; text: string } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const workerRef = useRef<Worker | null>(null);
    const importRef = useRef<HTMLInputElement>(null);

    // Newest first, matching the viewer's own ordering.
    const ordered = [...sessions].sort((a, b) => b.startedAt - a.startedAt);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        void (async () => {
            const [archived, onDisk] = await Promise.all([
                getDownloadedSessions(),
                getSavedToDiskSessions(),
            ]);
            if (cancelled) return;
            setDownloaded(archived);
            setSavedToDisk(onDisk);
        })();
        return () => {
            cancelled = true;
        };
    }, [open, sessions]);

    // Drop selections whose session is gone (deleted here, or in another tab).
    useEffect(() => {
        const names = new Set(sessions.map((session) => session.id));
        setSelected((previous) => {
            const next = new Set([...previous].filter((name) => names.has(name)));
            return next.size === previous.size ? previous : next;
        });
    }, [sessions]);

    useEffect(
        () => () => {
            workerRef.current?.terminate();
            workerRef.current = null;
        },
        [],
    );

    // Opened from the viewer's empty state, the window is a step on the way to
    // importing, not the destination — so it goes straight to the file picker.
    useEffect(() => {
        if (!open || !startImport) return;
        importRef.current?.click();
    }, [open, startImport]);

    const selectedNames = ordered.filter((session) => selected.has(session.id)).map((s) => s.id);
    const allSelected = ordered.length > 0 && selected.size === ordered.length;
    const working = busy !== "";

    const toggleAll = useCallback(() => {
        setSelected((previous) =>
            previous.size === ordered.length ? new Set() : new Set(ordered.map((s) => s.id)),
        );
    }, [ordered]);

    const toggleOne = useCallback((name: string) => {
        setSelected((previous) => {
            const next = new Set(previous);
            if (!next.delete(name)) next.add(name);
            return next;
        });
    }, []);

    /** ZIP of the stored HTML, built off the main thread. */
    const exportZip = useCallback(
        (names?: string[]) => {
            if (working) return;
            setBusy("zip");
            setProgress(null);
            setStatus(null);

            workerRef.current?.terminate();
            const worker = new LogsExportWorker();
            workerRef.current = worker;
            const marked = names ?? ordered.map((session) => session.id);

            const finish = () => {
                setBusy("");
                setProgress(null);
                worker.terminate();
                if (workerRef.current === worker) workerRef.current = null;
            };

            worker.onmessage = (event: MessageEvent<LogsExportWorkerResponse>) => {
                const { data } = event;
                if (data.type === "progress") {
                    setProgress({ current: data.current, total: data.total });
                } else if (data.type === "success") {
                    download(data.blob, `logi_${today()}.zip`);
                    finish();
                    void markSessionsDownloaded(marked).then(() =>
                        getDownloadedSessions().then(setDownloaded),
                    );
                } else {
                    console.error("[LogsExport]", data.message);
                    setStatus({ tone: "danger", text: data.message });
                    finish();
                }
            };
            worker.onerror = (error) => {
                console.error("[LogsExport] Worker error:", error);
                setStatus({ tone: "danger", text: "Nie udalo sie przygotowac archiwum." });
                finish();
            };

            worker.postMessage({
                type: "export",
                // Seeded from the class list even with no log pane mounted, so
                // this works from here — see `collectLogStyles`.
                inlineStyles: collectLogStyles(),
                sessionNames: names,
            });
        },
        [working, ordered],
    );

    /** The round trip: JSON out here, JSON back in below. */
    const exportJson = useCallback(async () => {
        if (working || selectedNames.length === 0) return;
        setBusy("json");
        setStatus(null);
        const logsDb = new LogsDatabase();
        try {
            const db = await logsDb.get();
            if (!db) return;
            const data: LogExportData = { version: 1, sessions: {} };
            for (const name of selectedNames) {
                const entries = await getRawSessionData(db, name);
                if (entries.length > 0) data.sessions[name] = entries;
            }
            download(
                new Blob([JSON.stringify(data)], { type: "application/json" }),
                `logi_eksport_${today()}.json`,
            );
        } catch (error) {
            console.error("[LogManager] JSON export failed:", error);
            setStatus({ tone: "danger", text: "Nie udalo sie wyeksportowac sesji." });
        } finally {
            logsDb.release();
            setBusy("");
        }
    }, [working, selectedNames]);

    const importJson = useCallback(
        async (file: File) => {
            setBusy("import");
            setStatus(null);
            const logsDb = new LogsDatabase();
            try {
                let data: LogExportData;
                try {
                    data = JSON.parse(await file.text());
                } catch {
                    setStatus({ tone: "danger", text: "Niepoprawny plik JSON." });
                    return;
                }
                if (data.version !== 1 || !data.sessions || typeof data.sessions !== "object") {
                    setStatus({ tone: "danger", text: "Niepoprawny format pliku eksportu." });
                    return;
                }

                const names = Object.keys(data.sessions);
                if (names.length === 0) {
                    setStatus({ tone: "danger", text: "Plik nie zawiera zadnych sesji." });
                    return;
                }

                const db = await logsDb.get();
                if (!db) return;
                const existing = new Set<string>();
                for (let index = 0; index < db.objectStoreNames.length; index += 1) {
                    const name = db.objectStoreNames.item(index);
                    if (name) existing.add(name);
                }

                const toImport = names.filter((name) => !existing.has(name));
                const skipped = names.length - toImport.length;
                if (toImport.length === 0) {
                    setStatus({
                        tone: "neutral",
                        text: `Pominieto ${skipped} duplikatow. Brak nowych sesji do zaimportowania.`,
                    });
                    return;
                }

                // One upgrade creates every store; the records go in afterwards.
                const upgraded = await logsDb.upgrade((upgradeDb) => {
                    for (const name of toImport) {
                        if (!upgradeDb.objectStoreNames.contains(name)) {
                            upgradeDb.createObjectStore(name, { autoIncrement: true });
                        }
                    }
                });
                for (const name of toImport) {
                    const entries = data.sessions[name];
                    if (!entries || entries.length === 0) continue;
                    await new Promise<void>((resolve, reject) => {
                        const tx = upgraded.transaction(name, "readwrite");
                        const store = tx.objectStore(name);
                        for (const entry of entries) store.add(entry);
                        tx.oncomplete = () => resolve();
                        tx.onerror = () => reject(tx.error);
                    });
                }

                setStatus({
                    tone: "neutral",
                    text: `Zaimportowano ${toImport.length} sesji, pominieto ${skipped} duplikatow.`,
                });
                onSessionsChanged();
            } catch (error) {
                console.error("[LogManager] Import failed:", error);
                setStatus({ tone: "danger", text: "Nie udalo sie zaimportowac pliku." });
            } finally {
                logsDb.release();
                setBusy("");
                if (importRef.current) importRef.current.value = "";
            }
        },
        [onSessionsChanged],
    );

    const deleteSelected = useCallback(async () => {
        setConfirmDelete(false);
        if (selectedNames.length === 0) return;
        setBusy("delete");
        setStatus(null);
        const logsDb = new LogsDatabase();
        try {
            await logsDb.upgrade((upgradeDb) => {
                for (const name of selectedNames) {
                    if (upgradeDb.objectStoreNames.contains(name)) upgradeDb.deleteObjectStore(name);
                }
            });
            setSelected(new Set());
            onSessionsChanged();
        } catch (error) {
            console.error("[LogManager] Delete failed:", error);
            setStatus({ tone: "danger", text: "Nie udalo sie usunac sesji." });
        } finally {
            // Held open, this connection would block the next tab's upgrade.
            logsDb.release();
            setBusy("");
        }
    }, [selectedNames, onSessionsChanged]);

    if (!open) return null;

    const actions = (
        <div className="logs-manage__actions">
            <button
                type="button"
                className="popup-btn popup-btn--control popup-btn--sm"
                disabled={working || selected.size === 0}
                onClick={() => exportZip(selectedNames)}
                title="Archiwum ZIP z zaznaczonych sesji"
            >
                {busy === "zip" && progress
                    ? `${progress.current}/${progress.total}`
                    : `Pobierz ZIP (${selected.size})`}
            </button>
            <button
                type="button"
                className="popup-btn popup-btn--control popup-btn--sm"
                disabled={working || ordered.length === 0}
                onClick={() => exportZip()}
                title="Archiwum ZIP ze wszystkich sesji"
            >
                Pobierz wszystkie
            </button>
            <button
                type="button"
                className="popup-btn popup-btn--control popup-btn--sm"
                disabled={working || ordered.length === 0}
                onClick={() =>
                    setSelected(
                        new Set(
                            ordered
                                .filter((session) => !downloaded.has(session.id))
                                .map((session) => session.id),
                        ),
                    )
                }
            >
                Zaznacz niepobrane
            </button>
            <div className="logs-manage__spacer" />
            <button
                type="button"
                className="popup-btn popup-btn--control popup-btn--sm"
                disabled={working || selected.size === 0}
                onClick={() => void exportJson()}
                title="Eksport do pliku, ktory mozna zaimportowac z powrotem"
            >
                {busy === "json" ? "Eksportowanie..." : `Eksport JSON (${selected.size})`}
            </button>
            <button
                type="button"
                className="popup-btn popup-btn--control popup-btn--sm popup-btn--solid"
                disabled={working}
                onClick={() => importRef.current?.click()}
            >
                {busy === "import" ? "Importowanie..." : "Importuj"}
            </button>
            <input
                ref={importRef}
                type="file"
                accept=".json"
                className="logs-manage__file"
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void importJson(file);
                }}
            />
            <button
                type="button"
                className="popup-btn popup-btn--control popup-btn--sm popup-btn--danger popup-btn--ghost"
                disabled={working || selected.size === 0}
                onClick={() => setConfirmDelete(true)}
            >
                {busy === "delete" ? "Usuwanie..." : `Usun (${selected.size})`}
            </button>
        </div>
    );

    return (
        <>
            <SubDialog
                title="Zarzadzanie logami"
                size="lg"
                onClose={() => onOpenChange(false)}
                footer={actions}
            >
                {status ? (
                    <div
                        className={`popup-notice logs-manage__status${status.tone === "danger" ? " popup-notice--danger" : ""}`}
                    >
                        {status.text}
                    </div>
                ) : null}

                {ordered.length === 0 ? (
                    <p className="popup-muted logs-manage__empty">
                        Nie ma jeszcze zadnego logu. Uzyj „Importuj”, zeby wczytac je z pliku eksportu.
                    </p>
                ) : (
                    <div className="logs-manage__table-box">
                        <table className="popup-table logs-manage__table">
                            <thead>
                                <tr>
                                    <th className="logs-manage__pick">
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            onChange={toggleAll}
                                        />
                                    </th>
                                    <th>Sesja</th>
                                    <th>Od–Do</th>
                                    <th className="logs-manage__num">Linie</th>
                                    <th className="logs-manage__flag" title="Pobrano archiwum">
                                        ZIP
                                    </th>
                                    <th className="logs-manage__flag" title="Zapisano na dysk">
                                        Dysk
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {ordered.map((session, index) => {
                                    const year = sessionYear(session);
                                    const newYear = index === 0 || sessionYear(ordered[index - 1]) !== year;
                                    return (
                                        <Fragment key={session.id}>
                                            {newYear ? (
                                                <tr className="logs-manage__year">
                                                    <td colSpan={6}>{year}</td>
                                                </tr>
                                            ) : null}
                                            <tr
                                                data-selected={selected.has(session.id)}
                                                onClick={() => toggleOne(session.id)}
                                            >
                                                <td
                                                    className="logs-manage__pick"
                                                    onClick={(event) => event.stopPropagation()}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selected.has(session.id)}
                                                        onChange={() => toggleOne(session.id)}
                                                    />
                                                </td>
                                                <td>
                                                    {session.characters.length > 0
                                                        ? session.characters.join(", ")
                                                        : session.dateLabel}
                                                </td>
                                                <td className="logs-manage__span">{spanLabel(session)}</td>
                                                <td className="logs-manage__num">{session.lines.length}</td>
                                                <td className="logs-manage__flag">
                                                    {downloaded.has(session.id) ? "✓" : ""}
                                                </td>
                                                <td className="logs-manage__flag">
                                                    {savedToDisk.has(session.id) ? "✓" : ""}
                                                </td>
                                            </tr>
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </SubDialog>

            {confirmDelete ? (
                <SubDialog
                    title="Usunac zaznaczone logi?"
                    size="sm"
                    onClose={() => setConfirmDelete(false)}
                    footer={
                        <>
                            <button
                                type="button"
                                className="popup-btn popup-btn--control popup-btn--sm"
                                onClick={() => setConfirmDelete(false)}
                            >
                                Anuluj
                            </button>
                            <button
                                type="button"
                                className="popup-btn popup-btn--control popup-btn--sm popup-btn--danger popup-btn--ghost"
                                onClick={() => void deleteSelected()}
                            >
                                Usun
                            </button>
                        </>
                    }
                >
                    {`Zaznaczonych sesji: ${selected.size}. Tej operacji nie da sie cofnac.`}
                </SubDialog>
            ) : null}
        </>
    );
}
