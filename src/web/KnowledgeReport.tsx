import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  KnowledgeCategoryStatus,
  KnowledgeBookEntry,
  KnowledgeBookCategoryProgress,
} from '@modules/data/dataStores/knowledgeStore';
import eventBus from '@modules/core/eventBus';
import type { KnowledgeReportAction } from '@shared/events';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { getBaseCategoryFromName, type KnowledgeCategoryBaseName } from '@client/knowledgeCategories';
import type {
  WiedzaDbResult,
  WiedzaDbWorkerRequest,
  WiedzaDbWorkerResponse,
} from '@modules/data/wiedzaDbImport.shared';
import type { KnowledgeDetailsType } from '@modules/data/dataStores/knowledgeDetailsStore';
import {
  mergeKnowledgeEvents,
  getKnowledgeEventsForCharacter,
  type KnowledgeEvent,
} from '@modules/data/dataStores/knowledgeEventsStore';
import { characterStorage } from '@modules/core/storage';

function findBookProgValue(
  bookProg: KnowledgeBookCategoryProgress,
  cat: string,
): true | 'in_progress' | undefined {
  if (bookProg[cat] != null) return bookProg[cat];
  const lower = cat.toLowerCase();
  for (const [key, value] of Object.entries(bookProg)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

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
  currentLibraryId?: string | null;
};

type BookReportPayload = {
  books: Record<string, KnowledgeBookEntry>;
  bookProgress: Record<string, KnowledgeBookCategoryProgress>;
};

type WiedzaTotalCategory = {
  name: KnowledgeCategoryBaseName;
  totalLevel: string;
};

type WiedzaTypeLevelInfo = {
  level: string;
  levelIndex: number;
};

type WiedzaDetailsCategory = {
  name: string;
  types: Partial<Record<KnowledgeDetailsType, WiedzaTypeLevelInfo>>;
};

const WIEDZA_TYPE_LABELS: Record<KnowledgeDetailsType, string> = {
  fight: 'Z walki',
  books: 'Z ksiazek i bibliotek',
  exploration: 'Z eksploracji',
};


type TabType = 'libraries' | 'categories' | 'books' | 'wiedza' | 'history';

const POPUP_ID = 'popup:knowledgeReport';

const KNOWLEDGE_LEVEL_LABELS = [
  'brak', 'znikoma', 'niewielka', 'czesciowa', 'niezla',
  'dosc dobra', 'dobra', 'bardzo dobra', 'doskonala',
  'prawie pelna', 'pelna',
];

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

function getLevelIndex(level: string): number {
  return KNOWLEDGE_LEVEL_LABELS.indexOf(level.toLowerCase());
}

function getLevelColorClass(index: number): string {
  if (index <= 0) return 'knowledge-level--none';
  if (index <= 2) return 'knowledge-level--low';
  if (index <= 4) return 'knowledge-level--mid';
  if (index <= 6) return 'knowledge-level--good';
  if (index <= 8) return 'knowledge-level--high';
  if (index === 9) return 'knowledge-level--almost';
  return 'knowledge-level--full';
}

type ImportState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'preview'; parsed: WiedzaDbResult; selectedCharacter: string } // '__all__' = all characters
  | { phase: 'importing' }
  | { phase: 'done'; message: string }
  | { phase: 'error'; message: string };

const KnowledgeReport: React.FC = () => {
  const { wrapperProps, isOpen, isPinned, setIsOpen } = usePopup(POPUP_ID);
  const [data, setData] = useState<KnowledgeReportPayload | null>(null);
  const [bookData, setBookData] = useState<BookReportPayload | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('libraries');
  const [expandedStatuses, setExpandedStatuses] = useState<
    Record<string, Partial<Record<KnowledgeCategoryStatus, boolean>>>
  >({});
  const [importState, setImportState] = useState<ImportState>({ phase: 'idle' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  const handleReport = useCallback((detail: KnowledgeReportPayload | null | undefined) => {
    if (!detail || (!detail.libraries?.length && !detail.categories?.length)) {
      setData(null);
      if (!isPinned) {
        setIsOpen(false);
      }
      return;
    }

    setData(detail);
    setExpandedStatuses({});
    if (detail.libraries.length > 0) {
      setActiveTab('libraries');
    } else {
      setActiveTab('categories');
    }
  }, [isPinned, setIsOpen]);

  useEffect(() => {
    const unsubs = [
      eventBus.on('knowledgeReport', (payload) => {
        handleReport(payload as KnowledgeReportPayload | null | undefined);
      }),
      eventBus.on('knowledgeReportCurrentLibrary', (libraryId) => {
        setData((prev) => prev ? { ...prev, currentLibraryId: libraryId as string | null } : prev);
      }),
      eventBus.on('knowledgeBookReport', (payload) => {
        setBookData(payload as BookReportPayload | null);
      }),
      eventBus.on('knowledgeReport.popup.open', () => {
        setIsOpen(true);
      }),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [handleReport]);

  useEffect(() => {
    if (isOpen && !data) {
      eventBus.emit('requestKnowledgeReport');
    }
    if (isOpen && !bookData) {
      eventBus.emit('requestKnowledgeBookReport');
    }
  }, [isOpen, data, bookData]);

  const handleStartCategory = useCallback((dative: string) => {
    eventBus.emit('sendCommand', {
      command: `zglebiaj wiedze o ${dative}`,
    });
  }, []);

  const handleLeadToLibrary = useCallback((internalId: string) => {
    if (!internalId) return;
    eventBus.emit('leadToByInternalId', internalId);
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

  const handleToggleBook = useCallback((bookKey: string, category: string) => {
    eventBus.emit('knowledgeBookReportAction', {
      type: 'toggleBook',
      bookKey,
      category,
    });
  }, []);

  // === Import ===

  async function parseInWorker(buffer: ArrayBuffer): Promise<WiedzaDbResult> {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('@modules/data/wiedzaDbImport.worker.ts', import.meta.url),
        { type: 'module' },
      );
    }

    const worker = workerRef.current;

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
      };

      const handleMessage = (event: MessageEvent) => {
        const resp = event.data as WiedzaDbWorkerResponse | undefined;
        if (!resp) return;
        if (resp.type === 'success') {
          cleanup();
          resolve(resp.payload);
        }
        if (resp.type === 'error') {
          cleanup();
          reject(new Error(resp.message));
        }
      };

      const handleError = (event: ErrorEvent) => {
        cleanup();
        if (workerRef.current === worker) {
          workerRef.current.terminate();
          workerRef.current = null;
        }
        reject(event.error ?? new Error(event.message));
      };

      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);

      const request: WiedzaDbWorkerRequest = { type: 'parse', buffer };
      worker.postMessage(request, [buffer]);
    });
  }

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;

    setImportState({ phase: 'loading' });
    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parseInWorker(buffer);
      if (parsed.characters.length === 0) {
        setImportState({ phase: 'error', message: 'Baza nie zawiera zadnych danych.' });
        return;
      }
      setImportState({ phase: 'preview', parsed, selectedCharacter: '__all__' });
    } catch (err) {
      setImportState({ phase: 'error', message: err instanceof Error ? err.message : 'Nieznany blad.' });
    }
  }, []);

  const handleImportConfirm = useCallback(async () => {
    if (importState.phase !== 'preview') return;

    const isAll = importState.selectedCharacter === '__all__';
    const charactersToImport = isAll
      ? importState.parsed.characters
      : [importState.selectedCharacter];

    setImportState({ phase: 'importing' });

    try {
      const results: string[] = [];

      for (const sourceChar of charactersToImport) {
        const charData = importState.parsed.byCharacter[sourceChar];
        if (!charData) continue;

        const targetChar = sourceChar.toLowerCase();

        if (charData.events.length > 0) {
          const events: KnowledgeEvent[] = charData.events.map((e) => ({
            category: e.category,
            categoryDative: e.categoryDative,
            type: e.type,
            locationId: e.locationId,
            timestamp: e.timestamp,
          }));
          const added = await mergeKnowledgeEvents(targetChar, events);
          results.push(`${sourceChar}: zdarzenia ${added}/${charData.events.length}`);
        }

        if (charData.libraries.length > 0) {
          eventBus.emit('wiedzaImportLibraries', {
            character: targetChar,
            libraries: charData.libraries,
          });
          results.push(`${sourceChar}: biblioteki ${charData.libraries.length}`);
        }

        if (charData.books.length > 0) {
          eventBus.emit('wiedzaImportBooks', {
            character: targetChar,
            books: charData.books,
          });
          results.push(`${sourceChar}: ksiegi ${charData.books.length}`);
        }

        if (charData.totalLevels.length > 0) {
          eventBus.emit('wiedzaImportTotalLevels', {
            character: targetChar,
            levels: charData.totalLevels,
          });
          // Also store level changes as events for history
          const levelEvents: KnowledgeEvent[] = [];
          for (const lv of charData.totalLevels) {
            const category = getBaseCategoryFromName(lv.categoryName);
            if (category) {
              levelEvents.push({
                category,
                categoryDative: '',
                type: 'level_change',
                locationId: 0,
                timestamp: lv.timestamp,
                level: lv.level,
              });
            }
          }
          if (levelEvents.length > 0) {
            await mergeKnowledgeEvents(targetChar, levelEvents);
          }
          results.push(`${sourceChar}: poziomy ${charData.totalLevels.length}`);
        }
      }

      setImportState({
        phase: 'done',
        message: `Import zakonczony.\n${results.join('\n')}`,
      });

      // Refresh all reports after import
      window.setTimeout(() => {
        eventBus.emit('requestKnowledgeReport');
        eventBus.emit('requestKnowledgeBookReport');
      }, 100);
    } catch (err) {
      setImportState({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Blad importu.',
      });
    }
  }, [importState]);

  const handleImportCancel = useCallback(() => {
    setImportState({ phase: 'idle' });
  }, []);

  // === Library Content ===

  const libraryContent = useMemo(() => {
    if (!data) return null;
    if (data.libraries.length === 0) {
      return <div className="knowledge-empty">Brak wiedzy do zglebiania w znanych bibliotekach.</div>;
    }

    const currentLibrary = data.currentLibraryId
      ? data.libraries.find((l) => l.id === data.currentLibraryId)
      : undefined;
    const activeLibraries = data.libraries.filter(
      (l) => l.remaining > 0 && l.id !== data.currentLibraryId,
    );
    const completedLibraries = data.libraries.filter(
      (l) => l.remaining === 0 && l.id !== data.currentLibraryId,
    );

    if (!currentLibrary && activeLibraries.length === 0 && completedLibraries.length === 0) {
      return <div className="knowledge-empty">Brak wiedzy do zglebiania w znanych bibliotekach.</div>;
    }

    const renderLibrary = (library: KnowledgeReportLibrary, mode: 'active' | 'completed') => {
      const grouped = groupLibraryCategories(library.categories);
      const libraryExpanded = expandedStatuses[library.id] ?? {};
      return (
        <div key={library.id} className="knowledge-library">
          <div className="knowledge-library-header">
            <div className="knowledge-library-info">
              <button type="button" className="knowledge-library-name"
                onClick={() => handleLeadToLibrary(library.locationId)}
              >
                {library.name}
              </button>
              <span className="knowledge-library-remaining">
                Pozostalo {library.remaining} z {library.total} kategorii
              </span>
            </div>
            <div className="knowledge-library-actions">
              <button type="button" className="popup-btn popup-btn--md popup-btn--pill popup-btn--primary"
                onClick={() => handleLeadToLibrary(library.locationId)}
                title="Prowadz do biblioteki"
              >
                Prowadz
              </button>
              {mode === 'active' ? (
                <button type="button" className="popup-btn popup-btn--md popup-btn--pill popup-btn--success"
                  onClick={() => handleCompleteLibrary(library.id)}
                  disabled={library.remaining === 0}
                >
                  Zakoncz biblioteke
                </button>
              ) : (
                <button type="button" className="popup-btn popup-btn--md popup-btn--pill"
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
              if (!count) return null;
              const isExpanded = Boolean(libraryExpanded[key]);
              return (
                <div key={key} className={`knowledge-library-status knowledge-library-status--${key}`}>
                  <button type="button"
                    className={`knowledge-chip knowledge-chip--${chipClass} ${isExpanded ? 'knowledge-chip--active' : ''}`}
                    onClick={() => toggleLibraryStatus(library.id, key)}
                  >
                    {label}: {count}
                  </button>
                  {isExpanded && grouped[key].length > 0 && (
                    <div className="knowledge-library-categories">
                      {grouped[key].map((cat) => (
                        <button type="button" key={cat.name}
                          className={`knowledge-library-category knowledge-library-category--${cat.status}`}
                          onClick={() => handleStartCategory(cat.dative)}
                        >
                          {cat.name}
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
        {currentLibrary && (
          <div className="knowledge-library-group knowledge-library-group--current">
            <div className="knowledge-library-group-title">Obecna biblioteka</div>
            <div className="knowledge-libraries">
              {renderLibrary(currentLibrary, currentLibrary.remaining > 0 ? 'active' : 'completed')}
            </div>
          </div>
        )}
        {activeLibraries.length > 0 && (
          <div className="knowledge-library-group">
            <div className="knowledge-library-group-title">Do zglebienia</div>
            <div className="knowledge-libraries">
              {activeLibraries.map((l) => renderLibrary(l, 'active'))}
            </div>
          </div>
        )}
        {completedLibraries.length > 0 && (
          <div className="knowledge-library-group">
            <div className="knowledge-library-group-title">Ukonczone</div>
            <div className="knowledge-libraries">
              {completedLibraries.map((l) => renderLibrary(l, 'completed'))}
            </div>
          </div>
        )}
      </div>
    );
  }, [data, expandedStatuses, handleCompleteLibrary, handleResetLibrary, handleLeadToLibrary, handleStartCategory, toggleLibraryStatus]);

  // === Categories Content ===

  const categoriesContent = useMemo(() => {
    if (!data) return null;
    if (data.categories.length === 0) {
      return <div className="knowledge-empty">Brak kategorii wymagajacych zglebiania.</div>;
    }

    // Build book entries per category
    const booksByCategory = new Map<string, { name: string; status: 'completed' | 'in_progress' | 'not_started' }[]>();
    if (bookData?.books && bookData?.bookProgress) {
      for (const [bookKey, book] of Object.entries(bookData.books)) {
        const prog = bookData.bookProgress[bookKey] ?? {};
        for (const cat of book.categories) {
          const list = booksByCategory.get(cat) ?? [];
          const value = findBookProgValue(prog, cat);
          const status = value === true ? 'completed' as const : value === 'in_progress' ? 'in_progress' as const : 'not_started' as const;
          list.push({ name: bookKey, status });
          booksByCategory.set(cat, list);
        }
      }
    }

    return (
      <div className="knowledge-category-grid">
        {data.categories.map((category) => {
          const categoryBooks = booksByCategory.get(category.name) ?? [];
          return (
            <div key={category.name} className="knowledge-category-tile">
              <div className="knowledge-category-header">
                <span className="knowledge-category-name">{category.name}</span>
                <button type="button" className="knowledge-category-command"
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
                      title={library.status === 'completed' ? 'Ukonczone' : library.status === 'in_progress' ? 'W trakcie' : 'Nierozpoczete'}
                    />
                    <span className="knowledge-category-entry-name">{library.name}</span>
                  </div>
                ))}
                {categoryBooks.map((book) => (
                  <div key={`book-${book.name}`} className="knowledge-category-entry">
                    <span
                      className={`knowledge-status-dot knowledge-status-dot--${book.status}`}
                      title={book.status === 'completed' ? 'Przeczytane' : book.status === 'in_progress' ? 'W trakcie' : 'Nieprzeczytane'}
                    />
                    <span className="knowledge-category-entry-name knowledge-category-entry-name--book">{book.name}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [data, bookData, handleStartCategory]);

  // === Wiedza Total Content ===

  const [wiedzaLevels, setWiedzaLevels] = useState<WiedzaTotalCategory[]>([]);
  const [wiedzaTickCounts, setWiedzaTickCounts] = useState<Record<string, number>>({});
  const [wiedzaLevelsLoaded, setWiedzaLevelsLoaded] = useState(false);
  const [wiedzaRefreshCounter, setWiedzaRefreshCounter] = useState(0);
  const [wiedzaDetailsCategories, setWiedzaDetailsCategories] = useState<WiedzaDetailsCategory[]>([]);

  useEffect(() => {
    const handler = (payload: unknown) => {
      setWiedzaRefreshCounter((c) => c + 1);
      const report = payload as { categories?: { name: string; types: Record<string, { level?: string; levelIndex?: number }> }[] } | null;
      if (report?.categories) {
        const cats: WiedzaDetailsCategory[] = report.categories.map((cat) => {
          const types: Partial<Record<KnowledgeDetailsType, WiedzaTypeLevelInfo>> = {};
          for (const [typeKey, summary] of Object.entries(cat.types)) {
            if (summary.level && summary.levelIndex != null) {
              types[typeKey as KnowledgeDetailsType] = { level: summary.level, levelIndex: summary.levelIndex };
            }
          }
          return { name: cat.name, types };
        });
        setWiedzaDetailsCategories(cats);
      }
    };
    eventBus.on('knowledgeDetailsReport', handler);
    return () => { eventBus.off('knowledgeDetailsReport', handler); };
  }, []);

  useEffect(() => {
    const charKey = characterStorage.getCharacter()?.trim() || '';
    if (!charKey) {
      setWiedzaLevels([]);
      setWiedzaTickCounts({});
      setWiedzaLevelsLoaded(true);
      return;
    }
    void getKnowledgeEventsForCharacter(charKey).then((events) => {
      // Extract latest level per category
      const latest = new Map<string, { level: string; timestamp: number }>();
      for (const e of events) {
        if (e.type !== 'level_change' || !e.level) continue;
        const prev = latest.get(e.category);
        if (!prev || e.timestamp > prev.timestamp) {
          latest.set(e.category, { level: e.level, timestamp: e.timestamp });
        }
      }
      const cats: WiedzaTotalCategory[] = [];
      for (const [name, { level }] of latest) {
        cats.push({ name: name as KnowledgeCategoryBaseName, totalLevel: level });
      }
      cats.sort((a, b) => a.name.localeCompare(b.name));

      // Count ticks since last level change per category
      const ticks: Record<string, number> = {};
      for (const e of events) {
        if (e.type !== 'tick') continue;
        const levelEntry = latest.get(e.category);
        const sinceTs = levelEntry?.timestamp ?? 0;
        if (e.timestamp > sinceTs) {
          ticks[e.category] = (ticks[e.category] ?? 0) + 1;
        }
      }

      setWiedzaLevels(cats);
      setWiedzaTickCounts(ticks);
      setWiedzaLevelsLoaded(true);
    });
  }, [importState.phase, wiedzaRefreshCounter]);

  const wiedzaTotalContent = useMemo(() => {
    if (!wiedzaLevelsLoaded) {
      return <div className="knowledge-empty">Ladowanie...</div>;
    }
    if (wiedzaLevels.length === 0) {
      return (
        <div className="knowledge-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <span>Brak danych o poziomach wiedzy. Uzyj komendy 'wiedza' w grze lub zaimportuj dane.</span>
          <button className="btn btn-sm btn-outline-light" onClick={() => eventBus.emit('sendCommand', { command: 'wiedza' })}>Wyslij 'wiedza'</button>
        </div>
      );
    }

    const detailsMap = new Map(wiedzaDetailsCategories.map((c) => [c.name, c]));

    return (
      <div className="knowledge-wiedza-total">
        {wiedzaLevels.map((cat) => {
          const levelIndex = getLevelIndex(cat.totalLevel);
          const percent = levelIndex >= 0 ? Math.round((levelIndex / 10) * 100) : 0;
          const colorClass = getLevelColorClass(levelIndex);
          const isFull = levelIndex >= 10;
          const details = detailsMap.get(cat.name);
          const hasSubLevels = details && Object.keys(details.types).length > 0;

          return (
            <div key={cat.name} className={`knowledge-wiedza-row ${colorClass} ${isFull ? 'knowledge-wiedza-row--full' : ''} ${hasSubLevels ? 'knowledge-wiedza-row--has-sub' : ''}`}>
              <span className="knowledge-wiedza-name">{cat.name}</span>
              <span className="knowledge-wiedza-level-label">{cat.totalLevel}</span>
              <div className="knowledge-wiedza-bar">
                <div className="knowledge-wiedza-bar-track">
                  {Array.from({ length: 10 }, (_, i) => (
                    <div
                      key={i}
                      className={`knowledge-wiedza-bar-segment ${i < levelIndex ? 'knowledge-wiedza-bar-segment--filled' : ''}`}
                    />
                  ))}
                </div>
              </div>
              <span className="knowledge-wiedza-percent">{percent}%</span>
              <span className={`knowledge-wiedza-ticks ${!isFull && (wiedzaTickCounts[cat.name] ?? 0) > 0 ? 'knowledge-wiedza-ticks--active' : ''}`}>
                {isFull ? '' : `+${wiedzaTickCounts[cat.name] ?? 0}`}
              </span>
              {hasSubLevels && (
                <div className="knowledge-wiedza-sub-levels">
                  {(['fight', 'books', 'exploration'] as KnowledgeDetailsType[]).map((type) => {
                    const info = details.types[type];
                    if (!info) return null;
                    const subColorClass = getLevelColorClass(info.levelIndex);
                    return (
                      <div key={type} className={`knowledge-wiedza-sub-item ${subColorClass}`} title={`${WIEDZA_TYPE_LABELS[type]}: ${info.level} (${info.levelIndex}/10)`}>
                        <span className="knowledge-wiedza-sub-name">{WIEDZA_TYPE_LABELS[type]}</span>
                        <span className="knowledge-wiedza-sub-level-label">{info.level}</span>
                        <div className="knowledge-wiedza-sub-bar">
                          <div className="knowledge-wiedza-bar-track">
                            {Array.from({ length: 10 }, (_, i) => (
                              <div
                                key={i}
                                className={`knowledge-wiedza-bar-segment ${i < info.levelIndex ? 'knowledge-wiedza-bar-segment--filled' : ''}`}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }, [wiedzaLevels, wiedzaLevelsLoaded, wiedzaTickCounts, wiedzaDetailsCategories]);

  // === Books Content ===

  const booksContent = useMemo(() => {
    if (!bookData || !bookData.books || Object.keys(bookData.books).length === 0) {
      return <div className="knowledge-empty">Brak danych o ksiegach.</div>;
    }

    const books = bookData.books;
    const progress = bookData.bookProgress ?? {};
    const bookEntries = Object.entries(books).sort(([a], [b]) => a.localeCompare(b));

    const completedBooks = bookEntries.filter(([bookKey, book]) => {
      const bookProg = progress[bookKey] ?? {};
      return book.categories.every((cat) => findBookProgValue(bookProg, cat) === true);
    });
    const activeBooks = bookEntries.filter(([bookKey]) => {
      return !completedBooks.some(([key]) => key === bookKey);
    });

    const renderBook = (bookKey: string, book: KnowledgeBookEntry, mode: 'active' | 'completed') => {
      const bookCategories = book.categories;
      const bookProg = progress[bookKey] ?? {};
      const completedCount = bookCategories.filter((cat) => findBookProgValue(bookProg, cat) === true).length;
      const totalCount = bookCategories.length;

      return (
        <div key={bookKey} className={`knowledge-book ${mode === 'completed' ? 'knowledge-book--complete' : ''}`}>
          <div className="knowledge-library-header">
            <div className="knowledge-library-info">
              <span className="knowledge-book-name">{bookKey}</span>
              <span className="knowledge-library-remaining">
                {completedCount} z {totalCount} kategorii
              </span>
            </div>
          </div>
          <div className="knowledge-book-categories">
            {bookCategories.map((cat) => {
              const value = findBookProgValue(bookProg, cat);
              const catStatus = value === true ? 'completed' : value === 'in_progress' ? 'in_progress' : 'not_started';
              return (
                <button
                  type="button"
                  key={cat}
                  className={`knowledge-library-category knowledge-book-category knowledge-library-category--${catStatus}`}
                  onClick={() => handleToggleBook(bookKey, cat)}
                  title={`${cat}: ${catStatus === 'completed' ? 'Ukonczone' : catStatus === 'in_progress' ? 'W trakcie' : 'Do zrobienia'}`}
                >
                  <span className={`knowledge-status-dot knowledge-status-dot--${catStatus}`} />
                  {cat}
                </button>
              );
            })}
          </div>
        </div>
      );
    };

    return (
      <div className="knowledge-library-groups">
        {activeBooks.length > 0 && (
          <div className="knowledge-library-group">
            <div className="knowledge-library-group-title">Do przeczytania</div>
            <div className="knowledge-books">
              {activeBooks.map(([key, book]) => renderBook(key, book, 'active'))}
            </div>
          </div>
        )}
        {completedBooks.length > 0 && (
          <div className="knowledge-library-group">
            <div className="knowledge-library-group-title">Przeczytane</div>
            <div className="knowledge-books">
              {completedBooks.map(([key, book]) => renderBook(key, book, 'completed'))}
            </div>
          </div>
        )}
      </div>
    );
  }, [bookData, handleToggleBook]);

  // === History Content ===

  const [historyEvents, setHistoryEvents] = useState<KnowledgeEvent[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyCategoryFilter, setHistoryCategoryFilter] = useState('');

  useEffect(() => {
    if (activeTab !== 'history' || historyLoaded) return;
    const charKey = characterStorage.getCharacter()?.trim() || '';
    if (!charKey) {
      setHistoryLoaded(true);
      return;
    }
    void getKnowledgeEventsForCharacter(charKey).then((events) => {
      setHistoryEvents(events);
      setHistoryLoaded(true);
    });
  }, [activeTab, historyLoaded]);

  // Reload history after import
  useEffect(() => {
    if (importState.phase === 'done') {
      setHistoryLoaded(false);
    }
  }, [importState.phase]);

  const historyCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const e of historyEvents) {
      if (e.type === 'tick' || e.type === 'level_change') cats.add(e.category);
    }
    return Array.from(cats).sort();
  }, [historyEvents]);

  const historyContent = useMemo(() => {
    if (!historyLoaded) {
      return <div className="knowledge-empty">Ladowanie...</div>;
    }

    const filtered = historyEvents.filter(
      (e) => (e.type === 'tick' || e.type === 'level_change') &&
             (!historyCategoryFilter || e.category === historyCategoryFilter),
    );
    if (historyEvents.length === 0) {
      return <div className="knowledge-empty">Brak zdarzen. Ticki i zmiany poziomu pojawia sie tutaj.</div>;
    }

    // Show newest first
    const sorted = [...filtered].sort((a, b) => b.timestamp - a.timestamp);

    return (
      <div className="knowledge-history">
        <div className="knowledge-history-filters">
          <select
            className="knowledge-import-select"
            value={historyCategoryFilter}
            onChange={(e) => setHistoryCategoryFilter(e.target.value)}
          >
            <option value="">Wszystkie kategorie</option>
            {historyCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <span className="knowledge-history-count">{sorted.length} zdarzen</span>
        </div>
        <table className="knowledge-history-table">
          <thead>
            <tr>
              <th className="knowledge-history-col-date">Data</th>
              <th>Kategoria</th>
              <th className="knowledge-history-col-type">Typ</th>
              <th className="knowledge-history-col-detail">Szczegoly</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((event, idx) => {
              const date = new Date(event.timestamp);
              const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

              const isLevelChange = event.type === 'level_change';
              const levelIndex = isLevelChange && event.level ? getLevelIndex(event.level) : -1;
              const colorClass = isLevelChange ? getLevelColorClass(levelIndex) : '';

              return (
                <tr key={`${event.timestamp}-${event.category}-${idx}`} className={isLevelChange ? 'knowledge-history-row--level' : ''}>
                  <td className="knowledge-history-date">{dateStr}</td>
                  <td className="knowledge-history-category">{event.category}</td>
                  <td className="knowledge-history-type">
                    {isLevelChange ? (
                      <span className="knowledge-history-badge knowledge-history-badge--level">poziom</span>
                    ) : (
                      <span className="knowledge-history-badge knowledge-history-badge--tick">tick</span>
                    )}
                  </td>
                  <td className="knowledge-history-detail">
                    {isLevelChange && event.level ? (
                      <span className={`knowledge-wiedza-level-label ${colorClass}`}>{event.level}</span>
                    ) : event.locationId ? (
                      <span className="knowledge-history-location">#{event.locationId}</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }, [historyEvents, historyLoaded, historyCategoryFilter, historyCategories]);

  // === Import Content ===

  const importContent = useMemo(() => {
    if (importState.phase === 'idle') {
      return (
        <div className="knowledge-import">
          <p>Wybierz plik Database_wiedza.db z Mudleta aby zaimportowac dane.</p>
          <button type="button" className="knowledge-import-btn" onClick={handleImportClick}>
            Wybierz plik...
          </button>
          <input ref={fileInputRef} type="file" accept=".db" style={{ display: 'none' }} onChange={handleFileChange} />
        </div>
      );
    }

    if (importState.phase === 'loading') {
      return <div className="knowledge-import">Wczytywanie bazy danych...</div>;
    }

    if (importState.phase === 'importing') {
      return <div className="knowledge-import">Importowanie danych...</div>;
    }

    if (importState.phase === 'error') {
      return (
        <div className="knowledge-import">
          <div className="knowledge-import-error">{importState.message}</div>
          <button type="button" className="knowledge-import-btn" onClick={handleImportCancel}>
            Zamknij
          </button>
        </div>
      );
    }

    if (importState.phase === 'done') {
      return (
        <div className="knowledge-import">
          <div className="knowledge-import-done">{importState.message}</div>
          <button type="button" className="knowledge-import-btn" onClick={handleImportCancel}>
            Zamknij
          </button>
        </div>
      );
    }

    if (importState.phase === 'preview') {
      const isAll = importState.selectedCharacter === '__all__';
      const selectedChars = isAll ? importState.parsed.characters : [importState.selectedCharacter];
      const totals = { events: 0, libraries: 0, books: 0, levels: 0 };
      for (const c of selectedChars) {
        const d = importState.parsed.byCharacter[c];
        if (!d) continue;
        totals.events += d.events.length;
        totals.libraries += d.libraries.length;
        totals.books += d.books.length;
        totals.levels += d.totalLevels.length;
      }

      return (
        <div className="knowledge-import">
          <div className="knowledge-import-row">
            <label className="knowledge-import-label">Postac:</label>
            <select
              className="knowledge-import-select"
              value={importState.selectedCharacter}
              onChange={(e) => setImportState({ ...importState, selectedCharacter: e.target.value })}
            >
              <option value="__all__">Wszystkie postacie ({importState.parsed.characters.length})</option>
              {importState.parsed.characters.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="knowledge-import-summary">
            <div>Zdarzenia (ticki/wpisy): <strong>{totals.events}</strong></div>
            <div>Biblioteki: <strong>{totals.libraries}</strong></div>
            <div>Ksiegi: <strong>{totals.books}</strong></div>
            <div>Poziomy wiedzy: <strong>{totals.levels}</strong></div>
          </div>
          <div className="knowledge-import-actions">
            <button type="button" className="knowledge-import-btn knowledge-import-btn--confirm"
              onClick={handleImportConfirm}
            >
              Importuj
            </button>
            <button type="button" className="knowledge-import-btn" onClick={handleImportCancel}>
              Anuluj
            </button>
          </div>
        </div>
      );
    }

    return null;
  }, [importState, handleImportClick, handleFileChange, handleImportConfirm, handleImportCancel]);

  // === Render ===

  const hasLibraries = data?.libraries && data.libraries.length > 0;
  const hasAnyData = data || bookData || wiedzaLevels.length > 0;

  function renderTabContent() {
    switch (activeTab) {
      case 'libraries': return libraryContent;
      case 'categories': return categoriesContent;
      case 'wiedza': return wiedzaTotalContent;
      case 'books': return booksContent;
      case 'history': return historyContent;
      default: return null;
    }
  }

  const headerActions = (
    <>
      <button
        type="button"
        className="knowledge-header-import-btn"
        onClick={handleImportClick}
        disabled={importState.phase === 'loading' || importState.phase === 'importing'}
        title="Import z Mudleta"
      >
        Import
      </button>
      <input ref={fileInputRef} type="file" accept=".db" style={{ display: 'none' }} onChange={handleFileChange} />
    </>
  );

  return (
    <DockablePopupWrapper
      {...wrapperProps}
      popupType="knowledgeReport"
      title="Wiedza"
      minWidth={500}
      minHeight={350}
      initialWidth={960}
      initialHeight={Math.min(window.innerHeight * 0.75, window.innerHeight - 32)}
      className="knowledge-window"
      bodyClassName="knowledge-window-body"
      headerActions={headerActions}
    >
      {importState.phase !== 'idle' && (
        <div className="knowledge-import-panel">
          {importContent}
        </div>
      )}
      {!hasAnyData && importState.phase === 'idle' ? (
        <div className="knowledge-empty">Brak danych. Uzyj komendy /wiedza lub /biblioteki.</div>
      ) : (
        <>
          <div className="knowledge-tabs">
            <button type="button"
              className={`knowledge-tab-button ${activeTab === 'wiedza' ? 'knowledge-tab-button--active' : ''}`}
              onClick={() => setActiveTab('wiedza')}
            >
              Wiedza
            </button>
            <button type="button"
              className={`knowledge-tab-button ${activeTab === 'libraries' ? 'knowledge-tab-button--active' : ''}`}
              onClick={() => setActiveTab('libraries')}
              disabled={!hasLibraries}
            >
              Biblioteki
            </button>
            <button type="button"
              className={`knowledge-tab-button ${activeTab === 'books' ? 'knowledge-tab-button--active' : ''}`}
              onClick={() => setActiveTab('books')}
            >
              Ksiegi
            </button>
            <button type="button"
              className={`knowledge-tab-button ${activeTab === 'categories' ? 'knowledge-tab-button--active' : ''}`}
              onClick={() => setActiveTab('categories')}
            >
              Kategorie
            </button>
            <button type="button"
              className={`knowledge-tab-button ${activeTab === 'history' ? 'knowledge-tab-button--active' : ''}`}
              onClick={() => { setHistoryLoaded(false); setActiveTab('history'); }}
            >
              Historia
            </button>
          </div>
          <div className="knowledge-content">
            {renderTabContent()}
          </div>
        </>
      )}
    </DockablePopupWrapper>
  );
};

export default KnowledgeReport;
