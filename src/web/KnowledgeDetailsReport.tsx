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
import { usePopup } from './hooks/usePopup';
import { usePopupSetting } from './hooks/usePopupSetting';
import { getEmbeddedMap } from './embedRegistry';

const POPUP_ID = 'popup:knowledgeDetails';

const TYPE_CONFIG: { key: KnowledgeDetailsType; label: string; showDetails: boolean }[] = [
  { key: 'fight', label: 'Z walki', showDetails: false },
  { key: 'books', label: 'Z ksiazek i bibliotek', showDetails: false },
  { key: 'exploration', label: 'Z eksploracji', showDetails: true },
];

type KnowledgeDetailsReportEntry = {
  name: string;
  status: 'known' | 'missing';
  id?: number | null;
  lokalizacja?: string;
  note?: string;
};

type KnowledgeDetailsReportTypeSummary = {
  total: number;
  known: number;
  missing: string[];
  unknown: string[];
  entries: KnowledgeDetailsReportEntry[];
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
    return '\u2014';
  }

  if (summary.levelIndex == null) {
    return summary.level;
  }

  if (summary.levelMax > 0) {
    return `${summary.level} (${summary.levelIndex}/${summary.levelMax})`;
  }

  return `${summary.level} (${summary.levelIndex})`;
}

function isBlank(value: string | undefined | null): value is undefined | null | '' {
  return !value || /^-+$/.test(value);
}

function isUnavailable(entry: KnowledgeDetailsReportEntry): boolean {
  return [entry.name, entry.lokalizacja, entry.note].some(
    (v) => typeof v === 'string' && v.toLowerCase().includes('niedostepna'),
  );
}

function getEmbedded() {
  return getEmbeddedMap();
}

function getAreaForRoom(roomId: number): string | undefined {
  const embedded = getEmbedded();
  if (!embedded?.reader) return undefined;
  const room = embedded.reader.getRoom(roomId);
  if (!room) return undefined;
  const area = embedded.reader.getArea?.(room.area);
  if (!area) return undefined;
  return area.getAreaName?.();
}

function getCurrentArea(): string | undefined {
  const embedded = getEmbedded();
  const roomId = embedded?.currentRoom;
  if (typeof roomId !== 'number') return undefined;
  return getAreaForRoom(roomId);
}

type AreaSectionEntry = KnowledgeDetailsReportEntry & {
  categories: string[];
};

type AreaSection = {
  areaName: string;
  known: number;
  total: number;
  entries: AreaSectionEntry[];
};

const KnowledgeDetailsReport: React.FC = () => {
  const { wrapperProps, isOpen, isPinned, setIsOpen } = usePopup(POPUP_ID);
  const [data, setData] = useState<KnowledgeDetailsReportPayload | null>(null);
  const [hideCompleted, setHideCompleted] = usePopupSetting(POPUP_ID, 'hideCompleted', false);
  const [showHints, setShowHints] = usePopupSetting(POPUP_ID, 'showHints', false);
  const [activeTab, setActiveTab] = usePopupSetting<'categories' | 'areas'>(POPUP_ID, 'activeTab', 'categories');
  const [selectedArea, setSelectedArea] = usePopupSetting(POPUP_ID, 'selectedArea', '');
  const [filter, setFilter] = usePopupSetting(POPUP_ID, 'filter', '');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
  }, [isPinned, setIsOpen]);

  useEffect(() => {
    const unsubReport = eventBus.on('knowledgeDetailsReport', (payload) => {
      handleReport(payload as KnowledgeDetailsReportPayload | null | undefined);
    });
    const unsubOpen = eventBus.on('knowledgeDetails.popup.open', () => {
      setIsOpen(true);
    });
    return () => {
      unsubReport();
      unsubOpen();
    };
  }, [handleReport, setIsOpen]);

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
  }, [isOpen]);

  useEffect(() => {
    eventBus.emit('knowledgeHints', { enabled: showHints, hideCompleted });
    if (!showHints && activeTab === 'areas') {
      setActiveTab('categories');
    }
  }, [showHints, hideCompleted]);

  // Sync hideCompleted when changed externally (e.g. from map dropdown)
  useEffect(() => {
    const handler = (detail: unknown) => {
      const payload = detail as { enabled: boolean; hideCompleted: boolean } | undefined;
      if (payload) {
        setHideCompleted(payload.hideCompleted);
      }
    };
    eventBus.on('knowledgeHints', handler);
    return () => { eventBus.off('knowledgeHints', handler); };
  }, [setHideCompleted]);

  const handleBuildKnowledge = useCallback(() => {
    eventBus.emit('sendCommand', { command: '/wiedza_buduj' });
  }, []);

  const handleLeadToEntry = useCallback((locationId: number) => {
    eventBus.emit('sendCommand', { command: `/prowadz ${locationId}` });
  }, []);

  const handleShowOnMap = useCallback((roomId: number) => {
    eventBus.emit('staticmap.popup.open', { roomId });
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

  const renderEntry = useCallback((entry: KnowledgeDetailsReportEntry, keyPrefix: string) => {
    const unavailable = entry.status !== 'known' && isUnavailable(entry);
    const lokalizacja = isBlank(entry.lokalizacja) || entry.lokalizacja!.toLowerCase().includes('niedostepna') ? undefined : entry.lokalizacja;
    const note = isBlank(entry.note) ? undefined : entry.note;
    const statusClass = unavailable ? 'unavailable' : entry.status;

    return (
      <li
        key={`${keyPrefix}-${entry.name}`}
        className={`knowledge-details-entry knowledge-details-entry--${statusClass}`}
      >
        <span
          className={`knowledge-details-entry-indicator knowledge-details-entry-indicator--${statusClass}`}
        />
        <span className="knowledge-details-entry-name">{entry.name}</span>
        {showHints && lokalizacja && (
          <button
            type="button"
            className="knowledge-details-entry-location"
            title={lokalizacja}
            onClick={entry.id != null ? () => handleLeadToEntry(entry.id!) : undefined}
          >
            {lokalizacja}
          </button>
        )}
        {showHints && entry.id != null && (
          <button
            type="button"
            className="knowledge-details-entry-map"
            title="Pokaz na mapie"
            onClick={() => handleShowOnMap(entry.id!)}
          >
            &#x1f50d;
          </button>
        )}
        {showHints && unavailable && (
          <span className="knowledge-details-entry-note" title="Obecnie niedostepne">
            Obecnie niedostepne
          </span>
        )}
        {showHints && !unavailable && note && (
          <span className="knowledge-details-entry-note" title={note}>
            {note}
          </span>
        )}
      </li>
    );
  }, [showHints, handleLeadToEntry, handleShowOnMap]);

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

              const filterLower = filter.toLowerCase();
              const filteredEntries = summary.entries.filter((entry) => {
                if (hideCompleted && entry.status === 'known') return false;
                if (!filterLower) return true;
                if (entry.name.toLowerCase().includes(filterLower)) return true;
                if (showHints) {
                  if (entry.lokalizacja && entry.lokalizacja.toLowerCase().includes(filterLower)) return true;
                  if (entry.note && entry.note.toLowerCase().includes(filterLower)) return true;
                }
                return false;
              });

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
                    {filteredEntries.map((entry) => renderEntry(entry, key))}
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
  }, [data, hideCompleted, showHints, filter, handleLeadToEntry, renderEntry]);

  const areaSections = useMemo<AreaSection[]>(() => {
    if (!data) {
      return [];
    }

    // Flat deduplicated entries per area, each tracking which categories it belongs to
    const areaEntryMap = new Map<string, Map<string, AreaSectionEntry>>();
    const areaSeenEntries = new Map<string, Map<string, boolean>>();
    const filterLower = filter.toLowerCase();

    for (const category of data.categories) {
      for (const { key, showDetails } of TYPE_CONFIG) {
        if (!showDetails) continue;
        const summary = category.types[key];
        if (!summary) continue;

        for (const entry of summary.entries) {
          if (hideCompleted && entry.status === 'known') continue;
          if (filterLower) {
            const matchesName = entry.name.toLowerCase().includes(filterLower);
            const matchesLokalizacja = showHints && entry.lokalizacja && entry.lokalizacja.toLowerCase().includes(filterLower);
            const matchesNote = showHints && entry.note && entry.note.toLowerCase().includes(filterLower);
            if (!matchesName && !matchesLokalizacja && !matchesNote) continue;
          }

          let areaName = 'Inne';
          if (entry.id != null) {
            areaName = getAreaForRoom(entry.id) ?? 'Inne';
          }

          let entryMap = areaEntryMap.get(areaName);
          if (!entryMap) {
            entryMap = new Map();
            areaEntryMap.set(areaName, entryMap);
          }

          const entryKey = entry.name.toLowerCase();
          const existing = entryMap.get(entryKey);
          if (existing) {
            if (!existing.categories.includes(category.name)) {
              existing.categories.push(category.name);
            }
          } else {
            entryMap.set(entryKey, { ...entry, categories: [category.name] });
          }
        }

        // Count totals per area (regardless of hideCompleted), deduplicated by entry name
        for (const entry of summary.entries) {
          let areaName = 'Inne';
          if (entry.id != null) {
            areaName = getAreaForRoom(entry.id) ?? 'Inne';
          }
          let areaSeen = areaSeenEntries.get(areaName);
          if (!areaSeen) {
            areaSeen = new Map();
            areaSeenEntries.set(areaName, areaSeen);
          }
          const entryKey = entry.name.toLowerCase();
          const isKnown = entry.status === 'known';
          const existingSeen = areaSeen.get(entryKey);
          if (existingSeen === undefined) {
            areaSeen.set(entryKey, isKnown);
          } else if (!existingSeen && isKnown) {
            areaSeen.set(entryKey, true);
          }
        }
      }
    }

    const areaKnown = new Map<string, number>();
    const areaTotal = new Map<string, number>();
    for (const [areaName, seen] of areaSeenEntries) {
      let total = 0;
      let known = 0;
      for (const isKnown of seen.values()) {
        total++;
        if (isKnown) known++;
      }
      areaTotal.set(areaName, total);
      areaKnown.set(areaName, known);
    }

    const currentArea = getCurrentArea();
    const sections: AreaSection[] = [];

    for (const [areaName, entryMap] of areaEntryMap) {
      sections.push({
        areaName,
        known: areaKnown.get(areaName) ?? 0,
        total: areaTotal.get(areaName) ?? 0,
        entries: Array.from(entryMap.values()),
      });
    }

    sections.sort((a, b) => {
      if (currentArea) {
        const aIsCurrent = a.areaName === currentArea;
        const bIsCurrent = b.areaName === currentArea;
        if (aIsCurrent && !bIsCurrent) return -1;
        if (!aIsCurrent && bIsCurrent) return 1;
      }
      if (a.areaName === 'Inne') return 1;
      if (b.areaName === 'Inne') return -1;
      return a.areaName.localeCompare(b.areaName);
    });

    return sections;
  }, [data, hideCompleted, filter, showHints]);

  const filteredAreaSections = useMemo(() => {
    if (!selectedArea) return areaSections;
    return areaSections.filter((s) => s.areaName === selectedArea);
  }, [areaSections, selectedArea]);

  const areasContent = useMemo(() => {
    if (filteredAreaSections.length === 0) {
      return null;
    }

    return filteredAreaSections.map((section) => (
      <section key={section.areaName} className="knowledge-details-area">
        <div className="knowledge-details-area-header">
          <span className="knowledge-details-name">{section.areaName}</span>
          <span
            className="knowledge-details-badge knowledge-details-badge--entries"
            title={`Znane wpisy: ${section.known} z ${section.total}`}
          >
            {section.known}/{section.total}
          </span>
        </div>
        <ul className="knowledge-details-entries">
          {section.entries.map((entry) => {
            const unavailable = entry.status !== 'known' && isUnavailable(entry);
            const lokalizacja = isBlank(entry.lokalizacja) || entry.lokalizacja!.toLowerCase().includes('niedostepna') ? undefined : entry.lokalizacja;
            const note = isBlank(entry.note) ? undefined : entry.note;
            const statusClass = unavailable ? 'unavailable' : entry.status;

            return (
              <li
                key={`area-${section.areaName}-${entry.name}`}
                className={`knowledge-details-entry knowledge-details-entry--${statusClass}`}
              >
                <span
                  className={`knowledge-details-entry-indicator knowledge-details-entry-indicator--${statusClass}`}
                />
                <span className="knowledge-details-entry-name">{entry.name}</span>
                {showHints && lokalizacja && (
                  <button
                    type="button"
                    className="knowledge-details-entry-location"
                    title={lokalizacja}
                    onClick={entry.id != null ? () => handleLeadToEntry(entry.id!) : undefined}
                  >
                    {lokalizacja}
                  </button>
                )}
                {showHints && entry.id != null && (
                  <button
                    type="button"
                    className="knowledge-details-entry-map"
                    title="Pokaz na mapie"
                    onClick={() => handleShowOnMap(entry.id!)}
                  >
                    &#x1f50d;
                  </button>
                )}
                {showHints && unavailable && (
                  <span className="knowledge-details-entry-note" title="Obecnie niedostepne">
                    Obecnie niedostepne
                  </span>
                )}
                {showHints && !unavailable && note && (
                  <span className="knowledge-details-entry-note" title={note}>
                    {note}
                  </span>
                )}
                <span className="knowledge-details-entry-categories">
                  {entry.categories.map((cat) => (
                    <span key={cat} className="knowledge-details-entry-category-badge">{cat}</span>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    ));
  }, [filteredAreaSections, renderEntry]);

  const overallProgress = useMemo(() => {
    if (!data) {
      return null;
    }

    const seen = new Map<string, boolean>();

    for (const category of data.categories) {
      for (const { key } of TYPE_CONFIG) {
        const summary = category.types[key];
        if (!summary) {
          continue;
        }

        for (const entry of summary.entries) {
          const entryKey = entry.name.toLowerCase();
          const isKnown = entry.status === 'known';
          const existing = seen.get(entryKey);
          if (existing === undefined) {
            seen.set(entryKey, isKnown);
          } else if (!existing && isKnown) {
            seen.set(entryKey, true);
          }
        }
      }
    }

    let total = 0;
    let known = 0;
    for (const isKnown of seen.values()) {
      total++;
      if (isKnown) known++;
    }

    const percentage =
      total > 0 ? Math.round((known / total) * 100) : 0;

    return { total, known, percentage };
  }, [data]);

  const collectEntryNames = useCallback((status: 'known' | 'missing') => {
    if (!data) return '';
    const seen = new Set<string>();
    const names: string[] = [];
    for (const category of data.categories) {
      for (const { key } of TYPE_CONFIG) {
        const summary = category.types[key];
        if (!summary) continue;
        for (const entry of summary.entries) {
          if (entry.status !== status) continue;
          const lower = entry.name.toLowerCase();
          if (seen.has(lower)) continue;
          seen.add(lower);
          names.push(entry.name);
        }
      }
    }
    return names.join('\n');
  }, [data]);

  const handleCopyCompleted = useCallback(() => {
    const text = collectEntryNames('known');
    if (text) navigator.clipboard.writeText(text);
  }, [collectEntryNames]);

  const handleCopyNotCompleted = useCallback(() => {
    const text = collectEntryNames('missing');
    if (text) navigator.clipboard.writeText(text);
  }, [collectEntryNames]);

  const titleWithProgress = overallProgress
    ? `Raport wiedzy ${overallProgress.known}/${overallProgress.total} (${overallProgress.percentage}%)`
    : 'Raport wiedzy';

  const headerActions = (
    <>
      <button
        type="button"
        className="knowledge-details-copy-button"
        title="Kopiuj brakujace wpisy"
        onClick={handleCopyNotCompleted}
        disabled={!data}
      >
        Kopiuj brakujace
      </button>
      <button
        type="button"
        className="knowledge-details-copy-button"
        title="Kopiuj ukonczone wpisy"
        onClick={handleCopyCompleted}
        disabled={!data}
      >
        Kopiuj ukonczone
      </button>
      <div className="knowledge-details-filter">
        <input
          type="text"
          className="knowledge-details-filter-input"
          placeholder="Filtruj..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {filter && (
          <button
            type="button"
            className="knowledge-details-filter-clear"
            onClick={() => setFilter('')}
          >
            &times;
          </button>
        )}
      </div>
    </>
  );

  return (
    <DockablePopupWrapper
      {...wrapperProps}
      popupType="knowledgeDetails"
      title={titleWithProgress}
      headerActions={headerActions}
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
              <div className="knowledge-tabs">
                <button
                  type="button"
                  className={`knowledge-tab-button${
                    activeTab === 'categories' ? ' knowledge-tab-button--active' : ''
                  }`}
                  onClick={() => setActiveTab('categories')}
                >
                  Kategorie
                </button>
                <button
                  type="button"
                  className={`knowledge-tab-button${
                    activeTab === 'areas' ? ' knowledge-tab-button--active' : ''
                  }`}
                  onClick={() => setActiveTab('areas')}
                  disabled={!showHints}
                >
                  Regiony
                </button>
              </div>
              {activeTab === 'areas' && areaSections.length > 0 && (
                <select
                  className="knowledge-details-area-select"
                  value={selectedArea}
                  onChange={(e) => setSelectedArea(e.target.value)}
                >
                  <option value="">Wszystkie regiony</option>
                  {areaSections.map((s) => (
                    <option key={s.areaName} value={s.areaName}>
                      {s.areaName} ({s.known}/{s.total})
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                className={`knowledge-details-toggle-button${
                  hideCompleted ? ' knowledge-details-toggle-button--active' : ''
                }`}
                onClick={() => setHideCompleted(!hideCompleted)}
              >
                {hideCompleted ? 'Pokaż ukończone wpisy' : 'Ukryj ukończone wpisy'}
              </button>
              <button
                type="button"
                className={`knowledge-details-toggle-button${
                  showHints ? ' knowledge-details-toggle-button--active' : ''
                }`}
                onClick={() => setShowHints(!showHints)}
              >
                {showHints ? 'Ukryj podpowiedzi' : 'Pokaż podpowiedzi'}
              </button>
              <button
                type="button"
                className="knowledge-details-build-button"
                onClick={handleBuildKnowledge}
              >
                Odbuduj raport
              </button>
            </div>
            {activeTab === 'categories' && navItems.length > 0 && (
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
          <div className="knowledge-details-categories">
            {activeTab === 'categories' ? categoriesContent : areasContent}
          </div>
        </div>
      )}
    </DockablePopupWrapper>
  );
};

export default KnowledgeDetailsReport;
