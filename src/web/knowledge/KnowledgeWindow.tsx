import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Copy, Download, Library, MoreHorizontal, RefreshCw, Search, Send, X } from 'lucide-react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from '@web/layout/components/DockablePopupWrapper';
import { usePopup } from '@web/hooks/usePopup';
import { usePopupSetting } from '@web/hooks/usePopupSetting';
import { openSettingsPage } from '@web/settings/categories.ts';
import { showContextMenu } from '@web/contextMenu';
import { CategoriesTab } from './CategoriesTab';
import { ReportTab } from './ReportTab';
import { LibrariesTab } from './LibrariesTab';
import { RegionsTab } from './RegionsTab';
import { HistoryTab } from './HistoryTab';
import { Segmented, Switch } from './knowledgeUi';
import {
    LIBRARY_SORTS,
    uniqueEntryNames,
    type CategorySort,
    type EntryFilter,
    type LibrarySort,
} from './knowledgeModel';
import { useDistance, useKnowledgeData } from './useKnowledgeData';
import './knowledge.css';

/** One window for Wiedza and Biblioteki (the id stays the Wiedza one, so layouts keep it). */
export const KNOWLEDGE_POPUP_ID = 'popup:knowledgeDetails';

type Tab = 'categories' | 'report' | 'libraries' | 'areas' | 'history';

const TABS: { key: Tab; label: string }[] = [
    { key: 'categories', label: 'Kategorie' },
    { key: 'report', label: 'Raport' },
    { key: 'libraries', label: 'Biblioteki' },
    { key: 'areas', label: 'Regiony' },
    { key: 'history', label: 'Historia' },
];

/** Below this width the window is a phone's: categories become list then page. */
const NARROW_PX = 640;

function ago(timestamp: number | null): string {
    if (!timestamp) return '';
    const minutes = Math.round((Date.now() - timestamp) / 60000);
    if (minutes < 1) return 'dane z gry sprzed chwili';
    if (minutes < 60) return `dane z gry sprzed ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `dane z gry sprzed ${hours} godz.`;
    return `dane z gry sprzed ${Math.round(hours / 24)} dni`;
}

const rebuild = () => eventBus.emit('sendCommand', { command: '/wiedza_buduj' });

export default function KnowledgeWindow() {
    const { wrapperProps, isOpen, setIsOpen } = usePopup(KNOWLEDGE_POPUP_ID);
    const [tab, setTab] = usePopupSetting<Tab>(KNOWLEDGE_POPUP_ID, 'activeTab', 'categories');
    const [category, setCategory] = usePopupSetting(KNOWLEDGE_POPUP_ID, 'category', '');
    const [categorySort, setCategorySort] = usePopupSetting<CategorySort>(KNOWLEDGE_POPUP_ID, 'categorySort', 'weakest');
    const [entryFilter, setEntryFilter] = usePopupSetting<EntryFilter>(KNOWLEDGE_POPUP_ID, 'entryFilter', 'missing');
    const [reportFilter, setReportFilter] = usePopupSetting<EntryFilter>(KNOWLEDGE_POPUP_ID, 'reportFilter', 'missing');
    const [hints, setHints] = usePopupSetting(KNOWLEDGE_POPUP_ID, 'showHints', false);
    const [query, setQuery] = usePopupSetting(KNOWLEDGE_POPUP_ID, 'filter', '');
    const [area, setArea] = usePopupSetting(KNOWLEDGE_POPUP_ID, 'selectedArea', '');
    const [librarySort, setLibrarySort] = usePopupSetting<LibrarySort>(KNOWLEDGE_POPUP_ID, 'librarySort', 'most');
    const [hideDoneLibraries, setHideDoneLibraries] = usePopupSetting(KNOWLEDGE_POPUP_ID, 'hideDoneLibraries', true);
    const [pageOpen, setPageOpen] = useState(false);

    const data = useKnowledgeData(isOpen);
    const distance = useDistance(data.roomVersion);

    // /wiedza opens on what it was showing (Biblioteki aside); /biblioteki on Biblioteki.
    useEffect(() => {
        const unsubs = [
            eventBus.on('knowledgeDetails.popup.open', () => {
                setIsOpen(true);
                setTab((current) => (current === 'libraries' ? 'categories' : current));
            }),
            eventBus.on('knowledgeReport.popup.open', () => {
                setIsOpen(true);
                setTab('libraries');
            }),
        ];
        return () => unsubs.forEach((off) => off());
    }, [setIsOpen, setTab]);

    // The map rings the missing entries while hints are on; keep it in step.
    const hideCompleted = (tab === 'report' || tab === 'areas' ? reportFilter : entryFilter) === 'missing';
    useEffect(() => {
        eventBus.emit('knowledgeHints', { enabled: hints, hideCompleted });
    }, [hints, hideCompleted]);
    useEffect(() => eventBus.on('knowledgeHints', (detail) => {
        const payload = detail as { enabled: boolean; hideCompleted: boolean } | undefined;
        if (!payload) return;
        const next: EntryFilter = payload.hideCompleted ? 'missing' : 'all';
        setEntryFilter((prev) => (prev === 'known' && !payload.hideCompleted ? prev : next));
        setReportFilter(next);
    }), [setEntryFilter, setReportFilter]);

    // Narrow = a phone: measured on the window, not the screen, so a slim docked window gets it too.
    const rootRef = useRef<HTMLDivElement>(null);
    const [narrow, setNarrow] = useState(false);
    useLayoutEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        const observer = new ResizeObserver(() => setNarrow(el.clientWidth > 0 && el.clientWidth < NARROW_PX));
        observer.observe(el);
        return () => observer.disconnect();
    }, [isOpen]);

    const openCategory = useCallback((name: string) => {
        setCategory(name);
        setTab('categories');
        setPageOpen(true);
    }, [setCategory, setTab]);

    const here = data.libraries?.libraries.find((lib) => lib.id === data.libraries?.currentLibraryId);
    const herePending = here?.categories.filter((c) => c.status !== 'completed') ?? [];

    const moreMenu = (x: number, y: number) => {
        const copy = (status: 'known' | 'missing') => () => {
            const text = uniqueEntryNames(data.rows, status).join('\n');
            if (text) void navigator.clipboard?.writeText(text);
        };
        showContextMenu(
            [
                { label: 'Odbuduj raport', icon: RefreshCw, hint: '/wiedza_buduj', action: rebuild },
                { label: 'Wyślij „wiedza”', icon: Send, detail: 'odświeża poziomy wszystkich kategorii', action: () => eventBus.emit('sendCommand', { command: 'wiedza' }) },
                { label: 'Kopiuj brakujące wpisy', icon: Copy, separator: true, action: copy('missing') },
                { label: 'Kopiuj poznane wpisy', icon: Copy, action: copy('known') },
                {
                    label: 'Import z Mudleta',
                    icon: Download,
                    separator: true,
                    opensWindow: true,
                    action: () => openSettingsPage('data-import', 'import-wiedza'),
                },
            ],
            x,
            y,
        );
    };

    const moreButton = (
        <button
            type="button"
            id="knowledge-more"
            className="kn-icon-btn kn-icon-btn--box"
            title="Więcej: odbuduj raport, kopiuj, import z Mudleta"
            onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                moreMenu(rect.left, rect.bottom + 4);
            }}
        >
            <MoreHorizontal size={15} />
        </button>
    );

    const searchField = (
        <span className="kn-search">
            <Search size={14} />
            <input
                id="knowledge-search"
                type="search"
                placeholder={hints ? 'Szukaj we wpisach i podpowiedziach' : 'Szukaj we wpisach'}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
                <button type="button" className="kn-search__clear" title="Wyczyść" onClick={() => setQuery('')}>
                    <X size={13} />
                </button>
            )}
        </span>
    );

    const missingTotal = data.rows.reduce((sum, row) => sum + (row.total - row.known), 0);
    const entriesTotal = data.rows.reduce((sum, row) => sum + row.total, 0);

    const toolbarExtras = () => {
        switch (tab) {
            case 'categories':
                return (
                    <>
                        {data.updatedAt && <span className="kn-muted kn-hide-narrow">{ago(data.updatedAt)}</span>}
                        <button type="button" className="kn-btn kn-btn--sm" title="Odbuduj raport (/wiedza_buduj)" onClick={rebuild}>
                            <RefreshCw size={13} />
                            <span className="kn-hide-narrow">Odśwież</span>
                        </button>
                    </>
                );
            case 'report':
            case 'areas':
                return (
                    <>
                        {searchField}
                        <Switch id="knowledge-report-hints" checked={hints} onChange={setHints}>Podpowiedzi</Switch>
                        <Segmented<EntryFilter>
                            value={reportFilter === 'known' ? 'all' : reportFilter}
                            onChange={setReportFilter}
                            options={[
                                { key: 'missing', label: <>Brakujące <span className="kn-count">{missingTotal}</span></> },
                                { key: 'all', label: <>Wszystkie <span className="kn-count">{entriesTotal}</span></> },
                            ]}
                        />
                    </>
                );
            case 'libraries':
                return (
                    <>
                        <label className="kn-check" htmlFor="knowledge-hide-done">
                            <input id="knowledge-hide-done" type="checkbox" checked={hideDoneLibraries} onChange={(e) => setHideDoneLibraries(e.target.checked)} />
                            Ukryj ukończone
                        </label>
                        <select id="knowledge-library-sort" className="kn-select" value={librarySort} onChange={(e) => setLibrarySort(e.target.value as LibrarySort)}>
                            {LIBRARY_SORTS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                        </select>
                    </>
                );
            default:
                return null;
        }
    };

    const hasAnything = Boolean(data.details || data.libraries || data.books || data.history?.length);

    const body = () => {
        if (!hasAnything) {
            return (
                <div className="kn-empty kn-empty--start">
                    <span>Brak danych o wiedzy tej postaci.</span>
                    <span className="kn-muted">Raport buduje się z odpowiedzi gry na „wiedza o …” dla każdej kategorii.</span>
                    <span className="kn-row">
                        <button type="button" className="kn-btn kn-btn--solid" onClick={rebuild}>Zbuduj raport</button>
                        <button type="button" className="kn-btn" onClick={() => openSettingsPage('data-import', 'import-wiedza')}>Import z Mudleta</button>
                    </span>
                </div>
            );
        }
        switch (tab) {
            case 'report':
                return <ReportTab rows={data.rows} query={query} filter={reportFilter === 'known' ? 'all' : reportFilter} hints={hints} distance={distance} />;
            case 'libraries':
                return (
                    <LibrariesTab
                        report={data.libraries}
                        sort={librarySort}
                        hideCompleted={hideDoneLibraries}
                        distance={distance}
                        onOpenCategory={openCategory}
                    />
                );
            case 'areas':
                return (
                    <RegionsTab
                        rows={data.rows}
                        filter={reportFilter === 'known' ? 'all' : reportFilter}
                        query={query}
                        hints={hints}
                        area={area}
                        onArea={setArea}
                        distance={distance}
                        roomVersion={data.roomVersion}
                    />
                );
            case 'history':
                return <HistoryTab events={data.history} />;
            default:
                return (
                    <CategoriesTab
                        rows={data.rows}
                        selected={category}
                        onSelect={(name) => {
                            setCategory(name);
                            setPageOpen(true);
                        }}
                        sort={categorySort}
                        onSort={setCategorySort}
                        entryFilter={entryFilter}
                        onEntryFilter={setEntryFilter}
                        hints={hints}
                        onHints={setHints}
                        distance={distance}
                        narrow={narrow}
                        pageOpen={pageOpen}
                        onBack={() => setPageOpen(false)}
                    />
                );
        }
    };

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="knowledgeDetails"
            title="Wiedza"
            minWidth={340}
            minHeight={320}
            initialWidth={Math.min(1080, window.innerWidth - 16)}
            initialHeight={Math.min(window.innerHeight * 0.8, window.innerHeight - 32)}
            className="knowledge-window"
            bodyClassName="knowledge-window-body"
        >
            <div ref={rootRef} className={`kn${narrow ? ' kn--narrow' : ''}`} data-tab={tab}>
                <div className="kn-toolbar">
                    <Segmented<Tab>
                        className="kn-tabs"
                        value={tab}
                        onChange={(next) => {
                            setTab(next);
                            setPageOpen(false);
                        }}
                        options={TABS}
                    />
                    <span className="kn-grow" />
                    {hasAnything && toolbarExtras()}
                    {moreButton}
                </div>
                {tab === 'categories' && here && herePending.length > 0 && !(narrow && pageOpen) && (
                    <div className="kn-here">
                        <Library size={15} />
                        <span>Jesteś w <strong>{here.name}</strong>.</span>
                        <span className="kn-dim">Do zgłębienia tutaj:</span>
                        {herePending.map((cat) => (
                            <button key={cat.name} type="button" className="kn-chip kn-chip--acc kn-chip--btn" onClick={() => openCategory(cat.name)}>
                                {cat.name}
                            </button>
                        ))}
                    </div>
                )}
                <div className="kn-body">{body()}</div>
            </div>
        </DockablePopupWrapper>
    );
}
