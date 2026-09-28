import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { History } from "lucide-react";
import { foldText } from "@shared/foldText.ts";

interface HistorySearchProps {
  /** Text to start from (what was on the command line). */
  initialQuery: string;
  search: (query: string) => string[];
  /** Put the entry on the command line. */
  onPick: (entry: string) => void;
  /**
   * Closed without a pick; the command line keeps what it had. `refocus` when
   * the player backed out (Escape), not when they clicked somewhere else.
   */
  onCancel: (refocus: boolean) => void;
}

/** The query's words marked in `entry`, case and Polish letters ignored. */
function markTerms(entry: string, query: string): ReactNode {
  const terms = foldText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return entry;
  const folded = foldText(entry);
  const marked = new Array<boolean>(entry.length).fill(false);
  for (const term of terms) {
    for (let at = folded.indexOf(term); at !== -1; at = folded.indexOf(term, at + term.length)) {
      marked.fill(true, at, at + term.length);
    }
  }
  const parts: ReactNode[] = [];
  let start = 0;
  for (let i = 1; i <= entry.length; i++) {
    if (i === entry.length || marked[i] !== marked[start]) {
      const text = entry.slice(start, i);
      parts.push(marked[start] ? <mark key={start}>{text}</mark> : text);
      start = i;
    }
  }
  return parts;
}

/**
 * Ctrl+R: the command history searched as you type, fzf-style. The newest match
 * sits at the bottom, next to the command line; ↑ (or Ctrl+R again) walks to
 * older ones. Enter or Tab puts the pick on the line without sending it, so it
 * can still be edited. The search itself is the engine's (shared with any UI).
 */
export default function HistorySearch({ initialQuery, search, onPick, onCancel }: HistorySearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const results = useMemo(() => search(query), [search, query]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => setSelected(0), [query]);

  useLayoutEffect(() => {
    listRef.current?.querySelector(".is-selected")?.scrollIntoView({ block: "nearest" });
  }, [selected, results]);

  const move = (by: number) => {
    if (results.length === 0) return;
    setSelected((index) => Math.min(results.length - 1, Math.max(0, index + by)));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const older = event.key === "ArrowUp" || (event.ctrlKey && event.code === "KeyR");
    if (older || event.key === "ArrowDown") {
      event.preventDefault();
      move(older ? 1 : -1);
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      move(event.key === "PageUp" ? 10 : -10);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      if (results[selected] !== undefined) onPick(results[selected]);
      else onCancel(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel(true);
    }
  };

  // Oldest at the top, so the newest ends up right above the command line.
  const shown = results.map((entry, index) => ({ entry, index })).reverse();

  return (
    <div className="history-search" onMouseDown={(e) => e.target !== inputRef.current && e.preventDefault()}>
      {shown.length > 0 ? (
        <ul className="history-search__list" ref={listRef}>
          {shown.map(({ entry, index }) => (
            <li
              key={entry}
              className={index === selected ? "is-selected" : undefined}
              onMouseEnter={() => setSelected(index)}
              onClick={() => onPick(entry)}
            >
              {markTerms(entry.replace(/\n/g, " ⏎ "), query)}
            </li>
          ))}
        </ul>
      ) : (
        <div className="history-search__empty">Brak pasujących komend</div>
      )}
      <label className="history-search__field">
        <History size={14} strokeWidth={2.1} />
        <input
          ref={inputRef}
          value={query}
          placeholder="Szukaj w historii komend…"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => onCancel(false)}
        />
        <span className="history-search__keys"><kbd>↑↓</kbd> wybierz <kbd>Enter</kbd> wstaw <kbd>Esc</kbd> anuluj</span>
      </label>
    </div>
  );
}
