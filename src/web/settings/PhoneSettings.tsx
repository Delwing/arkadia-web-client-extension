import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import {
    SETTINGS_CATEGORIES,
    type SettingsCategory,
    type SettingsCategoryKey,
    type SettingsGroup,
} from "./categories";
import { NavIcon } from "./categoryIcons";
import { highlightRuns, settingPreview, settingsCountText, unsavedChangesText, type SettingMatch } from "./settingsIndex";

/**
 * The settings dialog on a phone: a list of pages to drill into, a page with
 * its section chips, search over individual settings, and a save bar that is
 * there only while something is unsaved. SettingsDialog owns the state (the
 * pages stay mounted in it); these are the views.
 */

const PHONE_GROUPS: readonly SettingsGroup[] = ["character", "ui", "data"];

export interface ScopeChip {
    text: string;
    title: string;
}

export interface PhoneResults {
    settings: (SettingMatch & { category: SettingsCategory })[];
    pages: SettingsCategory[];
}

function Highlighted({ text, terms }: { text: string; terms: readonly string[] }) {
    return (
        <>
            {highlightRuns(text, terms).map((run, i) => run.hit
                ? <mark key={i} className="settings-phone__mark">{run.text}</mark>
                : <span key={i}>{run.text}</span>)}
        </>
    );
}

function PageRow({ category, summary, dirty, onOpen, children }: {
    category: SettingsCategory;
    summary: ReactNode;
    dirty?: boolean;
    onOpen: () => void;
    children?: ReactNode;
}) {
    return (
        <button type="button" className="settings-phone__row" data-settings-category={category.key} onClick={onOpen}>
            <span className="settings-phone__row-icon"><NavIcon category={category.key} size={15} className="" /></span>
            <span className="settings-phone__row-text">
                <span className="settings-phone__row-label">{category.label}</span>
                {summary && <span className="settings-phone__row-summary">{summary}</span>}
            </span>
            {children}
            {dirty && <span className="settings-dialog__dirty" title="Niezapisane zmiany" />}
            <ChevronRight className="settings-phone__chevron" size={14} strokeWidth={2.1} />
        </button>
    );
}

export function PhoneStart({
    searchRef, query, onQuery, terms, results, summaries, dirty, groupLabel, groupName, scopeChip, onOpenPage, onOpenSetting, onToggle,
}: {
    searchRef: RefObject<HTMLInputElement | null>;
    query: string;
    onQuery: (query: string) => void;
    terms: readonly string[];
    results: PhoneResults | null;
    summaries: ReadonlyMap<SettingsCategoryKey, string>;
    dirty: ReadonlySet<SettingsCategoryKey>;
    groupLabel: (group: SettingsGroup) => string;
    /** The group's bare name ("Postać"), for a result's trail. */
    groupName: (group: SettingsGroup) => string;
    scopeChip: (group: SettingsGroup) => ScopeChip | null;
    onOpenPage: (key: SettingsCategoryKey) => void;
    onOpenSetting: (match: PhoneResults["settings"][number]) => void;
    onToggle: (match: PhoneResults["settings"][number]) => void;
}) {
    return (
        <div className="settings-phone__start">
            <label className="settings-phone__search">
                <Search size={15} strokeWidth={2.1} />
                <input
                    ref={searchRef}
                    id="settings-search"
                    type="search"
                    placeholder="Szukaj ustawienia"
                    autoComplete="off"
                    value={query}
                    onChange={(e) => onQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Escape" && query) {
                            e.preventDefault();
                            e.stopPropagation();
                            onQuery("");
                        }
                    }}
                />
                {query && (
                    <button type="button" className="settings-phone__clear" title="Wyczyść" onClick={() => onQuery("")}>
                        <X size={13} strokeWidth={2.1} />
                    </button>
                )}
            </label>
            {results ? (
                <SearchResults
                    query={query}
                    terms={terms}
                    results={results}
                    summaries={summaries}
                    groupName={groupName}
                    onOpenPage={onOpenPage}
                    onOpenSetting={onOpenSetting}
                    onToggle={onToggle}
                />
            ) : PHONE_GROUPS.map(group => {
                const chip = scopeChip(group);
                return (
                    <div key={group} className="settings-phone__group" data-settings-group={group}>
                        <div className="settings-phone__group-head">
                            <span className="settings-phone__caption">{groupLabel(group)}</span>
                            {chip && <span className={`settings-scope-chip settings-scope-chip--${group}`} title={chip.title}>{chip.text}</span>}
                        </div>
                        <div className="settings-phone__card">
                            {SETTINGS_CATEGORIES.filter(c => c.group === group).map(c => (
                                <PageRow
                                    key={c.key}
                                    category={c}
                                    summary={summaries.get(c.key)}
                                    dirty={dirty.has(c.key)}
                                    onOpen={() => onOpenPage(c.key)}
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function SearchResults({ query, terms, results, summaries, groupName, onOpenPage, onOpenSetting, onToggle }: {
    query: string;
    terms: readonly string[];
    results: PhoneResults;
    summaries: ReadonlyMap<SettingsCategoryKey, string>;
    groupName: (group: SettingsGroup) => string;
    onOpenPage: (key: SettingsCategoryKey) => void;
    onOpenSetting: (match: PhoneResults["settings"][number]) => void;
    onToggle: (match: PhoneResults["settings"][number]) => void;
}) {
    const { settings, pages } = results;
    if (settings.length === 0 && pages.length === 0) {
        return <div className="settings-dialog__empty">Brak ustawień pasujących do „{query.trim()}”.</div>;
    }
    return (
        <>
            {settings.length > 0 && (
                <>
                    <span className="settings-phone__count">
                        {settingsCountText(settings.length)}
                    </span>
                    <div className="settings-phone__card">
                        {settings.map((match, i) => <SettingResult key={i} match={match} terms={terms} groupName={groupName} onOpen={onOpenSetting} onToggle={onToggle} />)}
                    </div>
                </>
            )}
            {pages.length > 0 && (
                <>
                    <span className="settings-phone__caption settings-phone__caption--pages">Strony</span>
                    <div className="settings-phone__card">
                        {pages.map(c => (
                            <PageRow
                                key={c.key}
                                category={c}
                                summary={summaries.get(c.key) && <Highlighted text={summaries.get(c.key)!} terms={terms} />}
                                onOpen={() => onOpenPage(c.key)}
                            />
                        ))}
                    </div>
                </>
            )}
        </>
    );
}

function SettingResult({ match, terms, groupName, onOpen, onToggle }: {
    match: PhoneResults["settings"][number];
    terms: readonly string[];
    groupName: (group: SettingsGroup) => string;
    onOpen: (match: PhoneResults["settings"][number]) => void;
    onToggle: (match: PhoneResults["settings"][number]) => void;
}) {
    const { entry, category, viaOption } = match;
    // Group › page › card; a card named like its page is left out.
    const trail = [groupName(category.group), category.label, entry.section !== category.label ? entry.section : ""]
        .filter(Boolean).join(" › ");
    const text = (
        <span className="settings-phone__result-text">
            <span className="settings-phone__trail">{trail}</span>
            <span className="settings-phone__result-label">
                <Highlighted text={entry.label} terms={terms} />
                {viaOption && <span className="settings-phone__via"> (zawiera: <Highlighted text={viaOption} terms={terms} />)</span>}
            </span>
        </span>
    );
    if (entry.kind === "toggle") {
        const input = entry.control as HTMLInputElement;
        const disabled = input.matches(":disabled");
        return (
            <div className="settings-phone__result">
                {text}
                <button
                    type="button"
                    role="switch"
                    className={`settings-phone__switch${input.checked ? " is-on" : ""}`}
                    title={entry.label}
                    disabled={disabled}
                    data-checked={input.checked ? "1" : "0"}
                    onClick={() => onToggle(match)}
                />
            </div>
        );
    }
    return (
        <button type="button" className="settings-phone__result settings-phone__result--open" onClick={() => onOpen(match)}>
            {text}
            <span className="settings-phone__preview">{settingPreview(entry)}</span>
            <ChevronRight className="settings-phone__chevron" size={14} strokeWidth={2.1} />
        </button>
    );
}

/** The page's header: back to the list, its title and scope, close. */
export function PhonePageHeader({ category, chip, onBack, onClose }: {
    category: SettingsCategory;
    chip: ScopeChip | null;
    onBack: () => void;
    onClose: () => void;
}) {
    return (
        <header className="settings-phone__header">
            <button type="button" id="settings-phone-back" className="settings-phone__icon-btn settings-phone__back" title="Wstecz do listy" onClick={onBack}>
                <ChevronLeft size={18} strokeWidth={2.1} />
            </button>
            <span className="settings-phone__title">{category.label}</span>
            {chip && <span className={`settings-scope-chip settings-scope-chip--${category.group}`} title={chip.title}>{chip.text}</span>}
            <button type="button" className="settings-phone__icon-btn" title="Zamknij" onClick={onClose}>
                <X size={16} strokeWidth={2.1} />
            </button>
        </header>
    );
}

/**
 * Chips for the cards on the page; a tap scrolls to one, and the chip of the
 * card at the top lights up as the page scrolls.
 */
export function PhoneSectionChips({ sections, pane }: {
    sections: { element: HTMLElement; title: string }[];
    pane: HTMLElement | null;
}) {
    const [active, setActive] = useState(0);
    // A tapped chip stays lit while the page scrolls to its card, even when the
    // card is too near the end to reach the top; the next touch lets go.
    const pinned = useRef(false);
    // The first chip on a new page: the dialog keys this by page.
    useEffect(() => {
        if (!pane || sections.length === 0) return;
        const release = () => { pinned.current = false; };
        const onScroll = () => {
            if (pinned.current) return;
            const top = pane.getBoundingClientRect().top + 16;
            let current = 0;
            sections.forEach((section, i) => {
                if (section.element.getBoundingClientRect().top <= top) current = i;
            });
            setActive(current);
        };
        pane.addEventListener("scroll", onScroll, { passive: true });
        pane.addEventListener("touchstart", release, { passive: true });
        pane.addEventListener("wheel", release, { passive: true });
        return () => {
            pane.removeEventListener("scroll", onScroll);
            pane.removeEventListener("touchstart", release);
            pane.removeEventListener("wheel", release);
        };
    }, [sections, pane]);

    if (sections.length < 2) return null;
    return (
        <div className="settings-phone__chips">
            {sections.map((section, i) => (
                <button
                    key={i}
                    type="button"
                    className={`settings-phone__chip${i === active ? " is-active" : ""}`}
                    onClick={() => {
                        if (!pane) return;
                        pinned.current = true;
                        pane.scrollTop += section.element.getBoundingClientRect().top - pane.getBoundingClientRect().top - 12;
                        setActive(i);
                    }}
                >
                    {section.title}
                </button>
            ))}
        </div>
    );
}

export function PhoneSaveBar({ count, onRevert, onSave }: { count: number; onRevert: () => void; onSave: () => void }) {
    if (count === 0) return null;
    return (
        <div className="settings-phone__savebar">
            <span className="settings-phone__savebar-dot" />
            <span id="settings-phone-unsaved" className="settings-phone__savebar-text">{unsavedChangesText(count)}</span>
            <button type="button" id="settings-phone-revert" className="settings-phone__btn" onClick={onRevert}>Cofnij</button>
            <button type="button" id="settings-phone-save" className="settings-phone__btn settings-phone__btn--primary" onClick={onSave}>Zapisz</button>
        </div>
    );
}
