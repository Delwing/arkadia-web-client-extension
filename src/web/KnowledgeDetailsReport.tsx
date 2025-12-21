import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { KnowledgeDetailsType } from '@modules/data/dataStores/knowledgeDetailsStore';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { shouldPopupAutoOpen } from './layout/utils/layoutStorage';

const POPUP_ID = 'popup:knowledgeDetails';

const TYPE_CONFIG: { key: KnowledgeDetailsType; label: string; showDetails: boolean }[] = [
  { key: 'fight', label: 'Z walki', showDetails: false },
  { key: 'books', label: 'Z ksiazek i bibliotek', showDetails: false },
  { key: 'exploration', label: 'Z eksploracji', showDetails: true },
];

type KnowledgeDetailsReportTypeSummary = {
  total: number;
  known: number;
  missing: string[];
  unknown: string[];
  entries: { name: string; status: 'known' | 'missing' }[];
  level?: string;
  levelIndex?: number;
  levelMax: number;
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

function formatLevelDisplay(summary: KnowledgeDetailsReportTypeSummary): string {
  if (!summary.level) {
    return '—';
  }

  if (summary.levelIndex == null) {
    return summary.level;
  }

  if (summary.levelMax > 0) {
    return `${summary.level} (${summary.levelIndex}/${summary.levelMax})`;
  }

  return `${summary.level} (${summary.levelIndex})`;
}

const KnowledgeDetailsReport: React.FC = () => {
  // Check if popup should auto-open on page load (was pinned before reload)
  const [isOpen, setIsOpen] = useState(() => shouldPopupAutoOpen(POPUP_ID));
  const [data, setData] = useState<KnowledgeDetailsReportPayload | null>(null);
  const [hideCompleted, setHideCompleted] = useState(false);
  // If auto-opening, start pinned since that's why we're persisting
  const [isPinned, setIsPinned] = useState(() => shouldPopupAutoOpen(POPUP_ID));
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handlePinnedChange = useCallback((pinned: boolean) => {
    setIsPinned(pinned);
  }, []);

  const handleReport = useCallback((detail: KnowledgeDetailsReportPayload | null | undefined) => {
    if (!detail || !detail.categories?.length) {
      setData(null);
      // Don't close if pinned (popup should stay open with empty state)
      if (!isPinned) {
        setIsOpen(false);
      }
      return;
    }
    setData(detail);
    setIsOpen(true);
    setHideCompleted(false);
  }, [isPinned]);

  useEffect(() => {
    const unsubscribe = eventBus.on('knowledgeDetailsReport', (payload) => {
      handleReport(payload as KnowledgeDetailsReportPayload | null | undefined);
    });
    return () => {
      unsubscribe();
    };
  }, [handleReport]);

  // Request data when popup auto-opens (e.g., after page reload when docked/pinned)
  useEffect(() => {
    if (isOpen && !data) {
      eventBus.emit('requestKnowledgeDetailsReport');
    }
  }, [isOpen, data]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    requestAnimationFrame(() => {
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    });
  }, [data, isOpen]);

  const handleBuildKnowledge = useCallback(() => {
    eventBus.emit('sendCommand', { command: '/wiedza_buduj' });
  }, []);

  const navItems = useMemo<{ id: string; label: string }[]>(() => {
    if (!data) {
      return [];
    }
    return data.categories.map((category, index) => ({
      id: `knowledge-category-${index}`,
      label:
        category.types.exploration && category.types.exploration.total > 0
          ? `${category.name} ${category.types.exploration.known}/${category.types.exploration.total}`
          : category.name,
    }));
  }, [data]);

  const handleNavigate = useCallback((elementId: string) => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const section = container.querySelector<HTMLElement>(`#${elementId}`);
    if (!section) {
      return;
    }

    const header =
      section.querySelector<HTMLElement>('.knowledge-details-header') ?? section;
    const sticky = container.querySelector<HTMLElement>('.knowledge-details-sticky');
    const stickyHeight = sticky ? sticky.getBoundingClientRect().height : 0;
    const containerRect = container.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const offset = headerRect.top - containerRect.top + container.scrollTop;
    const targetTop = Math.max(offset - stickyHeight, 0);

    container.scrollTo({ top: targetTop, behavior: 'smooth' });
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
                  const levelTitle =
                    summary.levelIndex != null
                      ? `Poziom wiedzy: ${
                          summary.levelMax > 0
                            ? `${summary.levelIndex}/${summary.levelMax}`
                            : `${summary.levelIndex}`
                        }${summary.level ? ` (${summary.level})` : ''}`
                      : 'Brak danych o poziomie wiedzy';
                  const levelDisplay = formatLevelDisplay(summary);
                  return (
                    <span key={key} className="knowledge-details-counter">
                      <span className="knowledge-details-counter-type">{label}</span>
                      <span
                        className={`knowledge-details-counter-label${
                          summary.level ? '' : ' knowledge-details-counter-label--empty'
                        }`}
                        title={levelTitle}
                      >
                        {levelDisplay}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="knowledge-details-type-groups">
            {TYPE_CONFIG.filter(({ showDetails }) => showDetails).map(({ key, label }) => {
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

              const entriesTitle = `Znane wpisy: ${summary.known} z ${summary.total}`;

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
                    <span
                      className="knowledge-details-badge knowledge-details-badge--entries"
                      title={entriesTitle}
                    >
                      {summary.known}/{summary.total}
                    </span>
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
  }, [data, hideCompleted]);

  const overallProgress = useMemo(() => {
    if (!data) {
      return null;
    }

    const totals = data.categories.reduce(
      (acc, category) => {
        TYPE_CONFIG.forEach(({ key }) => {
          const summary = category.types[key];
          if (!summary) {
            return;
          }

          acc.total += summary.total;
          acc.known += summary.known;
        });

        return acc;
      },
      { total: 0, known: 0 },
    );

    const percentage =
      totals.total > 0 ? Math.round((totals.known / totals.total) * 100) : 0;

    return { ...totals, percentage };
  }, [data]);

  const titleWithProgress = overallProgress
    ? `Raport wiedzy ${overallProgress.known}/${overallProgress.total} (${overallProgress.percentage}%)`
    : 'Raport wiedzy';

  return (
    <DockablePopupWrapper
      popupId={POPUP_ID}
      popupType="knowledgeDetails"
      title={titleWithProgress}
      isOpen={isOpen}
      isPinned={isPinned}
      onClose={close}
      onPinnedChange={handlePinnedChange}
      minWidth={500}
      minHeight={350}
      initialWidth={960}
      initialHeight={Math.min(window.innerHeight * 0.75, window.innerHeight - 32)}
      className="knowledge-window"
      bodyClassName="knowledge-window-body knowledge-details-body"
    >
      {!data ? (
        <div className="knowledge-empty">Brak danych. Użyj komendy /list.</div>
      ) : (
        <div className="knowledge-details-content" ref={scrollContainerRef}>
          <div className="knowledge-details-sticky">
            <div className="knowledge-details-toolbar">
              <button
                type="button"
                className={`knowledge-details-toggle-button${
                  hideCompleted ? ' knowledge-details-toggle-button--active' : ''
                }`}
                onClick={() => setHideCompleted((prev) => !prev)}
              >
                {hideCompleted ? 'Pokaż ukończone wpisy' : 'Ukryj ukończone wpisy'}
              </button>
              <button
                type="button"
                className="knowledge-details-build-button"
                onClick={handleBuildKnowledge}
              >
                Odbuduj raport
              </button>
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
      )}
    </DockablePopupWrapper>
  );
};

export default KnowledgeDetailsReport;
