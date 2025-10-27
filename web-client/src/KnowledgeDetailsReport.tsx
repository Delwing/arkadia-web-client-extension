import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type Client from '@client/src/Client';
import type { KnowledgeDetailsType } from '@client/src/dataStores/knowledgeDetailsStore';

const TYPE_CONFIG: { key: KnowledgeDetailsType; label: string }[] = [
  { key: 'fight', label: 'Z walki' },
  { key: 'books', label: 'Z ksiazek i bibliotek' },
  { key: 'exploration', label: 'Z eksploracji' },
];

type KnowledgeDetailsReportTypeSummary = {
  total: number;
  known: number;
  missing: string[];
  unknown: string[];
  entries: { name: string; status: 'known' | 'missing' }[];
  level?: string;
};

type KnowledgeDetailsReportCategory = {
  name: string;
  dative: string;
  updatedAt: number | null;
  types: Record<KnowledgeDetailsType, KnowledgeDetailsReportTypeSummary>;
};

type KnowledgeDetailsReportPayload = {
  categories: KnowledgeDetailsReportCategory[];
};

type PointerDragState = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
};

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function formatTimestamp(value: number | null): string | null {
  if (value == null) {
    return null;
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return null;
  }
}

const KnowledgeDetailsReport: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<KnowledgeDetailsReportPayload | null>(null);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<PointerDragState | null>(null);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const ensureVisiblePosition = useCallback((prev: { left: number; top: number } | null) => {
    if (!prev || !panelRef.current) {
      return prev;
    }
    const margin = 16;
    const width = panelRef.current.offsetWidth;
    const height = panelRef.current.offsetHeight;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - height - margin);
    const nextLeft = clamp(prev.left, margin, maxLeft);
    const nextTop = clamp(prev.top, margin, maxTop);
    if (nextLeft === prev.left && nextTop === prev.top) {
      return prev;
    }
    return { left: nextLeft, top: nextTop };
  }, []);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const drag = dragState.current;
    if (!drag || event.pointerId !== drag.pointerId || !panelRef.current) {
      return;
    }
    const margin = 16;
    const width = panelRef.current.offsetWidth;
    const height = panelRef.current.offsetHeight;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - height - margin);
    const nextLeft = clamp(event.clientX - drag.offsetX, margin, maxLeft);
    const nextTop = clamp(event.clientY - drag.offsetY, margin, maxTop);
    setPosition({ left: nextLeft, top: nextTop });
  }, []);

  const endPointerDrag = useCallback(
    (event: PointerEvent) => {
      const drag = dragState.current;
      if (!drag || event.pointerId !== drag.pointerId) {
        return;
      }
      dragState.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', endPointerDrag);
      window.removeEventListener('pointercancel', endPointerDrag);
    },
    [handlePointerMove],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !panelRef.current) {
        return;
      }
      const rect = panelRef.current.getBoundingClientRect();
      dragState.current = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };
      setPosition((prev) => prev ?? { left: rect.left, top: rect.top });
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', endPointerDrag);
      window.addEventListener('pointercancel', endPointerDrag);
      event.preventDefault();
    },
    [endPointerDrag, handlePointerMove],
  );

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', endPointerDrag);
      window.removeEventListener('pointercancel', endPointerDrag);
    };
  }, [endPointerDrag, handlePointerMove]);

  useEffect(() => {
    if (isOpen) {
      return;
    }
    dragState.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', endPointerDrag);
    window.removeEventListener('pointercancel', endPointerDrag);
  }, [endPointerDrag, handlePointerMove, isOpen]);

  const handleReport = useCallback((detail: KnowledgeDetailsReportPayload | null | undefined) => {
    if (!detail || !detail.categories?.length) {
      setData(null);
      setIsOpen(false);
      return;
    }
    setData(detail);
    setIsOpen(true);
    setHideCompleted(false);
    setPosition(null);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<KnowledgeDetailsReportPayload | null | undefined>;
      handleReport(custom.detail);
    };
    window.addEventListener('knowledgeDetailsReport', handler as EventListener);
    return () => window.removeEventListener('knowledgeDetailsReport', handler as EventListener);
  }, [handleReport]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [close, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handlePointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && panelRef.current?.contains(target)) {
        return;
      }
      close();
    };
    window.addEventListener('pointerdown', handlePointerDownOutside);
    return () => window.removeEventListener('pointerdown', handlePointerDownOutside);
  }, [close, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleResize = () => {
      setPosition((prev) => ensureVisiblePosition(prev));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [ensureVisiblePosition, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setPosition((prev) => ensureVisiblePosition(prev));
    panelRef.current?.focus();
  }, [ensureVisiblePosition, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    requestAnimationFrame(() => {
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    });
  }, [data, isOpen]);

  const handleStartCategory = useCallback((dative: string) => {
    const client = (window as any).clientExtension as Client | undefined;
    if (!client) {
      return;
    }
    client.sendCommand(`zglebiaj wiedze o ${dative}`);
  }, []);

  const navItems = useMemo<{ id: string; label: string }[]>(() => {
    if (!data) {
      return [];
    }
    return data.categories.map((category, index) => ({
      id: `knowledge-category-${index}`,
      label: category.name,
    }));
  }, [data]);

  const handleNavigate = useCallback((elementId: string) => {
    const target = panelRef.current?.querySelector<HTMLElement>(`#${elementId}`);
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
  }, []);

  const categoriesContent = useMemo(() => {
    if (!data) {
      return null;
    }
    return data.categories.map((category, index) => {
      const updatedText = formatTimestamp(category.updatedAt);
      const elementId = `knowledge-category-${index}`;
      return (
        <section key={`${category.name}-${index}`} id={elementId} className="knowledge-details-category">
          <div className="knowledge-details-header">
            <div className="knowledge-details-title">
              <span className="knowledge-details-name">{category.name}</span>
              {updatedText && (
                <span className="knowledge-details-updated">Aktualizacja: {updatedText}</span>
              )}
              <div className="knowledge-details-counters">
                {TYPE_CONFIG.map(({ key, label }) => {
                  const summary = category.types[key];
                  if (!summary) {
                    return null;
                  }
                  return (
                    <span key={key} className="knowledge-details-counter">
                      <span className="knowledge-details-counter-label">{label}</span>
                      <span className="knowledge-details-counter-value">
                        {summary.known}/{summary.total}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              className="knowledge-details-command"
              onClick={() => handleStartCategory(category.dative)}
            >
              Zglebiaj
            </button>
          </div>
          <div className="knowledge-details-type-groups">
            {TYPE_CONFIG.map(({ key, label }) => {
              const summary = category.types[key];
              if (!summary) {
                return null;
              }

              const filteredEntries = hideCompleted
                ? summary.entries.filter((entry) => entry.status !== 'known')
                : summary.entries;

              const hasEntries = filteredEntries.length > 0;
              const hasUnknown = summary.unknown.length > 0;
              const hasLevel = Boolean(summary.level);

              if (!hasEntries && !hasUnknown && !hasLevel && summary.entries.length === 0) {
                return null;
              }

              let entriesContent: React.ReactNode = null;
              if (hasEntries) {
                entriesContent = (
                  <ul className="knowledge-details-entries">
                    {filteredEntries.map((entry) => (
                      <li
                        key={`${key}-${entry.name}`}
                        className={`knowledge-details-entry knowledge-details-entry--${entry.status}`}
                      >
                        <span
                          className={`knowledge-details-entry-indicator knowledge-details-entry-indicator--${entry.status}`}
                        />
                        <span className="knowledge-details-entry-name">{entry.name}</span>
                      </li>
                    ))}
                  </ul>
                );
              } else if (summary.entries.length === 0) {
                entriesContent = (
                  <div className="knowledge-details-empty">Brak zdefiniowanych wpisów.</div>
                );
              } else if (hideCompleted) {
                entriesContent = (
                  <div className="knowledge-details-empty">Ukryto ukończone wpisy.</div>
                );
              }

              return (
                <div key={key} className="knowledge-details-type-group">
                  <div className="knowledge-details-type-heading">
                    <span className="knowledge-details-type-label">{label}</span>
                    {summary.level && (
                      <span className="knowledge-details-level">{summary.level}</span>
                    )}
                  </div>
                  {entriesContent}
                  {hasUnknown && (
                    <div className="knowledge-details-unknown">
                      <div className="knowledge-details-unknown-title">
                        Nieznane wpisy ({summary.unknown.length})
                      </div>
                      <ul className="knowledge-details-entries">
                        {summary.unknown.map((entry) => (
                          <li
                            key={`${key}-unknown-${entry}`}
                            className="knowledge-details-entry knowledge-details-entry--unknown"
                          >
                            <span className="knowledge-details-entry-indicator knowledge-details-entry-indicator--unknown" />
                            <span className="knowledge-details-entry-name">{entry}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      );
    });
  }, [data, handleStartCategory, hideCompleted]);

  if (!isOpen || !data) {
    return null;
  }

  return (
    <div className="knowledge-window-container">
      <div
        ref={panelRef}
        className={`knowledge-window ${
          position ? 'knowledge-window--floating' : 'knowledge-window--center'
        }`}
        style={position ? { left: `${position.left}px`, top: `${position.top}px` } : undefined}
        tabIndex={-1}
      >
        <div className="knowledge-window-header" onPointerDown={handlePointerDown}>
          <h5 className="knowledge-window-title">Raport wiedzy</h5>
          <button type="button" className="btn-close" onClick={close} />
        </div>
        <div className="knowledge-window-body knowledge-details-body">
          <div className="knowledge-details-content" ref={scrollContainerRef}>
            <div className="knowledge-details-sticky">
              <div className="knowledge-details-toolbar">
                <label className="knowledge-details-toggle">
                  <input
                    type="checkbox"
                    checked={hideCompleted}
                    onChange={(event) => setHideCompleted(event.target.checked)}
                  />
                  Ukryj ukończone wpisy
                </label>
              </div>
              {navItems.length > 0 && (
                <div className="knowledge-details-nav">
                  {navItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="knowledge-details-nav-button"
                      onClick={() => handleNavigate(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="knowledge-details-categories">{categoriesContent}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeDetailsReport;
