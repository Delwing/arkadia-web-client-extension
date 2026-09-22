import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { CornerDownLeft, Info, Menu, Search, Sparkles, X } from 'lucide-react';
import eventBus, { type ClientEvents } from '@modules/core/eventBus';
import { DockablePopupWrapper } from '@web/layout/components/DockablePopupWrapper';
import { usePopup } from '@web/hooks/usePopup';
import { usePopupSetting } from '@web/hooks/usePopupSetting';
import { DOC_PAGES, type DocGroup } from './docPages';
import {
    buildDocPages,
    highlightHtml,
    isSearching,
    pagesLabel,
    resultsLabel,
    searchDocs,
    type DocBlock,
    type DocCommand,
    type DocPage,
    type DocSearchResult,
} from './docsModel';
import './docs.css';

export const DOCS_POPUP_ID = 'popup:docs';

/** Below this width the window is a phone's: contents behind a button, sections as chips. */
const NARROW_PX = 640;
const GROUPS: DocGroup[] = ['Start', 'Gra', 'Klient'];

let parsed: DocPage[] | null = null;
/** Parsed on first open, not at start-up. */
const getPages = () => (parsed ??= buildDocPages(DOC_PAGES));

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Puts `text` on the command line, caret at the end, ready to finish and send. */
function insertCommand(text: string) {
    const input = document.getElementById('message-input') as HTMLInputElement | HTMLTextAreaElement | null;
    if (!input) return;
    input.value = text;
    input.focus();
    input.setSelectionRange(text.length, text.length);
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** The AI assistant (/pomoc); what was searched for becomes the question. */
function askAssistant(query: string) {
    const question = query.trim();
    eventBus.emit('assistant.popup.open', question ? { question } : undefined);
}

function CommandRow({ row, terms }: { row: DocCommand; terms: string[] }) {
    const key = terms.join(' ');
    const token = useMemo(
        () => ({
            __html: `${highlightHtml(escapeHtml(row.head), terms)}${row.args ? ` <i>${highlightHtml(escapeHtml(row.args), terms)}</i>` : ''}`,
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [row, key],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const desc = useMemo(() => ({ __html: highlightHtml(row.html, terms) }), [row, key]);
    return (
        <div className="doc-cmd">
            <span className="doc-cmd__key">
                <span className="doc-token" dangerouslySetInnerHTML={token} />
            </span>
            <span className="doc-cmd__desc" dangerouslySetInnerHTML={desc} />
            <span className="doc-cmd__act">
                {row.insert && (
                    <button
                        type="button"
                        className="doc-btn doc-insert"
                        title={`Wstaw „${row.insert.trim()}” do linii komend`}
                        onClick={() => insertCommand(row.insert!)}
                    >
                        <CornerDownLeft size={13} />
                        Wstaw
                    </button>
                )}
            </span>
        </div>
    );
}

function Html({ html, className, terms = [] }: { html: string; className: string; terms?: string[] }) {
    const key = terms.join(' ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const inner = useMemo(() => ({ __html: highlightHtml(html, terms) }), [html, key]);
    return <div className={className} dangerouslySetInnerHTML={inner} />;
}

function Tip({ html, terms }: { html: string; terms?: string[] }) {
    return (
        <div className="doc-tip">
            <Info size={15} />
            <Html className="doc-tip__body" html={html} terms={terms} />
        </div>
    );
}

function Blocks({ blocks }: { blocks: DocBlock[] }) {
    return (
        <>
            {blocks.map((b, i) => {
                switch (b.kind) {
                    case 'commands':
                        return (
                            <div key={i} className="doc-cmds">
                                {b.rows.map((row, j) => <CommandRow key={j} row={row} terms={[]} />)}
                            </div>
                        );
                    case 'tip':
                        return <Tip key={i} html={b.html} />;
                    case 'subheading':
                        return <h3 key={i} className="doc-h3">{b.title}</h3>;
                    default:
                        return <Html key={i} className="doc-text" html={b.html} />;
                }
            })}
        </>
    );
}

/** Lista obiektów draws its own demos; its h2s get the section ids the contents point at. */
function CustomPage({ page }: { page: DocPage }) {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || !page.custom) return;
        el.innerHTML = page.custom.html;
        page.custom.init?.(el);
        el.querySelectorAll('h1').forEach((h) => h.remove());
        el.querySelectorAll('h2').forEach((h, i) => {
            const section = page.sections[i];
            if (section) {
                h.id = section.id;
                h.dataset.section = section.id;
            }
        });
    }, [page]);
    return <div ref={ref} className="doc-custom" />;
}

function PageView({ page }: { page: DocPage }) {
    return (
        <article className="doc-page" data-page={page.key}>
            <span className="doc-crumb">{page.group} / {page.title}</span>
            <header className="doc-head">
                <h1>{page.title}</h1>
                {page.lead && <p className="doc-lead">{page.lead}</p>}
            </header>
            {page.custom ? (
                <CustomPage page={page} />
            ) : (
                page.sections.map((section) => (
                    <section key={section.id} className="doc-sec">
                        {section.title && <h2 id={section.id} data-section={section.id}>{section.title}</h2>}
                        <Blocks blocks={section.blocks} />
                    </section>
                ))
            )}
        </article>
    );
}

function ResultsView({ result, query, onOpen }: { result: DocSearchResult; query: string; onOpen: (page: string, section: string) => void }) {
    if (result.total === 0) {
        return (
            <div className="doc-empty">
                <span>Brak wyników dla „{query.trim()}”.</span>
                <button type="button" className="doc-btn doc-ask" onClick={() => askAssistant(query)}>
                    <Sparkles size={14} />
                    Zapytaj asystenta
                </button>
            </div>
        );
    }
    return (
        <div className="doc-results">
            <div className="doc-results__head">
                <h1>{resultsLabel(result.total)} dla „{query.trim()}”</h1>
                <span className="doc-muted">{pagesLabel(result.perPage.length)}</span>
            </div>
            {result.groups.map((group) => (
                <div key={group.section.id} className="doc-hits" data-page={group.page.key}>
                    <div className="doc-hits__head">
                        <span className="doc-hits__page">{group.page.title}</span>
                        {group.section.title && (
                            <>
                                <span className="doc-muted">›</span>
                                <span className="doc-dim">{group.section.title}</span>
                            </>
                        )}
                        <span className="doc-grow" />
                        <button type="button" className="doc-link" onClick={() => onOpen(group.page.key, group.section.id)}>
                            Otwórz stronę
                        </button>
                    </div>
                    <div className="doc-cmds">
                        {group.hits.map((hit, i) =>
                            hit.kind === 'command' ? (
                                <CommandRow key={i} row={hit.row} terms={result.terms} />
                            ) : hit.tip ? (
                                <div key={i} className="doc-cmd doc-cmd--text"><Tip html={hit.html} terms={result.terms} /></div>
                            ) : (
                                <div key={i} className="doc-cmd doc-cmd--text"><Html className="doc-text" html={hit.html} terms={result.terms} /></div>
                            ),
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

function SearchField({
    inputRef,
    query,
    onQuery,
    autoFocus,
}: {
    inputRef: RefObject<HTMLInputElement | null>;
    query: string;
    onQuery: (query: string) => void;
    autoFocus?: boolean;
}) {
    return (
        <label className="doc-search">
            <Search size={15} />
            <input
                ref={inputRef}
                id="docs-search"
                type="text"
                placeholder="Szukaj komendy lub tematu"
                autoComplete="off"
                spellCheck={false}
                autoFocus={autoFocus}
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Escape' && query) {
                        e.stopPropagation();
                        onQuery('');
                    }
                }}
            />
            {query ? (
                <button type="button" className="doc-search__clear" title="Wyczyść" onClick={() => onQuery('')}>
                    <X size={12} />
                </button>
            ) : (
                <span className="doc-kbd" title="Naciśnij /, aby szukać">/</span>
            )}
        </label>
    );
}

export default function DocsWindow() {
    const [pageKey, setPageKey] = usePopupSetting(DOCS_POPUP_ID, 'page', 'overview');
    const [query, setQuery] = useState('');
    const onOpen = useCallback(
        (detail: ClientEvents['docs.popup.open']) => {
            if (detail && typeof detail === 'object' && detail.page) {
                setPageKey(detail.page);
                setQuery('');
            }
        },
        [setPageKey],
    );
    const { wrapperProps, isOpen } = usePopup(DOCS_POPUP_ID, { openEvent: 'docs.popup.open', onOpen });

    const pages = useMemo(() => (isOpen ? getPages() : []), [isOpen]);
    const page = pages.find((p) => p.key === pageKey) ?? pages[0];
    const searching = isSearching(query);
    const result = useMemo(() => (searching ? searchDocs(pages, query) : null), [searching, pages, query]);

    const rootRef = useRef<HTMLDivElement>(null);
    const mainRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const [narrow, setNarrow] = useState(false);
    const [tocOpen, setTocOpen] = useState(false);
    const [phoneSearch, setPhoneSearch] = useState(false);
    const [activeSection, setActiveSection] = useState('');
    const [resultPage, setResultPage] = useState('');
    const pendingScroll = useRef<string | null>(null);

    useLayoutEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        const observer = new ResizeObserver(() => setNarrow(el.clientWidth > 0 && el.clientWidth < NARROW_PX));
        observer.observe(el);
        return () => observer.disconnect();
    }, [isOpen]);

    const titled = useMemo(() => page?.sections.filter((s) => s.title) ?? [], [page]);

    // Which section the reader is in: the last heading scrolled past the top.
    const spy = useCallback(() => {
        const main = mainRef.current;
        if (!main || searching) return;
        const top = main.getBoundingClientRect().top + 48;
        let current = titled[0]?.id ?? '';
        for (const heading of main.querySelectorAll<HTMLElement>('[data-section]')) {
            if (heading.getBoundingClientRect().top <= top) current = heading.dataset.section ?? current;
        }
        setActiveSection(current);
    }, [searching, titled]);

    // A new page starts at its top, or at the section asked for.
    useLayoutEffect(() => {
        const main = mainRef.current;
        if (!main || !page) return;
        const target = pendingScroll.current;
        pendingScroll.current = null;
        const heading = target ? main.querySelector<HTMLElement>(`[data-section="${target}"]`) : null;
        if (heading) {
            main.scrollTop += heading.getBoundingClientRect().top - main.getBoundingClientRect().top - 12;
        } else {
            main.scrollTop = 0;
        }
        spy();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, searching]);

    useEffect(() => {
        setResultPage(result?.perPage[0]?.page.key ?? '');
    }, [result]);

    const openPage = (key: string, section?: string) => {
        pendingScroll.current = section ?? null;
        setQuery('');
        setPhoneSearch(false);
        setTocOpen(false);
        if (key === page?.key && section) {
            // Same page: the layout effect will not run, scroll now.
            requestAnimationFrame(() => {
                const main = mainRef.current;
                const heading = main?.querySelector<HTMLElement>(`[data-section="${section}"]`);
                if (main && heading) main.scrollTop += heading.getBoundingClientRect().top - main.getBoundingClientRect().top - 12;
                pendingScroll.current = null;
            });
        }
        setPageKey(key);
    };

    const scrollToSection = (id: string) => {
        const main = mainRef.current;
        const heading = main?.querySelector<HTMLElement>(`[data-section="${id}"]`);
        if (!main || !heading) return;
        main.scrollTo({ top: main.scrollTop + heading.getBoundingClientRect().top - main.getBoundingClientRect().top - 12, behavior: 'smooth' });
        setActiveSection(id);
    };

    const scrollToResults = (key: string) => {
        setResultPage(key);
        const main = mainRef.current;
        const group = main?.querySelector<HTMLElement>(`.doc-hits[data-page="${key}"]`);
        if (main && group) main.scrollTo({ top: main.scrollTop + group.getBoundingClientRect().top - main.getBoundingClientRect().top - 12, behavior: 'smooth' });
    };

    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        if (e.key !== '/' || target.closest('input, textarea, select, [contenteditable="true"]')) return;
        e.preventDefault();
        if (narrow) setPhoneSearch(true);
        searchRef.current?.focus();
    };

    const toc = (withSections: boolean) => (
        <div className="doc-nav__list">
            {GROUPS.map((group) => (
                <div key={group} className="doc-nav__group">
                    <span className="doc-cap">{group}</span>
                    {pages
                        .filter((p) => p.group === group)
                        .map((p) => (
                            <div key={p.key}>
                                <button
                                    type="button"
                                    className={`doc-nav__page${p.key === page?.key ? ' is-active' : ''}`}
                                    data-page={p.key}
                                    onClick={() => openPage(p.key)}
                                >
                                    {p.title}
                                </button>
                                {withSections && p.key === page?.key && titled.length > 0 && (
                                    <div className="doc-nav__sub">
                                        {titled.map((s) => (
                                            <button
                                                key={s.id}
                                                type="button"
                                                className={s.id === activeSection ? 'is-active' : undefined}
                                                onClick={() => scrollToSection(s.id)}
                                            >
                                                {s.title}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                </div>
            ))}
        </div>
    );

    const resultsNav = result && (
        <div className="doc-nav__list">
            <div className="doc-nav__group">
                <span className="doc-cap">Wyniki na stronach</span>
                {result.perPage.length === 0 && <span className="doc-muted doc-nav__none">Nic nie pasuje.</span>}
                {result.perPage.map(({ page: p, count }) => (
                    <button
                        key={p.key}
                        type="button"
                        className={`doc-nav__page${p.key === resultPage ? ' is-active' : ''}`}
                        data-page={p.key}
                        onClick={() => scrollToResults(p.key)}
                    >
                        <span className="doc-grow">{p.title}</span>
                        <span className="doc-count">{count}</span>
                    </button>
                ))}
            </div>
        </div>
    );

    const main = page && (
        <div ref={mainRef} className="doc-main" onScroll={spy}>
            {result ? <ResultsView result={result} query={query} onOpen={openPage} /> : <PageView page={page} />}
        </div>
    );

    const body = () => {
        if (!page) return null;
        if (narrow) {
            return (
                <>
                    <div className="doc-bar">
                        <button
                            type="button"
                            className={`doc-icon-btn${tocOpen ? ' is-on' : ''}`}
                            title="Spis treści"
                            id="docs-toc"
                            onClick={() => setTocOpen((open) => !open)}
                        >
                            <Menu size={18} />
                        </button>
                        {phoneSearch ? (
                            <SearchField inputRef={searchRef} query={query} onQuery={setQuery} autoFocus />
                        ) : (
                            <span className="doc-bar__title">{tocOpen ? 'Spis treści' : page.title}</span>
                        )}
                        <span className="doc-grow" />
                        <button
                            type="button"
                            className="doc-icon-btn"
                            id="docs-ask"
                            title="Zapytaj asystenta (/pomoc)"
                            onClick={() => askAssistant(searching ? query : '')}
                        >
                            <Sparkles size={17} />
                        </button>
                        <button
                            type="button"
                            className="doc-icon-btn"
                            title={phoneSearch ? 'Zamknij szukanie' : 'Szukaj'}
                            id="docs-search-toggle"
                            onClick={() => {
                                if (phoneSearch) setQuery('');
                                setPhoneSearch(!phoneSearch);
                                setTocOpen(false);
                            }}
                        >
                            {phoneSearch ? <X size={17} /> : <Search size={17} />}
                        </button>
                    </div>
                    {tocOpen ? (
                        <nav className="doc-nav doc-nav--sheet">{toc(false)}</nav>
                    ) : (
                        <>
                            {!result && titled.length > 0 && (
                                <div className="doc-chips">
                                    {titled.map((s) => (
                                        <button
                                            key={s.id}
                                            type="button"
                                            className={`doc-chip${s.id === activeSection ? ' is-active' : ''}`}
                                            onClick={() => scrollToSection(s.id)}
                                        >
                                            {s.title}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {main}
                        </>
                    )}
                </>
            );
        }
        return (
            <div className="doc-split">
                <nav className="doc-nav">
                    <div className="doc-nav__search">
                        <SearchField inputRef={searchRef} query={query} onQuery={setQuery} />
                        <button
                            type="button"
                            id="docs-ask"
                            className="doc-btn doc-ask"
                            title={searching ? `Zapytaj asystenta: „${query.trim()}” (/pomoc)` : 'Otwórz asystenta AI (/pomoc)'}
                            onClick={() => askAssistant(searching ? query : '')}
                        >
                            <Sparkles size={14} />
                            {searching ? 'Zapytaj asystenta o to' : 'Zapytaj asystenta'}
                        </button>
                    </div>
                    {result ? resultsNav : toc(true)}
                </nav>
                {main}
            </div>
        );
    };

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="docs"
            title="Dokumentacja"
            minWidth={320}
            minHeight={320}
            initialWidth={Math.min(1100, window.innerWidth - 16)}
            initialHeight={Math.min(window.innerHeight * 0.85, window.innerHeight - 32)}
            className="docs-window"
            bodyClassName="docs-window-body"
        >
            <div ref={rootRef} className={`doc${narrow ? ' doc--narrow' : ''}`} tabIndex={-1} onKeyDown={onKeyDown}>
                {body()}
            </div>
        </DockablePopupWrapper>
    );
}
