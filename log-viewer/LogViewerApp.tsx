import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  openDb,
  formatSessionLabel,
  getSessionYear,
  getSessionData,
  flattenLogGroups,
  parseSearchQuery,
  type SessionInfo,
  type FlatLogLine,
} from "../src/web/logBrowserUtils";
import { LogLine } from "../src/web/LogBrowser";

export default function LogViewerApp() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [flatLines, setFlatLines] = useState<FlatLogLine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndices, setHighlightedIndices] = useState<Set<number>>(new Set());
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [currentMatchIdx, setCurrentMatchIdx] = useState(-1);

  const dbRef = useRef<IDBDatabase | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const matchIndicesRef = useRef<number[]>([]);

  const virtualizer = useVirtualizer({
    count: flatLines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 20,
    overscan: 50,
  });

  // Load sessions on mount
  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        dbRef.current = await openDb();
        const db = dbRef.current;
        if (!db) return;

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
          } catch {
            // skip inaccessible sessions
          }
        }
        available.sort((a, b) => a.name.localeCompare(b.name));
        setSessions(available);

        // Check URL param for pre-selected session
        const params = new URLSearchParams(window.location.search);
        const requestedSession = params.get("session");

        if (requestedSession && available.some(s => s.name === requestedSession)) {
          setCurrentSession(requestedSession);
        } else if (available.length > 0) {
          setCurrentSession(available[available.length - 1].name);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Load session data when session changes
  useEffect(() => {
    if (!currentSession || !dbRef.current) return;

    (async () => {
      setIsLoading(true);
      try {
        const groups = await getSessionData(dbRef.current!, currentSession);
        const flat = flattenLogGroups(groups);
        setFlatLines(flat);
        setHighlightedIndices(new Set());
        setMatchCount(null);
        setCurrentMatchIdx(-1);
        matchIndicesRef.current = [];

        // Scroll to bottom
        setTimeout(() => {
          if (parentRef.current) {
            parentRef.current.scrollTop = parentRef.current.scrollHeight;
          }
        }, 0);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [currentSession]);

  const runSearch = useCallback(() => {
    const { regex } = parseSearchQuery(searchQuery);
    if (!regex || flatLines.length === 0) {
      setHighlightedIndices(new Set());
      setMatchCount(searchQuery.trim() ? 0 : null);
      setCurrentMatchIdx(-1);
      matchIndicesRef.current = [];
      return;
    }

    const indices: number[] = [];
    for (let i = 0; i < flatLines.length; i++) {
      if (regex.test(flatLines[i].text)) {
        indices.push(i);
      }
    }

    matchIndicesRef.current = indices;
    setHighlightedIndices(new Set(indices));
    setMatchCount(indices.length);

    if (indices.length > 0) {
      setCurrentMatchIdx(0);
      virtualizer.scrollToIndex(indices[0], { align: "center" });
    } else {
      setCurrentMatchIdx(-1);
    }
  }, [searchQuery, flatLines, virtualizer]);

  const goToMatch = useCallback((idx: number) => {
    const indices = matchIndicesRef.current;
    if (idx < 0 || idx >= indices.length) return;
    setCurrentMatchIdx(idx);
    virtualizer.scrollToIndex(indices[idx], { align: "center" });
  }, [virtualizer]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (matchCount !== null && matchCount > 0) {
        goToMatch((currentMatchIdx + 1) % matchIndicesRef.current.length);
      } else {
        runSearch();
      }
    }
  }, [runSearch, goToMatch, matchCount, currentMatchIdx]);

  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value);
    if (!value.trim()) {
      setHighlightedIndices(new Set());
      setMatchCount(null);
      setCurrentMatchIdx(-1);
      matchIndicesRef.current = [];
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

  return (
    <div className="log-viewer-root">
      <div className="log-viewer-toolbar">
        <select
          className="form-select form-select-sm"
          style={{ width: "auto", minWidth: "10rem" }}
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

        <div className="log-viewer-search-group">
          <input
            className="form-control form-control-sm"
            placeholder="Szukaj..."
            value={searchQuery}
            onChange={(e) => handleSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          <button className="btn btn-primary btn-sm" onClick={runSearch}>Szukaj</button>
          {matchCount !== null && (
            <>
              <span className="log-viewer-match-info">
                {matchCount === 0 ? "Brak wynikow" : `${currentMatchIdx + 1}/${matchCount}`}
              </span>
              {matchCount > 0 && (
                <>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={currentMatchIdx <= 0}
                    onClick={() => goToMatch(currentMatchIdx - 1)}
                  >
                    &uarr;
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={currentMatchIdx >= matchCount - 1}
                    onClick={() => goToMatch(currentMatchIdx + 1)}
                  >
                    &darr;
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div
        id="logs-preview"
        ref={parentRef}
        className="log-viewer-content"
      >
        {isLoading && (
          <div className="log-viewer-loading">Ladowanie...</div>
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
