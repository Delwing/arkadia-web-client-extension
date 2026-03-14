import { useState, useEffect, useRef, useCallback, useMemo, Fragment, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { globalStorage } from "@modules/core/storage";
import type { LogsExportWorkerResponse, LogExportData } from "./logsExport.shared";
import LogsExportWorker from "./logsExport.worker?worker";
import { isFileSaveSupported, isFileSaveActive, enableFileSave, disableFileSave, getDirectoryName, onStatusChange } from "./logFileSaver";

export interface LogEntry {
  text: string;
  type?: string;
  timestamp: number;
}

export interface ParsedLogLine {
  html: string;
  text: string;
}

export interface ParsedLogGroup {
  timestamp: number;
  time: string;
  dateTime: string;
  type?: string;
  lines: ParsedLogLine[];
}

export interface FlatLogLine {
  groupIndex: number;
  lineIndex: number;
  time: string;
  html: string;
  text: string;
  type?: string;
  timestamp: number;
}

export interface SessionInfo {
  name: string;
  label: string;
}

interface LineMatch {
  flatIndex: number;
  matchIndex: number;
  text: string;
  lineText: string;
}

interface SearchResult {
  sessionName: string;
  sessionLabel: string;
  groupTimestamp: number;
  groupDateTime: string;
  matches: LineMatch[];
}

interface SearchSessionGroup {
  sessionName: string;
  sessionLabel: string;
  results: SearchResult[];
  totalMatches: number;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da} ${formatTime(ts)}`;
}

export function formatSessionLabel(name: string): string {
  if (name.startsWith("session_")) {
    const ts = parseInt(name.slice("session_".length), 10);
    if (!Number.isNaN(ts)) {
      const d = new Date(ts);
      const da = String(d.getDate()).padStart(2, "0");
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      const h = String(d.getHours()).padStart(2, "0");
      const m = String(d.getMinutes()).padStart(2, "0");
      const s = String(d.getSeconds()).padStart(2, "0");
      return `${da}.${mo} ${h}:${m}:${s}`;
    }
  }
  return name;
}

export function getSessionYear(name: string): number | null {
  if (name.startsWith("session_")) {
    const ts = parseInt(name.slice("session_".length), 10);
    if (!Number.isNaN(ts)) return new Date(ts).getFullYear();
  }
  return null;
}

/** Collect only CSS rules relevant to log HTML output. */
function collectLogStyles(): string {
  const logContainer = document.getElementById("logs-preview");
  if (!logContainer) return "";

  // Collect all class names actually used in the log preview
  const usedClasses = new Set<string>();
  for (const el of logContainer.querySelectorAll("[class]")) {
    for (const cls of el.classList) usedClasses.add(cls);
  }
  // Also include ansi animation classes that may appear in log content
  usedClasses.add("ansi-slow-blink");
  usedClasses.add("ansi-rapid-blink");
  usedClasses.add("ansi-dim");

  function isRelevantRule(rule: CSSRule): boolean {
    if (rule instanceof CSSKeyframesRule) {
      const name = rule.name;
      return name.startsWith("ansi-");
    }
    if (rule instanceof CSSStyleRule) {
      const sel = rule.selectorText;
      // Match rules that reference #logs-preview or any used class
      if (sel.includes("#logs-preview")) return true;
      if (sel === ":root" || sel === "body" || sel === "html" || sel === "html, body") return true;
      for (const cls of usedClasses) {
        if (sel.includes(`.${cls}`)) return true;
      }
      return false;
    }
    if (rule instanceof CSSMediaRule) {
      const inner: string[] = [];
      for (const child of Array.from(rule.cssRules)) {
        if (isRelevantRule(child)) inner.push(child.cssText);
      }
      if (inner.length > 0) return true;
    }
    return false;
  }

  function extractRuleCss(rule: CSSRule): string {
    if (rule instanceof CSSMediaRule) {
      const inner: string[] = [];
      for (const child of Array.from(rule.cssRules)) {
        if (isRelevantRule(child)) inner.push(child.cssText);
      }
      if (inner.length > 0) {
        return `@media ${rule.conditionText} { ${inner.join("\n")} }`;
      }
      return "";
    }
    return rule.cssText;
  }

  const parts: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        if (isRelevantRule(rule)) {
          const css = extractRuleCss(rule);
          if (css) parts.push(css);
        }
      }
    } catch {
      // Skip cross-origin stylesheets
    }
  }
  return parts.join("\n");
}

function splitLines(html: string): string[] {
  const lines: string[] = [];
  const stack: { open: string; close: string }[] = [];
  let line = "";
  const regex = /(<[^>]+>|\r?\n)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const token = match[0];
    line += html.slice(last, match.index);
    if (token === "\n" || token === "\r\n") {
      lines.push(line + stack.map(s => s.close).reverse().join(""));
      line = stack.map(s => s.open).join("");
    } else {
      line += token;
      if (token.startsWith("<") && !token.startsWith("</") && !token.endsWith("/>") && !token.startsWith("<!")) {
        const tag = token.match(/^<([a-zA-Z0-9:-]+)/);
        if (tag) stack.push({ open: token, close: `</${tag[1]}>` });
      } else if (token.startsWith("</")) {
        stack.pop();
      }
    }
    last = regex.lastIndex;
  }
  line += html.slice(last);
  lines.push(line);
  return lines;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeFlags(flags: string): string {
  const filtered = flags.replace(/g/g, "");
  const parts = filtered.split("").filter(part => part !== "");
  return Array.from(new Set(parts)).join("");
}

export function parseSearchQuery(query: string): { regex: RegExp | null; error?: string } {
  const trimmed = query.trim();
  if (!trimmed) {
    return { regex: null };
  }
  if (trimmed.startsWith("/")) {
    let escaped = false;
    for (let i = 1; i < trimmed.length; i++) {
      const char = trimmed[i];
      if (!escaped && char === "/") {
        const pattern = trimmed.slice(1, i);
        const flags = trimmed.slice(i + 1);
        try {
          return { regex: new RegExp(pattern, flags) };
        } catch {
          return { regex: null, error: "Niepoprawne wyrazenie regularne." };
        }
      }
      escaped = !escaped && char === "\\";
    }
  }
  try {
    return { regex: new RegExp(escapeRegExp(trimmed), "i") };
  } catch {
    return { regex: null, error: "Nie udalo sie utworzyc wyrazenia wyszukiwania." };
  }
}

const textParser = document.createElement("div");

export function parseLogEntries(entries: LogEntry[]): ParsedLogGroup[] {
  const groups: ParsedLogGroup[] = [];
  for (const entry of entries) {
    const lines: ParsedLogLine[] = [];
    const parts = splitLines(entry.text);
    for (const part of parts) {
      textParser.innerHTML = part;
      const text = textParser.textContent ?? "";
      textParser.textContent = "";
      lines.push({ html: part, text });
    }
    groups.push({
      timestamp: entry.timestamp,
      time: formatTime(entry.timestamp),
      dateTime: formatDateTime(entry.timestamp),
      type: entry.type,
      lines,
    });
  }
  return groups;
}

export function flattenLogGroups(groups: ParsedLogGroup[]): FlatLogLine[] {
  const flat: FlatLogLine[] = [];
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex];
    for (let lineIndex = 0; lineIndex < group.lines.length; lineIndex++) {
      const line = group.lines[lineIndex];
      flat.push({
        groupIndex,
        lineIndex,
        time: group.time,
        html: line.html,
        text: line.text,
        type: group.type,
        timestamp: group.timestamp,
      });
    }
  }
  return flat;
}

export async function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open("ArkadiaMessagesDB");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.error("[Logs] Failed to open IndexedDB:", request.error);
        resolve(null);
      };
    } catch (error) {
      console.error("[Logs] Error opening IndexedDB:", error);
      resolve(null);
    }
  });
}

export async function getRawSessionData(db: IDBDatabase, storeName: string): Promise<LogEntry[]> {
  return new Promise(resolve => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(storeName, "readonly");
    } catch (error) {
      console.error(`Failed to create transaction for ${storeName}:`, error);
      resolve([]);
      return;
    }
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result as LogEntry[]);
    req.onerror = () => {
      console.error(`Failed to read from ${storeName}:`, req.error);
      resolve([]);
    };
  });
}

export async function getSessionData(db: IDBDatabase, storeName: string): Promise<ParsedLogGroup[]> {
  const logs = await getRawSessionData(db, storeName);
  return parseLogEntries(logs);
}

// --- Downloaded status persistence via separate IndexedDB ---

function openMetaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("ArkadiaLogsMetaDB", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("downloaded")) {
        db.createObjectStore("downloaded");
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
                      <td colSpan={6} style={{ top: theadHeight }}>{year}</td>
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

export function LogLine({ line, isHighlighted }: { line: FlatLogLine; isHighlighted: boolean }) {
  const classes = ["output_msg"];
  if (line.type) classes.push(line.type);
  if (isHighlighted) classes.push("logs-preview-highlight");

  return (
    <div className={classes.join(" ")}>
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

  const virtualizer = useVirtualizer({
    count: flatLines.length,
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
        if (!pendingScrollTarget || pendingScrollTarget.sessionName !== currentSession) {
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
  }, [isOpen, currentSession, pendingScrollTarget]);

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

    // Highlight and scroll to first result
    if (allResults.length > 0) {
      const firstResult = allResults[0];
      if (firstResult.sessionName === currentSession) {
        const indices = new Set(firstResult.matches.map(m => m.flatIndex));
        setHighlightedIndices(indices);
        if (firstResult.matches.length > 0) {
          virtualizer.scrollToIndex(firstResult.matches[0].flatIndex, { align: "center" });
        }
        setTimeout(() => setHighlightedIndices(new Set()), 2000);
      } else {
        // Switch to the session with first result
        setPendingScrollTarget(firstResult);
        setCurrentSession(firstResult.sessionName);
      }
    }
  }, [searchQuery, sessions, currentSession, virtualizer, searchCurrentOnly, flatLines]);

  // Handle result click
  const handleResultClick = useCallback((globalIndex: number) => {
    if (globalIndex < 0 || globalIndex >= searchResults.length) return;

    setActiveResultIndex(globalIndex);
    const result = searchResults[globalIndex];

    // Switch session if needed
    if (result.sessionName !== currentSession) {
      // Set pending scroll target - will be handled by effect after session loads
      setPendingScrollTarget(result);
      setCurrentSession(result.sessionName);
    } else {
      const indices = new Set(result.matches.map(m => m.flatIndex));
      setHighlightedIndices(indices);
      if (result.matches.length > 0) {
        virtualizer.scrollToIndex(result.matches[0].flatIndex, { align: "center" });
      }
      // Clear highlight after 2s
      setTimeout(() => setHighlightedIndices(new Set()), 2000);
    }
  }, [searchResults, currentSession, virtualizer]);

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
      const logs = req.result as LogEntry[];
      const entries: string[] = [];
      for (const l of logs) {
        const time = formatDateTime(l.timestamp);
        const parts = splitLines(l.text);
        for (const part of parts) {
          const classes = ["output_msg"];
          if (l.type) classes.push(l.type);
          const lineHtml = `<div class="${classes.join(" ")}"><div class="output_msg_text" style="white-space:pre-wrap"><span class="log-time">${time}</span><span>${part}</span></div></div>`;
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
      a.download = `${currentSession}.html`;
      a.click();
      URL.revokeObjectURL(url);
    };
  }, [currentSession]);

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
              <span className="text-muted small">Folder: {fileSaveDirName}</span>
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
            onClick={handleDownload}
          >
            Pobierz
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
              const line = flatLines[virtualRow.index];
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
                    isHighlighted={highlightedIndices.has(virtualRow.index)}
                  />
                </div>
              );
            })}
          </div>
        </div>
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
