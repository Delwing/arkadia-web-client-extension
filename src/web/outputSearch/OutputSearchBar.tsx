import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { ChevronDown, ChevronUp, ScrollText, Search, X } from "lucide-react";
import { canSearchLogs, requestLogSearch } from "@web/logSearchRequest.ts";
import { clearMatches, findInOutput, paintMatches, revealMatch, type OutputMatch } from "./outputSearch";
import { closeOutputSearch, getOutputSearchRequest, subscribeOutputSearch } from "./outputSearchState";

interface OutputSearchBarProps {
    outputWrapper: HTMLElement;
    /** The split view's live pane: not searched, and covering the bottom when open. */
    splitBottom: HTMLElement;
    /** Other overlays living inside the output that are not game text. */
    skip: Element[];
    /** Where focus goes back to when the bar closes. */
    commandInput: () => HTMLElement | null;
}

/** The output's top right corner, inside its scrollbar. */
function placeOver(outputWrapper: HTMLElement): { top: number; right: number } {
    const box = outputWrapper.getBoundingClientRect();
    const scrollbar = outputWrapper.offsetWidth - outputWrapper.clientWidth;
    return { top: box.top + 8, right: window.innerWidth - box.right + scrollbar + 8 };
}

/** How often, at most, output arriving meanwhile re-runs the search. */
const RESCAN_MS = 250;

/**
 * Ctrl+F over the game output: a bar at the output's top right. Hits are painted
 * in place (see outputSearch.ts); Enter walks to older ones, Shift+Enter back to
 * newer, starting from the newest. It only searches what the output still holds;
 * "W logach" hands the query on to the Logi window for the rest.
 */
export default function OutputSearchBar({ outputWrapper, splitBottom, skip, commandInput }: OutputSearchBarProps) {
    const request = useSyncExternalStore(subscribeOutputSearch, getOutputSearchRequest);
    if (!request) return null;
    return (
        <SearchBar
            key={request.id}
            initialQuery={request.query}
            outputWrapper={outputWrapper}
            splitBottom={splitBottom}
            skip={skip}
            commandInput={commandInput}
        />
    );
}

function SearchBar({ initialQuery, outputWrapper, splitBottom, skip, commandInput }: OutputSearchBarProps & { initialQuery: string }) {
    const [query, setQuery] = useState(initialQuery);
    const [matches, setMatches] = useState<OutputMatch[]>([]);
    const [current, setCurrent] = useState(-1);
    // Placed on the first render already: a bar still hidden while it measures
    // could not take focus.
    const [position, setPosition] = useState(() => placeOver(outputWrapper));
    const inputRef = useRef<HTMLInputElement>(null);
    const stateRef = useRef({ query, matches, current });
    stateRef.current = { query, matches, current };

    const skipSet = useRef(new Set<Element>());
    skipSet.current = new Set([splitBottom, ...skip]);

    const reveal = useCallback((match: OutputMatch | undefined) => {
        if (!match) return;
        const covered = splitBottom.offsetHeight || outputWrapper.clientHeight * 0.3;
        revealMatch(outputWrapper, match, covered);
    }, [outputWrapper, splitBottom]);

    // A new query starts from the newest hit.
    useEffect(() => {
        const found = findInOutput(outputWrapper, query, skipSet.current);
        setMatches(found);
        setCurrent(found.length - 1);
        reveal(found[found.length - 1]);
    }, [query, outputWrapper, reveal]);

    // Output keeps arriving (and old lines get trimmed) while the bar is open:
    // search again, staying on the same hit if it is still there.
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const rescan = () => {
            timer = null;
            const { query: q, matches: before, current: index } = stateRef.current;
            const anchor = before[index];
            const found = findInOutput(outputWrapper, q, skipSet.current);
            const kept = anchor ? found.findIndex(m => m.line === anchor.line && m.start === anchor.start) : -1;
            setMatches(found);
            setCurrent(kept !== -1 ? kept : index < 0 ? found.length - 1 : Math.min(index, found.length - 1));
        };
        const observer = new MutationObserver(() => {
            timer ??= setTimeout(rescan, RESCAN_MS);
        });
        observer.observe(outputWrapper, { childList: true });
        return () => {
            observer.disconnect();
            if (timer) clearTimeout(timer);
        };
    }, [outputWrapper]);

    useEffect(() => paintMatches(matches, current), [matches, current]);
    useEffect(() => clearMatches, []);

    // Pinned to the output's top right, wherever the layout has put the output.
    useLayoutEffect(() => {
        const place = () => setPosition(placeOver(outputWrapper));
        const observer = new ResizeObserver(place);
        observer.observe(outputWrapper);
        window.addEventListener("resize", place);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", place);
        };
    }, [outputWrapper]);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const step = (older: boolean) => {
        if (matches.length === 0) return;
        const next = (current + (older ? -1 : 1) + matches.length) % matches.length;
        setCurrent(next);
        reveal(matches[next]);
    };

    const close = () => {
        closeOutputSearch();
        commandInput()?.focus();
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault();
            step(!event.shiftKey);
        } else if (event.key === "Escape") {
            event.preventDefault();
            close();
        }
    };

    const count = !query.trim() ? "" : matches.length === 0 ? "brak" : `${current + 1} z ${matches.length}`;

    return (
        <div className="output-search" style={position}>
            <Search size={14} strokeWidth={2.1} className="output-search__icon" />
            <input
                ref={inputRef}
                id="output-search-input"
                value={query}
                placeholder="Szukaj w tekście…"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
            />
            <span className="output-search__count">{count}</span>
            <button type="button" title="Starsze (Enter)" disabled={matches.length === 0} onClick={() => step(true)}>
                <ChevronUp size={15} strokeWidth={2.2} />
            </button>
            <button type="button" title="Nowsze (Shift+Enter)" disabled={matches.length === 0} onClick={() => step(false)}>
                <ChevronDown size={15} strokeWidth={2.2} />
            </button>
            {canSearchLogs() && (
                <button
                    type="button"
                    title="Szukaj w logach (starsze niż to, co jest na ekranie)"
                    disabled={!query.trim()}
                    onClick={() => {
                        requestLogSearch(query.trim());
                        closeOutputSearch();
                    }}
                >
                    <ScrollText size={15} strokeWidth={2.1} />
                </button>
            )}
            <button type="button" title="Zamknij (Esc)" onClick={close}>
                <X size={15} strokeWidth={2.2} />
            </button>
        </div>
    );
}
