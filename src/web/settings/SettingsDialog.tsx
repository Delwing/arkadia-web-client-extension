import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useCharacterSettingsPages } from "@web/options/useCharacterSettingsPages.tsx";
import { useUiSettingsPages, type UiSettingsPagesProps } from "@web/uiSettings/useUiSettingsPages.tsx";
import { useDataPages } from "@web/options/useDataPages.tsx";
import { OPEN_SETTINGS_EVENT, type OpenSettingsDetail } from "@web/assistant/openSettings.ts";
import {
    CLOSE_SETTINGS_EVENT,
    DEFAULT_SETTINGS_CATEGORY,
    SAVE_SETTINGS_EVENT,
    SETTINGS_CATEGORIES,
    SETTINGS_GROUP_LABELS,
    SETTINGS_MODAL_ID,
    SHOW_SETTINGS_EVENT,
    settingsCategory,
    settingsCategoryByLabel,
    type SettingsCategoryKey,
    type SettingsGroup,
    type ShowSettingsDetail,
} from "./categories";
import { applySearch, clearSearch, highlightTerms, searchTerms, type PageSearchInput } from "./settingsSearch";
import { indexPage, matchSettings, pageMatches, pageSections } from "./settingsIndex";
import { PhonePageHeader, PhoneSaveBar, PhoneSectionChips, PhoneStart, type PhoneResults, type ScopeChip } from "./PhoneSettings";
import { pageSignature } from "./settingsDirty";
import { NavIcon } from "./categoryIcons";
import { AppModal, MODAL_EVENT } from "@web/modals/appModal.ts";
import { useBackLayer } from "@web-ui/backNavigation.ts";
import "./settingsDialog.css";

const GROUPS: readonly SettingsGroup[] = ["character", "ui", "data"];
/** The host's button next to Save that drops every unsaved edit. */
const SETTINGS_DISCARD_ID = "settings-discard";

function capitalize(name: string): string {
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function sameKeys(a: ReadonlySet<string> | null, b: ReadonlySet<string>): boolean {
    return !!a && a.size === b.size && [...b].every(key => a.has(key));
}

/** What a control is set to, for counting unsaved changes. */
function controlValue(el: Element): string {
    if (el instanceof HTMLInputElement) return el.type === "checkbox" || el.type === "radio" ? String(el.checked) : el.value;
    return (el as HTMLSelectElement | HTMLTextAreaElement).value;
}

function settingControls(root: HTMLElement): Element[] {
    return Array.from(root.querySelectorAll("input, select, textarea")).filter(el => !el.closest("[data-settings-ignore]"));
}

/**
 * Whether the dialog is phone-narrow - the same 40rem as the stylesheet's
 * container query, measured on the dialog itself so a narrow forge shell or
 * popout gets the phone views too. A hidden dialog (width 0) keeps its answer.
 */
function useNarrow(ref: RefObject<HTMLElement | null>): boolean {
    const [narrow, setNarrow] = useState(false);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const check = () => {
            const width = el.clientWidth;
            if (width === 0) return;
            const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
            setNarrow(width <= 40 * rem);
        };
        check();
        const observer = new ResizeObserver(check);
        observer.observe(el);
        return () => observer.disconnect();
    }, [ref]);
    return narrow;
}

/** Never equal to a page's signature: a page changed before anything was recorded. */
const UNKNOWN_BASELINE = "(changed before its baseline was taken)";

function sameCounts(a: ReadonlyMap<string, number> | null, b: ReadonlyMap<string, number>): boolean {
    return !!a && a.size === b.size && [...b].every(([key, count]) => a.get(key) === count);
}

export interface SettingsDialogProps extends UiSettingsPagesProps {
    /** Page to open on; hosts that keep the dialog mounted use `SHOW_SETTINGS_EVENT` instead. */
    initialCategory?: SettingsCategoryKey;
}

/**
 * Character and UI settings in one dialog: a sidebar of pages grouped by where
 * they are stored, a search across every page, and one Save for both.
 *
 * The host provides the chrome (title, Save button) and the modal lifecycle
 * on `#settings-modal`; forge fakes those events on its own shell.
 *
 * Closing without saving is not discarding: the dialog stays mounted for the
 * session and reopens where it was left - the page, its scroll, the search and
 * the unsaved edits (their live preview is undone while it is closed). Only
 * Save, "Odrzuć zmiany" or a character switch start a group from storage again.
 */
function SettingsDialog({ soundManager, onEnableNotifications, initialCategory }: SettingsDialogProps) {
    const character = useCharacterSettingsPages();
    const ui = useUiSettingsPages({ soundManager, onEnableNotifications });
    const data = useDataPages();
    const latest = useRef({ character, ui });
    latest.current = { character, ui };

    const [category, setCategory] = useState<SettingsCategoryKey>(initialCategory ?? DEFAULT_SETTINGS_CATEGORY.character);
    const [query, setQuery] = useState("");
    // How many sections match on each page; the sidebar shows the counts and the
    // ‹ › buttons walk the pages in this order.
    const [searchHits, setSearchHits] = useState<ReadonlyMap<SettingsCategoryKey, number> | null>(null);
    const [currentHit, setCurrentHit] = useState(0);
    const [dirty, setDirty] = useState<ReadonlySet<SettingsCategoryKey>>(() => new Set());
    // How many controls differ from before they were touched (a page changed some
    // other way, a list edited, counts as one): the phone's save bar shows it.
    const [dirtyCount, setDirtyCount] = useState(0);
    const hostRef = useRef<HTMLDivElement>(null);
    const narrow = useNarrow(hostRef);
    // On a phone the dialog is a list of pages to drill into.
    // A general first opening starts on the list; one asked for a page, on that page.
    const [phoneView, setPhoneView] = useState<"list" | "page">(initialCategory ? "page" : "list");
    // The pages stay mounted while the window is closed; Back may step from a
    // page to the list only while it shows.
    const [modalOpen, setModalOpen] = useState(() => !!AppModal.byId(SETTINGS_MODAL_ID)?.isOpen);
    useBackLayer(modalOpen && narrow && phoneView === "page", () => setPhoneView("list"));
    // Bumped when the pages' DOM changes while on a phone: the list summaries,
    // the search index and the section chips are read from it.
    const [domVersion, setDomVersion] = useState(0);
    const controlBaselines = useRef(new Map<SettingsCategoryKey, Map<Element, string>>());
    // The setting a search result opened, scrolled to once its page shows.
    const pendingAnchor = useRef<HTMLElement | null>(null);

    const pagesRef = useRef<HTMLDivElement>(null);
    const pageRefs = useRef(new Map<SettingsCategoryKey, HTMLDivElement>());
    const searchRef = useRef<HTMLInputElement>(null);
    // Each page's signature from just before the user first touched it.
    const baselines = useRef(new Map<SettingsCategoryKey, string>());
    const dirtyFrame = useRef(0);
    const scrollPos = useRef(new Map<SettingsCategoryKey, number>());
    const categoryRef = useRef(category);
    // Where the last close left the pane, restored when it reopens on the same page.
    const resumeScroll = useRef<number | null>(null);
    const dirtyRef = useRef(dirty);
    dirtyRef.current = dirty;
    // The groups a close left unsaved, and whose character the edits were for.
    const held = useRef<{ groups: ReadonlySet<SettingsGroup>; character: string | null } | null>(null);

    const terms = useMemo(() => searchTerms(query), [query]);
    // The wide layout's search filters the pages in place; the phone lists results instead.
    const searching = !narrow && terms.length > 0;
    const searchingRef = useRef(searching);
    searchingRef.current = searching;

    const navigate = useCallback((next: SettingsCategoryKey) => {
        const pane = pagesRef.current;
        // The results list scrolls on its own; only a page's position is worth keeping.
        if (pane && !searchingRef.current) {
            scrollPos.current.set(categoryRef.current, pane.scrollTop);
        }
        setQuery("");
        setCategory(next);
        pendingAnchor.current = null;
        resumeScroll.current = null;
        setPhoneView("page");
    }, []);

    // The pages with a match, in sidebar order: what ‹ › walk and what the
    // counter counts.
    const hitKeys = useMemo(
        () => (searchHits ? SETTINGS_CATEGORIES.filter(c => searchHits.has(c.key)).map(c => c.key) : []),
        [searchHits],
    );
    // Typing narrows the results while `currentHit` stays put, so what is shown
    // is the clamped one - never "4 z 2".
    const shownHit = hitKeys.length === 0 ? 0 : Math.min(currentHit, hitKeys.length - 1);
    const currentKey = hitKeys[shownHit];

    // A new query starts again from the first page with a match.
    useEffect(() => setCurrentHit(0), [query]);

    /** Scroll the nth page with a match to the top of the results pane. */
    const gotoHit = useCallback((index: number) => {
        if (hitKeys.length === 0) return;
        const next = ((index % hitKeys.length) + hitKeys.length) % hitKeys.length;
        setCurrentHit(next);
        const page = pageRefs.current.get(hitKeys[next]);
        const pane = pagesRef.current;
        if (page && pane) {
            pane.scrollTop += page.getBoundingClientRect().top - pane.getBoundingClientRect().top;
        }
    }, [hitKeys]);

    const pageLayout = (key: SettingsCategoryKey) =>
        pageRefs.current.get(key)?.querySelector<HTMLElement>(".settings-page__layout") ?? null;

    const checkDirty = useCallback(() => {
        cancelAnimationFrame(dirtyFrame.current);
        // Next frame, once React has rendered the change into the page.
        dirtyFrame.current = requestAnimationFrame(() => {
            const next = new Set<SettingsCategoryKey>();
            let count = 0;
            for (const [key, baseline] of baselines.current) {
                const layout = pageLayout(key);
                if (!layout || pageSignature(layout) === baseline) continue;
                next.add(key);
                let changed = 0;
                for (const [el, value] of controlBaselines.current.get(key) ?? []) {
                    if (el.isConnected && controlValue(el) !== value) changed++;
                }
                count += Math.max(1, changed);
            }
            setDirty(prev => sameKeys(prev, next) ? prev : next);
            setDirtyCount(count);
        });
    }, []);

    /** Forget the edits of `groups` (all by default): they start from storage again. */
    const resetDirty = useCallback((groups?: readonly SettingsGroup[]) => {
        cancelAnimationFrame(dirtyFrame.current);
        if (groups) {
            for (const key of [...baselines.current.keys()]) {
                if (!groups.includes(settingsCategory(key).group)) continue;
                baselines.current.delete(key);
                controlBaselines.current.delete(key);
            }
            checkDirty();
            return;
        }
        baselines.current.clear();
        controlBaselines.current.clear();
        setDirty(new Set());
        setDirtyCount(0);
    }, [checkDirty]);

    /**
     * Called before any input reaches a page (pointer, key, focus), so the
     * baseline is what the page showed before this edit — including anything
     * that loaded asynchronously after the dialog opened.
     */
    /**
     * A change that arrived with no touch, key or focus before it (a script,
     * an assistive tool) left no baseline to compare with: the page stays
     * unsaved until Save or Cofnij, so the phone's save bar still offers it.
     */
    const onPageChange = (key: SettingsCategoryKey) => {
        if (!baselines.current.has(key)) {
            baselines.current.set(key, UNKNOWN_BASELINE);
            controlBaselines.current.set(key, new Map());
        }
        checkDirty();
    };

    const captureBaseline = (key: SettingsCategoryKey) => {
        if (baselines.current.has(key)) return;
        const layout = pageLayout(key);
        if (!layout) return;
        baselines.current.set(key, pageSignature(layout));
        controlBaselines.current.set(key, new Map(settingControls(layout).map(el => [el, controlValue(el)])));
    };

    // List editors and drag-and-drop change the page without input events.
    useEffect(() => {
        const pane = pagesRef.current;
        if (!pane) return;
        const observer = new MutationObserver(() => {
            if (baselines.current.size > 0) checkDirty();
        });
        observer.observe(pane, { childList: true, subtree: true, characterData: true });
        return () => {
            observer.disconnect();
            cancelAnimationFrame(dirtyFrame.current);
        };
    }, [checkDirty]);

    useLayoutEffect(() => {
        categoryRef.current = category;
        const pane = pagesRef.current;
        if (!pane) return;
        if (!narrow) {
            pane.scrollTop = searching ? 0 : scrollPos.current.get(category) ?? 0;
            return;
        }
        if (phoneView !== "page") return;
        // A page opened from a search result starts at that setting, briefly lit.
        const anchor = pendingAnchor.current;
        pendingAnchor.current = null;
        pane.scrollTop = 0;
        if (anchor?.isConnected) {
            pane.scrollTop = anchor.getBoundingClientRect().top - pane.getBoundingClientRect().top - pane.clientHeight / 3;
            anchor.classList.remove("settings-phone__flash");
            void anchor.offsetWidth;
            anchor.classList.add("settings-phone__flash");
        }
    }, [category, searching, narrow, phoneView]);

    // The phone views read the pages' DOM (summaries, the search index, the
    // chips), so they follow it while the dialog is narrow.
    useEffect(() => {
        const pane = pagesRef.current;
        if (!narrow || !pane) return;
        let frame = 0;
        const bump = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => setDomVersion(v => v + 1));
        };
        bump();
        const observer = new MutationObserver(bump);
        observer.observe(pane, { childList: true, subtree: true, characterData: true });
        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
    }, [narrow]);

    useEffect(() => {
        const onShowCategory = (event: Event) => {
            const detail = (event as CustomEvent<ShowSettingsDetail>).detail;
            if (!detail?.category) return;
            navigate(detail.category);
            // "Open settings" in general: a phone starts on the list of pages.
            if (detail.overview) setPhoneView("list");
        };

        /**
         * The assistant sending the user to a setting it may not change itself.
         * It knows the page only by the label in its navigation path, so the
         * label is looked up here; one from the wrong group falls back to that
         * group's first page.
         */
        const onAssistantOpen = (event: Event) => {
            const detail = (event as CustomEvent<OpenSettingsDetail>).detail;
            if (!detail) return;
            const found = settingsCategoryByLabel(detail.tabLabel);
            navigate(found?.group === detail.surface ? found.key : DEFAULT_SETTINGS_CATEGORY[detail.surface]);
        };

        const onSave = () => {
            latest.current.character.save();
            latest.current.ui.save();
            resetDirty();
            // The close below comes before the re-render: nothing is left unsaved.
            dirtyRef.current = new Set();
            (document.activeElement as HTMLElement | null)?.blur?.();
            window.dispatchEvent(new Event(CLOSE_SETTINGS_EVENT));
        };

        const modalEl = document.getElementById(SETTINGS_MODAL_ID);
        /**
         * A group left unsaved picks up where it was; the others reload, so a
         * change made elsewhere meanwhile shows. Character edits are dropped
         * when another character is playing now - they were for the old one.
         */
        const onModalShow = () => {
            setModalOpen(true);
            const kept = held.current;
            held.current = null;
            const keepCharacter = !!kept?.groups.has("character") && kept.character === latest.current.character.character;
            const keepUi = !!kept?.groups.has("ui");
            if (!keepCharacter) latest.current.character.reload();
            if (keepUi) latest.current.ui.resume();
            else latest.current.ui.reload();
            const fresh: SettingsGroup[] = [];
            if (!keepCharacter) fresh.push("character");
            if (!keepUi) fresh.push("ui");
            if (fresh.length > 0) resetDirty(fresh);
        };
        const onModalShown = () => {
            const pane = pagesRef.current;
            if (pane && resumeScroll.current !== null) pane.scrollTop = resumeScroll.current;
            resumeScroll.current = null;
        };
        const onModalHide = () => {
            resumeScroll.current = pagesRef.current?.scrollTop ?? null;
            const groups = new Set([...dirtyRef.current].map(key => settingsCategory(key).group));
            held.current = { groups, character: latest.current.character.character };
        };
        // Undo the live preview of unsaved UI settings while the dialog is closed.
        const onModalHidden = () => {
            setModalOpen(false);
            latest.current.ui.revert();
        };

        window.addEventListener(SHOW_SETTINGS_EVENT, onShowCategory);
        window.addEventListener(OPEN_SETTINGS_EVENT, onAssistantOpen);
        window.addEventListener(SAVE_SETTINGS_EVENT, onSave);
        modalEl?.addEventListener(MODAL_EVENT.show, onModalShow);
        modalEl?.addEventListener(MODAL_EVENT.shown, onModalShown);
        modalEl?.addEventListener(MODAL_EVENT.hide, onModalHide);
        modalEl?.addEventListener(MODAL_EVENT.hidden, onModalHidden);
        return () => {
            window.removeEventListener(SHOW_SETTINGS_EVENT, onShowCategory);
            window.removeEventListener(OPEN_SETTINGS_EVENT, onAssistantOpen);
            window.removeEventListener(SAVE_SETTINGS_EVENT, onSave);
            modalEl?.removeEventListener(MODAL_EVENT.show, onModalShow);
            modalEl?.removeEventListener(MODAL_EVENT.shown, onModalShown);
            modalEl?.removeEventListener(MODAL_EVENT.hide, onModalHide);
            modalEl?.removeEventListener(MODAL_EVENT.hidden, onModalHidden);
        };
    }, [navigate, resetDirty]);

    // Search reads the rendered pages, so it re-runs whenever their DOM changes
    // (a row appearing behind a checkbox, a list item added) while a query is set.
    useEffect(() => {
        const inputs = (): PageSearchInput[] => SETTINGS_CATEGORIES.flatMap(c => {
            const element = pageRefs.current.get(c.key);
            return element ? [{ element, pageText: `${SETTINGS_GROUP_LABELS[c.group]} ${c.label} ${c.keywords ?? ""}` }] : [];
        });
        if (!searching) {
            clearSearch(inputs());
            setSearchHits(null);
            return;
        }
        const run = () => {
            const pages = inputs();
            const hits = applySearch(pages, terms);
            const counts = new Map<SettingsCategoryKey, number>(
                [...hits].map(([i, count]) => [pages[i].element.dataset.settingsCategory as SettingsCategoryKey, count]),
            );
            setSearchHits(prev => sameCounts(prev, counts) ? prev : counts);
            highlightTerms(pages.filter((_, i) => hits.has(i)), terms);
        };
        run();
        let frame = 0;
        const observer = new MutationObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(run);
        });
        if (pagesRef.current) {
            observer.observe(pagesRef.current, { childList: true, subtree: true, characterData: true });
        }
        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
    }, [terms, searching]);

    useEffect(() => () => clearSearch([]), []);

    const onHostKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
            event.preventDefault();
            searchRef.current?.focus();
            searchRef.current?.select();
        }
    };

    const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        // Escape clears the query first; only an empty field lets it close the dialog.
        if (event.key === "Escape" && query) {
            event.preventDefault();
            event.stopPropagation();
            setQuery("");
            return;
        }
        // Enter walks the pages with a match, as a find bar does.
        if (event.key === "Enter" && hitKeys.length > 0) {
            event.preventDefault();
            gotoHit(shownHit + (event.shiftKey ? -1 : 1));
        }
    };

    const characterName = character.character ? capitalize(character.character) : null;
    const currentCategory = SETTINGS_CATEGORIES.find(c => c.key === category)!;
    const groupLabel = (group: SettingsGroup) =>
        group === "character" && characterName ? `${SETTINGS_GROUP_LABELS.character}: ${characterName}` : SETTINGS_GROUP_LABELS[group];
    // "Dane" pages act at once, outside Save; they carry no chip.
    const scopeChip = (group: SettingsGroup): ScopeChip | null => group === "character"
        ? { text: characterName ? `tylko ${characterName}` : "brak postaci", title: "Zapisywane osobno dla każdej postaci" }
        : group === "ui"
            ? { text: "wszystkie postacie", title: "Wspólne dla wszystkich postaci. Układ i rozmiary (mapa, stopka, przyciski, okna) zapisywane są osobno na każdym urządzeniu." }
            : null;

    const pageInput = (key: SettingsCategoryKey): PageSearchInput | null => {
        const element = pageRefs.current.get(key);
        const c = SETTINGS_CATEGORIES.find(cat => cat.key === key)!;
        return element ? { element, pageText: `${SETTINGS_GROUP_LABELS[c.group]} ${c.label} ${c.keywords ?? ""}` } : null;
    };

    // The list's one-line summary of each page: the titles of its cards.
    const summaries = useMemo(() => {
        const map = new Map<SettingsCategoryKey, string>();
        if (!narrow) return map;
        for (const c of SETTINGS_CATEGORIES) {
            const element = pageRefs.current.get(c.key);
            // A card named like its page says nothing new; the keywords do.
            const titles = element ? pageSections(element).map(section => section.title).filter(title => title !== c.label) : [];
            const summary = titles.length > 0 ? titles.join(", ") : c.keywords?.split(" ").slice(0, 4).join(", ");
            if (summary) map.set(c.key, summary);
        }
        return map;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [narrow, domVersion]);

    const phoneResults = useMemo((): PhoneResults | null => {
        if (!narrow || terms.length === 0) return null;
        const results: PhoneResults = { settings: [], pages: [] };
        for (const c of SETTINGS_CATEGORIES) {
            const input = pageInput(c.key);
            if (!input) continue;
            for (const match of matchSettings(indexPage(input.element), terms)) results.settings.push({ ...match, category: c });
            if (pageMatches(input.element, input.pageText, terms)) results.pages.push(c);
        }
        return results;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [narrow, terms, domVersion]);

    const phoneSections = useMemo(() => {
        const element = narrow && phoneView === "page" ? pageRefs.current.get(category) : undefined;
        return element ? pageSections(element) : [];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [narrow, phoneView, category, domVersion]);

    /** From the phone's list or results: keeps the query, so Back returns to the results. */
    const openPhonePage = (key: SettingsCategoryKey, anchor: HTMLElement | null = null) => {
        pendingAnchor.current = anchor;
        setCategory(key);
        setPhoneView("page");
    };

    const toggleFromResults = (match: PhoneResults["settings"][number]) => {
        const input = match.entry.control as HTMLInputElement;
        if (input.matches(":disabled")) return;
        captureBaseline(match.category.key);
        input.click();
        // The checkbox changes a property, not the DOM: re-read after React renders.
        requestAnimationFrame(() => setDomVersion(v => v + 1));
    };

    const revertEdits = useCallback(() => {
        latest.current.character.reload();
        latest.current.ui.reload();
        resetDirty();
    }, [resetDirty]);

    // The host's "Odrzuć zmiany" beside Save (the wide layout; a phone has its save bar).
    useEffect(() => {
        const button = document.getElementById(SETTINGS_DISCARD_ID);
        if (!button) return;
        button.hidden = dirty.size === 0;
        button.addEventListener("click", revertEdits);
        return () => button.removeEventListener("click", revertEdits);
    }, [dirty, revertEdits]);

    return (
        <div ref={hostRef} className="settings-dialog-host" onKeyDown={onHostKeyDown}>
            <div className={[
                "settings-dialog",
                searching ? "settings-dialog--searching" : "",
                narrow ? `settings-dialog--phone settings-dialog--phone-${phoneView}` : "",
            ].filter(Boolean).join(" ")}>
                {narrow && phoneView === "list" && (
                    <PhoneStart
                        key="phone-start"
                        searchRef={searchRef}
                        query={query}
                        onQuery={setQuery}
                        terms={terms}
                        results={phoneResults}
                        summaries={summaries}
                        dirty={dirty}
                        groupLabel={groupLabel}
                        groupName={(group) => SETTINGS_GROUP_LABELS[group]}
                        scopeChip={scopeChip}
                        onOpenPage={(key) => openPhonePage(key)}
                        onOpenSetting={(match) => openPhonePage(match.category.key, match.entry.element)}
                        onToggle={toggleFromResults}
                    />
                )}
                {narrow && phoneView === "page" && (
                    <div key="phone-page" className="settings-phone__page-head">
                        <PhonePageHeader
                            category={currentCategory}
                            chip={scopeChip(currentCategory.group)}
                            onBack={() => setPhoneView("list")}
                            onClose={() => window.dispatchEvent(new Event(CLOSE_SETTINGS_EVENT))}
                        />
                        <PhoneSectionChips key={category} sections={phoneSections} pane={pagesRef.current} />
                    </div>
                )}
                {!narrow && <div className="settings-dialog__search">
                    <input
                        ref={searchRef}
                        id="settings-search"
                        type="search"
                        className="popup-input popup-input--control"
                        placeholder="Szukaj w ustawieniach"
                        autoComplete="off"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={onSearchKeyDown}
                    />
                    {searching && (
                        <div className="settings-dialog__matches">
                            <span id="settings-search-count" className="settings-dialog__matches-count">
                                {hitKeys.length === 0 ? "brak wyników" : `${shownHit + 1} z ${hitKeys.length}`}
                            </span>
                            <button
                                type="button"
                                id="settings-search-prev"
                                className="settings-dialog__matches-btn"
                                title="Poprzednia strona z wynikami (Shift+Enter)"
                                disabled={hitKeys.length === 0}
                                onClick={() => gotoHit(shownHit - 1)}
                            >
                                <ChevronUp size={14} strokeWidth={2.2} />
                            </button>
                            <button
                                type="button"
                                id="settings-search-next"
                                className="settings-dialog__matches-btn"
                                title="Następna strona z wynikami (Enter)"
                                disabled={hitKeys.length === 0}
                                onClick={() => gotoHit(shownHit + 1)}
                            >
                                <ChevronDown size={14} strokeWidth={2.2} />
                            </button>
                        </div>
                    )}
                </div>}
                {!narrow && <nav className="settings-dialog__nav">
                    {GROUPS.map(group => (
                        <div key={group} className="settings-dialog__nav-group">
                            <div className="settings-dialog__nav-group-label" title={groupLabel(group)}>{groupLabel(group)}</div>
                            {SETTINGS_CATEGORIES.filter(c => c.group === group).map(c => {
                                const matches = searching ? searchHits?.get(c.key) ?? 0 : 0;
                                const classes = [
                                    "settings-dialog__nav-item",
                                    !searching && c.key === category ? "settings-dialog__nav-item--active" : "",
                                    // While searching, "active" follows the results, not the page you came from.
                                    searching && c.key === currentKey ? "settings-dialog__nav-item--active" : "",
                                    searching && matches === 0 ? "settings-dialog__nav-item--empty" : "",
                                ].filter(Boolean).join(" ");
                                return (
                                    <button
                                        key={c.key}
                                        type="button"
                                        className={classes}
                                        data-settings-category={c.key}
                                        data-settings-matches={matches || undefined}
                                        // A page with results is scrolled to, keeping the query;
                                        // one without is opened the usual way, which clears it.
                                        onClick={() => (matches > 0 ? gotoHit(hitKeys.indexOf(c.key)) : navigate(c.key))}
                                    >
                                        <span className="settings-dialog__nav-label">
                                            <NavIcon category={c.key} />
                                            <span>{c.label}</span>
                                        </span>
                                        {matches > 0 && (
                                            <span className="settings-dialog__nav-count" title={`Pasujące sekcje: ${matches}`}>{matches}</span>
                                        )}
                                        {dirty.has(c.key) && <span className="settings-dialog__dirty" title="Niezapisane zmiany" />}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </nav>}
                <div ref={pagesRef} className="settings-dialog__pages">
                    {SETTINGS_CATEGORIES.map(c => {
                        const visible = searching ? !!searchHits?.has(c.key) : c.key === category && !(narrow && phoneView === "list");
                        const locked = c.group === "character" && !character.character;
                        const chip = scopeChip(c.group);
                        return (
                            <div
                                key={c.key}
                                ref={(el) => { if (el) pageRefs.current.set(c.key, el); else pageRefs.current.delete(c.key); }}
                                className="settings-page"
                                data-settings-category={c.key}
                                hidden={!visible}
                                onPointerDownCapture={() => captureBaseline(c.key)}
                                onKeyDownCapture={() => captureBaseline(c.key)}
                                onFocusCapture={() => captureBaseline(c.key)}
                                onChange={() => onPageChange(c.key)}
                                onInput={() => onPageChange(c.key)}
                            >
                                <div className="settings-page__header">
                                    <h5 className="settings-page__title">
                                        {searching && <span className="settings-page__group">{SETTINGS_GROUP_LABELS[c.group]} › </span>}
                                        {c.label}
                                    </h5>
                                    {chip && <span className={`settings-scope-chip settings-scope-chip--${c.group}`} title={chip.title}>{chip.text}</span>}
                                </div>
                                {locked && !searching && (
                                    <div className="popup-notice">
                                        Opcje zależne od postaci są zablokowane do momentu jej wybrania.
                                    </div>
                                )}
                                <fieldset disabled={locked} className="settings-page__fieldset">
                                    <div className="settings-page__layout">
                                        {c.group === "character"
                                            ? character.pages[c.key as keyof typeof character.pages]
                                            : c.group === "data"
                                                // Acts at once, outside Save: never counts as unsaved.
                                                ? <div className="settings-data-page" data-settings-ignore>{data.pages[c.key as keyof typeof data.pages]}</div>
                                                : ui.pages[c.key as keyof typeof ui.pages]}
                                    </div>
                                </fieldset>
                            </div>
                        );
                    })}
                    {searching && searchHits?.size === 0 && (
                        <div className="settings-dialog__empty">
                            Brak ustawień pasujących do „{query.trim()}”.
                        </div>
                    )}
                </div>
                {narrow && (
                    <PhoneSaveBar
                        count={dirtyCount}
                        onRevert={revertEdits}
                        onSave={() => window.dispatchEvent(new Event(SAVE_SETTINGS_EVENT))}
                    />
                )}
            </div>
            {ui.extras}
        </div>
    );
}

export default SettingsDialog;
