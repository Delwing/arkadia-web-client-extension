import { forwardRef, useLayoutEffect, useRef, useState } from "react";
import { Button, Icon, IconButton, Input, InputShell, Menu, MenuCheckItem, MenuSeparator, Toggle } from "../ui";
import { formatClock } from "../model/format";
import type { SearchScope, TimeRange } from "../model/types";

/**
 * The field says where it is about to look — the field is the only part of
 * the viewer a player is looking at while typing.
 */
const SCOPE_PLACEHOLDER: Record<SearchScope, string> = {
    log: "Szukaj w tym logu",
    all: "Szukaj we wszystkich logach",
    range: "Szukaj w zakresie",
};

export interface SearchBarProps {
    query: string;
    onQueryChange: (value: string) => void;
    /** Empties the field and hands focus back to it — the same as Escape. */
    onClear: () => void;
    caseSensitive: boolean;
    onCaseSensitiveChange: (value: boolean) => void;
    regex: boolean;
    onRegexChange: (value: boolean) => void;
    onlyMatches: boolean;
    onOnlyMatchesChange: (value: boolean) => void;
    scope: SearchScope;
    onScopeChange: (value: SearchScope) => void;
    /**
     * The slice the log is narrowed to. While there is one it IS where the
     * search looks, so it takes the place of the scope menu, with a way out.
     */
    range: TimeRange | null;
    onClearRange: () => void;
    /** "Wszystkie logi" waits until the host has listed every session. */
    allScopePending?: boolean;
    onStep: (direction: 1 | -1) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
    /** Pre-rendered counter line and its tone — see `LogViewer` for the wording. */
    counter: string;
    counterTone: "normal" | "muted" | "error";
    subLine: string;
    /** Sub-line is a one-off announcement rather than the standing hint. */
    subIsNotice: boolean;
    invalid: boolean;
    /** The channel and view menus, at the far end of the row. */
    filters?: React.ReactNode;
}

/**
 * The row above the log.
 *
 * At rest it is a field, where it looks, and the two filter menus. Everything
 * that only means something once there is a query — the counter, the arrows,
 * "Tylko trafienia" — appears with the first keystroke rather than sitting
 * there empty, and the match options (case, regex) live behind the field's own
 * button.
 */
export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(props, ref) {
    const {
        query,
        onQueryChange,
        onClear,
        caseSensitive,
        onCaseSensitiveChange,
        regex,
        onRegexChange,
        onlyMatches,
        onOnlyMatchesChange,
        scope,
        onScopeChange,
        range,
        onClearRange,
        allScopePending,
        onStep,
        onKeyDown,
        counter,
        counterTone,
        subLine,
        subIsNotice,
        invalid,
        filters,
    } = props;
    const searching = query.length > 0;
    const optionsOn = caseSensitive || regex;

    // The counter inside the field runs from "1 z 2" to "Brak trafień tutaj",
    // so the text's right padding follows what the adornments measure rather
    // than a guess that either wastes the field or runs under them.
    const adornmentsRef = useRef<HTMLSpanElement>(null);
    const [adornmentsWidth, setAdornmentsWidth] = useState(0);
    useLayoutEffect(() => {
        const element = adornmentsRef.current;
        if (!element) return;
        const measure = () => setAdornmentsWidth(element.offsetWidth);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    return (
        <div className="lv-search" data-searching={searching}>
            <InputShell
                className="lv-search__field"
                icon={<Icon name="search" size={14} />}
                adornments={
                    <span ref={adornmentsRef} className="lv-search__adornments">
                        {/* Inside the field, like an editor's find box: beside
                            it they cost the row the width that kept it on one
                            line once there was a query. */}
                        {searching ? (
                            <>
                                <span className="lv-search__count" data-tone={counterTone}>
                                    {counter}
                                </span>
                                <IconButton
                                    size="sm"
                                    className="lv-search__adornment"
                                    title="Poprzednie trafienie  Shift+Enter"
                                    onClick={() => onStep(-1)}
                                >
                                    <Icon name="chevron-up" size={14} />
                                </IconButton>
                                <IconButton
                                    size="sm"
                                    className="lv-search__adornment"
                                    title="Następne trafienie  Enter"
                                    onClick={() => onStep(1)}
                                >
                                    <Icon name="chevron-down" size={14} />
                                </IconButton>
                                <IconButton
                                    size="sm"
                                    className="lv-search__adornment lv-search__clear"
                                    title="Wyczyść wyszukiwanie  Esc"
                                    onClick={onClear}
                                >
                                    <Icon name="close" size={14} />
                                </IconButton>
                            </>
                        ) : null}
                        <Menu
                            align="end"
                            trigger={
                                <IconButton
                                    size="sm"
                                    className="lv-search__adornment lv-search__options"
                                    data-state={optionsOn ? "on" : "off"}
                                    title={
                                        optionsOn
                                            ? `Opcje wyszukiwania: ${[caseSensitive && "wielkość liter", regex && "wyrażenie regularne"].filter(Boolean).join(", ")}`
                                            : "Opcje wyszukiwania"
                                    }
                                >
                                    <Icon name="options" size={14} />
                                </IconButton>
                            }
                        >
                            <MenuCheckItem
                                checked={caseSensitive}
                                label="Rozróżniaj wielkość liter"
                                onToggle={() => onCaseSensitiveChange(!caseSensitive)}
                            />
                            <MenuCheckItem
                                checked={regex}
                                label="Wyrażenie regularne"
                                onToggle={() => onRegexChange(!regex)}
                            />
                        </Menu>
                    </span>
                }
            >
                <Input
                    ref={ref}
                    id="lv-search"
                    size="lg"
                    mono
                    invalid={invalid}
                    value={query}
                    onChange={(event) => onQueryChange(event.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={`${SCOPE_PLACEHOLDER[scope]}  Ctrl+F`}
                    autoComplete="off"
                    spellCheck={false}
                    style={{ paddingRight: `${adornmentsWidth + 8}px` }}
                />
            </InputShell>

            {range ? (
                <span className="lv-range-chip" title="Zakres zawęża log, wyszukiwanie i eksport">
                    zakres {formatClock(range.from)}{"–"}{formatClock(range.to)}
                    <Button variant="ghost" size="sm" onClick={onClearRange} title="Wyczyść zakres">
                        <Icon name="close" size={12} />
                    </Button>
                </span>
            ) : (
                <Menu
                    align="start"
                    trigger={
                        <Button
                            size="sm"
                            className="lv-search__scope"
                            trailing={<Icon name="chevron-down" size={14} />}
                            title="Gdzie szukać"
                        >
                            {scope === "all" ? "We wszystkich logach" : "W tym logu"}
                        </Button>
                    }
                >
                    <MenuCheckItem
                        closeOnSelect
                        checked={scope !== "all"}
                        label="W tym logu"
                        onToggle={() => onScopeChange("log")}
                    />
                    <MenuCheckItem
                        closeOnSelect
                        checked={scope === "all"}
                        label="We wszystkich logach"
                        // Still selectable when it already is: the search then
                        // simply starts once the list is complete.
                        disabled={allScopePending && scope !== "all"}
                        title={allScopePending ? "Dostępne po wczytaniu listy logów" : undefined}
                        onToggle={() => onScopeChange("all")}
                    />
                    <MenuSeparator />
                    <div className="lv-menu__note">
                        Zakres: przeciągnij po osi czasu albo kliknij linię prawym przyciskiem.
                    </div>
                </Menu>
            )}

            {searching ? (
                <>
                    <Toggle
                        pressed={onlyMatches}
                        onPressedChange={onOnlyMatchesChange}
                        size="md"
                        className="lv-search__only"
                        title="Ukryj linie bez trafienia"
                    >
                        <span className="lv-hide-narrow">Tylko trafienia</span>
                        <span className="lv-only-narrow">Trafienia</span>
                    </Toggle>
                </>
            ) : null}

            {/* Progress across every log, or a jump the player did not ask
                for. It can be any length ("Dalej w: <postac>, <dzien>"), so it
                takes the room before the menus and clips there — the full
                text is in the title. */}
            {subLine ? (
                <span className="lv-search__sub" data-notice={subIsNotice} title={subLine}>
                    {subLine}
                </span>
            ) : null}

            {/* Forces the wrap between the search row and the filter row on a
                phone; `display: none` everywhere else. */}
            <span className="lv-search__break" />

            <div className="lv-spacer lv-hide-narrow" />

            <div className="lv-row lv-row--tight lv-search__filters">{filters}</div>
        </div>
    );
});
