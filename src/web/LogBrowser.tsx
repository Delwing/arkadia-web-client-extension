import { useState, useEffect, useRef, useCallback, useMemo, Fragment, type RefObject, type MouseEvent as ReactMouseEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { globalStorage } from "@modules/core/storage";
import type { LogsExportWorkerResponse, LogExportData } from "./logsExport.shared";
import LogsExportWorker from "./logsExport.worker?worker";
import { LogTimeline, type TimeRange } from "./LogTimeline";
import { isFileSaveSupported, isFileSaveActive, enableFileSave, disableFileSave, getDirectoryName, onStatusChange, getSavedToDiskSessions } from "./logFileSaver";
import {
  type LogEntry,
  type FlatLogLine,
  type SessionInfo,
  type LineMatch,
  type SearchResult,
  type SearchSessionGroup,
  formatDateTime,
  formatSessionLabel,
  formatSessionFileName,
  getSessionYear,
  collectLogStyles,
  splitLines,
  parseSearchQuery,
  normalizeFlags,
  flattenLogGroups,
  openDb,
  getRawSessionData,
  getSessionData,
} from "./logBrowserUtils";
import { downloadLogAsImage } from "./logToImage";

// --- Downloaded status persistence via separate IndexedDB ---

function openMetaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("ArkadiaLogsMetaDB", 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("downloaded")) {
        db.createObjectStore("downloaded");
      }
      if (!db.objectStoreNames.contains("fileSaveDir")) {
        db.createObjectStore("fileSaveDir");
      }
      if (!db.objectStoreNames.contains("savedToDisk")) {
        db.createObjectStore("savedToDisk");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getDownloadedSessions(): Promise<Set<string>> {
  const db = await openMetaDb();
  return new Promise((resolve) => {
    const tx = db.transaction("downloaded", "readonly");
    const req = tx.objectStore("downloaded").getAllKeys();
    req.onsuccess = () => resolve(new Set(req.result as string[]));
    req.onerror = () => resolve(new Set());
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
    for (const name of names) {
      store.put({ downloadedAt: now }, name);
    }
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// --- Session summary helpers ---

interface SessionSummary {
  count: number;
  firstTs: number;
  lastTs: number;
}

function formatDateShort(d: Date): string {
  const da = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${da}.${mo}`;
}

function formatTimeShort(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function formatDateTimeRange(firstTs: number, lastTs: number): string {
  const a = new Date(firstTs);
  const b = new Date(lastTs);
  const from = `${formatDateShort(a)} ${formatTimeShort(a)}`;
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()) {
    return `${from} – ${formatTimeShort(b)}`;
  }
  return `${from} – ${formatDateShort(b)} ${formatTimeShort(b)}`;
}

async function getSessionSummary(db: IDBDatabase, storeName: string): Promise<SessionSummary | null> {
  return new Promise(resolve => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(storeName, "readonly");
    } catch {
      resolve(null);
      return;
    }
    const store = tx.objectStore(storeName);
    const countReq = store.count();
    let count = 0;
    let firstTs = 0;
    let lastTs = 0;

    countReq.onsuccess = () => {
      count = countReq.result;
      if (count === 0) {
        resolve(null);
        return;
      }

      const fwdReq = store.openCursor();
      fwdReq.onsuccess = () => {
        const cursor = fwdReq.result;
        if (cursor) {
          firstTs = (cursor.value as LogEntry).timestamp;
        }

        const bwdReq = store.openCursor(null, "prev");
        bwdReq.onsuccess = () => {
          const cursor2 = bwdReq.result;
          if (cursor2) {
            lastTs = (cursor2.value as LogEntry).timestamp;
          }
          resolve({ count, firstTs, lastTs });
        };
        bwdReq.onerror = () => resolve({ count, firstTs, lastTs });
      };
      fwdReq.onerror = () => resolve(null);
    };
    countReq.onerror = () => resolve(null);
  });
}

// --- LogManager component ---

function collectInlineStyles(): string {
  return collectLogStyles();
}

function LogManager({
  dbRef,
  sessions,
  onSessionsChanged,
  onViewSession,
}: {
  dbRef: RefObject<IDBDatabase | null>;
  sessions: SessionInfo[];
  onSessionsChanged: () => void;
  onViewSession: (name: string) => void;
}) {
  const [summaries, setSummaries] = useState<Map<string, SessionSummary>>(new Map());
  const [downloadedSet, setDownloadedSet] = useState<Set<string>>(new Set());
  const [savedToDiskSet, setSavedToDiskSet] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isJsonExporting, setIsJsonExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const exportWorkerRef = useRef<Worker | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const [theadHeight, setTheadHeight] = useState(0);

  useEffect(() => {
    if (theadRef.current) {
      setTheadHeight(theadRef.current.getBoundingClientRect().height);
    }
  }, [sessions]);

  // Load summaries and downloaded status
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const db = dbRef.current;
      if (!db) return;

      const map = new Map<string, SessionSummary>();
      for (const s of sessions) {
        const summary = await getSessionSummary(db, s.name);
        if (cancelled) return;
        if (summary) map.set(s.name, summary);
      }
      setSummaries(map);

      const downloaded = await getDownloadedSessions();
      if (!cancelled) setDownloadedSet(downloaded);

      const savedToDisk = await getSavedToDiskSessions();
      if (!cancelled) setSavedToDiskSet(savedToDisk);
    }

    load();
    return () => { cancelled = true; };
  }, [sessions, dbRef]);

  // Clear selection when sessions change
  useEffect(() => {
    setSelected(prev => {
      const sessionNames = new Set(sessions.map(s => s.name));
      const next = new Set<string>();
      for (const name of prev) {
        if (sessionNames.has(name)) next.add(name);
      }
      return next;
    });
  }, [sessions]);

  const allSelected = sessions.length > 0 && selected.size === sessions.length;

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sessions.map(s => s.name)));
    }
  }, [allSelected, sessions]);

  const toggleOne = useCallback((name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const handleSelectNotDownloaded = useCallback(() => {
    setSelected(new Set(sessions.filter(s => !downloadedSet.has(s.name)).map(s => s.name)));
  }, [sessions, downloadedSet]);

  const startExport = useCallback((sessionNames?: string[]) => {
    if (isExporting) return;

    setIsExporting(true);
    setExportProgress(null);

    if (exportWorkerRef.current) {
      exportWorkerRef.current.terminate();
    }

    const worker = new LogsExportWorker();
    exportWorkerRef.current = worker;

    const namesToMark = sessionNames ?? sessions.map(s => s.name);

    worker.onmessage = (event: MessageEvent<LogsExportWorkerResponse>) => {
      const { data } = event;
      if (data.type === "progress") {
        setExportProgress({ current: data.current, total: data.total });
      } else if (data.type === "success") {
        setIsExporting(false);
        setExportProgress(null);

        const url = URL.createObjectURL(data.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `logi_${new Date().toISOString().slice(0, 10)}.zip`;
        a.click();
        URL.revokeObjectURL(url);

        worker.terminate();
        exportWorkerRef.current = null;

        markSessionsDownloaded(namesToMark).then(() => {
          getDownloadedSessions().then(setDownloadedSet);
        });
      } else if (data.type === "error") {
        setIsExporting(false);
        setExportProgress(null);
        console.error("[LogsExport]", data.message);
        worker.terminate();
        exportWorkerRef.current = null;
      }
    };

    worker.onerror = () => {
      setIsExporting(false);
      setExportProgress(null);
      worker.terminate();
      exportWorkerRef.current = null;
    };

    worker.postMessage({
      type: "export",
      inlineStyles: collectInlineStyles(),
      sessionNames,
    });
  }, [isExporting, sessions]);

  const handleDownloadSelected = useCallback(() => {
    const names = sessions.filter(s => selected.has(s.name)).map(s => s.name);
    if (names.length === 0) return;
    startExport(names);
  }, [selected, sessions, startExport]);

  const handleDownloadAll = useCallback(() => {
    startExport();
  }, [startExport]);

  const handleDeleteSelected = useCallback(async () => {
    const names = sessions.filter(s => selected.has(s.name)).map(s => s.name);
    if (names.length === 0) return;

    const db = dbRef.current;
    if (!db) return;

    setIsDeleting(true);
    try {
      const currentVersion = db.version;
      db.close();
      dbRef.current = null;

      dbRef.current = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("ArkadiaMessagesDB", currentVersion + 1);
        req.onupgradeneeded = () => {
          const upgradeDb = req.result;
          for (const name of names) {
            if (upgradeDb.objectStoreNames.contains(name)) {
              upgradeDb.deleteObjectStore(name);
            }
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      setSelected(new Set());
      onSessionsChanged();
    } catch (error) {
      console.error("[LogManager] Delete failed:", error);
      // Try to re-open the database
      dbRef.current = await openDb();
    } finally {
      setIsDeleting(false);
    }
  }, [sessions, selected, dbRef, onSessionsChanged]);

  const handleJsonExport = useCallback(async () => {
    const names = sessions.filter(s => selected.has(s.name)).map(s => s.name);
    if (names.length === 0) return;

    const db = dbRef.current;
    if (!db) return;

    setIsJsonExporting(true);
    try {
      const exportData: LogExportData = { version: 1, sessions: {} };
      for (const name of names) {
        const entries = await getRawSessionData(db, name);
        if (entries.length > 0) {
          exportData.sessions[name] = entries;
        }
      }

      const blob = new Blob([JSON.stringify(exportData)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `logi_eksport_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("[LogManager] JSON export failed:", error);
    } finally {
      setIsJsonExporting(false);
    }
  }, [sessions, selected, dbRef]);

  const handleImport = useCallback(async (file: File) => {
    const db = dbRef.current;
    if (!db) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      let data: LogExportData;
      try {
        data = JSON.parse(text);
      } catch {
        alert("Niepoprawny plik JSON.");
        return;
      }

      if (data.version !== 1 || !data.sessions || typeof data.sessions !== "object") {
        alert("Niepoprawny format pliku eksportu.");
        return;
      }

      const sessionNames = Object.keys(data.sessions);
      if (sessionNames.length === 0) {
        alert("Plik nie zawiera zadnych sesji.");
        return;
      }

      // Determine which sessions already exist
      const existingStores = new Set<string>();
      for (let i = 0; i < db.objectStoreNames.length; i++) {
        const name = db.objectStoreNames.item(i);
        if (name) existingStores.add(name);
      }

      const toImport = sessionNames.filter(name => !existingStores.has(name));
      const skipped = sessionNames.length - toImport.length;

      if (toImport.length === 0) {
        alert(`Pominieto ${skipped} duplikatow. Brak nowych sesji do zaimportowania.`);
        return;
      }

      // Close current DB, upgrade to create new object stores
      const currentVersion = db.version;
      db.close();
      dbRef.current = null;

      const newDb = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("ArkadiaMessagesDB", currentVersion + 1);
        req.onupgradeneeded = () => {
          const upgradeDb = req.result;
          for (const name of toImport) {
            if (!upgradeDb.objectStoreNames.contains(name)) {
              upgradeDb.createObjectStore(name, { autoIncrement: true });
            }
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      // Insert entries into new object stores
      for (const name of toImport) {
        const entries = data.sessions[name];
        if (!entries || entries.length === 0) continue;
        await new Promise<void>((resolve, reject) => {
          const tx = newDb.transaction(name, "readwrite");
          const store = tx.objectStore(name);
          for (const entry of entries) {
            store.add(entry);
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }

      dbRef.current = newDb;
      alert(`Zaimportowano ${toImport.length} sesji, pominieto ${skipped} duplikatow.`);
      onSessionsChanged();
    } catch (error) {
      console.error("[LogManager] Import failed:", error);
      if (!dbRef.current) {
        dbRef.current = await openDb();
      }
    } finally {
      setIsImporting(false);
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  }, [dbRef, onSessionsChanged]);

  return (
    <div className="d-flex flex-column gap-2">
      <div className="logs-manage-actions">
        <button
          className="btn btn-primary btn-sm"
          disabled={selected.size === 0 || isExporting || isDeleting}
          onClick={handleDownloadSelected}
          style={{ whiteSpace: "nowrap", position: "relative" }}
        >
          <span style={{ visibility: isExporting ? "hidden" : "visible" }}>
            Pobierz zaznaczone ({selected.size})
          </span>
          {isExporting && exportProgress && (
            <span style={{ position: "absolute", left: 0, right: 0, textAlign: "center" }}>
              {exportProgress.current}/{exportProgress.total}
            </span>
          )}
        </button>
        <button
          className="btn btn-secondary btn-sm"
          disabled={sessions.length === 0 || isExporting || isDeleting}
          onClick={handleDownloadAll}
        >
          Pobierz wszystkie
        </button>
        <button
          className="btn btn-secondary btn-sm"
          disabled={isExporting || isDeleting}
          onClick={handleSelectNotDownloaded}
        >
          Zaznacz niepobrane
        </button>
        <button
          className="btn btn-primary btn-sm"
          disabled={selected.size === 0 || isExporting || isDeleting || isJsonExporting || isImporting}
          onClick={handleJsonExport}
        >
          {isJsonExporting ? "Eksportowanie..." : `Eksportuj zaznaczone (${selected.size})`}
        </button>
        <button
          className="btn btn-secondary btn-sm"
          disabled={isExporting || isDeleting || isJsonExporting || isImporting}
          onClick={() => importInputRef.current?.click()}
        >
          {isImporting ? "Importowanie..." : "Importuj"}
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImport(file);
          }}
        />
        <button
          className="btn btn-danger btn-sm"
          disabled={selected.size === 0 || isExporting || isDeleting || isJsonExporting || isImporting}
          onClick={handleDeleteSelected}
        >
          {isDeleting ? "Usuwanie..." : `Usun zaznaczone (${selected.size})`}
        </button>
      </div>

      <div className="border rounded" style={{ maxHeight: "60vh", overflowY: "auto" }}>
        <table className="logs-manage-table">
          <thead ref={theadRef}>
            <tr>
              <th style={{ width: "2rem" }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                />
              </th>
              <th>Sesja</th>
              <th>Od–Do</th>
              <th style={{ textAlign: "right" }}>Linie</th>
              <th style={{ textAlign: "center", width: "4rem" }}>Pobrano</th>
              <th style={{ textAlign: "center", width: "3rem" }} title="Zapisano na dysk">{"\uD83D\uDCBE"}</th>
              <th style={{ width: "2rem" }}></th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s, i) => {
              const summary = summaries.get(s.name);
              const year = getSessionYear(s.name);
              const prevYear = i > 0 ? getSessionYear(sessions[i - 1].name) : null;
              const showYearHeader = year !== null && year !== prevYear;
              return (
                <Fragment key={s.name}>
                  {showYearHeader && (
                    <tr className="logs-manage-year">
                      <td colSpan={7} style={{ top: theadHeight }}>{year}</td>
                    </tr>
                  )}
                  <tr
                    className={selected.has(s.name) ? "table-active" : ""}
                    style={{ cursor: "pointer" }}
                    onClick={() => toggleOne(s.name)}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(s.name)}
                        onChange={() => toggleOne(s.name)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td>{s.label}</td>
                    <td>
                      {summary
                        ? formatDateTimeRange(summary.firstTs, summary.lastTs)
                        : "–"}
                    </td>
                    <td style={{ textAlign: "right" }}>{summary?.count ?? "–"}</td>
                    <td style={{ textAlign: "center" }}>
                      {downloadedSet.has(s.name) ? "\u2713" : ""}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {savedToDiskSet.has(s.name) ? "\u2713" : ""}
                    </td>
                    <td>
                      <button
                        className="btn btn-outline-primary btn-sm py-0 px-1"
                        title="Podglad"
                        onClick={(e) => { e.stopPropagation(); onViewSession(s.name); }}
                      >
                        &#x25B6;
                      </button>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function LogLine({
  line,
  isHighlighted,
  onContextMenu,
}: {
  line: FlatLogLine;
  isHighlighted: boolean;
  onContextMenu?: (e: ReactMouseEvent, line: FlatLogLine) => void;
}) {
  const classes = ["output_msg"];
  if (line.type) classes.push(line.type);
  if (isHighlighted) classes.push("logs-preview-highlight");

  return (
    <div className={classes.join(" ")} onContextMenu={onContextMenu ? (e) => onContextMenu(e, line) : undefined}>
      <div className="output_msg_text" style={{ whiteSpace: "pre-wrap" }}>
        <span className="log-time">{line.time}</span>
        <span dangerouslySetInnerHTML={{ __html: line.html }} />
      </div>
    </div>
  );
}

function SearchResultSnippet({ text, matchIndex, matchText }: { text: string; matchIndex: number; matchText: string }) {
  const windowSize = 60;
  const start = Math.max(0, matchIndex - windowSize);
  const end = Math.min(text.length, matchIndex + matchText.length + windowSize);
  const prefix = text.slice(start, matchIndex).replace(/\s+/g, " ");
  const suffix = text.slice(matchIndex + matchText.length, end).replace(/\s+/g, " ");
  const normalizedMatch = matchText.replace(/\s+/g, " ");

  return (
    <>
      {start > 0 && "..."}
      {prefix}
      <mark>{normalizedMatch}</mark>
      {suffix}
      {end < text.length && "..."}
    </>
  );
}

function SearchResultItem({
  result,
  isActive,
  onClick
}: {
  result: SearchResult;
  isActive: boolean;
  onClick: () => void;
}) {
  const firstMatch = result.matches[0];
  return (
    <button
      type="button"
      className={`logs-search-result ${isActive ? "logs-search-result-active" : ""}`}
      onClick={onClick}
    >
      <span className="logs-search-result-time">{result.groupDateTime}</span>
      <span className="logs-search-result-snippet">
        <SearchResultSnippet
          text={firstMatch.lineText}
          matchIndex={firstMatch.matchIndex}
          matchText={firstMatch.text}
        />
      </span>
      <span className="logs-search-result-count">({result.matches.length})</span>
    </button>
  );
}

function SearchResults({
  sessionGroups,
  activeResultIndex,
  activeSessionName,
  onResultClick,
  hideSessionHeaders,
}: {
  sessionGroups: SearchSessionGroup[];
  activeResultIndex: number;
  activeSessionName: string | null;
  onResultClick: (globalIndex: number) => void;
  hideSessionHeaders?: boolean;
}) {
  let globalIndex = 0;

  return (
    <div id="logs-search-results" className="logs-search-results border rounded">
      {sessionGroups.map(session => {
        const isActiveSession = session.sessionName === activeSessionName;
        return (
          <div
            key={session.sessionName}
            className={`logs-search-session ${isActiveSession ? "logs-search-session-active" : ""}`}
          >
            {!hideSessionHeaders && (
              <div className="logs-search-session-header">
                <span className="logs-search-session-title">{session.sessionLabel}</span>
                <span className="logs-search-session-count">({session.totalMatches})</span>
              </div>
            )}
            <div className="logs-search-session-results">
              {session.results.map((result, resultIdx) => {
                const currentIndex = globalIndex++;
                return (
                  <SearchResultItem
                    key={`${result.groupTimestamp}-${resultIdx}`}
                    result={result}
                    isActive={currentIndex === activeResultIndex}
                    onClick={() => onResultClick(currentIndex)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function LogBrowser() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"logs" | "manage">("logs");
  const [loggingEnabled, setLoggingEnabled] = useState(true);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [flatLines, setFlatLines] = useState<FlatLogLine[]>([]);
  const [rangeFilter, setRangeFilter] = useState<TimeRange | null>(null);
  const [lineMenu, setLineMenu] = useState<{ x: number; y: number; timestamp: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCurrentOnly, setSearchCurrentOnly] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchSessionGroups, setSearchSessionGroups] = useState<SearchSessionGroup[]>([]);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const [highlightedIndices, setHighlightedIndices] = useState<Set<number>>(new Set());
  const [pendingScrollTarget, setPendingScrollTarget] = useState<SearchResult | null>(null);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number; sessionName: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [fileSaveEnabled, setFileSaveEnabled] = useState(isFileSaveActive());
  const [fileSaveDirName, setFileSaveDirName] = useState(getDirectoryName());

  const dbRef = useRef<IDBDatabase | null>(null);
  const exportWorkerRef = useRef<Worker | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const searchRequestIdRef = useRef(0);
  // Mirrors pendingScrollTarget for the loader effect. Reading it through a ref
  // keeps it out of the loader's dependency array, so clearing the target after
  // a scroll-to-result does not re-trigger a reload (which would then scroll to
  // the bottom of the log).
  const pendingScrollTargetRef = useRef<SearchResult | null>(null);

  // Narrow the rendered lines to the selected timeline window. Lines are
  // chronologically ordered, so the range maps to a contiguous slice; the
  // offset lets us translate search/highlight indices (into the full
  // flatLines) back onto the visible slice.
  const { visibleLines, visibleStartIdx } = useMemo(() => {
    if (!rangeFilter) return { visibleLines: flatLines, visibleStartIdx: 0 };
    let start = flatLines.findIndex(l => l.timestamp >= rangeFilter.from);
    if (start === -1) return { visibleLines: [] as FlatLogLine[], visibleStartIdx: 0 };
    let end = flatLines.length - 1;
    while (end >= start && flatLines[end].timestamp > rangeFilter.to) end--;
    return { visibleLines: flatLines.slice(start, end + 1), visibleStartIdx: start };
  }, [flatLines, rangeFilter]);

  const virtualizer = useVirtualizer({
    count: visibleLines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 20,
    overscan: 50,
  });

  // Listen to file saver status changes
  useEffect(() => {
    return onStatusChange((active, dirName) => {
      setFileSaveEnabled(active);
      setFileSaveDirName(dirName);
    });
  }, []);

  const handleFileSaveToggle = useCallback(async (enabled: boolean) => {
    if (enabled) {
      const result = await enableFileSave();
      if (result) {
        setFileSaveEnabled(true);
        setFileSaveDirName(result.dirName);
      }
    } else {
      disableFileSave();
      setFileSaveEnabled(false);
      setFileSaveDirName(null);
    }
  }, []);

  // Listen to modal events (modal is created in initLogBrowser, not here)
  useEffect(() => {
    const modalEl = document.getElementById("logs-modal") as HTMLDivElement | null;
    if (!modalEl) return;

    const handleShow = () => setIsOpen(true);
    const handleHide = () => setIsOpen(false);

    modalEl.addEventListener("show.bs.modal", handleShow);
    modalEl.addEventListener("hidden.bs.modal", handleHide);

    return () => {
      modalEl.removeEventListener("show.bs.modal", handleShow);
      modalEl.removeEventListener("hidden.bs.modal", handleHide);
    };
  }, []);

  // Sync header tab buttons with activeTab state
  useEffect(() => {
    const tabsContainer = document.getElementById("logs-header-tabs");
    if (!tabsContainer) return;

    const buttons = tabsContainer.querySelectorAll<HTMLButtonElement>("[data-logs-tab]");

    const handleClick = (e: Event) => {
      const tab = (e.currentTarget as HTMLButtonElement).dataset.logsTab as "logs" | "manage";
      setActiveTab(tab);
    };

    buttons.forEach(btn => btn.addEventListener("click", handleClick));

    // Update button styles
    buttons.forEach(btn => {
      if (btn.dataset.logsTab === activeTab) {
        btn.classList.remove("btn-outline-secondary");
        btn.classList.add("btn-primary");
      } else {
        btn.classList.remove("btn-primary");
        btn.classList.add("btn-outline-secondary");
      }
    });

    return () => {
      buttons.forEach(btn => btn.removeEventListener("click", handleClick));
    };
  }, [activeTab]);

  // Load logging preference
  useEffect(() => {
    const saved = globalStorage.get("loggingEnabled");
    setLoggingEnabled(saved !== false);
  }, []);

  // Save logging preference
  const handleLoggingChange = useCallback((enabled: boolean) => {
    setLoggingEnabled(enabled);
    globalStorage.set("loggingEnabled", enabled);
  }, []);

  // Reusable session loader
  const reloadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      if (!dbRef.current) {
        dbRef.current = await openDb();
      }
      const db = dbRef.current;
      if (!db) {
        setSearchMessage("Nie udalo sie otworzyc bazy danych.");
        return;
      }

      const available: SessionInfo[] = [];
      for (let i = 0; i < db.objectStoreNames.length; i++) {
        const name = db.objectStoreNames.item(i);
        if (!name) continue;
        try {
          const tx = db.transaction(name, "readonly");
          const req = tx.objectStore(name).count();
          const count = await new Promise<number>(resolve => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(0);
          });
          if (count > 0) {
            available.push({ name, label: formatSessionLabel(name) });
          }
        } catch (error) {
          console.error(`Error accessing session ${name}:`, error);
        }
      }
      available.sort((a, b) => a.name.localeCompare(b.name));
      setSessions(available);

      if (available.length > 0) {
        const latest = available[available.length - 1];
        setCurrentSession(prev => {
          // Keep current selection if still valid
          if (prev && available.some(s => s.name === prev)) return prev;
          return latest.name;
        });
      } else {
        setCurrentSession(null);
        setSearchMessage("Brak logow do wyswietlenia.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load sessions when modal opens
  useEffect(() => {
    if (!isOpen) return;
    reloadSessions();
  }, [isOpen, reloadSessions]);

  // Reset the timeline window whenever the selected session changes
  useEffect(() => {
    setRangeFilter(null);
    setLineMenu(null);
  }, [currentSession]);

  // Right-click on a log line opens a "start/end here" context menu
  const handleLineContextMenu = useCallback((e: ReactMouseEvent, line: FlatLogLine) => {
    e.preventDefault();
    setLineMenu({ x: e.clientX, y: e.clientY, timestamp: line.timestamp });
  }, []);

  // Set the start or end of the timeline window from a clicked line's timestamp
  const setRangeBound = useCallback((kind: "start" | "end", ts: number) => {
    setRangeFilter(prev => {
      const min = flatLines[0]?.timestamp ?? ts;
      const max = flatLines[flatLines.length - 1]?.timestamp ?? ts;
      let from = prev?.from ?? min;
      let to = prev?.to ?? max;
      if (kind === "start") from = Math.min(ts, to);
      else to = Math.max(ts, from);
      if (from <= min && to >= max) return null;
      return { from, to };
    });
    setLineMenu(null);
    // Reveal the chosen boundary line once the narrowed slice has rendered:
    // "start here" lands at the top, "end here" at the bottom.
    setTimeout(() => {
      const el = parentRef.current;
      if (!el) return;
      el.scrollTop = kind === "start" ? 0 : el.scrollHeight;
    }, 0);
  }, [flatLines]);

  // Dismiss the line context menu on outside click, scroll, or Escape
  useEffect(() => {
    if (!lineMenu) return;
    const close = () => setLineMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLineMenu(null); };
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [lineMenu]);

  // Load session data when current session changes or modal opens
  useEffect(() => {
    if (!isOpen || !currentSession || !dbRef.current) return;

    const loadSession = async () => {
      setIsLoading(true);
      try {
        const groups = await getSessionData(dbRef.current!, currentSession);
        const flat = flattenLogGroups(groups);
        setFlatLines(flat);
        // Scroll to bottom after loading (unless we have a pending scroll target)
        const pending = pendingScrollTargetRef.current;
        if (!pending || pending.sessionName !== currentSession) {
          setTimeout(() => {
            if (parentRef.current) {
              parentRef.current.scrollTop = parentRef.current.scrollHeight;
            }
          }, 0);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();
  }, [isOpen, currentSession]);

  // Handle pending scroll target after session loads
  useEffect(() => {
    if (!pendingScrollTarget || pendingScrollTarget.sessionName !== currentSession || flatLines.length === 0 || isLoading) {
      return;
    }

    const indices = new Set(pendingScrollTarget.matches.map(m => m.flatIndex));
    setHighlightedIndices(indices);
    if (pendingScrollTarget.matches.length > 0) {
      const targetIndex = pendingScrollTarget.matches[0].flatIndex;
      // Use requestAnimationFrame to ensure virtualizer has updated
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(targetIndex, { align: "center" });
      });
    }
    pendingScrollTargetRef.current = null;
    setPendingScrollTarget(null);

    // Clear highlight after 2s
    setTimeout(() => setHighlightedIndices(new Set()), 2000);
  }, [pendingScrollTarget, currentSession, flatLines.length, isLoading, virtualizer]);

  // Search functionality
  const runSearch = useCallback(async () => {
    const { regex, error } = parseSearchQuery(searchQuery);
    const trimmed = searchQuery.trim();

    if (!trimmed) {
      setSearchMessage("Wpisz fraze wyszukiwania.");
      setSearchResults([]);
      setSearchSessionGroups([]);
      setActiveResultIndex(-1);
      return;
    }

    if (!regex) {
      setSearchMessage(error ?? "Nie udalo sie utworzyc wyrazenia wyszukiwania.");
      setSearchResults([]);
      setSearchSessionGroups([]);
      return;
    }

    if (sessions.length === 0) {
      setSearchMessage("Brak logow do wyswietlenia.");
      return;
    }

    const requestId = ++searchRequestIdRef.current;
    setSearchMessage("Wyszukiwanie...");
    setSearchResults([]);
    setSearchSessionGroups([]);
    setActiveResultIndex(-1);
    // Searching spans the whole session; clear any timeline narrowing so
    // result indices line up with the full flatLines array.
    setRangeFilter(null);

    const baseFlags = normalizeFlags(regex.flags);
    const globalFlags = `${baseFlags}g`;
    const allResults: SearchResult[] = [];
    const sessionGroupsMap = new Map<string, SearchSessionGroup>();

    if (searchCurrentOnly) {
      // Search only the current session using in-memory flatLines
      if (!currentSession) return;

      const currentSessionInfo = sessions.find(s => s.name === currentSession);
      if (!currentSessionInfo) return;

      // Group flatLines by their groupIndex to reconstruct group-level results
      const groupMap = new Map<number, { timestamp: number; dateTime: string; matches: LineMatch[] }>();

      for (let flatIndex = 0; flatIndex < flatLines.length; flatIndex++) {
        const line = flatLines[flatIndex];
        if (!line.text) continue;

        const matcher = new RegExp(regex.source, globalFlags);
        let match: RegExpExecArray | null;
        while ((match = matcher.exec(line.text)) !== null) {
          if (match[0].length === 0) {
            matcher.lastIndex += 1;
            continue;
          }
          let group = groupMap.get(line.groupIndex);
          if (!group) {
            group = {
              timestamp: line.timestamp,
              dateTime: formatDateTime(line.timestamp),
              matches: [],
            };
            groupMap.set(line.groupIndex, group);
          }
          group.matches.push({
            flatIndex,
            matchIndex: match.index,
            text: match[0],
            lineText: line.text,
          });
        }
      }

      for (const group of groupMap.values()) {
        const result: SearchResult = {
          sessionName: currentSessionInfo.name,
          sessionLabel: currentSessionInfo.label,
          groupTimestamp: group.timestamp,
          groupDateTime: group.dateTime,
          matches: group.matches,
        };
        allResults.push(result);
      }
    } else {
      // Search all sessions via IndexedDB
      const db = dbRef.current;
      if (!db) return;

      for (let i = 0; i < sessions.length; i++) {
        const session = sessions[i];
        setSearchMessage(`Wyszukiwanie... (${i + 1}/${sessions.length})`);

        const groups = await getSessionData(db, session.name);
        if (requestId !== searchRequestIdRef.current) return;

        let flatIndex = 0;
        for (const group of groups) {
          const groupMatches: LineMatch[] = [];
          for (let lineIndex = 0; lineIndex < group.lines.length; lineIndex++) {
            const line = group.lines[lineIndex];
            if (!line.text) {
              flatIndex++;
              continue;
            }
            const matcher = new RegExp(regex.source, globalFlags);
            let match: RegExpExecArray | null;
            while ((match = matcher.exec(line.text)) !== null) {
              if (match[0].length === 0) {
                matcher.lastIndex += 1;
                continue;
              }
              groupMatches.push({
                flatIndex,
                matchIndex: match.index,
                text: match[0],
                lineText: line.text,
              });
            }
            flatIndex++;
          }
          if (groupMatches.length > 0) {
            const result: SearchResult = {
              sessionName: session.name,
              sessionLabel: session.label,
              groupTimestamp: group.timestamp,
              groupDateTime: group.dateTime,
              matches: groupMatches,
            };
            allResults.push(result);

            let sessionGroup = sessionGroupsMap.get(session.name);
            if (!sessionGroup) {
              sessionGroup = {
                sessionName: session.name,
                sessionLabel: session.label,
                results: [],
                totalMatches: 0,
              };
              sessionGroupsMap.set(session.name, sessionGroup);
            }
            sessionGroup.results.push(result);
            sessionGroup.totalMatches += groupMatches.length;
          }
        }
      }
    }

    if (requestId !== searchRequestIdRef.current) return;

    if (allResults.length === 0) {
      setSearchMessage("Brak wynikow.");
      return;
    }

    // Build session groups for current-only mode (single group, no header needed)
    if (searchCurrentOnly) {
      const currentSessionInfo = sessions.find(s => s.name === currentSession)!;
      const totalMatches = allResults.reduce((sum, r) => sum + r.matches.length, 0);
      sessionGroupsMap.set(currentSession!, {
        sessionName: currentSessionInfo.name,
        sessionLabel: currentSessionInfo.label,
        results: allResults,
        totalMatches,
      });
    }

    setSearchMessage(null);
    setSearchResults(allResults);
    setSearchSessionGroups(Array.from(sessionGroupsMap.values()));
    setActiveResultIndex(0);

    // Highlight and scroll to first result via the pending-scroll effect, so
    // it runs after the range reset re-renders the full (unfiltered) list.
    if (allResults.length > 0) {
      const firstResult = allResults[0];
      pendingScrollTargetRef.current = firstResult;
      setPendingScrollTarget(firstResult);
      if (firstResult.sessionName !== currentSession) {
        setCurrentSession(firstResult.sessionName);
      }
    }
  }, [searchQuery, sessions, currentSession, searchCurrentOnly, flatLines]);

  // Handle result click
  const handleResultClick = useCallback((globalIndex: number) => {
    if (globalIndex < 0 || globalIndex >= searchResults.length) return;

    setActiveResultIndex(globalIndex);
    const result = searchResults[globalIndex];

    // Clear any timeline narrowing so the target line is in view, then let the
    // pending-scroll effect do the highlight/scroll against the full list.
    setRangeFilter(null);
    pendingScrollTargetRef.current = result;
    setPendingScrollTarget(result);
    if (result.sessionName !== currentSession) {
      setCurrentSession(result.sessionName);
    }
  }, [searchResults, currentSession]);

  // Navigation
  const handlePrev = useCallback(() => {
    if (activeResultIndex > 0) {
      handleResultClick(activeResultIndex - 1);
    }
  }, [activeResultIndex, handleResultClick]);

  const handleNext = useCallback(() => {
    if (activeResultIndex < searchResults.length - 1) {
      handleResultClick(activeResultIndex + 1);
    }
  }, [activeResultIndex, searchResults.length, handleResultClick]);

  // Download
  const handleDownload = useCallback(async () => {
    if (!currentSession || !dbRef.current) return;

    const tx = dbRef.current.transaction(currentSession, "readonly");
    const req = tx.objectStore(currentSession).getAll();
    req.onsuccess = () => {
      const allLogs = req.result as LogEntry[];
      const logs = rangeFilter
        ? allLogs.filter(l => l.timestamp >= rangeFilter.from && l.timestamp <= rangeFilter.to)
        : allLogs;
      const entries: string[] = [];
      for (const l of logs) {
        const time = formatDateTime(l.timestamp);
        const parts = splitLines(l.text);
        for (const part of parts) {
          const classes = ["output_msg"];
          if (l.type) classes.push(l.type);
          const lineHtml = `<div class="${classes.join(" ")}"><div class="output_msg_text"><span class="log-time">${time}</span><span>${part}</span></div></div>`;
          entries.push(lineHtml);
        }
      }
      const styles = collectLogStyles();
      const allStyles = styles + "\nhtml, body { overflow: auto; } #logs-preview { height: auto; }";

      const head = `<meta charset="UTF-8">\n<style>${allStyles}</style>`;
      const html = `<!doctype html><html lang="en"><head>${head}</head><body><div id="logs-preview">${entries.join("\n")}</div></body></html>`;
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${formatSessionFileName(currentSession)}.html`;
      a.click();
      URL.revokeObjectURL(url);
    };
  }, [currentSession, rangeFilter]);

  // Download all logs as ZIP
  const handleDownloadAll = useCallback(() => {
    if (isExporting) return;

    const styles = collectLogStyles();

    setIsExporting(true);
    setExportProgress(null);

    // Terminate existing worker if any
    if (exportWorkerRef.current) {
      exportWorkerRef.current.terminate();
    }

    const worker = new LogsExportWorker();
    exportWorkerRef.current = worker;

    worker.onmessage = (event: MessageEvent<LogsExportWorkerResponse>) => {
      const { data } = event;

      if (data.type === "progress") {
        setExportProgress({
          current: data.current,
          total: data.total,
          sessionName: data.sessionName,
        });
      } else if (data.type === "success") {
        setIsExporting(false);
        setExportProgress(null);

        const url = URL.createObjectURL(data.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `logi_${new Date().toISOString().slice(0, 10)}.zip`;
        a.click();
        URL.revokeObjectURL(url);

        worker.terminate();
        exportWorkerRef.current = null;
      } else if (data.type === "error") {
        setIsExporting(false);
        setExportProgress(null);
        console.error("[LogsExport]", data.message);
        alert(data.message);

        worker.terminate();
        exportWorkerRef.current = null;
      }
    };

    worker.onerror = (error) => {
      setIsExporting(false);
      setExportProgress(null);
      console.error("[LogsExport] Worker error:", error);

      worker.terminate();
      exportWorkerRef.current = null;
    };

    worker.postMessage({
      type: "export",
      inlineStyles: styles,
    });
  }, [isExporting]);

  const [isImageDownloading, setIsImageDownloading] = useState(false);
  const handleDownloadAsImage = useCallback(async () => {
    if (!currentSession || isImageDownloading) return;
    const linesToRender = rangeFilter ? visibleLines : flatLines;
    if (linesToRender.length === 0) {
      alert("Brak linii do zapisu.");
      return;
    }
    setIsImageDownloading(true);
    try {
      const suffix = rangeFilter ? "_zakres" : "";
      await downloadLogAsImage(linesToRender, `${formatSessionFileName(currentSession)}${suffix}.png`);
    } catch (error) {
      console.error("[Logs] Image download failed:", error);
      alert(error instanceof Error ? error.message : "Nie udalo sie zapisac obrazu.");
    } finally {
      setIsImageDownloading(false);
    }
  }, [currentSession, rangeFilter, visibleLines, flatLines, isImageDownloading]);

  // Delete current session
  const [isDeleting, setIsDeleting] = useState(false);
  const handleDeleteCurrent = useCallback(async () => {
    if (!currentSession || !dbRef.current || isDeleting) return;
    if (!confirm("Czy na pewno chcesz usunac ten log?")) return;

    setIsDeleting(true);
    try {
      const db = dbRef.current;
      const currentVersion = db.version;
      db.close();
      dbRef.current = null;

      dbRef.current = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("ArkadiaMessagesDB", currentVersion + 1);
        req.onupgradeneeded = () => {
          const upgradeDb = req.result;
          if (upgradeDb.objectStoreNames.contains(currentSession)) {
            upgradeDb.deleteObjectStore(currentSession);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      setFlatLines([]);
      setCurrentSession(null);
      reloadSessions();
    } catch (error) {
      console.error("[Logs] Delete failed:", error);
      dbRef.current = await openDb();
    } finally {
      setIsDeleting(false);
    }
  }, [currentSession, isDeleting, reloadSessions]);

  // Re-run search when the toggle changes and there's an active search
  const prevSearchCurrentOnlyRef = useRef(searchCurrentOnly);
  useEffect(() => {
    if (prevSearchCurrentOnlyRef.current !== searchCurrentOnly) {
      prevSearchCurrentOnlyRef.current = searchCurrentOnly;
      if (searchQuery.trim() && (searchResults.length > 0 || searchMessage === "Brak wynikow.")) {
        runSearch();
      }
    }
  }, [searchCurrentOnly, searchQuery, searchResults.length, searchMessage, runSearch]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      runSearch();
    }
  }, [runSearch]);

  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value);
    if (!value.trim()) {
      setSearchMessage(null);
      setSearchResults([]);
      setSearchSessionGroups([]);
      setActiveResultIndex(-1);
      setHighlightedIndices(new Set());
    }
  }, []);

  const activeSessionName = useMemo(() => {
    if (activeResultIndex >= 0 && activeResultIndex < searchResults.length) {
      return searchResults[activeResultIndex].sessionName;
    }
    return null;
  }, [activeResultIndex, searchResults]);

  const sessionsByYear = useMemo(() => {
    const groups: { year: number | null; sessions: SessionInfo[] }[] = [];
    let current: { year: number | null; sessions: SessionInfo[] } | null = null;
    for (const s of sessions) {
      const year = getSessionYear(s.name);
      if (!current || current.year !== year) {
        current = { year, sessions: [] };
        groups.push(current);
      }
      current.sessions.push(s);
    }
    return groups;
  }, [sessions]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="modal-body d-flex flex-column gap-2">
      {activeTab === "logs" && (<>
        <div className="form-check form-switch">
          <input
            id="logs-enabled"
            className="form-check-input"
            type="checkbox"
            checked={loggingEnabled}
            onChange={(e) => handleLoggingChange(e.target.checked)}
          />
          <label className="form-check-label" htmlFor="logs-enabled">Zapisuj logi</label>
        </div>

        {isFileSaveSupported() && (
          <div className="d-flex align-items-center gap-2">
            <div className="form-check form-switch mb-0">
              <input
                id="logs-file-save"
                className="form-check-input"
                type="checkbox"
                checked={fileSaveEnabled}
                onChange={(e) => handleFileSaveToggle(e.target.checked)}
              />
              <label className="form-check-label" htmlFor="logs-file-save">Zapisuj na dysk</label>
            </div>
            {fileSaveEnabled && fileSaveDirName && (
              <span className="text-muted small">{"\uD83D\uDCC2"} {fileSaveDirName}</span>
            )}
          </div>
        )}

        <div className="d-flex gap-2">
          <select
            id="logs-session-select"
            className="form-select"
            value={currentSession ?? ""}
            onChange={(e) => setCurrentSession(e.target.value)}
          >
            {sessionsByYear.map(group =>
              group.year != null ? (
                <optgroup key={group.year} label={String(group.year)}>
                  {group.sessions.map(s => (
                    <option key={s.name} value={s.name}>{s.label}</option>
                  ))}
                </optgroup>
              ) : (
                group.sessions.map(s => (
                  <option key={s.name} value={s.name}>{s.label}</option>
                ))
              )
            )}
          </select>
          <button
            id="logs-download"
            className="btn btn-secondary"
            style={{ whiteSpace: "nowrap" }}
            onClick={handleDownload}
            title={rangeFilter ? "Pobierz tylko zaznaczony zakres osi czasu" : "Pobierz caly log"}
          >
            {rangeFilter ? "Pobierz zakres" : "Pobierz"}
          </button>
          <button
            id="logs-download-image"
            className="btn btn-secondary"
            style={{ whiteSpace: "nowrap" }}
            onClick={handleDownloadAsImage}
            disabled={!currentSession || isImageDownloading}
            title={rangeFilter ? "Pobierz zaznaczony zakres jako obraz PNG" : "Pobierz caly log jako obraz PNG"}
          >
            {isImageDownloading
              ? "Tworzenie..."
              : rangeFilter ? "Pobierz zakres jako obraz" : "Pobierz jako obraz"}
          </button>
          <button
            id="logs-download-all"
            className="btn btn-secondary"
            style={{ whiteSpace: "nowrap", position: "relative" }}
            onClick={handleDownloadAll}
            disabled={isExporting || sessions.length === 0}
            title="Pobierz wszystkie logi jako ZIP"
          >
            <span style={{ visibility: isExporting ? "hidden" : "visible" }}>Pobierz wszystkie</span>
            {isExporting && exportProgress && (
              <span style={{ position: "absolute", left: 0, right: 0, textAlign: "center" }}>
                {exportProgress.current}/{exportProgress.total}
              </span>
            )}
          </button>
          <button
            className="btn btn-danger"
            onClick={handleDeleteCurrent}
            disabled={!currentSession || isDeleting || isExporting}
          >
            {isDeleting ? "Usuwanie..." : "Usun"}
          </button>
          <button
            className="btn btn-primary"
            style={{ whiteSpace: "nowrap" }}
            disabled={!currentSession}
            onClick={() => {
              const url = new URL("log-viewer/index.html", window.location.href);
              if (currentSession) url.searchParams.set("session", currentSession);
              window.open(url.toString(), "_blank");
            }}
            title="Otworz log w nowej karcie"
          >
            {`Otw\u00F3rz w nowej karcie`}
          </button>
        </div>

        <div className="d-flex flex-column gap-2">
          <div className="d-flex justify-content-between align-items-center">
            <label htmlFor="logs-search-input" className="form-label mb-0">
              {searchCurrentOnly ? "Szukaj w biezacym logu" : "Szukaj w logach"}
            </label>
            <div className="form-check form-switch mb-0">
              <input
                id="logs-search-current-only"
                className="form-check-input"
                type="checkbox"
                checked={searchCurrentOnly}
                onChange={(e) => setSearchCurrentOnly(e.target.checked)}
              />
              <label className="form-check-label" htmlFor="logs-search-current-only">
                Tylko biezacy log
              </label>
            </div>
          </div>
          <div className="d-flex gap-2 align-items-end flex-wrap">
            <div className="flex-grow-1">
              <div className="logs-search-input-wrapper">
                <input
                  id="logs-search-input"
                  className="form-control"
                  placeholder="Fraza lub /wzorzec/"
                  value={searchQuery}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="logs-search-clear"
                    onClick={() => handleSearchInput("")}
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>
            <button
              id="logs-search-button"
              className="btn btn-primary"
              onClick={runSearch}
            >
              Szukaj
            </button>
          </div>

          {searchResults.length > 0 && (
            <div id="logs-search-controls" className="logs-search-controls">
              <button
                id="logs-search-prev"
                className="btn btn-secondary btn-sm"
                type="button"
                disabled={activeResultIndex <= 0}
                onClick={handlePrev}
              >
                Poprzedni
              </button>
              <button
                id="logs-search-next"
                className="btn btn-secondary btn-sm"
                type="button"
                disabled={activeResultIndex >= searchResults.length - 1}
                onClick={handleNext}
              >
                Nastepny
              </button>
            </div>
          )}

          {searchMessage && (
            <div id="logs-search-results" className="logs-search-results border rounded">
              <div className="logs-search-empty">{searchMessage}</div>
            </div>
          )}

          {searchSessionGroups.length > 0 && (
            <SearchResults
              sessionGroups={searchSessionGroups}
              activeResultIndex={activeResultIndex}
              activeSessionName={activeSessionName}
              onResultClick={handleResultClick}
              hideSessionHeaders={searchCurrentOnly}
            />
          )}
        </div>

        {flatLines.length > 0 && (
          <LogTimeline
            lines={flatLines}
            value={rangeFilter}
            onChange={setRangeFilter}
          />
        )}

        <div
          id="logs-preview"
          ref={parentRef}
          className="border"
          style={{ position: "relative" }}
        >
          {isLoading && (
            <div className="logs-loading-overlay">
              <div className="logs-loading-spinner" />
            </div>
          )}
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualItems.map(virtualRow => {
              const line = visibleLines[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                >
                  <LogLine
                    line={line}
                    isHighlighted={highlightedIndices.has(visibleStartIdx + virtualRow.index)}
                    onContextMenu={handleLineContextMenu}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {lineMenu && (
          <div
            className="logs-line-menu"
            style={{ left: lineMenu.x, top: lineMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={() => setRangeBound("start", lineMenu.timestamp)}>
              Zacznij od tej linii
            </button>
            <button type="button" onClick={() => setRangeBound("end", lineMenu.timestamp)}>
              Zakoncz na tej linii
            </button>
          </div>
        )}
      </>)}

      {activeTab === "manage" && (
        <LogManager
          dbRef={dbRef}
          sessions={sessions}
          onSessionsChanged={reloadSessions}
          onViewSession={(name) => { setCurrentSession(name); setActiveTab("logs"); }}
        />
      )}
    </div>
  );
}

let initialized = false;

function initLogBrowser(): boolean {
  if (initialized) {
    console.log("[Logs] Already initialized, skipping");
    return true;
  }

  const button = document.getElementById("logs-button") as HTMLButtonElement | null;
  const modalEl = document.getElementById("logs-modal") as HTMLElement | null;

  if (!button || !modalEl) {
    console.error("[Logs] Failed to find required elements:", { button: !!button, modalEl: !!modalEl });
    return false;
  }

  // Find or create container for React component
  const modalBody = modalEl.querySelector(".modal-body");
  if (!modalBody) {
    console.error("[Logs] Failed to find modal body");
    return false;
  }

  // Create React root container
  const reactContainer = document.createElement("div");
  reactContainer.id = "logs-react-root";
  reactContainer.style.display = "contents";

  // Clear existing content and add React container
  modalBody.innerHTML = "";
  modalBody.appendChild(reactContainer);

  // Mount React component and setup modal
  Promise.all([
    import("react-dom/client"),
    import("bootstrap/js/dist/modal")
  ]).then(([{ createRoot }, { default: Modal }]) => {
    const root = createRoot(reactContainer);
    root.render(<LogBrowser />);

    // Setup button click handler
    const modal = new Modal(modalEl);
    button.addEventListener("click", () => {
      modal.show();
    });
  });

  initialized = true;
  return true;
}

function ensureLogBrowser() {
  if (initLogBrowser()) return;
  const observer = new MutationObserver(() => {
    if (initLogBrowser()) {
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", ensureLogBrowser);
} else {
  ensureLogBrowser();
}
