import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
    Backpack,
    CloudUpload,
    HardDriveDownload,
    MonitorSmartphone,
    FileInput,
    ChartPie,
    Ellipsis,
    Map as MapIcon,
    MousePointerClick,
    Palette,
    PanelBottom,
    PanelsTopLeft,
    Shield,
    SlidersHorizontal,
    Smartphone,
    SquareTerminal,
    Swords,
    Volume2,
    WandSparkles,
    type LucideIcon,
} from "lucide-react";
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
    settingsCategoryByLabel,
    type SettingsCategoryKey,
    type SettingsGroup,
    type ShowSettingsDetail,
} from "./categories";
import { applySearch, clearSearch, highlightTerms, searchTerms, type PageSearchInput } from "./settingsSearch";
import { pageSignature } from "./settingsDirty";
import "./settingsDialog.css";

const GROUPS: readonly SettingsGroup[] = ["character", "ui", "data"];

// Kept here rather than in categories.ts, which the assistant-KB build reads in Node.
const CATEGORY_ICONS: Record<SettingsCategoryKey, LucideIcon> = {
    "character-general": SlidersHorizontal,
    "character-items": Backpack,
    "character-combat": Swords,
    "character-guilds": Shield,
    "character-magics": WandSparkles,
    "ui-appearance": Palette,
    "ui-windows": PanelsTopLeft,
    "ui-commands": SquareTerminal,
    "ui-buttons": MousePointerClick,
    "ui-mobile-buttons": Smartphone,
    "ui-radial": ChartPie,
    "ui-footer": PanelBottom,
    "ui-map": MapIcon,
    "ui-sound": Volume2,
    "ui-other": Ellipsis,
    "data-sync": CloudUpload,
    "data-backup": HardDriveDownload,
    "data-devices": MonitorSmartphone,
    "data-import": FileInput,
};

function NavIcon({ category }: { category: SettingsCategoryKey }) {
    const Icon = CATEGORY_ICONS[category];
    return <Icon className="settings-dialog__nav-icon" size={16} strokeWidth={1.75} />;
}

function capitalize(name: string): string {
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function sameKeys(a: ReadonlySet<string> | null, b: ReadonlySet<string>): boolean {
    return !!a && a.size === b.size && [...b].every(key => a.has(key));
}

export interface SettingsDialogProps extends UiSettingsPagesProps {
    /** Page to open on; hosts that keep the dialog mounted use `SHOW_SETTINGS_EVENT` instead. */
    initialCategory?: SettingsCategoryKey;
}

/**
 * Character and UI settings in one dialog: a sidebar of pages grouped by where
 * they are stored, a search across every page, and one Save for both.
 *
 * The host provides the chrome (title, Save button) and the Bootstrap modal
 * lifecycle on `#settings-modal`; forge fakes those events on its own shell.
 */
function SettingsDialog({ soundManager, onEnableNotifications, initialCategory }: SettingsDialogProps) {
    const character = useCharacterSettingsPages();
    const ui = useUiSettingsPages({ soundManager, onEnableNotifications });
    const data = useDataPages();
    const latest = useRef({ character, ui });
    latest.current = { character, ui };

    const [category, setCategory] = useState<SettingsCategoryKey>(initialCategory ?? DEFAULT_SETTINGS_CATEGORY.character);
    const [query, setQuery] = useState("");
    const [searchHits, setSearchHits] = useState<ReadonlySet<SettingsCategoryKey> | null>(null);
    const [dirty, setDirty] = useState<ReadonlySet<SettingsCategoryKey>>(() => new Set());

    const pagesRef = useRef<HTMLDivElement>(null);
    const pageRefs = useRef(new Map<SettingsCategoryKey, HTMLDivElement>());
    const searchRef = useRef<HTMLInputElement>(null);
    // Each page's signature from just before the user first touched it.
    const baselines = useRef(new Map<SettingsCategoryKey, string>());
    const dirtyFrame = useRef(0);
    const scrollPos = useRef(new Map<SettingsCategoryKey, number>());
    const categoryRef = useRef(category);

    const terms = useMemo(() => searchTerms(query), [query]);
    const searching = terms.length > 0;
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
    }, []);

    const pageLayout = (key: SettingsCategoryKey) =>
        pageRefs.current.get(key)?.querySelector<HTMLElement>(".settings-page__layout") ?? null;

    const resetDirty = useCallback(() => {
        cancelAnimationFrame(dirtyFrame.current);
        baselines.current.clear();
        setDirty(new Set());
    }, []);

    const checkDirty = useCallback(() => {
        cancelAnimationFrame(dirtyFrame.current);
        // Next frame, once React has rendered the change into the page.
        dirtyFrame.current = requestAnimationFrame(() => {
            const next = new Set<SettingsCategoryKey>();
            for (const [key, baseline] of baselines.current) {
                const layout = pageLayout(key);
                if (layout && pageSignature(layout) !== baseline) next.add(key);
            }
            setDirty(prev => sameKeys(prev, next) ? prev : next);
        });
    }, []);

    /**
     * Called before any input reaches a page (pointer, key, focus), so the
     * baseline is what the page showed before this edit — including anything
     * that loaded asynchronously after the dialog opened.
     */
    const captureBaseline = (key: SettingsCategoryKey) => {
        if (baselines.current.has(key)) return;
        const layout = pageLayout(key);
        if (layout) baselines.current.set(key, pageSignature(layout));
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
        if (pane) pane.scrollTop = searching ? 0 : scrollPos.current.get(category) ?? 0;
    }, [category, searching]);

    useEffect(() => {
        const onShowCategory = (event: Event) => {
            const next = (event as CustomEvent<ShowSettingsDetail>).detail?.category;
            if (next) navigate(next);
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
            (document.activeElement as HTMLElement | null)?.blur?.();
            window.dispatchEvent(new Event(CLOSE_SETTINGS_EVENT));
        };

        const modalEl = document.getElementById(SETTINGS_MODAL_ID);
        const onModalShow = () => {
            latest.current.character.reload();
            latest.current.ui.reload();
            resetDirty();
            setQuery("");
        };
        // Restore live-previewed UI settings when dismissed without saving.
        const onModalHidden = () => latest.current.ui.revert();

        window.addEventListener(SHOW_SETTINGS_EVENT, onShowCategory);
        window.addEventListener(OPEN_SETTINGS_EVENT, onAssistantOpen);
        window.addEventListener(SAVE_SETTINGS_EVENT, onSave);
        modalEl?.addEventListener("show.bs.modal", onModalShow);
        modalEl?.addEventListener("hidden.bs.modal", onModalHidden);
        return () => {
            window.removeEventListener(SHOW_SETTINGS_EVENT, onShowCategory);
            window.removeEventListener(OPEN_SETTINGS_EVENT, onAssistantOpen);
            window.removeEventListener(SAVE_SETTINGS_EVENT, onSave);
            modalEl?.removeEventListener("show.bs.modal", onModalShow);
            modalEl?.removeEventListener("hidden.bs.modal", onModalHidden);
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
            const keys = new Set([...hits].map(i => pages[i].element.dataset.settingsCategory as SettingsCategoryKey));
            setSearchHits(prev => sameKeys(prev, keys) ? prev : keys);
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
        }
    };

    const characterName = character.character ? capitalize(character.character) : null;
    const groupLabel = (group: SettingsGroup) =>
        group === "character" && characterName ? `${SETTINGS_GROUP_LABELS.character}: ${characterName}` : SETTINGS_GROUP_LABELS[group];
    const scopeChip = (group: SettingsGroup) => group === "character"
        ? { text: characterName ? `tylko ${characterName}` : "brak postaci", title: "Zapisywane osobno dla każdej postaci" }
        : group === "data"
            ? { text: "działa od razu", title: "Te strony nie czekają na Zapisz: synchronizacja, kopie i import działają od razu." }
            : { text: "wszystkie postacie", title: "Wspólne dla wszystkich postaci. Układ i rozmiary (mapa, stopka, przyciski, okna) zapisywane są osobno na każdym urządzeniu." };

    return (
        <div className="settings-dialog-host" onKeyDown={onHostKeyDown}>
            <div className={`settings-dialog${searching ? " settings-dialog--searching" : ""}`}>
                <div className="settings-dialog__search">
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
                </div>
                <nav className="settings-dialog__nav">
                    {GROUPS.map(group => (
                        <div key={group} className="settings-dialog__nav-group">
                            <div className="settings-dialog__nav-group-label" title={groupLabel(group)}>{groupLabel(group)}</div>
                            {SETTINGS_CATEGORIES.filter(c => c.group === group).map(c => (
                                <button
                                    key={c.key}
                                    type="button"
                                    className={`settings-dialog__nav-item${!searching && c.key === category ? " settings-dialog__nav-item--active" : ""}`}
                                    data-settings-category={c.key}
                                    onClick={() => navigate(c.key)}
                                >
                                    <span className="settings-dialog__nav-label">
                                        <NavIcon category={c.key} />
                                        <span>{c.label}</span>
                                    </span>
                                    {dirty.has(c.key) && <span className="settings-dialog__dirty" title="Niezapisane zmiany" />}
                                </button>
                            ))}
                        </div>
                    ))}
                </nav>
                <select
                    id="settings-category-select"
                    className="popup-input popup-input--control settings-dialog__select"
                    value={searching ? "" : category}
                    onChange={(e) => e.target.value && navigate(e.target.value as SettingsCategoryKey)}
                >
                    {searching && <option value="">Wyniki wyszukiwania</option>}
                    {GROUPS.map(group => (
                        <optgroup key={group} label={groupLabel(group)}>
                            {SETTINGS_CATEGORIES.filter(c => c.group === group).map(c => (
                                <option key={c.key} value={c.key}>{c.label}{dirty.has(c.key) ? " •" : ""}</option>
                            ))}
                        </optgroup>
                    ))}
                </select>
                <div ref={pagesRef} className="settings-dialog__pages">
                    {SETTINGS_CATEGORIES.map(c => {
                        const visible = searching ? !!searchHits?.has(c.key) : c.key === category;
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
                                onChange={checkDirty}
                                onInput={checkDirty}
                            >
                                <div className="settings-page__header">
                                    <h5 className="settings-page__title">
                                        {searching && <span className="settings-page__group">{SETTINGS_GROUP_LABELS[c.group]} › </span>}
                                        {c.label}
                                    </h5>
                                    <span className={`settings-scope-chip settings-scope-chip--${c.group}`} title={chip.title}>{chip.text}</span>
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
            </div>
            {ui.extras}
        </div>
    );
}

export default SettingsDialog;
