import React, { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { DATA_SOURCES, computeNextFetch, type DataSource } from './dataSourcesRegistry';
import { Button, HeaderButton, Input } from '@web-ui/primitives';
import { ArrowLeft, Check, ChevronDown, ChevronUp, Copy, Eye, RefreshCw, Search } from 'lucide-react';
import { highlightJson } from './jsonHighlight';
import {
  clearMatches,
  findInOutput,
  paintMatches,
  revealMatch,
  type HighlightNames,
  type OutputMatch,
} from './outputSearch/outputSearch';

const POPUP_ID = 'popup:dataSources';

// Cap the rendered preview so a huge snapshot (e.g. the full map) cannot freeze
// the UI when serialised.
const PREVIEW_LIMIT = 500_000;

interface RowState {
  refreshedAt?: number;
  loading: boolean;
  error: boolean;
}

interface DetailState {
  loading: boolean;
  error: boolean;
  hasData: boolean;
  /** Serialised snapshot, cut to PREVIEW_LIMIT. */
  text: string;
  /** Full serialised snapshot, for copying. */
  fullText: string;
}

type RowStatus = 'loading' | 'error' | 'empty' | 'due' | 'ok';

const STATUS_TITLES: Record<RowStatus, string> = {
  loading: 'Pobieranie…',
  error: 'Ostatnie pobranie nie powiodło się',
  empty: 'Jeszcze nie pobrano',
  due: 'Do odświeżenia',
  ok: 'Aktualne',
};

const EMPTY_DETAIL: DetailState = { loading: false, error: false, hasData: false, text: '', fullText: '' };

function formatRelativePast(from: number | undefined, now: number): string {
  if (!from) return 'nigdy';
  const diff = now - from;
  if (diff < 0) return 'przed chwilą';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s temu`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m temu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h temu`;
  const days = Math.floor(hr / 24);
  return `${days}d temu`;
}

function formatRelativeFuture(at: number | undefined, now: number): string {
  if (at === undefined) return '—';
  const diff = at - now;
  if (diff <= 0) return 'teraz';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `za ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `za ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `za ${hr}h`;
  const days = Math.floor(hr / 24);
  return `za ${days}d`;
}

function formatAbsolute(ts: number | undefined): string {
  if (!ts) return 'Nigdy nie pobrano';
  return new Date(ts).toLocaleString('pl-PL');
}

function formatSize(chars: number): string {
  if (chars < 1024) return `${chars} B`;
  if (chars < 1024 * 1024) return `${Math.round(chars / 1024)} KB`;
  return `${(chars / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSnapshot(snapshot: unknown): DetailState {
  if (snapshot === undefined || snapshot === null) return EMPTY_DETAIL;
  let text: string;
  try {
    text = JSON.stringify(snapshot, null, 2);
  } catch {
    text = String(snapshot);
  }
  return { ...EMPTY_DETAIL, hasData: true, text: text.slice(0, PREVIEW_LIMIT), fullText: text };
}

const SEARCH_NAMES: HighlightNames = { all: 'data-sources-search', current: 'data-sources-search-current' };

/** How long typing settles before a search over a large preview runs. */
const SEARCH_DELAY_MS = 150;

interface PreviewSearchProps {
  /** The preview's scroll box; its <pre> is searched. */
  scrollRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  /** The previewed text, to search again when it changes. */
  content: string;
}

/**
 * Find in the preview: hits are painted over the coloured JSON (see
 * outputSearch.ts) and Enter / Shift+Enter walk them. Case and Polish letters
 * don't matter, as in the other searches.
 */
function PreviewSearch({ scrollRef, inputRef, content }: PreviewSearchProps) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<OutputMatch[]>([]);
  const [current, setCurrent] = useState(-1);

  const reveal = useCallback((match: OutputMatch | undefined) => {
    if (match && scrollRef.current) revealMatch(scrollRef.current, match, 0);
  }, [scrollRef]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const timer = setTimeout(() => {
      const skip = new Set(Array.from(scroll.children).filter(child => child.tagName !== 'PRE'));
      const found = findInOutput(scroll, query, skip);
      setMatches(found);
      setCurrent(found.length > 0 ? 0 : -1);
      reveal(found[0]);
    }, query.trim() ? SEARCH_DELAY_MS : 0);
    return () => clearTimeout(timer);
  }, [query, content, scrollRef, reveal]);

  useEffect(() => paintMatches(matches, current, SEARCH_NAMES), [matches, current]);
  useEffect(() => () => clearMatches(SEARCH_NAMES), []);

  const step = (forward: boolean) => {
    if (matches.length === 0) return;
    const next = (current + (forward ? 1 : -1) + matches.length) % matches.length;
    setCurrent(next);
    reveal(matches[next]);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      step(!event.shiftKey);
    } else if (event.key === 'Escape' && query) {
      event.preventDefault();
      event.stopPropagation();
      setQuery('');
    }
  };

  const count = !query.trim() ? '' : matches.length === 0 ? 'brak' : `${current + 1} z ${matches.length}`;

  return (
    <div className="data-sources-search">
      <Search className="data-sources-search__icon" size={14} strokeWidth={2} />
      <Input
        ref={inputRef}
        placeholder="Szukaj w danych…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <span className="data-sources-search__count">{count}</span>
      <Button
        size="sm"
        variant="ghost"
        className="popup-btn--icon"
        disabled={matches.length === 0}
        onClick={() => step(false)}
        title="Poprzednie (Shift+Enter)"
      >
        <ChevronUp size={15} strokeWidth={2} />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="popup-btn--icon"
        disabled={matches.length === 0}
        onClick={() => step(true)}
        title="Następne (Enter)"
      >
        <ChevronDown size={15} strokeWidth={2} />
      </Button>
    </div>
  );
}

const DataSourcesPopup: React.FC = () => {
  const { wrapperProps, isOpen } = usePopup(POPUP_ID, {
    openEvent: 'dataSources.popup.open',
  });

  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [now, setNow] = useState(() => Date.now());
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState>(EMPTY_DETAIL);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedSource = useMemo(
    () => (selectedId ? DATA_SOURCES.find(s => s.id === selectedId) ?? null : null),
    [selectedId],
  );

  const loadMetadata = useCallback(async (source: DataSource) => {
    try {
      const meta = await source.getMetadata();
      setRows(prev => ({
        ...prev,
        [source.id]: {
          refreshedAt: meta?.refreshedAt,
          loading: prev[source.id]?.loading ?? false,
          error: false,
        },
      }));
    } catch (e) {
      console.error(`Failed to read metadata for data source ${source.id}:`, e);
      setRows(prev => ({
        ...prev,
        [source.id]: { ...prev[source.id], loading: false, error: true },
      }));
    }
  }, []);

  const loadDetail = useCallback(async (source: DataSource) => {
    setDetail({ ...EMPTY_DETAIL, loading: true });
    try {
      const snapshot = await source.getSnapshot();
      setDetail(formatSnapshot(snapshot));
    } catch (e) {
      console.error(`Failed to read snapshot for data source ${source.id}:`, e);
      setDetail({ ...EMPTY_DETAIL, error: true });
    }
  }, []);

  // Load metadata for every source when the popup opens.
  useEffect(() => {
    if (!isOpen) return;
    setNow(Date.now());
    DATA_SOURCES.forEach(source => {
      void loadMetadata(source);
    });
  }, [isOpen, loadMetadata]);

  // Reset to the list view whenever the popup is closed.
  useEffect(() => {
    if (!isOpen) setSelectedId(null);
  }, [isOpen]);

  // Load the raw snapshot when a source is selected for preview.
  useEffect(() => {
    if (!isOpen || !selectedSource) return;
    setCopied(false);
    void loadDetail(selectedSource);
  }, [isOpen, selectedSource, loadDetail]);

  // Keep relative times live while the popup is visible.
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Revert the copy button's confirmation after a moment.
  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timeout);
  }, [copied]);

  const handleRefresh = useCallback(
    async (source: DataSource) => {
      setRows(prev => ({
        ...prev,
        [source.id]: { ...prev[source.id], loading: true, error: false },
      }));
      try {
        await source.refresh();
      } catch (e) {
        console.error(`Failed to refresh data source ${source.id}:`, e);
        setRows(prev => ({
          ...prev,
          [source.id]: { ...prev[source.id], loading: false, error: true },
        }));
        return;
      }
      setRows(prev => ({
        ...prev,
        [source.id]: { ...prev[source.id], loading: false },
      }));
      await loadMetadata(source);
    },
    [loadMetadata],
  );

  const handleDetailRefresh = useCallback(
    async (source: DataSource) => {
      await handleRefresh(source);
      await loadDetail(source);
    },
    [handleRefresh, loadDetail],
  );

  const handleRefreshAll = useCallback(async () => {
    setRefreshingAll(true);
    await Promise.allSettled(DATA_SOURCES.map(source => handleRefresh(source)));
    setRefreshingAll(false);
  }, [handleRefresh]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(detail.fullText);
      setCopied(true);
    } catch (e) {
      console.error('Failed to copy data source preview:', e);
    }
  }, [detail.fullText]);

  // Highlighting the whole preview is the slow part; do it once per snapshot.
  const detailHtml = useMemo(() => ({ __html: highlightJson(detail.text) }), [detail.text]);

  const headerActions = selectedSource ? null : (
    <HeaderButton onClick={handleRefreshAll} disabled={refreshingAll} title="Pobierz wszystkie źródła teraz">
      Odśwież wszystko
    </HeaderButton>
  );

  const selectedRow = selectedSource ? rows[selectedSource.id] : undefined;
  const truncated = detail.fullText.length > detail.text.length;

  return (
    <DockablePopupWrapper
      {...wrapperProps}
      popupType="dataSources"
      title="Źródła danych"
      minWidth={360}
      minHeight={200}
      initialWidth={520}
      initialHeight={400}
      className="data-sources-popup"
      bodyClassName="data-sources-popup-body"
      headerActions={headerActions}
    >
      {selectedSource ? (
        <div
          className="data-sources-detail"
          tabIndex={-1}
          onKeyDown={e => {
            // Ctrl+F finds in the preview instead of the game output.
            if (e.code !== 'KeyF' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
            if (!searchRef.current) return;
            e.preventDefault();
            searchRef.current.focus();
            searchRef.current.select();
          }}
        >
          <div className="data-sources-detail__bar">
            <Button
              size="sm"
              variant="ghost"
              className="popup-btn--icon"
              onClick={() => setSelectedId(null)}
              title="Powrót do listy"
            >
              <ArrowLeft size={15} strokeWidth={2} />
            </Button>
            <div className="data-sources-detail__heading">
              <span className="data-sources-detail__title">{selectedSource.label}</span>
              <span className="data-sources-detail__meta" title={formatAbsolute(selectedRow?.refreshedAt)}>
                pobrano {formatRelativePast(selectedRow?.refreshedAt, now)}
                {detail.hasData && ` · ${formatSize(detail.fullText.length)}`}
              </span>
            </div>
            <Button size="sm" onClick={handleCopy} disabled={!detail.hasData} title="Kopiuj dane do schowka">
              {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={2} />}
              {copied ? 'Skopiowano' : 'Kopiuj'}
            </Button>
            <Button
              size="sm"
              onClick={() => handleDetailRefresh(selectedSource)}
              disabled={selectedRow?.loading}
              title="Pobierz teraz"
            >
              <RefreshCw
                size={13}
                strokeWidth={2}
                className={selectedRow?.loading ? 'data-sources__spin' : undefined}
              />
              Odśwież
            </Button>
          </div>
          {detail.loading ? (
            <div className="data-sources__empty"><span className="popup-spinner" /> Wczytywanie…</div>
          ) : detail.error ? (
            <div className="data-sources__empty data-sources__empty--error">Nie udało się wczytać danych.</div>
          ) : !detail.hasData ? (
            <div className="data-sources__empty">Brak danych — źródło nie zostało jeszcze pobrane.</div>
          ) : (
            <>
              <PreviewSearch
                key={selectedSource.id}
                scrollRef={scrollRef}
                inputRef={searchRef}
                content={detail.text}
              />
              <div className="data-sources-detail__scroll" ref={scrollRef}>
                <pre className="data-sources-detail__content" dangerouslySetInnerHTML={detailHtml} />
                {truncated && (
                  <div className="data-sources-detail__truncated">
                    Pokazano {formatSize(detail.text.length)} z {formatSize(detail.fullText.length)}.
                    Szukanie obejmuje tylko pokazaną część, Kopiuj zabiera całość.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="data-sources__list">
          <div className="data-sources__head">
            <span>Źródło</span>
            <span>Pobrano</span>
            <span>Następne</span>
            <span />
          </div>
          {DATA_SOURCES.map(source => {
            const row = rows[source.id];
            const refreshedAt = row?.refreshedAt;
            const nextAt = computeNextFetch(refreshedAt, source.ttlMs);
            const due = nextAt !== undefined && nextAt <= now;
            const status: RowStatus = row?.loading
              ? 'loading'
              : row?.error
                ? 'error'
                : !refreshedAt
                  ? 'empty'
                  : due
                    ? 'due'
                    : 'ok';
            return (
              <div key={source.id} className={`data-sources__item data-sources__item--${status}`}>
                <button
                  type="button"
                  className="data-sources__name"
                  onClick={() => setSelectedId(source.id)}
                  title="Pokaż pobrane dane"
                >
                  <span className="data-sources__dot" title={STATUS_TITLES[status]} />
                  <span className="data-sources__name-text">{source.label}</span>
                </button>
                <span className="data-sources__time" title={formatAbsolute(refreshedAt)}>
                  {row?.error
                    ? <span className="data-sources__badge data-sources__badge--error">błąd</span>
                    : formatRelativePast(refreshedAt, now)}
                </span>
                <span
                  className="data-sources__time"
                  title={source.versionChecked
                    ? 'Pobierane, gdy na serwerze pojawi się nowa wersja — czas to tylko szacunek'
                    : undefined}
                >
                  {formatRelativeFuture(nextAt, now)}
                  {source.versionChecked && <span className="data-sources__badge">wg wersji</span>}
                </span>
                <div className="data-sources__actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="popup-btn--icon"
                    onClick={() => setSelectedId(source.id)}
                    title="Pokaż pobrane dane"
                  >
                    <Eye size={15} strokeWidth={1.75} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="popup-btn--icon"
                    onClick={() => handleRefresh(source)}
                    disabled={row?.loading}
                    title="Pobierz teraz"
                  >
                    <RefreshCw
                      size={15}
                      strokeWidth={1.75}
                      className={row?.loading ? 'data-sources__spin' : undefined}
                    />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DockablePopupWrapper>
  );
};

export default DataSourcesPopup;
