import { forwardRef } from "react";
import { Icon, IconButton, Input, InputShell, Segmented, Toggle } from "../ui";
import type { SearchScope } from "../model/types";

/**
 * The field says where it is about to look. Taken from the in-client browser,
 * which is right that a search box narrowed to a ten-minute slice has to say
 * so — the field is the only part of the viewer a player is looking at while
 * typing. Shortened from the in-client wording, which does not fit this field's
 * 340px next to the Ctrl+F hint.
 */
const SCOPE_PLACEHOLDER: Record<SearchScope, string> = {
    log: "Szukaj w tym logu",
    all: "Szukaj we wszystkich",
    range: "Szukaj w zakresie",
};

/** The long form, for the scope buttons, where there is room for it. */
const SCOPE_TITLE: Record<SearchScope, string> = {
    log: "Szukaj w otwartym logu",
    all: "Szukaj we wszystkich logach",
    range: "Szukaj w zaznaczonym zakresie",
};

export interface SearchBarProps {
    query: string;
    onQueryChange: (value: string) => void;
    caseSensitive: boolean;
    onCaseSensitiveChange: (value: boolean) => void;
    regex: boolean;
    onRegexChange: (value: boolean) => void;
    onlyMatches: boolean;
    onOnlyMatchesChange: (value: boolean) => void;
    scope: SearchScope;
    onScopeChange: (value: SearchScope) => void;
    /** "Zakres" is only offered once a slice has been selected. */
    hasRange: boolean;
    onStep: (direction: 1 | -1) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
    /** Pre-rendered counter line and its tone — see `LogViewer` for the wording. */
    counter: string;
    counterTone: "normal" | "muted" | "error";
    subLine: string;
    /** Sub-line is a one-off announcement rather than the standing hint. */
    subIsNotice: boolean;
    invalid: boolean;
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(props, ref) {
    const {
        query,
        onQueryChange,
        caseSensitive,
        onCaseSensitiveChange,
        regex,
        onRegexChange,
        onlyMatches,
        onOnlyMatchesChange,
        scope,
        onScopeChange,
        hasRange,
        onStep,
        onKeyDown,
        counter,
        counterTone,
        subLine,
        subIsNotice,
        invalid,
    } = props;

    return (
        <div className="lv-search">
            <InputShell
                className="lv-search__field"
                icon={<Icon name="search" size={14} />}
                adornments={
                    <>
                        <Toggle
                            pressed={caseSensitive}
                            onPressedChange={onCaseSensitiveChange}
                            shape="square"
                            title="Rozroznianie wielkosci liter"
                        >
                            Aa
                        </Toggle>
                        <Toggle
                            pressed={regex}
                            onPressedChange={onRegexChange}
                            shape="square"
                            mono
                            title="Wyrazenie regularne"
                        >
                            .*
                        </Toggle>
                    </>
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
                    style={{ paddingRight: "70px" }}
                />
            </InputShell>

            <div className="lv-row lv-row--tight">
                <IconButton title="Poprzednie trafienie  Shift+Enter" onClick={() => onStep(-1)}>
                    <Icon name="chevron-up" />
                </IconButton>
                <IconButton title="Nastepne trafienie  Enter" onClick={() => onStep(1)}>
                    <Icon name="chevron-down" />
                </IconButton>
            </div>

            <div className="lv-search__counter">
                <span className="lv-search__count" data-tone={counterTone}>
                    {counter}
                </span>
                {/* The notice can be any length ("Dalej w: <postac>, <dzien>"), so
                    it is clipped rather than wrapped — the full text is in the
                    title. A second line here would push the whole row down. */}
                <span className="lv-search__sub" data-notice={subIsNotice} title={subLine || undefined}>
                    {subLine}
                </span>
            </div>

            <Toggle
                pressed={onlyMatches}
                onPressedChange={onOnlyMatchesChange}
                size="md"
                title="Ukryj linie bez trafienia"
            >
                Tylko trafienia
            </Toggle>

            <Segmented
                value={scope}
                onValueChange={onScopeChange}
                options={[
                    { value: "log", label: "Ten log", title: SCOPE_TITLE.log },
                    { value: "all", label: "Wszystkie logi", title: SCOPE_TITLE.all },
                    {
                        value: "range",
                        label: "Zakres",
                        disabled: !hasRange,
                        title: hasRange ? SCOPE_TITLE.range : "Zaznacz zakres na osi czasu",
                    },
                ]}
            />
        </div>
    );
});
