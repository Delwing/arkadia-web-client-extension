import { memo, useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, Fragment, type MouseEvent as ReactMouseEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { LogsExportWorkerResponse, LogExportData } from "./logsExport.shared";
import LogsExportWorker from "./logsExport.worker?worker";
import { LogTimeline, type TimeRange } from "./LogTimeline";
import { getSavedToDiskSessions } from "./logFileSaver";
import {
  type LogEntry,
  type FlatLogLine,
  type SessionInfo,
  type LineMatch,
  type SearchResult,
  type SearchSessionGroup,
  formatDateTime,
  formatTime,
  formatSessionLabel,
  formatSessionFileName,
  getSessionYear,
  collectLogStyles,
  splitLines,
  parseSearchQuery,
  normalizeFlags,
  flattenLogGroups,
  getRawSessionData,
  getSessionData,
} from "./logBrowserUtils";
import { LogsDatabase } from "./logsDatabase";
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
  logsDb,
  sessions,
  onSessionsChanged,
  onViewSession,
}: {
  logsDb: LogsDatabase;
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
      const db = await logsDb.get();
      if (!db || cancelled) return;

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
  }, [sessions, logsDb]);

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

    setIsDeleting(true);
    try {
      await logsDb.upgrade(upgradeDb => {
        for (const name of names) {
          if (upgradeDb.objectStoreNames.contains(name)) {
            upgradeDb.deleteObjectStore(name);
          }
        }
      });

      setSelected(new Set());
      onSessionsChanged();
    } catch (error) {
      console.error("[LogManager] Delete failed:", error);
    } finally {
      setIsDeleting(false);
    }
  }, [sessions, selected, logsDb, onSessionsChanged]);

  const handleJsonExport = useCallback(async () => {
    const names = sessions.filter(s => selected.has(s.name)).map(s => s.name);
    if (names.length === 0) return;

    const db = await logsDb.get();
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
  }, [sessions, selected, logsDb]);

  const handleImport = useCallback(async (file: File) => {
    const db = await logsDb.get();
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

      // Upgrade to create the new object stores
      const newDb = await logsDb.upgrade(upgradeDb => {
        for (const name of toImport) {
          if (!upgradeDb.objectStoreNames.contains(name)) {
            upgradeDb.createObjectStore(name, { autoIncrement: true });
          }
        }
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

      alert(`Zaimportowano ${toImport.length} sesji, pominieto ${skipped} duplikatow.`);
      onSessionsChanged();
    } catch (error) {
      console.error("[LogManager] Import failed:", error);
    } finally {
      setIsImporting(false);
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  }, [logsDb, onSessionsChanged]);

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

// --- Search-match highlighting in the preview ---
//
// Matches are painted with the CSS Custom Highlight API, so the stored line
// HTML is rendered untouched (no <mark> splicing through ANSI spans). Browsers
// without it still get the whole-line highlight of the active result.

interface MatchSpan {
  start: number;
  length: number;
}

let matchHighlights: { match: Highlight; active: Highlight } | null | undefined;

function getMatchHighlights() {
  if (matchHighlights !== undefined) return matchHighlights;
  if (typeof CSS === "undefined" || !("highlights" in CSS) || typeof Highlight === "undefined") {
    matchHighlights = null;
    return null;
  }
  matchHighlights = { match: new Highlight(), active: new Highlight() };
  CSS.highlights.set("logs-match", matchHighlights.match);
  CSS.highlights.set("logs-match-active", matchHighlights.active);
  return matchHighlights;
}

/** DOM ranges covering `matches` (offsets into root's textContent). */
function rangesForMatches(root: Node, matches: MatchSpan[]): Range[] {
  const nodes: { node: Text; start: number }[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let pos = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push({ node: n as Text, start: pos });
    pos += (n as Text).data.length;
  }
  const locate = (offset: number, isEnd: boolean) => {
    for (const entry of nodes) {
      const end = entry.start + entry.node.data.length;
      if (isEnd ? offset <= end : offset < end) return { node: entry.node, offset: offset - entry.start };
    }
    return null;
  };
  const ranges: Range[] = [];
  for (const m of matches) {
    const a = locate(m.start, false);
    const b = locate(m.start + m.length, true);
    if (!a || !b) continue;
    const range = document.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
    ranges.push(range);
  }
  return ranges;
}

export const LogLine = memo(function LogLine({
  line,
  isHighlighted,
  matches,
  onContextMenu,
}: {
  line: FlatLogLine;
  isHighlighted: boolean;
  /** Search matches within this line, painted in place. */
  matches?: MatchSpan[];
  onContextMenu?: (e: ReactMouseEvent, line: FlatLogLine) => void;
}) {
  const htmlRef = useRef<HTMLSpanElement>(null);
  // React re-assigns innerHTML whenever this object's identity changes, which
  // would re-parse every visible row on each scroll frame (and drop the match
  // highlights anchored in its text nodes).
  const innerHtml = useMemo(() => ({ __html: line.html }), [line.html]);
  const classes = ["output_msg"];
  if (line.type) classes.push(line.type);
  if (isHighlighted) classes.push("logs-preview-highlight");

  useLayoutEffect(() => {
    const highlights = getMatchHighlights();
    const root = htmlRef.current;
    if (!highlights || !root || !matches?.length) return;
    const target = isHighlighted ? highlights.active : highlights.match;
    const ranges = rangesForMatches(root, matches);
    for (const r of ranges) target.add(r);
    return () => {
      for (const r of ranges) target.delete(r);
    };
  }, [matches, isHighlighted, line.html]);

  return (
    <div className={classes.join(" ")} onContextMenu={onContextMenu ? (e) => onContextMenu(e, line) : undefined}>
      <div className="output_msg_text" style={{ whiteSpace: "pre-wrap" }}>
        <span className="log-time">{line.time}</span>
        <span ref={htmlRef} dangerouslySetInnerHTML={innerHtml} />
      </div>
    </div>
  );
});

// --- Search results list ---

/** Longest result list rendered at once; navigation still covers every result. */
const MAX_RENDERED_RESULTS = 500;

function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function SearchResultSnippet({ text, matchIndex, matchText }: { text: string; matchIndex: number; matchText: string }) {
  const before = 40;
  const after = 120;
  const start = Math.max(0, matchIndex - before);
  const end = Math.min(text.length, matchIndex + matchText.length + after);
  const prefix = text.slice(start, matchIndex).replace(/\s+/g, " ");
  const suffix = text.slice(matchIndex + matchText.length, end).replace(/\s+/g, " ");
  const normalizedMatch = matchText.replace(/\s+/g, " ");

  return (
    <>
      {start > 0 && "…"}
      {prefix}
      <mark>{normalizedMatch}</mark>
      {suffix}
      {end < text.length && "…"}
    </>
  );
}

function SearchResultItem({
  result,
  isActive,
  onClick,
}: {
  result: SearchResult;
  isActive: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (isActive) ref.current?.scrollIntoView({ block: "nearest" });
  }, [isActive]);

  const firstMatch = result.matches[0];
  return (
    <button
      ref={ref}
      type="button"
      className={`logs-search-result ${isActive ? "logs-search-result-active" : ""}`}
      onClick={onClick}
      title={result.groupDateTime}
    >
      <span className="logs-search-result-time">{formatTime(result.groupTimestamp).slice(0, 8)}</span>
      <span className="logs-search-result-snippet">
        <SearchResultSnippet
          text={firstMatch.lineText}
          matchIndex={firstMatch.matchIndex}
          matchText={firstMatch.text}
        />
      </span>
      {result.matches.length > 1 && (
        <span className="logs-search-result-count">{`×${result.matches.length}`}</span>
      )}
    </button>
  );
}

function SearchResults({
  sessionGroups,
  totalResults,
  totalMatches,
  activeResultIndex,
  onResultClick,
  hideSessionHeaders,
  rangeLabel,
}: {
  sessionGroups: SearchSessionGroup[];
  totalResults: number;
  totalMatches: number;
  activeResultIndex: number;
  onResultClick: (globalIndex: number) => void;
  hideSessionHeaders?: boolean;
  /** Set when the search covered only a timeline window. */
  rangeLabel?: string;
}) {
  let globalIndex = 0;
  let rendered = 0;
  const sessionCount = sessionGroups.length;

  return (<>
    <div className="logs-search-summary">
      {`${totalMatches} ${plural(totalMatches, "trafienie", "trafienia", "trafien")}`}
      {!hideSessionHeaders && ` w ${sessionCount} ${plural(sessionCount, "sesji", "sesjach", "sesjach")}`}
      {rangeLabel && ` w zakresie ${rangeLabel}`}
      {totalResults > MAX_RENDERED_RESULTS && ` · lista pokazuje ${MAX_RENDERED_RESULTS} pierwszych, reszta przez ▼`}
    </div>
    <div id="logs-search-results" className="logs-search-results border rounded">
      {sessionGroups.map(session => {
        if (rendered >= MAX_RENDERED_RESULTS) {
          globalIndex += session.results.length;
          return null;
        }
        const containsActive = activeResultIndex >= globalIndex && activeResultIndex < globalIndex + session.results.length;
        return (
          <div
            key={session.sessionName}
            className={`logs-search-session ${containsActive ? "logs-search-session-active" : ""}`}
          >
            {!hideSessionHeaders && (
              <div className="logs-search-session-header">
                <span className="logs-search-session-title">{`Sesja z ${session.sessionLabel}`}</span>
                <span className="logs-search-session-count">
                  {`${session.totalMatches} ${plural(session.totalMatches, "trafienie", "trafienia", "trafien")}`}
                </span>
              </div>
            )}
            <div className="logs-search-session-results">
              {session.results.map((result, resultIdx) => {
                const currentIndex = globalIndex++;
                if (rendered >= MAX_RENDERED_RESULTS) return null;
                rendered++;
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
  </>);
}

// --- Search scope ---

type SearchScope = "all" | "session" | "range";

const SEARCH_SCOPES: { value: SearchScope; label: string; placeholder: string }[] = [
  { value: "all", label: "Wszystkie", placeholder: "Szukaj we wszystkich logach" },
  { value: "session", label: "Ten log", placeholder: "Szukaj w otwartym logu" },
  { value: "range", label: "Zakres", placeholder: "Szukaj w zaznaczonym zakresie" },
];

// --- Preview scrolling ---

/**
 * Where the preview should scroll once `session` is the loaded one. `target`
 * is an index into the session's full flatLines; a target outside the current
 * timeline window clears the window first.
 */
interface ScrollRequest {
  session: string;
  target: number | "top" | "bottom";
  align: "start" | "center" | "end";
}

interface LineMetrics {
  cols: number;
  lineHeight: number;
}

/** First index in chronologically ordered `lines` at or after `ts`. */
function lowerBoundByTime(lines: FlatLogLine[], ts: number): number {
  let lo = 0;
  let hi = lines.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].timestamp < ts) lo = mid + 1;
    else hi = mid;
  }
  return Math.min(lo, lines.length - 1);
}

function isTextField(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && !!el.closest("input, textarea, select, [contenteditable='true']");
}

export function LogBrowser() {
  // Stock mounts LogBrowser once and drives isOpen off the #logs-modal Bootstrap
  // show/hide lifecycle (see the effect below), so it starts closed. Forge has no
  // #logs-modal — it mounts <LogBrowser /> directly inside its own modal, and only
  // while that modal is open. With no stock modal to track, the show event never
  // fires and isOpen would be stuck false, leaving sessions/lines unloaded. So when
  // #logs-modal is absent, treat the component as open from mount.
  const [isOpen, setIsOpen] = useState(() => !document.getElementById("logs-modal"));
  const [activeTab, setActiveTab] = useState<"logs" | "manage">("logs");
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  // The session `flatLines` belong to. Lags `currentSession` while a newly
  // picked session loads; anything indexing into flatLines must check it.
  const [loadedSession, setLoadedSession] = useState<string | null>(null);
  const [flatLines, setFlatLines] = useState<FlatLogLine[]>([]);
  const [rangeFilter, setRangeFilter] = useState<TimeRange | null>(null);
  const [lineMenu, setLineMenu] = useState<{ x: number; y: number; timestamp: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastSearch, setLastSearch] = useState<{ query: string; scope: SearchScope } | null>(null);
  const [searchScope, setSearchScope] = useState<SearchScope>("all");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchSessionGroups, setSearchSessionGroups] = useState<SearchSessionGroup[]>([]);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const [scrollRequest, setScrollRequest] = useState<ScrollRequest | null>(null);
  const [lineMetrics, setLineMetrics] = useState<LineMetrics | null>(null);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number; sessionName: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [logsDb] = useState(() => new LogsDatabase());
  const exportWorkerRef = useRef<Worker | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const searchRequestIdRef = useRef(0);

  // Narrow the rendered lines to the selected timeline window. Lines are
  // chronologically ordered, so the range maps to a contiguous slice; the
  // offset lets us translate search/highlight indices (into the full
  // flatLines) back onto the visible slice.
  const { visibleLines, visibleStartIdx } = useMemo(() => {
    if (!rangeFilter) return { visibleLines: flatLines, visibleStartIdx: 0 };
    const start = flatLines.findIndex(l => l.timestamp >= rangeFilter.from);
    if (start === -1) return { visibleLines: [] as FlatLogLine[], visibleStartIdx: 0 };
    let end = flatLines.length - 1;
    while (end >= start && flatLines[end].timestamp > rangeFilter.to) end--;
    return { visibleLines: flatLines.slice(start, end + 1), visibleStartIdx: start };
  }, [flatLines, rangeFilter]);

  // Rows are measured once rendered, but everything above the viewport is only
  // ever estimated — so the estimate decides where a jump lands and how steady
  // the scrollbar is. Lines are monospace and wrap at the preview width, so the
  // wrapped row count follows from the text length.
  const estimateSize = useCallback((index: number) => {
    if (!lineMetrics) return 20;
    const length = visibleLines[index]?.text.length ?? 0;
    return Math.max(1, Math.ceil(length / lineMetrics.cols)) * lineMetrics.lineHeight;
  }, [lineMetrics, visibleLines]);

  const virtualizer = useVirtualizer({
    count: visibleLines.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    getItemKey: (index) => visibleStartIdx + index,
    overscan: 30,
  });

  // Cached row sizes belong to one session at one width; start over when either changes.
  useEffect(() => {
    virtualizer.measure();
  }, [lineMetrics, loadedSession, virtualizer]);

  // Measure a character cell and the time column, and re-measure on resize.
  useLayoutEffect(() => {
    const el = parentRef.current;
    const probe = probeRef.current;
    if (!el || !probe) return;
    const measure = () => {
      const time = probe.querySelector<HTMLElement>(".log-time");
      const text = probe.querySelector<HTMLElement>(".logs-preview-probe-text");
      if (!time || !text) return;
      const style = getComputedStyle(el);
      const inner = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const textRect = text.getBoundingClientRect();
      if (inner <= 0 || textRect.width <= 0) return;
      const charWidth = textRect.width / 10;
      const cols = Math.max(10, Math.floor((inner - time.getBoundingClientRect().width) / charWidth));
      const lineHeight = probe.getBoundingClientRect().height;
      setLineMetrics(prev => (prev && prev.cols === cols && prev.lineHeight === lineHeight ? prev : { cols, lineHeight }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeTab]);

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

  // Reusable session loader
  const reloadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const db = await logsDb.get();
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
  }, [logsDb]);

  // Load sessions when modal opens; let go of the database once it closes
  useEffect(() => {
    if (!isOpen) return;
    reloadSessions();
    return () => logsDb.release();
  }, [isOpen, reloadSessions, logsDb]);

  // Reset the timeline window whenever the selected session changes
  useEffect(() => {
    setRangeFilter(null);
    setLineMenu(null);
  }, [currentSession]);

  // Load session data when current session changes or modal opens
  useEffect(() => {
    if (!isOpen || !currentSession) return;
    let cancelled = false;

    const loadSession = async () => {
      setIsLoading(true);
      try {
        const db = await logsDb.get();
        if (!db || cancelled) return;
        const groups = await getSessionData(db, currentSession);
        if (cancelled) return;
        setFlatLines(flattenLogGroups(groups));
        setLoadedSession(currentSession);
        // Open at the end of the log, unless a search result is waiting for this session.
        setScrollRequest(prev =>
          prev && prev.session === currentSession ? prev : { session: currentSession, target: "bottom", align: "end" });
        // Keys scroll the preview without clicking into it first.
        if (!isTextField(document.activeElement)) parentRef.current?.focus({ preventScroll: true });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadSession();
    return () => { cancelled = true; };
  }, [isOpen, currentSession, logsDb]);

  // Jump to a row. Rows above it are only estimated until rendered, so the
  // offset is re-read and re-applied each frame until it holds; any input of
  // the user's own in the preview abandons the jump. (The virtualizer's own
  // scrollToIndex keeps re-snapping to the target for seconds, fighting a user
  // who scrolls away, and gives up on a scroll clamped by a not-yet-grown list.)
  const scrollJobRef = useRef<number | null>(null);
  const cancelScrollJob = useCallback(() => {
    if (scrollJobRef.current !== null) cancelAnimationFrame(scrollJobRef.current);
    scrollJobRef.current = null;
  }, []);

  const scrollToLine = useCallback((index: number, align: ScrollRequest["align"]) => {
    cancelScrollJob();
    const el = parentRef.current;
    if (!el) return;
    let stableFrames = 0;
    let frames = 0;
    const step = () => {
      scrollJobRef.current = null;
      const offset = virtualizer.getOffsetForIndex(index, align);
      if (!offset) return;
      const target = Math.max(0, Math.min(offset[0], el.scrollHeight - el.clientHeight));
      if (Math.abs(el.scrollTop - target) <= 1) stableFrames++;
      else {
        stableFrames = 0;
        el.scrollTop = target;
      }
      if (stableFrames >= 3 || ++frames > 60) return;
      scrollJobRef.current = requestAnimationFrame(step);
    };
    step();
  }, [virtualizer, cancelScrollJob]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const events = ["wheel", "pointerdown", "touchstart", "keydown"] as const;
    for (const type of events) el.addEventListener(type, cancelScrollJob, { passive: true });
    return () => {
      for (const type of events) el.removeEventListener(type, cancelScrollJob);
      cancelScrollJob();
    };
  }, [activeTab, cancelScrollJob]);

  // Carry out a pending scroll once its session is the one on screen.
  useEffect(() => {
    if (!scrollRequest || scrollRequest.session !== loadedSession || isLoading) return;
    const count = visibleLines.length;
    if (count === 0) {
      setScrollRequest(null);
      return;
    }
    let index: number;
    if (scrollRequest.target === "top") index = 0;
    else if (scrollRequest.target === "bottom") index = count - 1;
    else {
      index = scrollRequest.target - visibleStartIdx;
      if ((index < 0 || index >= count) && rangeFilter) {
        // Outside the timeline window: widen to the whole log and retry.
        setRangeFilter(null);
        return;
      }
      index = Math.min(count - 1, Math.max(0, index));
    }
    scrollToLine(index, scrollRequest.align);
    setScrollRequest(null);
  }, [scrollRequest, loadedSession, isLoading, visibleLines, visibleStartIdx, rangeFilter, scrollToLine]);

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
    // Reveal the chosen boundary line: "start here" lands at the top, "end here" at the bottom.
    if (loadedSession) {
      setScrollRequest(kind === "start"
        ? { session: loadedSession, target: "top", align: "start" }
        : { session: loadedSession, target: "bottom", align: "end" });
    }
  }, [flatLines, loadedSession]);

  // Dismiss the line context menu on outside click, Escape, or scrolling the
  // preview. Only the preview's own scroll counts: the game output keeps
  // scrolling behind the modal as lines arrive. And only real movement: a scroll
  // event can land just after the menu opened (the tail of a wheel or
  // scroll-into-view) without the lines having moved since.
  useEffect(() => {
    if (!lineMenu) return;
    const close = () => setLineMenu(null);
    const preview = parentRef.current;
    const openedAt = preview?.scrollTop ?? 0;
    const onScroll = () => {
      if (preview && Math.abs(preview.scrollTop - openedAt) > 2) close();
    };
    // Capture phase, so Escape closes just the menu and never reaches the dialog.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      setLineMenu(null);
    };
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey, true);
    preview?.addEventListener("scroll", onScroll);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey, true);
      preview?.removeEventListener("scroll", onScroll);
    };
  }, [lineMenu]);

  // Page Up/Down, Home and End scroll the preview from anywhere in the dialog
  // except text fields. Bootstrap keeps focus on the modal element, which sits
  // above this component, so listen there.
  useEffect(() => {
    if (!isOpen || activeTab !== "logs") return;
    const root = rootRef.current;
    const host: HTMLElement | null = root?.closest(".modal") ?? root;
    if (!host) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTextField(e.target)) return;
      const el = parentRef.current;
      const count = visibleLines.length;
      if (!el || count === 0) return;
      const page = Math.max(20, el.clientHeight - 40);
      switch (e.key) {
        case "PageDown": cancelScrollJob(); el.scrollTop += page; break;
        case "PageUp": cancelScrollJob(); el.scrollTop -= page; break;
        case "Home": scrollToLine(0, "start"); break;
        case "End": scrollToLine(count - 1, "end"); break;
        default: return;
      }
      e.preventDefault();
    };
    host.addEventListener("keydown", onKey);
    return () => host.removeEventListener("keydown", onKey);
  }, [isOpen, activeTab, visibleLines.length, scrollToLine, cancelScrollJob]);

  // Select a search result and scroll to it, switching sessions if needed.
  const goToResult = useCallback((results: SearchResult[], index: number) => {
    const result = results[index];
    if (!result) return;
    setActiveResultIndex(index);
    setScrollRequest({ session: result.sessionName, target: result.matches[0].flatIndex, align: "center" });
    setCurrentSession(result.sessionName);
  }, []);

  // Search functionality
  const runSearch = useCallback(async () => {
    const { regex, error } = parseSearchQuery(searchQuery);
    const trimmed = searchQuery.trim();

    if (!trimmed) {
      setSearchMessage("Wpisz fraze wyszukiwania.");
      setSearchResults([]);
      setSearchSessionGroups([]);
      setActiveResultIndex(-1);
      setLastSearch(null);
      return;
    }

    if (!regex) {
      setSearchMessage(error ?? "Nie udalo sie utworzyc wyrazenia wyszukiwania.");
      setSearchResults([]);
      setSearchSessionGroups([]);
      setActiveResultIndex(-1);
      setLastSearch(null);
      return;
    }

    if (sessions.length === 0) {
      setSearchMessage("Brak logow do wyswietlenia.");
      return;
    }

    // "range" without a range left (cleared since) searches the whole open log.
    const scope: SearchScope = searchScope === "range" && !rangeFilter ? "session" : searchScope;
    const currentSessionInfo = scope !== "all" ? sessions.find(s => s.name === loadedSession) : undefined;
    if (scope !== "all" && !currentSessionInfo) {
      setSearchMessage("Brak otwartego logu do przeszukania.");
      return;
    }

    const requestId = ++searchRequestIdRef.current;
    setLastSearch({ query: trimmed, scope });
    setSearchMessage("Wyszukiwanie...");
    setSearchResults([]);
    setSearchSessionGroups([]);
    setActiveResultIndex(-1);

    const baseFlags = normalizeFlags(regex.flags);
    const globalFlags = `${baseFlags}g`;
    const allResults: SearchResult[] = [];
    const sessionGroupsMap = new Map<string, SearchSessionGroup>();

    if (currentSessionInfo) {
      // Search only the open session (or its timeline window) using in-memory flatLines
      const groupMap = new Map<number, { timestamp: number; dateTime: string; matches: LineMatch[] }>();
      const [firstLine, endLine] = scope === "range"
        ? [visibleStartIdx, visibleStartIdx + visibleLines.length]
        : [0, flatLines.length];

      for (let flatIndex = firstLine; flatIndex < endLine; flatIndex++) {
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
        allResults.push({
          sessionName: currentSessionInfo.name,
          sessionLabel: currentSessionInfo.label,
          groupTimestamp: group.timestamp,
          groupDateTime: group.dateTime,
          matches: group.matches,
        });
      }
      if (allResults.length > 0) {
        sessionGroupsMap.set(currentSessionInfo.name, {
          sessionName: currentSessionInfo.name,
          sessionLabel: currentSessionInfo.label,
          results: allResults,
          totalMatches: allResults.reduce((sum, r) => sum + r.matches.length, 0),
        });
      }
    } else {
      // Search all sessions via IndexedDB
      const db = await logsDb.get();
      if (requestId !== searchRequestIdRef.current) return;
      if (!db) {
        setSearchMessage("Nie udalo sie otworzyc bazy danych.");
        return;
      }

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

    setSearchMessage(null);
    setSearchResults(allResults);
    setSearchSessionGroups(Array.from(sessionGroupsMap.values()));

    // Jump to the first result at or after what is on screen now, so searching
    // the open log continues from where you are rather than from its start.
    let first = 0;
    const range = virtualizer.range;
    if (loadedSession && range) {
      const viewIndex = visibleStartIdx + range.startIndex;
      const idx = allResults.findIndex(r => r.sessionName === loadedSession && r.matches[0].flatIndex >= viewIndex);
      if (idx !== -1) first = idx;
    }
    goToResult(allResults, first);
  }, [searchQuery, sessions, loadedSession, searchScope, rangeFilter, flatLines, logsDb, visibleStartIdx, visibleLines.length, virtualizer, goToResult]);

  const handleResultClick = (globalIndex: number) => goToResult(searchResults, globalIndex);

  const handlePrev = () => {
    if (searchResults.length === 0) return;
    goToResult(searchResults, (activeResultIndex - 1 + searchResults.length) % searchResults.length);
  };

  const handleNext = () => {
    if (searchResults.length === 0) return;
    goToResult(searchResults, (activeResultIndex + 1) % searchResults.length);
  };

  // Matches of the loaded session, by line, for painting them in the preview.
  const matchesByLine = useMemo(() => {
    const map = new Map<number, MatchSpan[]>();
    for (const r of searchResults) {
      if (r.sessionName !== loadedSession) continue;
      for (const m of r.matches) {
        let spans = map.get(m.flatIndex);
        if (!spans) map.set(m.flatIndex, spans = []);
        spans.push({ start: m.matchIndex, length: m.text.length });
      }
    }
    return map;
  }, [searchResults, loadedSession]);

  const activeLines = useMemo(() => {
    const result = searchResults[activeResultIndex];
    if (!result || result.sessionName !== loadedSession) return new Set<number>();
    return new Set(result.matches.map(m => m.flatIndex));
  }, [searchResults, activeResultIndex, loadedSession]);

  const totalMatches = useMemo(() => searchResults.reduce((sum, r) => sum + r.matches.length, 0), [searchResults]);

  // Seek from a timeline click: bring the first line at that time to the top.
  const handleSeek = useCallback((ts: number) => {
    if (!loadedSession || flatLines.length === 0) return;
    setScrollRequest({ session: loadedSession, target: lowerBoundByTime(flatLines, ts), align: "start" });
  }, [loadedSession, flatLines]);

  // Download
  const handleDownload = useCallback(async () => {
    if (!currentSession) return;
    const db = await logsDb.get();
    if (!db) return;

    const tx = db.transaction(currentSession, "readonly");
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
  }, [currentSession, rangeFilter, logsDb]);

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
    if (!currentSession || isDeleting) return;
    if (!confirm("Czy na pewno chcesz usunac ten log?")) return;

    setIsDeleting(true);
    try {
      await logsDb.upgrade(upgradeDb => {
        if (upgradeDb.objectStoreNames.contains(currentSession)) {
          upgradeDb.deleteObjectStore(currentSession);
        }
      });

      setFlatLines([]);
      setLoadedSession(null);
      setCurrentSession(null);
      reloadSessions();
    } catch (error) {
      console.error("[Logs] Delete failed:", error);
    } finally {
      setIsDeleting(false);
    }
  }, [currentSession, isDeleting, reloadSessions, logsDb]);

  // Re-run search when the scope toggle changes and there's an active search
  const prevSearchScopeRef = useRef(searchScope);
  useEffect(() => {
    if (prevSearchScopeRef.current !== searchScope) {
      prevSearchScopeRef.current = searchScope;
      if (lastSearch) runSearch();
    }
  }, [searchScope, lastSearch, runSearch]);

  // Setting a timeline window while searching the open log narrows the search
  // to it; clearing the window widens it back.
  const hasRange = rangeFilter !== null;
  useEffect(() => {
    setSearchScope(scope => {
      if (hasRange && scope === "session") return "range";
      if (!hasRange && scope === "range") return "session";
      return scope;
    });
  }, [hasRange]);

  // A range search follows the window, once a drag settles.
  const runSearchRef = useRef(runSearch);
  runSearchRef.current = runSearch;
  const lastSearchScopeRef = useRef(lastSearch?.scope);
  lastSearchScopeRef.current = lastSearch?.scope;
  useEffect(() => {
    if (lastSearchScopeRef.current !== "range" || !rangeFilter) return;
    const timer = window.setTimeout(() => runSearchRef.current(), 300);
    return () => window.clearTimeout(timer);
  }, [rangeFilter]);

  // Enter searches; pressed again on the same query it steps through the
  // results (Shift+Enter backwards), like find-in-page.
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const unchanged = lastSearch && lastSearch.query === searchQuery.trim() && lastSearch.scope === searchScope;
    if (unchanged && searchResults.length > 0) {
      if (e.shiftKey) handlePrev();
      else handleNext();
    } else {
      runSearch();
    }
  };

  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value);
    if (!value.trim()) {
      searchRequestIdRef.current++;
      setSearchMessage(null);
      setSearchResults([]);
      setSearchSessionGroups([]);
      setActiveResultIndex(-1);
      setLastSearch(null);
    }
  }, []);

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

  // Time span on screen, for the timeline's position marker.
  const viewRange = virtualizer.range;
  const viewport = viewRange && visibleLines.length > 0 && loadedSession === currentSession
    ? {
      from: visibleLines[Math.min(viewRange.startIndex, visibleLines.length - 1)].timestamp,
      to: visibleLines[Math.min(viewRange.endIndex, visibleLines.length - 1)].timestamp,
    }
    : null;

  const menuPosition = lineMenu && {
    left: Math.max(0, Math.min(lineMenu.x, window.innerWidth - 200)),
    top: Math.max(0, Math.min(lineMenu.y, window.innerHeight - 80)),
  };

  return (
    <div ref={rootRef} className="modal-body d-flex flex-column gap-2 logs-browser">
      {activeTab === "logs" && (<>
        <div className="d-flex gap-2 flex-wrap logs-toolbar">
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
            {`Otwórz w nowej karcie`}
          </button>
        </div>

        <div className="d-flex flex-column gap-2">
          <div className="d-flex gap-2 align-items-center flex-wrap logs-search-bar">
            <div className="logs-search-input-wrapper flex-grow-1">
              <input
                id="logs-search-input"
                className="form-control"
                placeholder={`${SEARCH_SCOPES.find(s => s.value === searchScope)!.placeholder} (fraza lub /wzorzec/)`}
                title="Enter: szukaj, potem nastepny wynik. Shift+Enter: poprzedni."
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
            {searchResults.length > 0 && (
              <div id="logs-search-controls" className="logs-search-controls">
                <button
                  id="logs-search-prev"
                  className="btn btn-outline-secondary btn-sm"
                  type="button"
                  title="Poprzedni wynik (Shift+Enter)"
                  onClick={handlePrev}
                >
                  {"▲"}
                </button>
                <span className="logs-search-position">{`${activeResultIndex + 1} / ${searchResults.length}`}</span>
                <button
                  id="logs-search-next"
                  className="btn btn-outline-secondary btn-sm"
                  type="button"
                  title="Nastepny wynik (Enter)"
                  onClick={handleNext}
                >
                  {"▼"}
                </button>
              </div>
            )}
            <button
              id="logs-search-button"
              className="btn btn-primary"
              onClick={runSearch}
            >
              Szukaj
            </button>
            <div id="logs-search-scope" className="btn-group btn-group-sm" title="Gdzie szukac">
              {SEARCH_SCOPES.map(option => (
                <button
                  key={option.value}
                  type="button"
                  data-scope={option.value}
                  className={`btn ${searchScope === option.value ? "btn-primary" : "btn-outline-secondary"}`}
                  disabled={option.value === "range" && !rangeFilter}
                  title={option.value === "range" && !rangeFilter ? "Zaznacz zakres na osi czasu" : option.placeholder}
                  onClick={() => setSearchScope(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {searchMessage && (
            <div id="logs-search-results" className="logs-search-results border rounded">
              <div className="logs-search-empty">{searchMessage}</div>
            </div>
          )}

          {searchSessionGroups.length > 0 && (
            <SearchResults
              sessionGroups={searchSessionGroups}
              totalResults={searchResults.length}
              totalMatches={totalMatches}
              activeResultIndex={activeResultIndex}
              onResultClick={handleResultClick}
              hideSessionHeaders={lastSearch?.scope !== "all"}
              rangeLabel={lastSearch?.scope === "range" && rangeFilter
                ? `${formatTime(rangeFilter.from).slice(0, 8)} – ${formatTime(rangeFilter.to).slice(0, 8)}`
                : undefined}
            />
          )}
        </div>

        {flatLines.length > 0 && (
          <LogTimeline
            lines={flatLines}
            value={rangeFilter}
            onChange={setRangeFilter}
            viewport={viewport}
            onSeek={handleSeek}
          />
        )}

        <div
          id="logs-preview"
          ref={parentRef}
          className="border"
          tabIndex={0}
          style={{ position: "relative" }}
        >
          <div ref={probeRef} className="output_msg logs-preview-probe">
            <div className="output_msg_text">
              <span className="log-time">00:00:00.000</span>
              <span className="logs-preview-probe-text">MMMMMMMMMM</span>
            </div>
          </div>
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
              const flatIndex = visibleStartIdx + virtualRow.index;
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
                    isHighlighted={activeLines.has(flatIndex)}
                    matches={matchesByLine.get(flatIndex)}
                    onContextMenu={handleLineContextMenu}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {lineMenu && menuPosition && (
          <div
            className="logs-line-menu"
            style={menuPosition}
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
          logsDb={logsDb}
          sessions={sessions}
          onSessionsChanged={reloadSessions}
          onViewSession={(name) => { setCurrentSession(name); setActiveTab("logs"); }}
        />
      )}
    </div>
  );
}

// This module is side-effect free on purpose: stock mounts the browser via
// `logBrowserMount.tsx`, while forge-ui and the log viewer host these
// components inside their own shells.
