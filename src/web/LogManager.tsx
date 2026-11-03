/**
 * Session management for the in-client log browser: Logi → Zarządzaj.
 *
 * Everything here is about the *store*, not about reading a log: exporting
 * logs (as HTML, text and/or importable JSON), archiving them (export, then
 * delete from the browser), importing them back, and deleting the ones that
 * are no longer wanted. The standalone page deliberately has none of it — it
 * reads logs and never writes to the database — so this is the one place in
 * the client where a log can be removed or restored.
 *
 * The session list comes in already indexed (`LogSessionInfo[]`); sizes come
 * from the storage scan (`storage/storageScan.ts`), which reads only logs it
 * has not measured yet.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatClock, type LogSessionInfo } from "@ui/logViewer";
import { Check, FileCode2, FileJson, FileText, type LucideIcon } from "lucide-react";
import { Button, Check as CheckBox, Input, Notice, Select } from "@web-ui/primitives/index.ts";
import SubDialog from "./SubDialog";
import { EXPORT_FORMATS, type ExportFormat, type LogsExportWorkerResponse } from "./logsExport.shared";
import LogsExportWorker from "./logsExport.worker?worker";
import { collectLogStyles } from "./logBrowserUtils";
import { getSavedToDiskSessions } from "./logFileSaver";
import { countSessions, deleteSessions, LogsDatabase, writeSession } from "./logsDatabase";
import {
    dayToTime,
    getDownloadedFormats,
    ImportError,
    markDownloaded,
    presetRange,
    RANGE_PRESETS,
    readExportFile,
    sessionsInRange,
    timeToDay,
    type DownloadedFormats,
    type RangePreset,
} from "./logsArchive";
import { formatBytes } from "./storage/formatBytes";
import { PersistenceNotice } from "./storage/PersistenceNotice";
import { knownLogSizes, scanStorage, type LogSize } from "./storage/storageScan";

// --- helpers --------------------------------------------------------------

function download(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

function sessionYear(session: LogSessionInfo): number {
    return new Date(session.startedAt).getFullYear();
}

/** "14.09 20:31 - 22:04", collapsing the date when it does not change. */
function spanLabel(session: LogSessionInfo): string {
    const start = new Date(session.startedAt);
    const end = new Date(session.endedAt);
    const day = (date: Date) =>
        `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
    const from = `${day(start)} ${formatClock(session.startedAt)}`;
    const to = day(start) === day(end) ? formatClock(session.endedAt) : `${day(end)} ${formatClock(session.endedAt)}`;
    return `${from} - ${to}`;
}

const FORMAT_LABELS: Record<ExportFormat, { label: string; description: string; icon: LucideIcon }> = {
    html: { label: "HTML", description: "do czytania w przeglądarce, z kolorami", icon: FileCode2 },
    txt: { label: "TXT", description: "zwykły tekst z czasem każdej linii", icon: FileText },
    json: { label: "JSON", description: "do ponownego wczytania w Logi", icon: FileJson },
};

/** Which logs the list shows, by what they have been downloaded as. */
type DownloadFilter = "any" | "none" | ExportFormat;

const DOWNLOAD_FILTERS: { value: DownloadFilter; label: string }[] = [
    { value: "any", label: "Wszystkie" },
    { value: "none", label: "Niepobrane" },
    { value: "html", label: "Bez HTML" },
    { value: "txt", label: "Bez TXT" },
    { value: "json", label: "Bez JSON" },
];

function passesFilter(formats: DownloadedFormats | undefined, filter: DownloadFilter): boolean {
    if (filter === "any") return true;
    if (filter === "none") return !formats || Object.keys(formats).length === 0;
    return !formats?.[filter];
}

/** Total size of `names`, and whether any of them is not measured yet. */
function sizeOf(names: Iterable<string>, sizes: Record<string, LogSize>): { bytes: number; partial: boolean } {
    let bytes = 0;
    let partial = false;
    for (const name of names) {
        const size = sizes[name];
        if (size) bytes += size.bytes;
        else partial = true;
    }
    return { bytes, partial };
}

// --- The manager --------------------------------------------------------------

export interface LogManagerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Opens the file picker as soon as the window appears. */
    startImport?: boolean;
    sessions: LogSessionInfo[];
    /** The log being recorded: never archived, marked in the list. */
    liveSessionId?: string;
    /** Deleting or importing changes the store; the host reloads from it. */
    onSessionsChanged: () => void;
}

/** The export creator's state while it is open; `deleting` once the file is handed over. */
interface ExportState {
    formats: Set<ExportFormat>;
    archive: boolean;
    progress: { current: number; total: number } | null;
    /**
     * The ZIP is out: these are the logs to delete, if the player confirms.
     * `verified` when the client wrote the file itself (the save picker), so
     * it is known to be on disk; a download only reached the browser.
     */
    downloaded: { names: string[]; fileName: string; verified: boolean; size: string } | null;
    error: string | null;
}

export function LogManager({
    open,
    onOpenChange,
    startImport,
    sessions,
    liveSessionId,
    onSessionsChanged,
}: LogManagerProps) {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [downloaded, setDownloaded] = useState<Map<string, DownloadedFormats>>(new Map());
    const [savedToDisk, setSavedToDisk] = useState<Set<string>>(new Set());
    const [sizes, setSizes] = useState<Record<string, LogSize>>(() => knownLogSizes());
    const [measuring, setMeasuring] = useState(false);
    const [preset, setPreset] = useState<RangePreset>("all");
    const [customFrom, setCustomFrom] = useState("");
    const [customTo, setCustomTo] = useState("");
    const [filter, setFilter] = useState<DownloadFilter>("any");
    const [busy, setBusy] = useState<"" | "export" | "import" | "delete">("");
    const [status, setStatus] = useState<{ tone: "neutral" | "danger"; text: string } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [exporting, setExporting] = useState<ExportState | null>(null);
    const workerRef = useRef<Worker | null>(null);
    const importRef = useRef<HTMLInputElement>(null);

    // Newest first, matching the viewer's own ordering.
    const ordered = useMemo(() => [...sessions].sort((a, b) => b.startedAt - a.startedAt), [sessions]);

    const range = useMemo(
        () =>
            preset === "custom"
                ? { from: dayToTime(customFrom), to: dayToTime(customTo, true) }
                : presetRange(preset, Date.now()),
        [preset, customFrom, customTo],
    );

    /** The logs the list shows: in the range, passing the filter. The live one shows with "Wszystkie". */
    const visible = useMemo(() => {
        const inRange = new Set(sessionsInRange(ordered, range, preset === "all" ? undefined : liveSessionId).map((s) => s.id));
        return ordered.filter((session) => inRange.has(session.id) && passesFilter(downloaded.get(session.id), filter));
    }, [ordered, range, preset, liveSessionId, downloaded, filter]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        void Promise.all([getDownloadedFormats(), getSavedToDiskSessions()]).then(([formats, onDisk]) => {
            if (cancelled) return;
            setDownloaded(formats);
            setSavedToDisk(onDisk);
        });
        return () => {
            cancelled = true;
        };
    }, [open, sessions]);

    // Sizes: what was measured before at once, then a scan of the logs not measured yet.
    useEffect(() => {
        if (!open) return;
        const controller = new AbortController();
        setMeasuring(true);
        scanStorage({ logsOnly: true, signal: controller.signal })
            .then((result) => setSizes(result.logSizes))
            .catch((error: unknown) => {
                if (!controller.signal.aborted) console.error("[LogManager] Measuring logs failed:", error);
            })
            .finally(() => {
                if (!controller.signal.aborted) setMeasuring(false);
            });
        return () => controller.abort();
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

    /** A range or filter picked: the logs it shows become the selection (never the live one). */
    const selectVisibleOf = useCallback(
        (nextPreset: RangePreset, nextFilter: DownloadFilter, from = customFrom, to = customTo) => {
            const nextRange =
                nextPreset === "custom" ? { from: dayToTime(from), to: dayToTime(to, true) } : presetRange(nextPreset, Date.now());
            const names = sessionsInRange(ordered, nextRange, liveSessionId)
                .filter((session) => passesFilter(downloaded.get(session.id), nextFilter))
                .map((session) => session.id);
            setSelected(new Set(names));
        },
        [ordered, liveSessionId, downloaded, customFrom, customTo],
    );

    const selectedNames = ordered.filter((session) => selected.has(session.id)).map((s) => s.id);
    const allVisibleSelected = visible.length > 0 && visible.every((session) => selected.has(session.id));
    const working = busy !== "";
    const selection = sizeOf(selectedNames, sizes);
    const shown = sizeOf(
        visible.map((session) => session.id),
        sizes,
    );

    const toggleVisible = useCallback(() => {
        setSelected((previous) => {
            const next = new Set(previous);
            if (visible.every((session) => next.has(session.id))) {
                for (const session of visible) next.delete(session.id);
            } else {
                for (const session of visible) next.add(session.id);
            }
            return next;
        });
    }, [visible]);

    const toggleOne = useCallback((name: string) => {
        setSelected((previous) => {
            const next = new Set(previous);
            if (!next.delete(name)) next.add(name);
            return next;
        });
    }, []);

    const openExport = () => {
        setStatus(null);
        setExporting({ formats: new Set(["html", "json"]), archive: false, progress: null, downloaded: null, error: null });
    };

    /** Builds the ZIP off the main thread; resolves with it, or rejects with a message to show. */
    const buildArchive = useCallback(
        (names: string[], formats: ExportFormat[]): Promise<{ blob: Blob; exported: string[] }> =>
            new Promise((resolve, reject) => {
                workerRef.current?.terminate();
                const worker = new LogsExportWorker();
                workerRef.current = worker;
                const finish = () => {
                    worker.terminate();
                    if (workerRef.current === worker) workerRef.current = null;
                };
                worker.onmessage = (event: MessageEvent<LogsExportWorkerResponse>) => {
                    const { data } = event;
                    if (data.type === "progress") {
                        setExporting((state) =>
                            state ? { ...state, progress: { current: data.current, total: data.total } } : state,
                        );
                    } else if (data.type === "success") {
                        finish();
                        resolve({ blob: data.blob, exported: data.exported });
                    } else {
                        console.error("[LogsExport]", data.message);
                        finish();
                        reject(new Error(data.message));
                    }
                };
                worker.onerror = (error) => {
                    console.error("[LogsExport] Worker error:", error);
                    finish();
                    reject(new Error("Nie udało się przygotować archiwum."));
                };
                worker.postMessage({
                    type: "export",
                    // Seeded from the class list even with no log pane mounted, so
                    // this works from here — see `collectLogStyles`.
                    inlineStyles: collectLogStyles(),
                    sessionNames: names,
                    formats,
                });
            }),
        [],
    );

    /**
     * Exports the selection. Where the browser has a save picker (Chromium), the
     * player picks the file first (it must open on the click itself) and the
     * client writes it, so it knows the file is on disk; elsewhere the ZIP is a
     * download, which no page can confirm was saved.
     */
    const runExport = useCallback(async () => {
        if (!exporting || working || selectedNames.length === 0 || exporting.formats.size === 0) return;
        const formats = EXPORT_FORMATS.filter((format) => exporting.formats.has(format));
        const archive = exporting.archive;
        const names = selectedNames;
        const suggested = `${archive ? "logi_archiwum" : "logi"}_${today()}.zip`;

        let target: FileSystemFileHandle | null = null;
        if (typeof window.showSaveFilePicker === "function") {
            try {
                target = await window.showSaveFilePicker({
                    id: "arkadia-logs-export",
                    suggestedName: suggested,
                    startIn: "downloads",
                    types: [{ description: "Archiwum ZIP", accept: { "application/zip": [".zip"] } }],
                });
            } catch (error) {
                // Cancelled: nothing is exported. Refused for another reason
                // (an embedded page, a policy): a plain download instead.
                if (error instanceof DOMException && error.name === "AbortError") return;
                target = null;
            }
        }

        setBusy("export");
        setExporting({ ...exporting, progress: { current: 0, total: names.length }, error: null });
        let built: { blob: Blob; exported: string[] };
        try {
            built = await buildArchive(names, formats);
        } catch (error) {
            setBusy("");
            setExporting((state) =>
                state ? { ...state, progress: null, error: error instanceof Error ? error.message : String(error) } : state,
            );
            return;
        }

        let fileName = suggested;
        let verified = false;
        if (target) {
            try {
                const writable = await target.createWritable();
                await writable.write(built.blob);
                await writable.close();
                fileName = target.name;
                verified = true;
            } catch (error) {
                console.error("[LogManager] Writing the archive failed:", error);
                setBusy("");
                setExporting((state) =>
                    state ? { ...state, progress: null, error: "Nie udało się zapisać pliku. Logi zostają w przeglądarce." } : state,
                );
                return;
            }
        } else {
            download(built.blob, fileName);
        }
        setBusy("");

        void markDownloaded(built.exported, formats).then(() => getDownloadedFormats().then(setDownloaded));
        const size = formatBytes(built.blob.size);
        if (archive) {
            const toDelete = built.exported.filter((name) => name !== liveSessionId);
            setExporting((state) =>
                state ? { ...state, progress: null, downloaded: { names: toDelete, fileName, verified, size } } : state,
            );
        } else {
            setExporting(null);
            setStatus({
                tone: "neutral",
                text: `${verified ? "Zapisano" : "Pobrano"} ${fileName} (${size}): ${built.exported.length} logów.`,
            });
        }
    }, [exporting, working, selectedNames, liveSessionId, buildArchive]);

    const removeSessions = useCallback(
        async (names: string[]): Promise<boolean> => {
            if (names.length === 0) return true;
            setBusy("delete");
            const logsDb = new LogsDatabase();
            try {
                const db = await logsDb.get();
                if (!db) throw new Error("Logs database is unavailable");
                await deleteSessions(db, names);
                setSelected(new Set());
                onSessionsChanged();
                return true;
            } catch (error) {
                console.error("[LogManager] Delete failed:", error);
                setStatus({ tone: "danger", text: "Nie udało się usunąć sesji." });
                return false;
            } finally {
                logsDb.release();
                setBusy("");
            }
        },
        [onSessionsChanged],
    );

    const finishArchive = useCallback(async () => {
        const done = exporting?.downloaded;
        if (!done) return;
        const freed = sizeOf(done.names, sizes);
        if (await removeSessions(done.names)) {
            setExporting(null);
            setStatus({
                tone: "neutral",
                text: `Zarchiwizowano ${done.names.length} logów do ${done.fileName}${freed.bytes > 0 ? `, zwolniono ~${formatBytes(freed.bytes)}` : ""}.`,
            });
        }
    }, [exporting, sizes, removeSessions]);

    const importFile = useCallback(
        async (file: File) => {
            setBusy("import");
            setStatus(null);
            const logsDb = new LogsDatabase();
            try {
                const imported = await readExportFile(file);
                const names = Object.keys(imported);
                if (names.length === 0) {
                    setStatus({ tone: "danger", text: "Plik nie zawiera żadnych sesji." });
                    return;
                }

                const db = await logsDb.get();
                if (!db) return;
                const existing = new Set((await countSessions(db)).keys());

                const toImport = names.filter((name) => !existing.has(name));
                const skipped = names.length - toImport.length;
                if (toImport.length === 0) {
                    setStatus({
                        tone: "neutral",
                        text: `Pominięto ${skipped} duplikatów. Brak nowych sesji do zaimportowania.`,
                    });
                    return;
                }

                for (const name of toImport) {
                    const entries = imported[name];
                    if (!entries || entries.length === 0) continue;
                    await writeSession(
                        db,
                        name,
                        entries.map((entry, seq) => ({ seq, entry })),
                    );
                }

                setStatus({
                    tone: "neutral",
                    text: `Zaimportowano ${toImport.length} sesji, pominięto ${skipped} duplikatów.`,
                });
                onSessionsChanged();
            } catch (error) {
                if (error instanceof ImportError) {
                    setStatus({ tone: "danger", text: error.message });
                } else {
                    console.error("[LogManager] Import failed:", error);
                    setStatus({ tone: "danger", text: "Nie udało się zaimportować pliku." });
                }
            } finally {
                logsDb.release();
                setBusy("");
                if (importRef.current) importRef.current.value = "";
            }
        },
        [onSessionsChanged],
    );

    if (!open) return null;

    const sizeLabel = (size: { bytes: number; partial: boolean }) =>
        size.bytes > 0 || !size.partial ? `~${formatBytes(size.bytes)}${size.partial ? "+" : ""}` : "…";

    const toolbar = (
        <div className="logs-manage__toolbar">
            <label className="logs-manage__control">
                <span>Zakres</span>
                <Select
                    id="logs-manage-range"
                    value={preset}
                    onChange={(event) => {
                        const next = event.target.value as RangePreset;
                        setPreset(next);
                        let from = customFrom;
                        let to = customTo;
                        if (next === "custom" && !customFrom && !customTo && ordered.length > 0) {
                            // A starting point: the whole span of the logs there are.
                            from = timeToDay(ordered[ordered.length - 1].startedAt);
                            to = timeToDay(ordered[0].startedAt);
                            setCustomFrom(from);
                            setCustomTo(to);
                        }
                        selectVisibleOf(next, filter, from, to);
                    }}
                >
                    {RANGE_PRESETS.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </Select>
            </label>
            {preset === "custom" ? (
                <>
                    <label className="logs-manage__control">
                        <span>Od</span>
                        <Input
                            type="date"
                            id="logs-manage-from"
                            value={customFrom}
                            onChange={(event) => {
                                setCustomFrom(event.target.value);
                                selectVisibleOf("custom", filter, event.target.value, customTo);
                            }}
                        />
                    </label>
                    <label className="logs-manage__control">
                        <span>Do</span>
                        <Input
                            type="date"
                            id="logs-manage-to"
                            value={customTo}
                            onChange={(event) => {
                                setCustomTo(event.target.value);
                                selectVisibleOf("custom", filter, customFrom, event.target.value);
                            }}
                        />
                    </label>
                </>
            ) : null}
            <label className="logs-manage__control">
                <span>Pobrane</span>
                <Select
                    id="logs-manage-filter"
                    value={filter}
                    onChange={(event) => {
                        const next = event.target.value as DownloadFilter;
                        setFilter(next);
                        selectVisibleOf(preset, next);
                    }}
                >
                    {DOWNLOAD_FILTERS.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </Select>
            </label>
        </div>
    );

    const summary = (
        <p className="logs-manage__summary popup-muted">
            <span>
                Widoczne: {visible.length} · {sizeLabel(shown)}
            </span>
            <span className="logs-manage__summary-selected">
                Zaznaczone: {selectedNames.length} · {sizeLabel(selection)}
            </span>
            {measuring ? <span>liczenie rozmiarów…</span> : null}
        </p>
    );

    const actions = (
        <div className="logs-manage__actions">
            <Button
                variant="solid"
                size="sm"
                id="logs-manage-export"
                disabled={working || selected.size === 0}
                onClick={openExport}
                title="Pobierz zaznaczone logi jako HTML, TXT i/lub JSON; opcjonalnie usuń je potem z przeglądarki"
            >
                {`Eksportuj (${selected.size})…`}
            </Button>
            <div className="logs-manage__spacer" />
            <Button
                size="sm"
                disabled={working}
                onClick={() => importRef.current?.click()}
                title="Wczytaj logi z pliku JSON albo z archiwum ZIP z formatem JSON"
            >
                {busy === "import" ? "Importowanie..." : "Importuj"}
            </Button>
            <input
                ref={importRef}
                type="file"
                accept=".json,.zip,application/json,application/zip"
                className="logs-manage__file"
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void importFile(file);
                }}
            />
            <Button
                variant="danger"
                size="sm"
                className="popup-btn--ghost"
                disabled={working || selected.size === 0}
                onClick={() => setConfirmDelete(true)}
            >
                {busy === "delete" && !exporting ? "Usuwanie..." : `Usuń (${selected.size})`}
            </Button>
        </div>
    );

    return (
        <>
            <SubDialog title="Zarządzanie logami" size="lg" onClose={() => onOpenChange(false)} footer={actions}>
                {status ? (
                    <div
                        className={`popup-notice logs-manage__status${status.tone === "danger" ? " popup-notice--danger" : ""}`}
                    >
                        {status.text}
                    </div>
                ) : null}

                <PersistenceNotice />

                {ordered.length === 0 ? (
                    <p className="popup-muted logs-manage__empty">
                        Nie ma jeszcze żadnego logu. Użyj „Importuj”, żeby wczytać je z pliku eksportu.
                    </p>
                ) : (
                    <>
                        {toolbar}
                        {summary}
                        <div className="logs-manage__table-box">
                            <table className="popup-table logs-manage__table">
                                <thead>
                                    <tr>
                                        <th className="logs-manage__pick">
                                            <input
                                                type="checkbox"
                                                checked={allVisibleSelected}
                                                onChange={toggleVisible}
                                                title="Zaznacz widoczne"
                                            />
                                        </th>
                                        <th>Sesja</th>
                                        <th>Od–Do</th>
                                        <th className="logs-manage__num">Linie</th>
                                        <th className="logs-manage__num">Rozmiar</th>
                                        <th title="Pobrano jako">Pobrano</th>
                                        <th className="logs-manage__flag" title="Zapisano na dysk">
                                            Dysk
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visible.length === 0 ? (
                                        <tr className="logs-manage__none">
                                            <td colSpan={7}>Żaden log nie pasuje do zakresu i filtra.</td>
                                        </tr>
                                    ) : null}
                                    {visible.map((session, index) => {
                                        const year = sessionYear(session);
                                        const newYear = index === 0 || sessionYear(visible[index - 1]) !== year;
                                        const formats = downloaded.get(session.id);
                                        const size = sizes[session.id];
                                        return (
                                            <Fragment key={session.id}>
                                                {newYear ? (
                                                    <tr className="logs-manage__year">
                                                        <td colSpan={7}>{year}</td>
                                                    </tr>
                                                ) : null}
                                                <tr
                                                    data-session={session.id}
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
                                                        {session.id === liveSessionId ? (
                                                            <span className="logs-manage__live" title="Ten log jest właśnie nagrywany">
                                                                nagrywany
                                                            </span>
                                                        ) : null}
                                                    </td>
                                                    <td className="logs-manage__span">{spanLabel(session)}</td>
                                                    <td className="logs-manage__num">{session.lineCount}</td>
                                                    <td className="logs-manage__num">
                                                        {size ? `~${formatBytes(size.bytes)}` : measuring ? "…" : ""}
                                                    </td>
                                                    <td className="logs-manage__formats">
                                                        {/* Every format has its slot, shown or not, so the
                                                            column is as wide as three badges from the start and
                                                            a download does not resize the window. */}
                                                        {EXPORT_FORMATS.map((format) => {
                                                            const at = formats?.[format];
                                                            return (
                                                                <span
                                                                    key={format}
                                                                    className="logs-manage__badge"
                                                                    data-format={format}
                                                                    data-empty={!at}
                                                                    title={at ? `Pobrano jako ${FORMAT_LABELS[format].label}: ${new Date(at).toLocaleString("pl-PL")}` : undefined}
                                                                >
                                                                    {FORMAT_LABELS[format].label}
                                                                </span>
                                                            );
                                                        })}
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
                    </>
                )}
            </SubDialog>

            {exporting ? (
                <ExportDialog
                    state={exporting}
                    count={selectedNames.length}
                    size={sizeLabel(selection)}
                    includesLive={!!liveSessionId && selected.has(liveSessionId)}
                    busy={busy}
                    onChange={(next) => setExporting({ ...exporting, ...next })}
                    onRun={() => void runExport()}
                    onDelete={() => void finishArchive()}
                    onClose={() => {
                        if (busy === "export") {
                            workerRef.current?.terminate();
                            workerRef.current = null;
                            setBusy("");
                        }
                        setExporting(null);
                    }}
                />
            ) : null}

            {confirmDelete ? (
                <SubDialog
                    title="Usunąć zaznaczone logi?"
                    size="sm"
                    onClose={() => setConfirmDelete(false)}
                    footer={
                        <>
                            <Button size="sm" onClick={() => setConfirmDelete(false)}>
                                Anuluj
                            </Button>
                            <Button
                                variant="danger"
                                size="sm"
                                className="popup-btn--ghost"
                                onClick={() => {
                                    setConfirmDelete(false);
                                    void removeSessions(selectedNames);
                                }}
                            >
                                Usuń
                            </Button>
                        </>
                    }
                >
                    {`Zaznaczonych sesji: ${selected.size} (${sizeLabel(selection)}). Tej operacji nie da się cofnąć; jeśli chcesz je zachować, użyj „Eksportuj” z usuwaniem po pobraniu.`}
                </SubDialog>
            ) : null}
        </>
    );
}

/**
 * The export creator: which formats, and whether to delete the logs from the
 * browser once the file is saved. Deleting is its own step after the download,
 * as nothing here can tell that the file was really saved.
 */
function ExportDialog({
    state,
    count,
    size,
    includesLive,
    busy,
    onChange,
    onRun,
    onDelete,
    onClose,
}: {
    state: ExportState;
    count: number;
    size: string;
    includesLive: boolean;
    busy: string;
    onChange: (next: Partial<ExportState>) => void;
    onRun: () => void;
    onDelete: () => void;
    onClose: () => void;
}) {
    if (state.downloaded) {
        const { names, fileName, verified, size } = state.downloaded;
        return (
            <SubDialog
                title={verified ? "Plik zapisany. Usunąć logi z przeglądarki?" : "Usunąć pobrane logi z przeglądarki?"}
                size="sm"
                onClose={onClose}
                footer={
                    <>
                        <Button size="sm" onClick={onClose}>
                            Zostaw w przeglądarce
                        </Button>
                        <Button
                            variant="danger"
                            size="sm"
                            id="logs-archive-delete"
                            disabled={busy === "delete" || names.length === 0}
                            onClick={onDelete}
                        >
                            {busy === "delete" ? "Usuwanie..." : `Usuń ${names.length} logów`}
                        </Button>
                    </>
                }
            >
                {verified ? (
                    <p className="logs-export__text">
                        Zapisano <strong>{fileName}</strong> ({size}). Logi są w tym pliku, więc można je usunąć z
                        przeglądarki; tego nie da się cofnąć.
                    </p>
                ) : (
                    <p className="logs-export__text">
                        Plik <strong>{fileName}</strong> ({size}) został przekazany przeglądarce, ale strona nie może
                        sprawdzić, czy naprawdę się zapisał (zapis mógł zostać anulowany). Sprawdź go w pobranych plikach,
                        zanim usuniesz logi: tego nie da się cofnąć.
                    </p>
                )}
                {includesLive ? (
                    <p className="popup-muted logs-export__text">Log nagrywany teraz zostaje w przeglądarce.</p>
                ) : null}
            </SubDialog>
        );
    }

    const toggleFormat = (format: ExportFormat) => {
        const formats = new Set(state.formats);
        if (!formats.delete(format)) formats.add(format);
        onChange({ formats });
    };
    const running = busy === "export";

    return (
        <SubDialog
            title="Eksport logów"
            size="sm"
            onClose={onClose}
            footer={
                <>
                    <Button size="sm" onClick={onClose}>
                        Anuluj
                    </Button>
                    <Button
                        variant={state.archive ? "danger" : "solid"}
                        size="sm"
                        id="logs-export-run"
                        disabled={running || state.formats.size === 0 || count === 0}
                        onClick={onRun}
                    >
                        {running && state.progress
                            ? `${state.progress.current}/${state.progress.total}`
                            : state.archive
                              ? "Pobierz, potem usuń"
                              : "Pobierz ZIP"}
                    </Button>
                </>
            }
        >
            <p className="logs-export__text">
                Zaznaczone logi: <strong>{count}</strong> · {size}
            </p>
            <div className="logs-export__formats">
                {EXPORT_FORMATS.map((format) => {
                    const Icon = FORMAT_LABELS[format].icon;
                    const on = state.formats.has(format);
                    return (
                        <label key={format} className="logs-export__format" data-format={format} data-on={on}>
                            <input
                                type="checkbox"
                                id={`logs-export-${format}`}
                                className="logs-export__format-input"
                                checked={on}
                                disabled={running}
                                onChange={() => toggleFormat(format)}
                            />
                            <span className="logs-export__format-check">{on ? <Check size={12} strokeWidth={3} /> : null}</span>
                            <Icon className="logs-export__format-icon" size={28} strokeWidth={1.6} />
                            <span className="logs-export__format-name">{FORMAT_LABELS[format].label}</span>
                            <span className="logs-export__format-text">{FORMAT_LABELS[format].description}</span>
                        </label>
                    );
                })}
            </div>
            <CheckBox
                id="logs-export-archive"
                className="logs-export__archive"
                checked={state.archive}
                disabled={running}
                onChange={() => onChange({ archive: !state.archive })}
                label={
                    <>
                        <strong>Usuń z przeglądarki po pobraniu</strong>{" "}
                        <span className="popup-muted">(archiwizuj, żeby zwolnić miejsce)</span>
                    </>
                }
            />
            {state.archive && !state.formats.has("json") ? (
                <Notice variant="warning">
                    Bez JSON zarchiwizowanych logów nie da się później wczytać z powrotem do Logi.
                </Notice>
            ) : null}
            {state.archive && includesLive ? (
                <p className="popup-muted logs-export__text">Log nagrywany teraz zostanie pobrany, ale nie usunięty.</p>
            ) : null}
            {state.error ? <Notice variant="danger">{state.error}</Notice> : null}
        </SubDialog>
    );
}
