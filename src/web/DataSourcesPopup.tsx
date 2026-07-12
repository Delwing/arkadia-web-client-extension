import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { DATA_SOURCES, computeNextFetch, type DataSource } from './dataSourcesRegistry';

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
  text: string;
}

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

function formatSnapshot(snapshot: unknown): string {
  if (snapshot === undefined || snapshot === null) {
    return 'Brak danych — źródło nie zostało jeszcze pobrane.';
  }
  let text: string;
  try {
    text = JSON.stringify(snapshot, null, 2);
  } catch {
    text = String(snapshot);
  }
  if (text.length > PREVIEW_LIMIT) {
    return `${text.slice(0, PREVIEW_LIMIT)}\n\n… (podgląd obcięto, ${text.length} znaków)`;
  }
  return text;
}

const DataSourcesPopup: React.FC = () => {
  const { wrapperProps, isOpen } = usePopup(POPUP_ID, {
    openEvent: 'dataSources.popup.open',
  });

  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [now, setNow] = useState(() => Date.now());
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState>({ loading: false, error: false, text: '' });

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
    setDetail({ loading: true, error: false, text: '' });
    try {
      const snapshot = await source.getSnapshot();
      setDetail({ loading: false, error: false, text: formatSnapshot(snapshot) });
    } catch (e) {
      console.error(`Failed to read snapshot for data source ${source.id}:`, e);
      setDetail({ loading: false, error: true, text: '' });
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
    void loadDetail(selectedSource);
  }, [isOpen, selectedSource, loadDetail]);

  // Keep relative times live while the list is visible.
  useEffect(() => {
    if (!isOpen || selectedSource) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isOpen, selectedSource]);

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
    setRows(prev => {
      const next = { ...prev };
      for (const source of DATA_SOURCES) {
        next[source.id] = { ...next[source.id], loading: true, error: false };
      }
      return next;
    });
    await Promise.allSettled(
      DATA_SOURCES.map(async source => {
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
        await loadMetadata(source);
      }),
    );
    setRefreshingAll(false);
  }, [loadMetadata]);

  const headerActions = selectedSource ? null : (
    <button
      type="button"
      className="popup-btn"
      onClick={handleRefreshAll}
      disabled={refreshingAll}
      title="Odśwież wszystkie źródła"
    >
      Odśwież wszystko
    </button>
  );

  const selectedRow = selectedSource ? rows[selectedSource.id] : undefined;

  return (
    <DockablePopupWrapper
      {...wrapperProps}
      popupType="dataSources"
      title="Źródła danych"
      minWidth={360}
      minHeight={200}
      initialWidth={480}
      initialHeight={380}
      className="data-sources-popup"
      bodyClassName="data-sources-popup-body"
      headerActions={headerActions}
    >
      {selectedSource ? (
        <div className="data-sources-detail">
          <div className="data-sources-detail__header">
            <button
              type="button"
              className="popup-btn"
              onClick={() => setSelectedId(null)}
              title="Powrót do listy"
            >
              ← Powrót
            </button>
            <span className="data-sources-detail__title">{selectedSource.label}</span>
            <button
              type="button"
              className="popup-btn"
              onClick={() => handleDetailRefresh(selectedSource)}
              disabled={selectedRow?.loading}
              title="Pobierz teraz"
            >
              {selectedRow?.loading ? '…' : 'Odśwież'}
            </button>
          </div>
          {detail.loading ? (
            <div className="data-sources-detail__status">Ładowanie…</div>
          ) : detail.error ? (
            <div className="data-sources-detail__status">Nie udało się wczytać danych.</div>
          ) : (
            <pre className="data-sources-detail__content">{detail.text}</pre>
          )}
        </div>
      ) : (
        <table className="data-sources-table">
          <thead>
            <tr>
              <th>Źródło</th>
              <th>Pobrano</th>
              <th>Następne</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {DATA_SOURCES.map(source => {
              const row = rows[source.id];
              const refreshedAt = row?.refreshedAt;
              const nextAt = computeNextFetch(refreshedAt, source.ttlMs);
              const due = nextAt !== undefined && nextAt <= now;
              return (
                <tr key={source.id} className={due ? 'data-sources-row--due' : undefined}>
                  <td>{source.label}</td>
                  <td title={formatAbsolute(refreshedAt)}>
                    {row?.error ? 'błąd' : formatRelativePast(refreshedAt, now)}
                  </td>
                  <td>
                    {formatRelativeFuture(nextAt, now)}
                    {source.versionChecked && (
                      <span className="data-sources-note"> (wg wersji)</span>
                    )}
                  </td>
                  <td className="data-sources-action-cell">
                    <button
                      type="button"
                      className="popup-btn"
                      onClick={() => setSelectedId(source.id)}
                      title="Pokaż surowe dane"
                    >
                      Podgląd
                    </button>
                    <button
                      type="button"
                      className="popup-btn"
                      onClick={() => handleRefresh(source)}
                      disabled={row?.loading}
                      title="Pobierz teraz"
                    >
                      {row?.loading ? '…' : 'Odśwież'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </DockablePopupWrapper>
  );
};

export default DataSourcesPopup;
