import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { KnowledgeCategoryStatus } from '@modules/data/dataStores/knowledgeStore';
import eventBus from '@modules/core/eventBus';
import type { KnowledgeReportAction } from '@shared/events';
import { useDraggablePopup } from './hooks/useDraggablePopup';

type KnowledgeReportLibraryCategory = {
  name: string;
  dative: string;
  status: KnowledgeCategoryStatus;
};

type KnowledgeReportLibrary = {
  id: string;
  name: string;
  locationId: string;
  total: number;
  remaining: number;
  not_started: number;
  in_progress: number;
  completed: number;
  categories: KnowledgeReportLibraryCategory[];
};

type KnowledgeReportCategoryLibrary = {
  id: string;
  name: string;
  status: KnowledgeCategoryStatus;
};

type KnowledgeReportCategory = {
  name: string;
  dative: string;
  libraries: KnowledgeReportCategoryLibrary[];
};

type KnowledgeReportPayload = {
  libraries: KnowledgeReportLibrary[];
  categories: KnowledgeReportCategory[];
};

const LIBRARY_STATUS_CONFIG: {
  key: KnowledgeCategoryStatus;
  label: string;
  chipClass: string;
}[] = [
  { key: 'not_started', label: 'Nierozpoczete', chipClass: 'not-started' },
  { key: 'in_progress', label: 'W trakcie', chipClass: 'in-progress' },
  { key: 'completed', label: 'Ukonczone', chipClass: 'completed' },
];

function groupLibraryCategories(
  categories: KnowledgeReportLibraryCategory[],
): Record<KnowledgeCategoryStatus, KnowledgeReportLibraryCategory[]> {
  return categories.reduce(
    (acc, category) => {
      acc[category.status].push(category);
      return acc;
    },
    {
      not_started: [] as KnowledgeReportLibraryCategory[],
      in_progress: [] as KnowledgeReportLibraryCategory[],
      completed: [] as KnowledgeReportLibraryCategory[],
    },
  );
}

const KnowledgeReport: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<KnowledgeReportPayload | null>(null);
  const [activeTab, setActiveTab] = useState<'libraries' | 'categories'>('libraries');
  const [isPinned, setIsPinned] = useState(false);
  const [expandedStatuses, setExpandedStatuses] = useState<
    Record<string, Partial<Record<KnowledgeCategoryStatus, boolean>>>
  >({});

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const togglePinned = useCallback(() => {
    setIsPinned((prev) => !prev);
  }, []);

  const { panelRef, position, handlePointerDown } = useDraggablePopup({
    isOpen,
    isPinned,
    onClose: close,
  });

  const handleReport = useCallback((detail: KnowledgeReportPayload | null | undefined) => {
    if (!detail || (!detail.libraries?.length && !detail.categories?.length)) {
      setData(null);
      setIsOpen(false);
      return;
    }

    setData(detail);
    setIsOpen(true);
    setExpandedStatuses({});
    if (detail.libraries.length > 0) {
      setActiveTab('libraries');
    } else {
      setActiveTab('categories');
    }
  }, []);

  useEffect(() => {
    const unsubscribe = eventBus.on('knowledgeReport', (payload) => {
      handleReport(payload as KnowledgeReportPayload | null | undefined);
    });
    return () => {
      unsubscribe();
    };
  }, [handleReport]);


  const handleStartCategory = useCallback((dative: string) => {
    eventBus.emit('sendCommand', {
      command: `zglebiaj wiedze o ${dative}`,
    });
  }, []);

  const handleLeadToLibrary = useCallback((locationId: string) => {
    if (!locationId) {
      return;
    }
    eventBus.emit('sendCommand', {
      command: `/prowadz ${locationId}`,
    });
  }, []);

  const toggleLibraryStatus = useCallback(
    (libraryId: string, status: KnowledgeCategoryStatus) => {
      setExpandedStatuses((prev) => {
        const nextLibraryState = { ...(prev[libraryId] ?? {}) };
        nextLibraryState[status] = !nextLibraryState[status];
        return { ...prev, [libraryId]: nextLibraryState };
      });
    },
    [],
  );

  const sendKnowledgeReportAction = useCallback((action: KnowledgeReportAction) => {
    eventBus.emit('knowledgeReportAction', action);
  }, []);

  const handleCompleteLibrary = useCallback(
    (libraryId: string) => {
      sendKnowledgeReportAction({ type: 'completeLibrary', libraryId });
    },
    [sendKnowledgeReportAction],
  );

  const handleResetLibrary = useCallback(
    (libraryId: string) => {
      sendKnowledgeReportAction({ type: 'resetLibrary', libraryId });
    },
    [sendKnowledgeReportAction],
  );

  const libraryContent = useMemo(() => {
    if (!data) {
      return null;
    }
    if (data.libraries.length === 0) {
      return (
        <div className="knowledge-empty">Brak wiedzy do zglebiania w znanych bibliotekach.</div>
      );
    }

    const activeLibraries = data.libraries.filter((library) => library.remaining > 0);
    const completedLibraries = data.libraries.filter((library) => library.remaining === 0);

    if (activeLibraries.length === 0 && completedLibraries.length === 0) {
      return (
        <div className="knowledge-empty">Brak wiedzy do zglebiania w znanych bibliotekach.</div>
      );
    }

    const renderLibrary = (library: KnowledgeReportLibrary, mode: 'active' | 'completed') => {
      const grouped = groupLibraryCategories(library.categories);
      const libraryExpanded = expandedStatuses[library.id] ?? {};
      return (
        <div key={library.id} className="knowledge-library">
          <div className="knowledge-library-header">
            <div className="knowledge-library-info">
              <button
                type="button"
                className="knowledge-library-name"
                onClick={() => handleLeadToLibrary(library.locationId)}
              >
                {library.name}
              </button>
              <span className="knowledge-library-remaining">
                Pozostalo {library.remaining} z {library.total} kategorii
              </span>
            </div>
            <div className="knowledge-library-actions">
              {mode === 'active' ? (
                <button
                  type="button"
                  className="knowledge-library-action"
                  onClick={() => handleCompleteLibrary(library.id)}
                  disabled={library.remaining === 0}
                >
                  Zakoncz biblioteke
                </button>
              ) : (
                <button
                  type="button"
                  className="knowledge-library-reset"
                  onClick={() => handleResetLibrary(library.id)}
                >
                  Resetuj biblioteke
                </button>
              )}
            </div>
          </div>
          <div className="knowledge-library-statuses">
            {LIBRARY_STATUS_CONFIG.map(({ key, label, chipClass }) => {
              const count = library[key];
              if (!count) {
                return null;
              }
              const isExpanded = Boolean(libraryExpanded[key]);
              return (
                <div key={key} className={`knowledge-library-status knowledge-library-status--${key}`}>
                  <button
                    type="button"
                    className={`knowledge-chip knowledge-chip--${chipClass} ${
                      isExpanded ? 'knowledge-chip--active' : ''
                    }`}
                    onClick={() => toggleLibraryStatus(library.id, key)}
                  >
                    {label}: {count}
                  </button>
                  {isExpanded && grouped[key].length > 0 && (
                    <div className="knowledge-library-categories">
                      {grouped[key].map((category) => (
                        <button
                          type="button"
                          key={category.name}
                          className={`knowledge-library-category knowledge-library-category--${category.status}`}
                          onClick={() => handleStartCategory(category.dative)}
                        >
                          {category.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    };

    return (
      <div className="knowledge-library-groups">
        {activeLibraries.length > 0 && (
          <div className="knowledge-library-group">
            <div className="knowledge-library-group-title">Do zglebienia</div>
            <div className="knowledge-libraries">
              {activeLibraries.map((library) => renderLibrary(library, 'active'))}
            </div>
          </div>
        )}
        {completedLibraries.length > 0 && (
          <div className="knowledge-library-group">
            <div className="knowledge-library-group-title">Ukonczone</div>
            <div className="knowledge-libraries">
              {completedLibraries.map((library) => renderLibrary(library, 'completed'))}
            </div>
          </div>
        )}
      </div>
    );
  }, [
    data,
    expandedStatuses,
    handleCompleteLibrary,
    handleResetLibrary,
    handleLeadToLibrary,
    handleStartCategory,
    toggleLibraryStatus,
  ]);

  const categoriesContent = useMemo(() => {
    if (!data) {
      return null;
    }
    if (data.categories.length === 0) {
      return <div className="knowledge-empty">Brak kategorii wymagajacych zglebiania.</div>;
    }
    return (
      <div className="knowledge-category-grid">
        {data.categories.map((category) => (
          <div key={category.name} className="knowledge-category-tile">
            <div className="knowledge-category-header">
              <span className="knowledge-category-name">{category.name}</span>
              <button
                type="button"
                className="knowledge-category-command"
                onClick={() => handleStartCategory(category.dative)}
              >
                Zglebiaj
              </button>
            </div>
            <div className="knowledge-category-libraries">
              {category.libraries.map((library) => (
                <div key={library.id} className="knowledge-category-entry">
                  <span
                    className={`knowledge-status-dot knowledge-status-dot--${library.status}`}
                    title={
                      library.status === 'completed'
                        ? 'Ukonczone'
                        : library.status === 'in_progress'
                        ? 'W trakcie'
                        : 'Nierozpoczete'
                    }
                  />
                  <span className="knowledge-category-entry-name">{library.name}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }, [data, handleStartCategory]);

  if (!isOpen || !data) {
    return null;
  }

  const hasLibraries = data.libraries.length > 0;

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
          <div
            className="window-header-actions"
            onPointerDownCapture={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={`window-pin-button${isPinned ? ' window-pin-button--active' : ''}`}
              onClick={togglePinned}
              title={isPinned ? 'Odepnij okno' : 'Przypnij okno'}
            />
            <button type="button" className="btn-close" onClick={close} />
          </div>
        </div>
        <div className="knowledge-window-body">
          <div className="knowledge-tabs">
            <button
              type="button"
              className={`knowledge-tab-button ${
                activeTab === 'libraries' ? 'knowledge-tab-button--active' : ''
              }`}
              onClick={() => setActiveTab('libraries')}
              disabled={!hasLibraries}
            >
              Biblioteki
            </button>
            <button
              type="button"
              className={`knowledge-tab-button ${
                activeTab === 'categories' ? 'knowledge-tab-button--active' : ''
              }`}
              onClick={() => setActiveTab('categories')}
            >
              Kategorie
            </button>
          </div>
          <div className="knowledge-content">
            {activeTab === 'libraries' ? libraryContent : categoriesContent}
          </div>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeReport;
