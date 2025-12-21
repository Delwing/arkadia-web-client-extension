import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import storage from "@modules/core/storage";

interface LogEntry {
  text: string;
  type?: string;
  timestamp: number;
}

interface ParsedLogLine {
  html: string;
  text: string;
}

interface ParsedLogGroup {
  timestamp: number;
  time: string;
  dateTime: string;
  type?: string;
  lines: ParsedLogLine[];
}

interface FlatLogLine {
  groupIndex: number;
  lineIndex: number;
  time: string;
  html: string;
  text: string;
  type?: string;
  timestamp: number;
}

interface SessionInfo {
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

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da} ${formatTime(ts)}`;
}

function formatSessionLabel(name: string): string {
  if (name.startsWith("session_")) {
    const ts = parseInt(name.slice("session_".length), 10);
    if (!Number.isNaN(ts)) {
      return new Date(ts).toLocaleString();
    }
  }
  return name;
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

function parseSearchQuery(query: string): { regex: RegExp | null; error?: string } {
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

function parseLogEntries(entries: LogEntry[]): ParsedLogGroup[] {
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

function flattenLogGroups(groups: ParsedLogGroup[]): FlatLogLine[] {
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

async function openDb(): Promise<IDBDatabase | null> {
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

async function getSessionData(db: IDBDatabase, storeName: string): Promise<ParsedLogGroup[]> {
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
    req.onsuccess = () => {
      const logs = req.result as LogEntry[];
      resolve(parseLogEntries(logs));
    };
    req.onerror = () => {
      console.error(`Failed to read from ${storeName}:`, req.error);
      resolve([]);
    };
  });
}

function LogLine({ line, isHighlighted }: { line: FlatLogLine; isHighlighted: boolean }) {
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
  onResultClick
}: {
  sessionGroups: SearchSessionGroup[];
  activeResultIndex: number;
  activeSessionName: string | null;
  onResultClick: (globalIndex: number) => void;
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
            <div className="logs-search-session-header">
              <span className="logs-search-session-title">{session.sessionLabel}</span>
              <span className="logs-search-session-count">({session.totalMatches})</span>
            </div>
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
  const [loggingEnabled, setLoggingEnabled] = useState(true);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [flatLines, setFlatLines] = useState<FlatLogLine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchSessionGroups, setSearchSessionGroups] = useState<SearchSessionGroup[]>([]);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const [highlightedIndices, setHighlightedIndices] = useState<Set<number>>(new Set());
  const [pendingScrollTarget, setPendingScrollTarget] = useState<SearchResult | null>(null);

  const dbRef = useRef<IDBDatabase | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const searchRequestIdRef = useRef(0);

  const virtualizer = useVirtualizer({
    count: flatLines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 20,
    overscan: 50,
  });

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

  // Load logging preference
  useEffect(() => {
    storage.getItem("loggingEnabled").then(res => {
      setLoggingEnabled(res?.loggingEnabled !== false);
    });
  }, []);

  // Save logging preference
  const handleLoggingChange = useCallback((enabled: boolean) => {
    setLoggingEnabled(enabled);
    storage.setItem("loggingEnabled", enabled);
  }, []);

  // Load sessions when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const loadSessions = async () => {
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
          setCurrentSession(latest.name);
        } else {
          setSearchMessage("Brak logow do wyswietlenia.");
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadSessions();
  }, [isOpen]);

  // Load session data when current session changes
  useEffect(() => {
    if (!currentSession || !dbRef.current) return;

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
  }, [currentSession, pendingScrollTarget]);

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

    const db = dbRef.current;
    if (!db) return;

    const baseFlags = normalizeFlags(regex.flags);
    const globalFlags = `${baseFlags}g`;
    const allResults: SearchResult[] = [];
    const sessionGroupsMap = new Map<string, SearchSessionGroup>();

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

    if (requestId !== searchRequestIdRef.current) return;

    if (allResults.length === 0) {
      setSearchMessage("Brak wynikow.");
      return;
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
  }, [searchQuery, sessions, currentSession, virtualizer]);

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
      const inlineStyles: string[] = [];
      const linkTags: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const rules = Array.from(sheet.cssRules);
          inlineStyles.push(rules.map(r => r.cssText).join("\n"));
        } catch {
          const href = (sheet as CSSStyleSheet).href;
          if (href) {
            linkTags.push(`<link rel="stylesheet" href="${href}">`);
          }
        }
      }
      inlineStyles.push("html, body { overflow: auto; } #logs-preview { height: auto; }");

      const head = `<meta charset="UTF-8">\n${linkTags.join("\n")}\n<style>${inlineStyles.join("\n")}</style>`;
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

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="modal-body d-flex flex-column gap-2">
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

      <div className="d-flex gap-2">
        <select
          id="logs-session-select"
          className="form-select"
          value={currentSession ?? ""}
          onChange={(e) => setCurrentSession(e.target.value)}
        >
          {sessions.map(s => (
            <option key={s.name} value={s.name}>{s.label}</option>
          ))}
        </select>
        <button
          id="logs-download"
          className="btn btn-secondary"
          onClick={handleDownload}
        >
          Pobierz
        </button>
      </div>

      <div className="d-flex flex-column gap-2">
        <div className="d-flex gap-2 align-items-end flex-wrap">
          <div className="flex-grow-1">
            <label htmlFor="logs-search-input" className="form-label mb-1">Szukaj w logach</label>
            <input
              id="logs-search-input"
              className="form-control"
              placeholder="Fraza lub /wzorzec/"
              value={searchQuery}
              onChange={(e) => handleSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
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
    </div>
  );
}

let initialized = false;

export function initLogBrowser(): boolean {
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
  console.log("[Logs] React log browser initialized");
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
