import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { ChevronDown, ChevronUp, ScrollText, Search, X } from "lucide-react";
import { canSearchLogs, requestLogSearch } from "@web/logSearchRequest.ts";
import { clearMatches, findInLines, findInOutput, paintMatches, revealMatch, type OutputMatch } from "./outputSearch";
import { closeOutputSearch, getOutputSearchRequest, subscribeOutputSearch } from "./outputSearchState";
import { OUTPUT_BLOCK_CLASS, isOutputLine } from "@shared/dom/outputMessageHandler.ts";

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

/** How long typing settles before the output is searched. */
const SEARCH_DELAY_MS = 150;

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
    // What is actually searched: the typed query once typing settles.
    const [searchQuery, setSearchQuery] = useState(initialQuery);
    // The hits, with the query they were found for, so a rescan never mixes
    // the hits of two queries.
    const [found, setFound] = useState<{ query: string; matches: OutputMatch[] }>({ query: "", matches: [] });
    const matches = found.matches;
    const [current, setCurrent] = useState(-1);
    // Placed on the first render already: a bar still hidden while it measures
    // could not take focus.
    const [position, setPosition] = useState(() => placeOver(outputWrapper));
    const inputRef = useRef<HTMLInputElement>(null);
    const stateRef = useRef({ searchQuery, found, current });
    stateRef.current = { searchQuery, found, current };

    const skipSet = useRef(new Set<Element>());
    skipSet.current = new Set([splitBottom, ...skip]);

    const reveal = useCallback((match: OutputMatch | undefined) => {
        if (!match) return;
        const covered = splitBottom.offsetHeight || outputWrapper.clientHeight * 0.3;
        revealMatch(outputWrapper, match, covered);
    }, [outputWrapper, splitBottom]);

    // Each search walks the whole output, so typing settles first.
    useEffect(() => {
        if (query === searchQuery) return;
        const timer = setTimeout(() => setSearchQuery(query), query.trim() ? SEARCH_DELAY_MS : 0);
        return () => clearTimeout(timer);
    }, [query, searchQuery]);

    // A new query starts from the newest hit.
    useEffect(() => {
        const hits = findInOutput(outputWrapper, searchQuery, skipSet.current);
        setFound({ query: searchQuery, matches: hits });
        setCurrent(hits.length - 1);
        reveal(hits[hits.length - 1]);
    }, [searchQuery, outputWrapper, reveal]);

    // Output keeps arriving (and old lines get trimmed) while the bar is open:
    // drop the hits on trimmed lines and search only the lines that arrived,
    // staying on the same hit if it is still there.
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        let added: Element[] = [];
        const rescan = () => {
            timer = null;
            const arrived = added.filter(line => isOutputLine(outputWrapper, line))
                .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
            added = [];
            const { searchQuery: q, found: before, current: index } = stateRef.current;
            const anchor = before.matches[index];
            let hits: OutputMatch[];
            const kept = before.matches.filter(m => isOutputLine(outputWrapper, m.line));
            const last = kept[kept.length - 1]?.line;
            const inOrder = !last || arrived.every(line => line !== last &&
                (last.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
            if (before.query === q && inOrder) {
                hits = arrived.length > 0 ? kept.concat(findInLines(arrived, q, skipSet.current)) : kept;
            } else {
                hits = findInOutput(outputWrapper, q, skipSet.current);
            }
            const keptIndex = anchor ? hits.findIndex(m => m.line === anchor.line && m.start === anchor.start) : -1;
            setFound({ query: q, matches: hits });
            setCurrent(keptIndex !== -1 ? keptIndex : index < 0 ? hits.length - 1 : Math.min(index, hits.length - 1));
        };
        // Lines go into the output's blocks, so the whole subtree is watched, but
        // only what changes in the wrapper or in a block adds or trims lines. A
        // new block arrives empty; its lines get records of their own.
        const observer = new MutationObserver((records) => {
            let changed = false;
            for (const record of records) {
                const target = record.target;
                if (target !== outputWrapper && !(target instanceof Element && target.classList.contains(OUTPUT_BLOCK_CLASS))) continue;
                changed = true;
                record.addedNodes.forEach(node => {
                    if (node instanceof Element && !node.classList.contains(OUTPUT_BLOCK_CLASS)) added.push(node);
                });
            }
            if (changed) timer ??= setTimeout(rescan, RESCAN_MS);
        });
        observer.observe(outputWrapper, { childList: true, subtree: true });
        return () => {
            observer.disconnect();
            if (timer) clearTimeout(timer);
        };
    }, [outputWrapper]);

    useEffect(() => paintMatches(matches, current), [matches, current]);
    useEffect(() => () => clearMatches(), []);

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
            // Typed but not searched yet: search now (landing on the newest hit).
            if (query !== searchQuery) setSearchQuery(query);
            else step(!event.shiftKey);
        } else if (event.key === "Escape") {
            event.preventDefault();
            close();
        }
    };

    const count = !searchQuery.trim() ? "" : matches.length === 0 ? "brak" : `${current + 1} z ${matches.length}`;

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
