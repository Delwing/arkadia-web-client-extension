import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type Client from '@client/src/Client';
import type { KnowledgeCategoryStatus } from '@client/src/dataStores/knowledgeStore';

type KnowledgeReportLibrary = {
  id: string;
  name: string;
  total: number;
  remaining: number;
  not_started: number;
  in_progress: number;
  completed: number;
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

const KnowledgeReport: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<KnowledgeReportPayload | null>(null);
  const [activeTab, setActiveTab] = useState<'libraries' | 'categories'>('libraries');
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
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
      if (event.button !== 0) {
        return;
      }
      if (!panelRef.current) {
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

  const handleReport = useCallback((detail: KnowledgeReportPayload | null | undefined) => {
    if (!detail || (!detail.libraries?.length && !detail.categories?.length)) {
      setData(null);
      setIsOpen(false);
      return;
    }

    setData(detail);
    setIsOpen(true);
    setPosition(null);
    if (detail.libraries.length > 0) {
      setActiveTab('libraries');
    } else {
      setActiveTab('categories');
    }
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<KnowledgeReportPayload | null | undefined>;
      handleReport(custom.detail);
    };
    window.addEventListener('knowledgeReport', handler as EventListener);
    return () => window.removeEventListener('knowledgeReport', handler as EventListener);
  }, [handleReport]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
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

  const handleStartCategory = useCallback((dative: string) => {
    const client = (window as any).clientExtension as Client | undefined;
    if (!client) {
      return;
    }
    client.sendCommand(`zglebiaj wiedze o ${dative}`);
  }, []);

  const libraryContent = useMemo(() => {
    if (!data) {
      return null;
    }
    if (data.libraries.length === 0) {
      return (
        <div className="knowledge-empty">Brak wiedzy do zglebiania w znanych bibliotekach.</div>
      );
    }
    return (
      <div className="knowledge-libraries">
        {data.libraries.map((library) => (
          <div key={library.id} className="knowledge-library">
            <div className="knowledge-library-header">
              <span className="knowledge-library-name">{library.name}</span>
              <span className="knowledge-library-remaining">
                Pozostalo {library.remaining} z {library.total} kategorii
              </span>
            </div>
            <div className="knowledge-library-statuses">
              {library.not_started > 0 && (
                <span className="knowledge-chip knowledge-chip--not-started">
                  Nierozpoczete: {library.not_started}
                </span>
              )}
              {library.in_progress > 0 && (
                <span className="knowledge-chip knowledge-chip--in-progress">
                  W trakcie: {library.in_progress}
                </span>
              )}
              {library.completed > 0 && (
                <span className="knowledge-chip knowledge-chip--completed">
                  Ukonczone: {library.completed}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }, [data]);

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
        onPointerDownCapture={(event) => event.stopPropagation()}
      >
        <div className="knowledge-window-header" onPointerDown={handlePointerDown}>
          <h5 className="knowledge-window-title">Raport wiedzy</h5>
          <button type="button" className="btn-close" onClick={close} />
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

