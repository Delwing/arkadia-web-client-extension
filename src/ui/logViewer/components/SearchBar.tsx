import { forwardRef } from "react";
import { Icon, IconButton, Input, InputShell, Segmented, Toggle } from "@design";
import type { SearchScope } from "../model/types";

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
                    placeholder="Szukaj   Ctrl+F"
                    autoComplete="off"
                    spellCheck={false}
                    style={{ paddingRight: "70px" }}
                />
            </InputShell>

            <div className="ark-row ark-row--tight">
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
                <span className="lv-search__sub" data-notice={subIsNotice}>
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

            <div className="ark-spacer" />

            <Segmented
                value={scope}
                onValueChange={onScopeChange}
                options={[
                    { value: "log", label: "Ten log" },
                    { value: "all", label: "Wszystkie logi" },
                ]}
            />
        </div>
    );
});
